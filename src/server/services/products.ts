import type { ProductKind, ProductStatus } from "@prisma/client";
import { toDb2, toDb4 } from "@/domain/money";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";

export interface ProductPatch {
  status?: ProductStatus;
  kind?: ProductKind;
  defaultSellPrice?: string | null;
  estimatedUnitCost?: string | null;
  unit?: string;
  notes?: string | null;
  name?: string;
  sku?: string | null;
}

const skuOf = (v?: string | null) => (v == null ? v : v.trim() || null);

export async function updateProduct(db: Db, actor: Actor, id: string, patch: ProductPatch) {
  return db.$transaction(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({ where: { id } });
    if (patch.kind && patch.kind !== before.kind) {
      if (patch.kind === "BOX" && (await tx.inventoryBatch.count({ where: { productId: id } })) > 0) {
        throw new UserError("المنتج هذا له مخزون — ما يصير يتحول بوكس");
      }
      if (patch.kind === "GOODS" && (await tx.recipeLine.count({ where: { boxId: id } })) > 0) {
        throw new UserError("امسح مكونات البوكس الأول");
      }
    }
    const saved = await tx.product.update({
      where: { id },
      data: {
        status: patch.status,
        kind: patch.kind,
        name: patch.name?.trim() || undefined,
        sku: skuOf(patch.sku),
        unit: patch.unit?.trim() || undefined,
        notes: patch.notes === undefined ? undefined : patch.notes || null,
        defaultSellPrice: patch.defaultSellPrice === undefined ? undefined : patch.defaultSellPrice ? toDb2(patch.defaultSellPrice) : null,
        estimatedUnitCost: patch.estimatedUnitCost === undefined ? undefined : patch.estimatedUnitCost ? toDb4(patch.estimatedUnitCost) : null,
      },
    });
    await audit(tx, actor, "update", "Product", id, { before, after: saved });
    return saved;
  });
}

export async function createProduct(
  db: Db,
  actor: Actor,
  input: { name: string; category: string; engineId: string; kind?: ProductKind; defaultSellPrice?: string | null; estimatedUnitCost?: string | null; unit?: string; sku?: string | null },
) {
  if (!input.name.trim()) throw new UserError("اكتب اسم المنتج");
  return db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: input.name.trim(),
        category: input.category.trim() || "أخرى",
        engineId: input.engineId,
        sku: skuOf(input.sku) ?? null,
        kind: input.kind ?? "GOODS",
        status: "TESTING",
        unit: input.unit?.trim() || (input.kind === "BOX" ? "بوكس" : "قطعة"),
        defaultSellPrice: input.defaultSellPrice ? toDb2(input.defaultSellPrice) : null,
        estimatedUnitCost: input.estimatedUnitCost ? toDb4(input.estimatedUnitCost) : null,
      },
    });
    await audit(tx, actor, "create", "Product", p.id, { after: p });
    return p;
  });
}
