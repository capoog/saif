import { D, round2, toDb2, ZERO, type Decimal } from "@/domain/money";
import { riyadhDateKey, riyadhStartOfDay } from "@/domain/plan-calendar";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { engineCapitalUsed } from "./close";
import { createOrder } from "./orders";
import { PAYMENT_METHODS } from "../chart";

/** أنواع الأنشطة اللي تنضاف من الشاشة. CORE = المحركات الخمسة الأساسية في الخطة. */
export const BUSINESS_KINDS: Record<string, { label: string; unit: string; hint: string }> = {
  RESTAURANT: { label: "مطعم", unit: "طبق", hint: "المواد الخام بمخزون، والأطباق بوصفة تخصم مكوناتها" },
  CAFE: { label: "كافيه", unit: "كوب", hint: "البن والحليب مواد خام، والمشروبات بوصفة" },
  FOOD_TRUCK: { label: "فود ترك", unit: "وجبة", hint: "نفس المطعم مع بيع سريع من الجوال" },
  STALL: { label: "بسطة / كشك", unit: "قطعة", hint: "منتجات عادية وبيع سريع" },
  STORE: { label: "متجر / تجارة", unit: "قطعة", hint: "منتجات بمخزون FIFO" },
  SERVICES: { label: "خدمات", unit: "خدمة", hint: "بدون مخزون" },
  OTHER: { label: "أخرى", unit: "قطعة", hint: "" },
  CORE: { label: "أساسي", unit: "قطعة", hint: "" },
};
export const NEW_BUSINESS_KINDS = Object.keys(BUSINESS_KINDS).filter((k) => k !== "CORE");
/** الأنشطة اللي فيها بيع سريع (كاشير) */
export const QUICK_SALE_KINDS = ["RESTAURANT", "CAFE", "FOOD_TRUCK", "STALL", "STORE"];

export interface BusinessInput {
  name: string;
  kind: string;
  maxCapitalPct?: string | null;
  notes?: string | null;
}

function pctOrNull(v?: string | null) {
  if (v == null || v === "" || D(v).isZero()) return null;
  const p = D(v);
  if (p.lt(0) || p.gt(100)) throw new UserError("النسبة بين 0 و 100");
  return p.toFixed(2);
}

export async function createBusiness(db: Db, actor: Actor, input: BusinessInput) {
  const name = input.name.trim();
  if (!name) throw new UserError("اكتب اسم النشاط");
  if (!NEW_BUSINESS_KINDS.includes(input.kind)) throw new UserError("اختر نوع النشاط");
  return db.$transaction(async (tx) => {
    if (await tx.engine.findFirst({ where: { name } })) throw new UserError("فيه نشاط بنفس الاسم");
    const last = await tx.engine.aggregate({ _max: { sortOrder: true } });
    let n = (await tx.engine.count()) + 1;
    while (await tx.engine.findUnique({ where: { code: `BIZ_${n}` } })) n++;
    const e = await tx.engine.create({
      data: { code: `BIZ_${n}`, name, kind: input.kind, sortOrder: (last._max.sortOrder ?? 0) + 1, maxCapitalPct: pctOrNull(input.maxCapitalPct), notes: input.notes || null },
    });
    await audit(tx, actor, "create", "Engine", e.id, { after: e });
    return e;
  });
}

export async function updateBusiness(db: Db, actor: Actor, id: string, patch: Partial<BusinessInput> & { active?: boolean }) {
  return db.$transaction(async (tx) => {
    const before = await tx.engine.findUniqueOrThrow({ where: { id } });
    if (patch.kind && before.kind === "CORE" && patch.kind !== "CORE") throw new UserError("الأنشطة الأساسية نوعها ثابت");
    if (patch.kind && before.kind !== "CORE" && !NEW_BUSINESS_KINDS.includes(patch.kind)) throw new UserError("نوع غير معروف");
    const name = patch.name?.trim();
    if (patch.name !== undefined && !name) throw new UserError("اكتب اسم النشاط");
    if (name && name !== before.name && (await tx.engine.findFirst({ where: { name, id: { not: id } } }))) throw new UserError("فيه نشاط بنفس الاسم");
    const saved = await tx.engine.update({
      where: { id },
      data: {
        name: name ?? undefined,
        kind: patch.kind ?? undefined,
        active: patch.active ?? undefined,
        maxCapitalPct: patch.maxCapitalPct !== undefined ? pctOrNull(patch.maxCapitalPct) : undefined,
        notes: patch.notes !== undefined ? patch.notes || null : undefined,
      },
    });
    await audit(tx, actor, "update", "Engine", id, { before, after: saved });
    return saved;
  });
}

export interface BusinessRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
  maxCapitalPct: Decimal | null;
  products: number;
  monthRevenue: Decimal;
  monthProfit: Decimal;
  capitalUsed: Decimal;
  capitalPct: Decimal | null;
  overLimit: boolean;
}

/** كل الأنشطة: مبيعات وربح هالشهر (من الدفتر)، ورأس المال المستخدم مقابل الحد */
export async function businessOverview(db: Db, capital: Decimal, now = new Date()): Promise<BusinessRow[]> {
  const monthStart = riyadhStartOfDay(`${riyadhDateKey(now).slice(0, 7)}-01`);
  const [engines, counts, lines, used] = await Promise.all([
    db.engine.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.groupBy({ by: ["engineId"], where: { deletedAt: null }, _count: true }),
    db.journalLine.findMany({
      where: { engineId: { not: null }, entry: { date: { gte: monthStart, lte: now } }, account: { type: { in: ["INCOME", "EXPENSE"] } } },
      select: { engineId: true, debit: true, credit: true, account: { select: { type: true } } },
    }),
    engineCapitalUsed(db, now),
  ]);
  const rev = new Map<string, Decimal>();
  const prof = new Map<string, Decimal>();
  for (const l of lines) {
    const v = D(l.credit).minus(D(l.debit));
    prof.set(l.engineId!, (prof.get(l.engineId!) ?? ZERO).plus(v));
    if (l.account.type === "INCOME") rev.set(l.engineId!, (rev.get(l.engineId!) ?? ZERO).plus(v));
  }
  return engines.map((e) => {
    const capitalUsed = round2(used.get(e.id) ?? ZERO);
    const capitalPct = capital.gt(0) ? round2(capitalUsed.div(capital).times(100)) : null;
    const max = e.maxCapitalPct ? D(e.maxCapitalPct) : null;
    return {
      id: e.id,
      code: e.code,
      name: e.name,
      kind: e.kind,
      active: e.active,
      maxCapitalPct: max,
      products: counts.find((c) => c.engineId === e.id)?._count ?? 0,
      monthRevenue: round2(rev.get(e.id) ?? ZERO),
      monthProfit: round2(prof.get(e.id) ?? ZERO),
      capitalUsed,
      capitalPct,
      overLimit: !!(max && capitalPct && capitalPct.gt(max)),
    };
  });
}

export interface QuickSaleInput {
  engineId: string;
  items: { productId: string; quantity: number }[];
  method: string; // cash | mada | transfer
  discount?: string;
  date?: Date;
}

/** بيع سريع (كاشير): طلب مسلّم ومدفوع كامل مباشرة، بسعر البيع المسجّل لكل صنف */
export async function quickSale(db: Db, actor: Actor, input: QuickSaleInput) {
  const items = input.items.filter((i) => i.quantity > 0);
  if (!items.length) throw new UserError("اختر صنف واحد على الأقل");
  const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, deletedAt: null } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const i of items) {
    const p = byId.get(i.productId);
    if (!p) throw new UserError("صنف غير موجود");
    if (p.engineId !== input.engineId) throw new UserError(`«${p.name}» مو تابع لهالنشاط`);
    if (p.defaultSellPrice == null) throw new UserError(`حدد سعر بيع لـ «${p.name}» من صفحة المنتج`);
  }
  const pm = PAYMENT_METHODS.find((m) => m.code === input.method && m.code !== "cod");
  if (!pm) throw new UserError("طريقة دفع غير معروفة");
  const account = await db.ledgerAccount.findUniqueOrThrow({ where: { code: pm.defaultAccount } });
  return createOrder(db, actor, {
    date: input.date ?? new Date(),
    channel: "مباشر",
    engineId: input.engineId,
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: toDb2(D(byId.get(i.productId)!.defaultSellPrice!)) })),
    discount: input.discount,
    status: "DELIVERED",
    paymentMethod: pm.code,
    payment: { amount: "FULL", method: pm.code, accountId: account.id },
  });
}
