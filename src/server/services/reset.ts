import bcrypt from "bcryptjs";
import { riyadhDateKey, setPlanStart } from "@/domain/plan-calendar";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { seedBase } from "../seed";
import { PLAN_START_SETTING } from "./settings";

export const RESET_PHRASE = "تصفير";

// جداول ما تنمسح بالـ TRUNCATE: حساب المالك وجلساته، والمستقلين (مربوطين بجدول المستخدمين — ينمسحون بـ DELETE)
const KEEP = new Set(["_prisma_migrations", "User", "Session", "Freelancer"]);

/**
 * «تصفير التحدي»: يمسح كل شي (عمليات، عملاء، موردين، منتجات، أنشطة، إعدادات، حسابات المناديب والمستقلين)
 * ويرجع البيانات الأولية: 20,000 في البنك، واليوم 1 = يوم التصفير.
 * يبقى بس حساب المالك (الإيميل، كلمة المرور، التحقق الثنائي) عشان يقدر يدخل.
 */
export async function resetChallenge(db: Db, actor: Actor, input: { phrase: string; password: string; now?: Date }) {
  if (!actor.userId) throw new UserError("التصفير للمالك بس");
  const owner = await db.user.findUnique({ where: { id: actor.userId } });
  if (!owner || owner.role !== "owner") throw new UserError("التصفير للمالك بس");
  if (input.phrase.trim() !== RESET_PHRASE) throw new UserError(`اكتب كلمة «${RESET_PHRASE}» بالضبط`);
  if (!(await bcrypt.compare(input.password, owner.passwordHash))) throw new UserError("كلمة المرور غلط");

  const startKey = riyadhDateKey(input.now ?? new Date());
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const wipe = tables.map((t) => t.tablename).filter((t) => !KEEP.has(t));

  await db.$transaction(
    async (tx) => {
      // المستخدمين غير المالك (مناديب ومستقلين) وجلساتهم
      await tx.session.deleteMany({ where: { user: { role: { not: "owner" } } } });
      await tx.user.deleteMany({ where: { role: { not: "owner" } } });
      await tx.user.updateMany({ data: { freelancerId: null } });
      // CASCADE آمن هنا: ما فيه جدول باقي (User / Session / Freelancer) يعتمد على الجداول الممسوحة
      await tx.$executeRawUnsafe(`TRUNCATE ${wipe.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
      await tx.freelancer.deleteMany();
      await tx.setting.create({ data: { key: PLAN_START_SETTING, value: startKey } });
    },
    { timeout: 60000 },
  );
  setPlanStart(startKey);
  await seedBase(db);
  await audit(db, actor, "reset", "Challenge", startKey, { after: { startKey, wiped: wipe.length } });
  return { startKey };
}
