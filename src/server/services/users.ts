import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { D, Decimal, toDb2 } from "@/domain/money";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { hashPassword } from "../auth/core";
import { UserError } from "../errors";

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  commissionPct?: string | null;
  freelancerId?: string | null;
}

export async function createUser(db: Db, actor: Actor, i: NewUserInput) {
  if (!i.name.trim()) throw new UserError("اكتب الاسم");
  if (i.password.length < 10) throw new UserError("كلمة المرور 10 حروف على الأقل");
  if (i.role === "freelancer" && !i.freelancerId) throw new UserError("اربط الحساب بمستقل");
  const email = i.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new UserError("الإيميل مستخدم");
  const passwordHash = await hashPassword(i.password);
  return db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: i.name.trim(),
        email,
        role: i.role,
        passwordHash,
        commissionPct: i.role === "sales" && i.commissionPct ? toDb2(i.commissionPct) : null,
        freelancerId: i.role === "freelancer" ? i.freelancerId : null,
      },
    });
    await audit(tx, actor, "create", "User", u.id, { after: { email, role: i.role } });
    return u;
  });
}

export async function updateUser(db: Db, actor: Actor, id: string, patch: { active?: boolean; commissionPct?: string | null; password?: string }) {
  const target = await db.user.findUniqueOrThrow({ where: { id } });
  if (target.role === "owner" && patch.active === false) throw new UserError("ما يصير توقف حساب المالك");
  const data: Prisma.UserUpdateInput = {};
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.commissionPct !== undefined) data.commissionPct = patch.commissionPct ? toDb2(patch.commissionPct) : null;
  if (patch.password) {
    if (patch.password.length < 10) throw new UserError("كلمة المرور 10 حروف على الأقل");
    data.passwordHash = await hashPassword(patch.password);
  }
  return db.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data });
    // الإيقاف أو تغيير كلمة المرور يطلّعه من كل الأجهزة
    if (patch.active === false || patch.password) await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, actor, "update", "User", id, { after: { active: patch.active, commissionPct: patch.commissionPct, passwordChanged: !!patch.password } });
    return u;
  });
}

/** عمولات المندوب: المستحق (المتراكم − المدفوع) من الدفتر الفرعي */
export async function commissionBalances(db: Db): Promise<Map<string, { accrued: Decimal; paid: Decimal; due: Decimal }>> {
  const rows = await db.$queryRaw<{ uid: string; accrued: Prisma.Decimal; paid: Prisma.Decimal }[]>`
    SELECT l."salesUserId" AS uid, SUM(l."credit") AS accrued, SUM(l."debit") AS paid
    FROM "JournalLine" l JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."code" = 'SALES_COMMISSIONS' AND l."salesUserId" IS NOT NULL
    GROUP BY l."salesUserId"`;
  return new Map(rows.map((r) => [r.uid, { accrued: D(r.accrued), paid: D(r.paid), due: D(r.accrued).minus(D(r.paid)) }]));
}
