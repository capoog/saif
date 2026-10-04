import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { queueActionAlert } from "./action-alerts";

export interface Actor {
  userId: string | null;
}

export const SYSTEM_ACTOR: Actor = { userId: null };

/** يحوّل Decimal و Date لنصوص قبل التخزين في JSON */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (v && typeof v === "object" && v.constructor?.name === "Decimal" ? v.toString() : v)),
  );
}

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  data: { before?: unknown; after?: unknown; reason?: string } = {},
) {
  const before = data.before === undefined ? undefined : toJson(data.before);
  const after = data.after === undefined ? undefined : toJson(data.after);
  const row = await tx.auditLog.create({
    data: { userId: actor.userId, action, entity, entityId, before, after, reason: data.reason },
    select: { id: true, createdAt: true },
  });
  // تنبيه تيليجرام بعد الرد (ولو المعاملة انحفظت فعلًا)
  queueActionAlert({ auditId: row.id, userId: actor.userId, action, entity, entityId, before, after, reason: data.reason, at: row.createdAt });
}
