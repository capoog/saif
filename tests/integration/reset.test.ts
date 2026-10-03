import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlanStartKey, planDay, planWeek, setPlanStart } from "@/domain/plan-calendar";
import { getCapital } from "@/server/services/balances";
import { createBusiness } from "@/server/services/businesses";
import { saveFreelancer } from "@/server/services/agency";
import { createCustomer } from "@/server/services/crm";
import { createTransaction } from "@/server/services/transactions";
import { createUser } from "@/server/services/users";
import { closeDraft } from "@/server/services/close";
import { resetChallenge } from "@/server/services/reset";
import { updateSettings } from "@/server/services/settings";
import { seedBase } from "@/server/seed";
import { acct, db, resetDb } from "../helpers";

// التصفير يوم 3 أكتوبر 2026 الساعة 3 العصر بتوقيت الرياض
const NOW = new Date("2026-10-03T12:00:00Z");

describe("تصفير التحدي", () => {
  let ownerId = "";

  beforeAll(async () => {
    await resetDb();
    const owner = await db.user.create({ data: { email: "o@x.com", name: "المالك", role: "owner", passwordHash: await bcrypt.hash("owner-pass-1", 4) } });
    ownerId = owner.id;
    const actor = { userId: owner.id };
    // بيانات تجربة
    await createTransaction(db, actor, { type: "EXPENSE", date: new Date("2026-09-28T09:00:00Z"), amount: "500", accountId: (await acct("BANK")).id, category: "EXP_OTHER" });
    await createCustomer(db, actor, { name: "عميل تجربة" });
    await createBusiness(db, actor, { name: "كافيه تجربة", kind: "CAFE" });
    const f = await saveFreelancer(db, actor, { name: "مستقل" });
    await createUser(db, actor, { name: "مستقل", email: "f@x.com", password: "freelancer-1", role: "freelancer", freelancerId: f.id } as never);
    await createUser(db, actor, { name: "مندوب", email: "s@x.com", password: "salesman-12", role: "sales" } as never);
    await updateSettings(db, actor, { projectMaxPct: 30 });
    await db.session.create({ data: { tokenHash: "h1", userId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
    expect((await getCapital(db, NOW)).capital.toFixed(2)).toBe("19500.00");
  });

  afterAll(() => setPlanStart(undefined));

  it("يرفض بدون الكلمة أو بكلمة مرور غلط، أو من غير المالك", async () => {
    await expect(resetChallenge(db, { userId: ownerId }, { phrase: "صفر", password: "owner-pass-1", now: NOW })).rejects.toThrow(/تصفير/);
    await expect(resetChallenge(db, { userId: ownerId }, { phrase: "تصفير", password: "wrong", now: NOW })).rejects.toThrow(/غلط/);
    const rep = await db.user.findUniqueOrThrow({ where: { email: "s@x.com" } });
    await expect(resetChallenge(db, { userId: rep.id }, { phrase: "تصفير", password: "salesman-12", now: NOW })).rejects.toThrow(/للمالك/);
    expect(await db.customer.count()).toBe(1);
  });

  it("يمسح كل شي ويبدأ اليوم 1 من يوم التصفير برأس مال 20,000", async () => {
    const r = await resetChallenge(db, { userId: ownerId }, { phrase: " تصفير ", password: "owner-pass-1", now: NOW });
    expect(r.startKey).toBe("2026-10-03");
    expect(getPlanStartKey()).toBe("2026-10-03");
    expect(planDay(NOW)).toBe(1);
    expect(planWeek(new Date("2026-10-10T12:00:00Z"))).toBe(2);

    expect(await db.customer.count()).toBe(0);
    expect(await db.transaction.count()).toBe(0);
    expect(await db.engine.count({ where: { code: { startsWith: "BIZ_" } } })).toBe(0);
    expect(await db.freelancer.count()).toBe(0);
    expect((await db.user.findMany()).map((u) => u.email)).toEqual(["o@x.com"]);
    expect(await db.session.count()).toBe(1); // المالك يبقى داخل
    expect(await db.product.count({ where: { number: { not: null } } })).toBe(56);
    expect((await db.setting.findMany()).map((s) => s.key)).toEqual(["planStartKey"]);

    const w1 = await db.weeklyTarget.findUniqueOrThrow({ where: { week: 1 } });
    const w33 = await db.weeklyTarget.findUniqueOrThrow({ where: { week: 33 } });
    expect(w1.weekStartDate.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(w33.weekStartDate.toISOString().slice(0, 10)).toBe("2027-05-15");

    const cap = await getCapital(db, NOW);
    expect(cap.capital.toFixed(2)).toBe("20000.00");
    const opening = await db.journalEntry.findFirstOrThrow({ where: { sourceType: "OPENING" } });
    expect(opening.date.toISOString()).toBe("2026-10-02T21:00:00.000Z");
    expect((await closeDraft(db, NOW)).week).toBe(1);
    expect(await db.auditLog.count({ where: { action: "reset" } })).toBe(1);
  });

  it("النشر بعد التصفير (seed) ما يرجّع التواريخ القديمة", async () => {
    setPlanStart(undefined);
    await seedBase(db);
    expect(getPlanStartKey()).toBe("2026-10-03");
    const w1 = await db.weeklyTarget.findUniqueOrThrow({ where: { week: 1 } });
    expect(w1.weekStartDate.toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(await db.journalEntry.count({ where: { sourceType: "OPENING" } })).toBe(1);
  });
});
