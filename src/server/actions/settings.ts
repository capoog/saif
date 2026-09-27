"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { DEFAULT_SETTINGS } from "@/domain/settings";
import { prisma } from "../db";
import { audit } from "../audit";
import { actorOf, requireUser } from "../auth/session";
import { hashPassword } from "../auth/core";
import { generateTotpSecret, totpUri, verifyTotp } from "../auth/totp";
import { updateSettings } from "../services/settings";
import { UserError } from "../errors";
import { run, type ActionState } from "./run";

export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const patch: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof def === "boolean") {
        if (fd.has(`${key}__present`)) patch[key] = fd.get(key) === "on";
        continue;
      }
      const raw = fd.get(key);
      if (raw === null || typeof raw !== "string") continue;
      if (typeof def === "number") {
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n) || n < 0) throw new UserError(`قيمة غير صالحة: ${key}`);
        patch[key] = n;
      } else patch[key] = raw.trim();
    }
    await updateSettings(prisma, actorOf(user), patch);
  });
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true, message: "انحفظت الإعدادات" } : res;
}

export async function startTotpAction(): Promise<ActionState> {
  const user = await requireUser();
  if (user.totpEnabled) return { ok: false, error: "التحقق الثنائي مفعّل بالفعل" };
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  const uri = totpUri(secret, user.email);
  return { ok: true, data: { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) } };
}

export async function confirmTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = String(fd.get("code") ?? "");
  if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) return { ok: false, error: "الكود غير صحيح" };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await prisma.$transaction((tx) => audit(tx, actorOf(user), "enable_2fa", "User", user.id));
  revalidatePath("/settings");
  return { ok: true, message: "التحقق الثنائي تفعّل ✔" };
}

export async function disableTotpAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = String(fd.get("code") ?? "");
  if (!user.totpSecret || !verifyTotp(user.totpSecret, code)) return { ok: false, error: "الكود غير صحيح" };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await prisma.$transaction((tx) => audit(tx, actorOf(user), "disable_2fa", "User", user.id));
  revalidatePath("/settings");
  return { ok: true, message: "انلغى التحقق الثنائي" };
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new UserError("كلمة المرور الحالية غير صحيحة");
    if (next.length < 10) throw new UserError("كلمة المرور الجديدة لازم تكون 10 حروف على الأقل");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
    // تسجيل خروج كل الأجهزة التانية
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.$transaction((tx) => audit(tx, actorOf(user), "change_password", "User", user.id));
    return { ok: true, message: "تغيّرت كلمة المرور — سجّل دخول مرة ثانية" };
  });
}
