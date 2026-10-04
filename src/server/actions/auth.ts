"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "../db";
import { destroySession, login, SESSION_COOKIE } from "../auth/core";
import { notifyOwner } from "../notify";

export type LoginState = { error?: string; needCode?: boolean; email?: string };

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const code = String(fd.get("code") ?? "") || undefined;
  if (!email || !password) return { error: "اكتب البريد وكلمة المرور" };
  const h = await headers();
  const userAgent = h.get("user-agent") ?? undefined;
  const r = await login(prisma, email, password, code, userAgent);
  if (!r.ok) {
    const locked = r.lockedUser;
    if (locked) after(() => notifyOwner(`🔒 حساب ${locked.name} (${locked.email}) انقفل مؤقتًا بعد محاولات دخول فاشلة كثيرة.\n${clientInfo(h, userAgent)}`));
    return { error: r.error, needCode: r.needCode, email };
  }
  const u = r.user;
  after(() => notifyOwner(`🔑 دخول جديد: ${u.name} (${u.role})\n${clientInfo(h, userAgent)}`));
  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: r.expiresAt,
  });
  redirect("/");
}

export async function logoutAction() {
  const jar = await cookies();
  await destroySession(prisma, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

function clientInfo(h: Headers, userAgent: string | undefined) {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "؟";
  const geo = [h.get("x-vercel-ip-city"), h.get("x-vercel-ip-country")].filter((v): v is string => !!v).map(safeDecode).join("، ");
  return [`IP: ${ip}${geo ? ` (${geo})` : ""}`, `الجهاز: ${userAgent?.slice(0, 150) ?? "؟"}`].join("\n");
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
