import { PrismaClient } from "@prisma/client";
import { riyadhStartOfDay } from "@/domain/plan-calendar";
import { seedBase } from "@/server/seed";
import type { Actor } from "@/server/audit";

export const db = new PrismaClient();
export const actor: Actor & { role: string } = { userId: null, role: "owner" };

/** يمسح كل الجداول ويرجّع البيانات الأولية (بنك 20,000) */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await seedBase(db);
}

/** وقت محدد بتوقيت الرياض: at("2026-09-28", 14) = 2 الظهر */
export function at(dateKey: string, hour = 12, minute = 0): Date {
  return new Date(riyadhStartOfDay(dateKey).getTime() + (hour * 60 + minute) * 60000);
}

export async function acct(code: string) {
  return db.ledgerAccount.findUniqueOrThrow({ where: { code } });
}

export async function product(number: number) {
  return db.product.findUniqueOrThrow({ where: { number } });
}

export async function setSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}
