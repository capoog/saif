import type { ProductStatus } from "@prisma/client";
import { toDb2 } from "@/domain/money";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";

export interface ProductPatch {
  status?: ProductStatus;
  defaultSellPrice?: string | null;
  notes?: string | null;
  name?: string;
}

export async function updateProduct(db: Db, actor: Actor, id: string, patch: ProductPatch) {
  return db.$transaction(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    const saved = await tx.product.update({
      where: { id },
      data: {
        status: patch.status,
        name: patch.name?.trim() || undefined,
        notes: patch.notes === undefined ? undefined : patch.notes || null,
        defaultSellPrice: patch.defaultSellPrice === undefined ? undefined : patch.defaultSellPrice ? toDb2(patch.defaultSellPrice) : null,
      },
    });
    await audit(tx, actor, "update", "Product", id, { before, after: saved });
    return saved;
  });
}

export async function createProduct(db: Db, actor: Actor, input: { name: string; category: string; engineId: string; defaultSellPrice?: string | null; unit?: string }) {
  if (!input.name.trim()) throw new UserError("اكتب اسم المنتج");
  return db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: input.name.trim(),
        category: input.category.trim() || "أخرى",
        engineId: input.engineId,
        status: "TESTING",
        unit: input.unit || "قطعة",
        defaultSellPrice: input.defaultSellPrice ? toDb2(input.defaultSellPrice) : null,
      },
    });
    await audit(tx, actor, "create", "Product", p.id, { after: p });
    return p;
  });
}
