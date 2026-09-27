import { D, Decimal, round2, sum, type DecimalLike } from "./money";

export interface OrderLineInput {
  quantity: number;
  unitPrice: DecimalLike;
}

export interface OrderTotalsInput {
  items: OrderLineInput[];
  discount?: DecimalLike;
  shippingFee?: DecimalLike;
  vatRegistered: boolean;
  vatRatePct: number;
  pricesIncludeVat: boolean;
}

export interface OrderTotals {
  subtotal: Decimal;
  discount: Decimal;
  shippingFee: Decimal;
  vatAmount: Decimal;
  total: Decimal; // المستحق من العميل
  netRevenue: Decimal; // الإيراد الفعلي (بدون ضريبة)
  vatRate: Decimal; // كسر عشري 0.15
}

/**
 * حساب إجماليات الطلب. الضريبة المحصّلة ليست إيرادًا:
 * netRevenue = total − vatAmount، والضريبة تروح لحساب منفصل.
 * لو المنشأة مش مسجلة في الضريبة → ضريبة = 0.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = round2(sum(input.items.map((i) => D(i.unitPrice).times(i.quantity))));
  const discount = round2(D(input.discount));
  const shippingFee = round2(D(input.shippingFee));
  if (discount.gt(subtotal)) throw new Error("الخصم أكبر من مجموع البنود");
  const base = subtotal.minus(discount).plus(shippingFee);
  const rate = input.vatRegistered ? D(input.vatRatePct).div(100) : D(0);

  let vatAmount: Decimal;
  let total: Decimal;
  if (rate.isZero()) {
    vatAmount = D(0);
    total = base;
  } else if (input.pricesIncludeVat) {
    total = base;
    vatAmount = round2(base.times(rate).div(rate.plus(1)));
  } else {
    vatAmount = round2(base.times(rate));
    total = base.plus(vatAmount);
  }
  return {
    subtotal,
    discount,
    shippingFee,
    vatAmount,
    total: round2(total),
    netRevenue: round2(total.minus(vatAmount)),
    vatRate: rate,
  };
}
