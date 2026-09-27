import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "../db";
import { SESSION_COOKIE, userFromToken } from "./core";

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(prisma, token);
});

/** الصفحة الرئيسية لكل دور */
export function homeFor(role: Role): string {
  return role === "owner" ? "/" : role === "sales" ? "/crm" : "/tasks";
}

/** لأي صفحة أو action: يرجّع المستخدم أو يحوّل للدخول. الأدوار: الافتراضي owner بس. */
export async function requireUser(roles: Role[] = ["owner"]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function actorOf(user: { id: string; role: Role }) {
  return { userId: user.id, role: user.role };
}
