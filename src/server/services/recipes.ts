import { qty } from "@/domain/fifo";
import type { DecimalLike } from "@/domain/money";
import type { Db } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";

/** وصفة البوكس: بتستبدل المكونات كلها مرة واحدة */
export async function setRecipe(db: Db, actor: Actor, boxId: string, lines: { componentId: string; quantity: DecimalLike }[]) {
  return db.$transaction(async (tx) => {
    const box = await tx.product.findUniqueOrThrow({ where: { id: boxId } });
    if (box.kind !== "BOX") throw new UserError("المنتج هذا مو بوكس");
    const ids = lines.map((l) => l.componentId);
    if (new Set(ids).size !== ids.length) throw new UserError("فيه مكوّن متكرر");
    if (ids.includes(boxId)) throw new UserError("البوكس ما يصير يكون مكوّن في نفسه");
    const comps = await tx.product.findMany({ where: { id: { in: ids } } });
    if (comps.some((c) => c.kind === "BOX")) throw new UserError("المكونات لازم تكون مواد، مو بوكسات");
    for (const l of lines) if (qty(l.quantity).lte(0)) throw new UserError("كمية كل مكوّن لازم تكون أكبر من صفر");
    const before = await tx.recipeLine.findMany({ where: { boxId } });
    await tx.recipeLine.deleteMany({ where: { boxId } });
    if (lines.length) await tx.recipeLine.createMany({ data: lines.map((l) => ({ boxId, componentId: l.componentId, quantity: qty(l.quantity).toFixed(3) })) });
    await audit(tx, actor, "update", "Recipe", boxId, { before, after: lines });
  });
}
