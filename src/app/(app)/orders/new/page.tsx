import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { stockLevels } from "@/server/services/inventory";
import { getSettings } from "@/server/services/settings";
import { CHANNELS, PAYMENT_METHODS } from "@/server/chart";
import { OrderForm } from "./order-form";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const [products, levels, balances, settings] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null, status: { notIn: ["AVOID"] } }, orderBy: [{ name: "asc" }] }),
    stockLevels(prisma),
    accountBalances(prisma),
    getSettings(prisma),
  ]);
  // المنتجات اللي في المخزون الأول
  const list = products
    .map((p) => ({ id: p.id, name: p.name, price: p.defaultSellPrice?.toString() ?? "", available: levels.get(p.id)?.available ?? 0 }))
    .sort((a, b) => Number(b.available > 0) - Number(a.available > 0));
  const byCode = new Map(balances.map((b) => [b.code, b.id]));
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-3 text-xl font-bold">طلب جديد</h1>
      <OrderForm
        products={list}
        channels={[...CHANNELS]}
        methods={PAYMENT_METHODS.map((m) => ({ code: m.code, label: m.label, accountId: byCode.get(m.defaultAccount)! }))}
        accounts={balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name }))}
        vat={{ registered: settings.vatRegistered, ratePct: settings.vatRatePct, inclusive: settings.pricesIncludeVat }}
      />
    </div>
  );
}
