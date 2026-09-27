import type { Prisma, Role } from "@prisma/client";
import type { Db, Tx } from "./db";
import { UserError } from "./errors";

/**
 * نطاق البيانات حسب الدور. المالك يشوف كل شي، والمندوب يشوف اللي يخصه بس.
 * كل فحص هنا بيصير في السيرفر — إخفاء الأزرار في الواجهة مو كافي.
 */
export type Viewer = { id: string; role: Role };

export const isOwner = (v: Viewer) => v.role === "owner";

export function customerScope(v: Viewer): Prisma.CustomerWhereInput {
  return isOwner(v) ? {} : { ownerId: v.id };
}
export function dealScope(v: Viewer): Prisma.DealWhereInput {
  return isOwner(v) ? {} : { ownerId: v.id };
}
export function quoteScope(v: Viewer): Prisma.QuoteWhereInput {
  return isOwner(v) ? {} : { createdById: v.id };
}

async function deny(): Promise<never> {
  throw new UserError("ما عندك صلاحية على هذا السجل");
}

export async function assertCustomerAccess(db: Db | Tx, v: Viewer, customerId: string) {
  if (isOwner(v)) return;
  const c = await db.customer.findFirst({ where: { id: customerId, ownerId: v.id }, select: { id: true } });
  if (!c) await deny();
}

export async function assertDealAccess(db: Db | Tx, v: Viewer, dealId: string) {
  if (isOwner(v)) return;
  const d = await db.deal.findFirst({ where: { id: dealId, ownerId: v.id }, select: { id: true } });
  if (!d) await deny();
}

export async function assertQuoteAccess(db: Db | Tx, v: Viewer, quoteId: string) {
  if (isOwner(v)) return;
  const q = await db.quote.findFirst({ where: { id: quoteId, createdById: v.id }, select: { id: true } });
  if (!q) await deny();
}
