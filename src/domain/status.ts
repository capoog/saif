import { D, Decimal, round2, type DecimalLike } from "./money";
import type { Settings } from "./settings";

export type CapitalStatus = "above" | "on" | "below" | "danger";

export const STATUS_LABELS: Record<CapitalStatus, string> = {
  above: "فوق الهدف",
  on: "على الهدف",
  below: "أقل من الهدف",
  danger: "أقل بكثير من الهدف",
};

export function compareToTarget(
  capital: DecimalLike,
  target: DecimalLike,
  s: Pick<Settings, "statusOnTargetPct" | "statusDangerPct">,
): { gap: Decimal; gapPct: Decimal; status: CapitalStatus } {
  const c = D(capital);
  const t = D(target);
  const gap = round2(c.minus(t));
  const gapPct = t.isZero() ? D(0) : gap.div(t).times(100).toDecimalPlaces(4);
  let status: CapitalStatus;
  if (gapPct.gt(s.statusOnTargetPct)) status = "above";
  else if (gapPct.gte(-s.statusOnTargetPct)) status = "on";
  else if (gapPct.gte(-s.statusDangerPct)) status = "below";
  else status = "danger";
  return { gap, gapPct, status };
}

export interface EngineWeekResult {
  code: string;
  name: string;
  profit: Decimal;
  capitalUsed: Decimal;
  /** العائد % أو null لو ما فيه رأس مال مستخدم */
  returnPct: Decimal | null;
}

export interface DecisionContext {
  status: CapitalStatus;
  gap: Decimal;
  engines: EngineWeekResult[];
  settings: Pick<Settings, "surplusToTopEnginePct" | "onTargetAdBoostPct">;
}

/**
 * ترتيب المحركات حسب العائد على رأس المال. المحركات اللي ما فيها رأس مال مستخدم
 * (زي الوساطة) بتترتب بعدهم بالربح، لأن توجيه فائض رأس المال لها ما له معنى.
 */
export function rankEngines(engines: EngineWeekResult[]): EngineWeekResult[] {
  const withCap = engines.filter((e) => e.returnPct !== null).sort((a, b) => b.returnPct!.comparedTo(a.returnPct!));
  const noCap = engines.filter((e) => e.returnPct === null).sort((a, b) => b.profit.comparedTo(a.profit));
  return [...withCap, ...noCap];
}

/** القرار المقترح في الإغلاق الأسبوعي (القسم 5). */
export function suggestDecision(ctx: DecisionContext): string {
  const ranked = rankEngines(ctx.engines.filter((e) => !e.profit.isZero() || !e.capitalUsed.isZero()));
  const top = ranked[0]?.name ?? "المحرك الأعلى عائدًا";
  const weakest = ranked[ranked.length - 1]?.name ?? "أضعف محرك";
  switch (ctx.status) {
    case "above": {
      const toTop = round2(ctx.gap.times(ctx.settings.surplusToTopEnginePct).div(100));
      const toReserve = round2(ctx.gap.minus(toTop));
      return `فوق الهدف بـ ${ctx.gap.toFixed(2)} ريال → وجّه ${ctx.settings.surplusToTopEnginePct}% من الفائض (${toTop.toFixed(2)}) لـ «${top}»، والباقي (${toReserve.toFixed(2)}) للاحتياطي.`;
    }
    case "on":
      return `على الهدف → استمر، وارفع ميزانية إعلان المنتج الرابح ${ctx.settings.onTargetAdBoostPct}%.`;
    case "below":
      return "أقل من الهدف → ضاعف تواصل B2B، أوقف أضعف إعلان، سيّل أبطأ منتج.";
    case "danger":
      return `أقل بكثير من الهدف → أوقف أضعف محرك («${weakest}»)، لا مخزون إلا بطلب مدفوع، ركّز على الوكالة والوساطة.`;
  }
}
