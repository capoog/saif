/**
 * محرك القواعد (القسم 5). دوال نقية بدون قاعدة بيانات:
 * - checkOperation: قواعد "اعتراض" قبل الحفظ (تتجاوز بسبب مكتوب يتسجل في السجل)
 * - إشارات التنبيه: دفعات المخزون، الإعلانات، المحركات، الخسائر
 * كل الحدود من الإعدادات.
 */
import type { CapitalBreakdown } from "./capital";
import { D, Decimal, round2, type DecimalLike } from "./money";
import type { Settings } from "./settings";

export type OperationKind =
  | "INVENTORY_PURCHASE" // شراء مخزون (دفعة أو أمر شراء)
  | "CASH_OUT" // مصروف أو سحب أو سداد
  | "CAR_PURCHASE" // شراء سيارة (المرحلة 3)
  | "DEAL"; // صفقة/عقد بقيمة كبيرة

export interface ProposedOperation {
  kind: OperationKind;
  /** حجم الصفقة/الشراء */
  amount: DecimalLike;
  /** النقد اللي هيطلع دلوقتي */
  cashOut: DecimalLike;
  /** المخزون اللي هيدخل بالتكلفة */
  inventoryIn?: DecimalLike;
  /** تغيّر رأس المال نفسه (مصروف = بالسالب، شراء مخزون = صفر) */
  capitalChange?: DecimalLike;
}

export interface Violation {
  code: "EMERGENCY" | "DEAL_SIZE" | "CAR_MIN_CAPITAL" | "LIQUIDITY" | "INVENTORY_CAP";
  title: string;
  detail: string;
}

type RuleSettings = Pick<
  Settings,
  | "emergencyCapital"
  | "maxDealPct"
  | "maxCarDealPct"
  | "carDealUnlockCapital"
  | "minLiquidityPct"
  | "minLiquidityAbs"
  | "maxInventoryPct"
  | "maxInventoryPctCovered"
>;

const f = (d: Decimal) => d.toFixed(2);
const pctOf = (base: Decimal, pct: number) => round2(base.times(pct).div(100));

export function checkOperation(
  op: ProposedOperation,
  cap: Pick<CapitalBreakdown, "capital" | "liquidity" | "inventory" | "customerDeposits">,
  s: RuleSettings,
): Violation[] {
  const v: Violation[] = [];
  const capital = D(cap.capital);
  const amount = D(op.amount);
  const cashOut = D(op.cashOut);
  const inventoryIn = D(op.inventoryIn ?? 0);
  const capitalAfter = capital.plus(D(op.capitalChange ?? 0));

  if ((op.kind === "INVENTORY_PURCHASE" || op.kind === "CAR_PURCHASE") && capital.lt(s.emergencyCapital)) {
    v.push({
      code: "EMERGENCY",
      title: "وضع الطوارئ: مشتريات المخزون مجمّدة",
      detail: `رأس المال ${f(capital)} أقل من ${s.emergencyCapital}. لا شراء إلا بطلب مدفوع.`,
    });
  }

  if (op.kind === "CAR_PURCHASE" && capital.lt(s.carDealUnlockCapital)) {
    v.push({
      code: "CAR_MIN_CAPITAL",
      title: "شراء السيارات لسه مش متاح",
      detail: `رأس المال ${f(capital)} أقل من ${s.carDealUnlockCapital}. الوساطة بس لحد ما توصل.`,
    });
  }

  if (op.kind !== "CASH_OUT") {
    const pct = op.kind === "CAR_PURCHASE" && capital.gte(s.carDealUnlockCapital) ? s.maxCarDealPct : s.maxDealPct;
    const limit = pctOf(capital, pct);
    if (amount.gt(limit)) {
      v.push({
        code: "DEAL_SIZE",
        title: `العملية أكبر من ${pct}% من رأس المال`,
        detail: `القيمة ${f(amount)} والحد ${f(limit)} (${pct}% من ${f(capital)}).`,
      });
    }
  }

  if (cashOut.gt(0)) {
    const after = D(cap.liquidity).minus(cashOut);
    const pctLimit = pctOf(capitalAfter, s.minLiquidityPct);
    const floor = Decimal.max(pctLimit, D(s.minLiquidityAbs));
    if (after.lt(floor)) {
      v.push({
        code: "LIQUIDITY",
        title: "السيولة هتنزل تحت الحد الآمن",
        detail: `السيولة بعد العملية ${f(after)}، والحد الأدنى ${f(floor)} (${s.minLiquidityPct}% من رأس المال أو ${s.minLiquidityAbs} أيهما أكبر).`,
      });
    }
  }

  if (inventoryIn.gt(0)) {
    const after = D(cap.inventory).plus(inventoryIn);
    const limit = pctOf(capital, s.maxInventoryPct);
    const coveredLimit = pctOf(capital, s.maxInventoryPctCovered);
    const excess = after.minus(limit);
    const coveredOk = after.lte(coveredLimit) && excess.lte(D(cap.customerDeposits));
    if (after.gt(limit) && !coveredOk) {
      v.push({
        code: "INVENTORY_CAP",
        title: `المخزون هيعدّي ${s.maxInventoryPct}% من رأس المال`,
        detail: `المخزون بعد الشراء ${f(after)} والحد ${f(limit)}. يوصل ${s.maxInventoryPctCovered}% بس لو الزيادة مغطاة بعرابين (العرابين الحالية ${f(D(cap.customerDeposits))}).`,
      });
    }
  }
  return v;
}

// ─────────────── إشارات التنبيه ───────────────

export type BatchSignal = "LIQUIDATE" | "MARKDOWN" | "SLOW" | "DOUBLE" | null;

export function batchSignal(
  b: { ageDays: number; remaining: DecimalLike; sellThroughWindowPct: number | null },
  ads: { roas: Decimal | null; orders: number } | null,
  s: Pick<Settings, "inventoryAgeLiquidateDays" | "inventoryAgeMarkdownDays" | "batchSlowPct" | "batchFastPct" | "doubleMinRoas" | "doubleMinOrders">,
): BatchSignal {
  const hasStock = D(b.remaining).gt(0);
  if (hasStock && b.ageDays >= s.inventoryAgeLiquidateDays) return "LIQUIDATE";
  if (hasStock && b.ageDays >= s.inventoryAgeMarkdownDays) return "MARKDOWN";
  if (b.sellThroughWindowPct === null) return null;
  if (hasStock && b.sellThroughWindowPct < s.batchSlowPct) return "SLOW";
  if (b.sellThroughWindowPct >= s.batchFastPct && ads && ads.roas && ads.roas.gte(s.doubleMinRoas) && ads.orders >= s.doubleMinOrders) {
    return "DOUBLE";
  }
  return null;
}

export interface AdPerformance {
  spend: Decimal;
  orders: number;
  revenue: Decimal;
  cpa: Decimal | null;
  roas: Decimal | null;
}

export function adPerformance(spend: DecimalLike, orders: number, revenue: DecimalLike): AdPerformance {
  const sp = round2(D(spend));
  const rev = round2(D(revenue));
  return {
    spend: sp,
    orders,
    revenue: rev,
    cpa: orders > 0 ? round2(sp.div(orders)) : null,
    roas: sp.gt(0) ? rev.div(sp).toDecimalPlaces(2) : null,
  };
}

/**
 * قاعدة "أوقف المنتج": بعد إنفاق adStopMinSpend، لو تكلفة الطلب > adStopCpaMarginPct% من الربح الإجمالي للطلب.
 * لو مفيش طلبات خالص بعد الحد → أوقف.
 */
export function adStopSignal(
  perf: AdPerformance,
  grossProfitPerOrder: DecimalLike | null,
  s: Pick<Settings, "adStopMinSpend" | "adStopCpaMarginPct">,
): { stop: boolean; reason?: string } {
  if (perf.spend.lt(s.adStopMinSpend)) return { stop: false };
  if (perf.orders === 0 || perf.cpa === null) return { stop: true, reason: `اتصرف ${perf.spend.toFixed(2)} من غير أي طلب` };
  if (grossProfitPerOrder === null) return { stop: false };
  const limit = round2(D(grossProfitPerOrder).times(s.adStopCpaMarginPct).div(100));
  if (perf.cpa.gt(limit)) {
    return { stop: true, reason: `تكلفة الطلب ${perf.cpa.toFixed(2)} أكبر من ${s.adStopCpaMarginPct}% من ربح الطلب (${limit.toFixed(2)})` };
  }
  return { stop: false };
}

/** محرك ضعيف: مجموع عائد آخر 4 أسابيع < الحد الشهري، أو خسارة أسبوعين ورا بعض. الأسابيع من الأقدم للأحدث. */
export function engineWeakSignal(
  weeks: { profit: DecimalLike; returnPct: DecimalLike | null; capitalUsed: DecimalLike }[],
  s: Pick<Settings, "engineMinMonthlyReturnPct">,
): string | null {
  const last2 = weeks.slice(-2);
  if (last2.length === 2 && last2.every((w) => D(w.profit).lt(0))) return "خسر أسبوعين ورا بعض";
  const last4 = weeks.slice(-4);
  if (last4.length === 4 && last4.every((w) => D(w.capitalUsed).gt(0) && w.returnPct !== null)) {
    const monthly = last4.reduce((sum, w) => sum.plus(D(w.returnPct!)), D(0));
    if (monthly.lt(s.engineMinMonthlyReturnPct)) return `عائده ${monthly.toFixed(1)}% في آخر 4 أسابيع (أقل من ${s.engineMinMonthlyReturnPct}%)`;
  }
  return null;
}

/** خسارة صفقة > dealLossRedPct% من رأس المال، أو خسارة الشهر > monthLossRedPct% */
export function lossSignals(
  capital: DecimalLike,
  worstDealProfit: DecimalLike | null,
  monthProfit: DecimalLike,
  s: Pick<Settings, "dealLossRedPct" | "monthLossRedPct">,
): string[] {
  const c = D(capital);
  const out: string[] = [];
  if (worstDealProfit !== null && D(worstDealProfit).lt(0) && D(worstDealProfit).neg().gt(pctOf(c, s.dealLossRedPct))) {
    out.push(`صفقة خسرت ${D(worstDealProfit).neg().toFixed(2)} (أكتر من ${s.dealLossRedPct}% من رأس المال)`);
  }
  if (D(monthProfit).lt(0) && D(monthProfit).neg().gt(pctOf(c, s.monthLossRedPct))) {
    out.push(`الشهر ده خسران ${D(monthProfit).neg().toFixed(2)} (أكتر من ${s.monthLossRedPct}% من رأس المال)`);
  }
  return out;
}
