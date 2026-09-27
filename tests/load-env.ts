import fs from "node:fs";
import path from "node:path";

/** يحمّل .env لو موجود، ويوجّه Prisma لقاعدة الاختبار */
export function loadTestEnv() {
  const envFile = path.resolve(import.meta.dirname, "../.env");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("حدد DATABASE_URL_TEST (قاعدة اختبار منفصلة — بتتمسح مع كل تشغيل)");
  // حماية: الاختبارات بتمسح القاعدة بالكامل، فلازم اسمها يكون فيه test
  if (!/test/i.test(new URL(url).pathname)) throw new Error("اسم قاعدة الاختبار لازم يحتوي على test");
  process.env.DATABASE_URL = url;
}
