import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, login, userFromToken } from "@/server/auth/core";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from "@/server/auth/totp";
import { db, resetDb } from "../helpers";

describe("TOTP", () => {
  it("متجه اختبار RFC 6238 (SHA1)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("يقبل فرق خطوة واحدة ويرفض أكتر", () => {
    const s = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(s, totpCode(s, now - 30000), now)).toBe(true);
    expect(verifyTotp(s, totpCode(s, now - 90000), now)).toBe(false);
    expect(verifyTotp(s, "abc", now)).toBe(false);
  });
});

describe("الدخول", () => {
  beforeEach(async () => {
    await resetDb();
    await db.user.create({ data: { email: "owner@test.sa", name: "م", role: "owner", passwordHash: await hashPassword("correct-horse") } });
  });

  it("دخول ناجح ينشئ جلسة صالحة", async () => {
    const r = await login(db, "Owner@Test.sa", "correct-horse", undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await userFromToken(db, r.token))?.email).toBe("owner@test.sa");
    expect(await userFromToken(db, "fake")).toBeNull();
  });

  it("يقفل الحساب بعد 5 محاولات فاشلة", async () => {
    for (let i = 0; i < 5; i++) expect((await login(db, "owner@test.sa", "wrong", undefined)).ok).toBe(false);
    const r = await login(db, "owner@test.sa", "correct-horse", undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/مقفول/);
  });

  it("2FA: يطلب الكود ويرفض الغلط ويقبل الصح", async () => {
    const secret = generateTotpSecret();
    await db.user.update({ where: { email: "owner@test.sa" }, data: { totpSecret: secret, totpEnabled: true } });
    const step1 = await login(db, "owner@test.sa", "correct-horse", undefined);
    expect(step1.ok === false && step1.needCode).toBe(true);
    expect((await login(db, "owner@test.sa", "correct-horse", "000000")).ok).toBe(false);
    expect((await login(db, "owner@test.sa", "correct-horse", totpCode(secret))).ok).toBe(true);
  });
});
