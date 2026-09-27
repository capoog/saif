import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "@/domain/settings";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";

export async function getSettings(db: Db | Tx): Promise<Settings> {
  const rows = await db.setting.findMany();
  return mergeSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export async function updateSettings(db: Db, actor: Actor, patch: Partial<Record<string, unknown>>) {
  const current = await getSettings(db);
  await db.$transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) throw new UserError(`إعداد غير معروف: ${key}`);
      const def = DEFAULT_SETTINGS[key as keyof Settings];
      if (typeof value !== typeof def) throw new UserError(`قيمة غير صالحة لـ ${key}`);
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) throw new UserError(`قيمة غير صالحة لـ ${key}`);
      const before = current[key as keyof Settings];
      if (before === value) continue;
      await tx.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
      await audit(tx, actor, "update", "Setting", key, { before, after: value });
    }
  });
}
