import { ageInDays } from "./plan-calendar";
import { D, Decimal, round2, ZERO, type DecimalLike } from "./money";

export interface CustomerBalance {
  orderId: string;
  /** مدين − دائن على حساب العملاء لهذا الطلب: موجب = ذمة علينا نحصّلها، سالب = عربون/مبلغ نديه للعميل */
  balance: DecimalLike;
  /** تاريخ بداية الاستحقاق (تاريخ التسليم) لحساب التأخير */
  dueFrom: Date;
}

export interface CapitalInput {
  asOf: Date;
  cash: DecimalLike;
  wallets: DecimalLike;
  inventory: DecimalLike;
  customerBalances: CustomerBalance[];
  supplierPayable: DecimalLike;
  freelancerPayable: DecimalLike;
  loans: DecimalLike;
  vatPayable: DecimalLike;
  zakatProvision: DecimalLike;
  partnerCapital: DecimalLike;
  receivableSecuredDays: number;
}

export interface CapitalBreakdown {
  cash: Decimal;
  wallets: Decimal;
  liquidity: Decimal;
  inventory: Decimal;
  receivablesTotal: Decimal;
  receivablesSecured: Decimal;
  receivablesOverdue: Decimal;
  customerDeposits: Decimal;
  supplierPayable: Decimal;
  freelancerPayable: Decimal;
  loans: Decimal;
  liabilities: Decimal;
  vatPayable: Decimal;
  zakatProvision: Decimal;
  netEquity: Decimal;
  partnerCapital: Decimal;
  /** رأس المال المحسوب مقابل الهدف (بدون رأس مال الشريك) */
  capital: Decimal;
  liquidityPct: Decimal | null;
  inventoryPct: Decimal | null;
}

/**
 * رأس المال = النقد + المخزون بالتكلفة + الذمم المضمونة (≤ 30 يوم تأخير)
 *           − الالتزامات (موردين، مستقلين، عرابين، قروض)
 *           − ضريبة القيمة المضافة المحصّلة غير المسددة − مخصص الزكاة
 * ثم يُطرح رأس مال الشريك لأنه لا يُحسب ضمن الهدف.
 */
export function computeCapital(input: CapitalInput): CapitalBreakdown {
  const cash = round2(D(input.cash));
  const wallets = round2(D(input.wallets));
  const inventory = round2(D(input.inventory));

  let receivablesTotal = ZERO;
  let receivablesSecured = ZERO;
  let customerDeposits = ZERO;
  for (const cb of input.customerBalances) {
    const bal = D(cb.balance);
    if (bal.gt(0)) {
      receivablesTotal = receivablesTotal.plus(bal);
      if (ageInDays(cb.dueFrom, input.asOf) <= input.receivableSecuredDays) {
        receivablesSecured = receivablesSecured.plus(bal);
      }
    } else if (bal.lt(0)) {
      customerDeposits = customerDeposits.plus(bal.neg());
    }
  }

  const supplierPayable = round2(D(input.supplierPayable));
  const freelancerPayable = round2(D(input.freelancerPayable));
  const loans = round2(D(input.loans));
  const vatPayable = round2(D(input.vatPayable));
  const zakatProvision = round2(D(input.zakatProvision));
  const partnerCapital = round2(D(input.partnerCapital));

  const liabilities = supplierPayable.plus(freelancerPayable).plus(customerDeposits).plus(loans);
  const liquidity = cash.plus(wallets);
  const netEquity = liquidity
    .plus(inventory)
    .plus(receivablesSecured)
    .minus(liabilities)
    .minus(vatPayable)
    .minus(zakatProvision);
  const capital = netEquity.minus(partnerCapital);

  const pct = (x: Decimal) => (capital.gt(0) ? round2(x.div(capital).times(100)) : null);

  return {
    cash,
    wallets,
    liquidity: round2(liquidity),
    inventory,
    receivablesTotal: round2(receivablesTotal),
    receivablesSecured: round2(receivablesSecured),
    receivablesOverdue: round2(receivablesTotal.minus(receivablesSecured)),
    customerDeposits: round2(customerDeposits),
    supplierPayable,
    freelancerPayable,
    loans,
    liabilities: round2(liabilities),
    vatPayable,
    zakatProvision,
    netEquity: round2(netEquity),
    partnerCapital,
    capital: round2(capital),
    liquidityPct: pct(liquidity),
    inventoryPct: pct(inventory),
  };
}

/** مخصص الزكاة الشهري التقديري = الوعاء × (النسبة السنوية ÷ 12). لا مخصص على وعاء سالب. */
export function monthlyZakat(base: DecimalLike, annualRatePct: number): Decimal {
  const b = D(base);
  if (b.lte(0)) return ZERO;
  return round2(b.times(annualRatePct).div(100).div(12));
}
