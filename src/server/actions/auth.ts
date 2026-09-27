"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../db";
import { destroySession, login, SESSION_COOKIE } from "../auth/core";

export type LoginState = { error?: string; needCode?: boolean; email?: string };

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const code = String(fd.get("code") ?? "") || undefined;
  if (!email || !password) return { error: "اكتب البريد وكلمة المرور" };
  const r = await login(prisma, email, password, code, (await headers()).get("user-agent") ?? undefined);
  if (!r.ok) return { error: r.error, needCode: r.needCode, email };
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
