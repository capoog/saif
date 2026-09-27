import { PrismaClient } from "@prisma/client";
import { seedBase } from "../src/server/seed";

const db = new PrismaClient();

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) throw new Error("حدد OWNER_EMAIL و OWNER_PASSWORD (في .env محليًا، أو Environment Variables في Vercel)");
  if (password.length < 8) throw new Error("OWNER_PASSWORD لازم يكون 8 حروف على الأقل");
  await seedBase(db, { owner: { email, password, name: process.env.OWNER_NAME || "المالك" } });
  console.log("✔ البيانات الأولية تسجّلت");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
