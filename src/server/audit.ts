import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

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
  await tx.auditLog.create({
    data: {
      userId: actor.userId,
      action,
      entity,
      entityId,
      before: data.before === undefined ? undefined : toJson(data.before),
      after: data.after === undefined ? undefined : toJson(data.after),
      reason: data.reason,
    },
  });
}
