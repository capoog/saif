import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role, User } from "@prisma/client";
import type { Db } from "../db";
import { audit } from "../audit";
import { verifyTotp } from "./totp";

export const SESSION_COOKIE = "saif_session";
export const SESSION_DAYS = 30;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = "$2b$12$eCry8XmdiHx.AAGvkOfefe5LE1vsukpg.TPAsQWyLPfjpmW4EOZhK";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET غير مضبوط (16 حرف على الأقل)");
  return s;
}

export function hashToken(token: string): string {
  return crypto.createHmac("sha256", secret()).update(token).digest("hex");
}

export type LoginResult =
  | { ok: true; token: string; user: User; expiresAt: Date }
  | { ok: false; needCode?: boolean; error: string; lockedUser?: Pick<User, "name" | "email"> };

/** التحقق من بيانات الدخول (+ كود 2FA لو مفعّل)، مع قفل الحساب بعد محاولات فاشلة. */
export async function login(db: Db, email: string, password: string, code: string | undefined, userAgent?: string): Promise<LoginResult> {
  const generic = { ok: false as const, error: "البريد أو كلمة المرور غير صحيحة" };
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) {
    await bcrypt.compare(password, DUMMY_HASH); // نفس التوقيت سواء المستخدم موجود أو لا
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "الحساب مقفول مؤقتًا بسبب محاولات كثيرة. جرّب بعد شوي." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (valid && user.totpEnabled && !code) return { ok: false, needCode: true, error: "" };
  const codeOk = !user.totpEnabled || (!!user.totpSecret && !!code && verifyTotp(user.totpSecret, code));
  if (!valid || !codeOk) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      },
    });
    await db.$transaction((tx) => audit(tx, { userId: user.id }, "login_failed", "User", user.id));
    // لو هذي المحاولة اللي قفلت الحساب، نرجّع المستخدم عشان يتنبّه المالك
    const lockedUser = failed >= MAX_FAILED ? { name: user.name, email: user.email } : undefined;
    return valid ? { ok: false, needCode: true, error: "كود التحقق غير صحيح", lockedUser } : { ...generic, lockedUser };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await db.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  await db.$transaction((tx) => audit(tx, { userId: user.id }, "login", "User", user.id));
  return { ok: true, token, user, expiresAt };
}

export async function userFromToken(db: Db, token: string | undefined) {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

export async function destroySession(db: Db, token: string | undefined) {
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function hasRole(user: Pick<User, "role">, roles: Role[]) {
  return roles.includes(user.role);
}

export async function hashPassword(password: string) {
  if (password.length < 8) throw new Error("كلمة المرور لازم تكون 8 حروف على الأقل");
  return bcrypt.hash(password, 12);
}
