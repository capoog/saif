import { D, Decimal, round2, sum, ZERO } from "@/domain/money";
import { riyadhEndOfDay } from "@/domain/plan-calendar";
import type { Db } from "../db";
import { stockLevels } from "./inventory";
import { getSettings } from "./settings";

/** عدّاد المفصل الحاسم: عقود رمضان الموقعة بعربون قبل الموعد */
export async function ramadanCounter(db: Db, now = new Date()) {
  const s = await getSettings(db);
  const deadline = riyadhEndOfDay(s.ramadanDeadline);
  const contracts = await db.b2BContract.findMany({
    where: { status: { not: "CANCELLED" }, signedAt: { lte: deadline } },
    include: { orders: { include: { payments: { where: { deletedAt: null }, select: { amount: true } } } } },
  });
  const withDeposit = contracts.filter((c) => sum(c.orders.flatMap((o) => o.payments.map((p) => p.amount))).gt(0));
  return {
    signed: withDeposit.length,
    pendingDeposit: contracts.length - withDeposit.length,
    target: s.ramadanContractsTarget,
    deadline: s.ramadanDeadline,
    daysLeft: Math.max(Math.ceil((deadline.getTime() - now.getTime()) / 86400000), 0),
    value: round2(sum(withDeposit.map((c) => c.total))),
  };
}

export interface MaterialNeed {
  productId: string;
  name: string;
  unit: string;
  required: Decimal;
  onHand: Decimal;
  shortfall: Decimal;
}

/** احتياج المواد لكل الطلبات المفتوحة (البوكسات بتتفك لمكوناتها) مقابل المخزون الفعلي */
export async function materialNeeds(db: Db): Promise<MaterialNeed[]> {
  const items = await db.orderItem.findMany({
    where: { order: { status: { in: ["NEW", "CONFIRMED", "SHIPPED"] }, deletedAt: null } },
    include: { product: { include: { recipe: { include: { component: true } } } } },
  });
  const need = new Map<string, { name: string; unit: string; required: Decimal }>();
  const add = (id: string, name: string, unit: string, q: Decimal) => {
    const e = need.get(id) ?? { name, unit, required: ZERO };
    e.required = e.required.plus(q);
    need.set(id, e);
  };
  for (const it of items) {
    if (it.product.kind === "BOX") for (const r of it.product.recipe) add(r.componentId, r.component.name, r.component.unit, D(r.quantity).times(it.quantity));
    else add(it.productId, it.product.name, it.product.unit, D(it.quantity));
  }
  const levels = await stockLevels(db, [...need.keys()]);
  return [...need.entries()]
    .map(([productId, n]) => {
      const onHand = levels.get(productId)?.onHand ?? ZERO;
      return { productId, name: n.name, unit: n.unit, required: n.required, onHand, shortfall: Decimal.max(n.required.minus(onHand), ZERO) };
    })
    .sort((a, b) => b.shortfall.comparedTo(a.shortfall));
}
