"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "../db";
import { actorOf, requireUser } from "../auth/session";
import { resetChallenge } from "../services/reset";
import { formObject, run, type ActionState } from "./run";

export async function resetChallengeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await run(async () => {
    const v = z.object({ phrase: z.string(), password: z.string().min(1, "اكتب كلمة المرور") }).parse(formObject(fd));
    await resetChallenge(prisma, actorOf(user), v);
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect("/");
}
