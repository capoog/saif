import { Prisma, type ExternalOrder, type OrderStatus } from "@prisma/client";
import { D } from "@/domain/money";
import { parseSalla } from "@/integrations/stores/salla";
import { parseZid } from "@/integrations/stores/zid";
import type { StoreOrder, StoreOrderStatus } from "@/integrations/stores/types";
import type { Db, Tx } from "../db";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { UserError } from "../errors";
import { PAYMENT_METHODS } from "../chart";
import { addPaymentTx, changeStatusTx, createOrderTx, paidSoFar } from "./orders";
import { getSettings } from "./settings";

export const STORE_CHANNEL = "سلة / زد";
export const STORE_LABEL: Record<string, string> = { SALLA: "سلة", ZID: "زد" };

// ترتيب الحالات: نمشي للأمام بس (webhook قديم وصل متأخر ما يرجّع الطلب)
const RANK: Record<OrderStatus, number> = { NEW: 0, CONFIRMED: 1, SHIPPED: 2, DELIVERED: 3, RETURNED: 4, CANCELLED: 4 };

export function parseStorePayload(source: string, body: unknown): StoreOrder | null {
  return source === "SALLA" ? parseSalla(body) : parseZid(body);
}

async function accountFor(tx: Tx, method: string) {
  const code = PAYMENT_METHODS.find((m) => m.code === method && m.code !== "cod")?.defaultAccount ?? "WALLET_CARDS";
  return tx.ledgerAccount.findUniqueOrThrow({ where: { code } });
}

/** يطبّق حالة المتجر والدفع على طلب موجود */
async function syncOrderTx(tx: Tx, actor: Actor, orderId: string, so: StoreOrder) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const date = new Date();
  // الدفع: المتجر يقول مدفوع وإحنا ما سجلنا شي
  if (so.paid && so.status !== "CANCELLED" && so.status !== "RETURNED" && order.status !== "CANCELLED" && order.status !== "RETURNED") {
    const paid = await paidSoFar(tx, orderId);
    const left = D(order.total).minus(paid);
    if (left.gt(0)) {
      const acc = await accountFor(tx, so.paymentMethod);
      await addPaymentTx(tx, actor, orderId, { amount: left.toFixed(2), method: so.paymentMethod, accountId: acc.id, date, note: `دفع ${STORE_LABEL[so.source]}` });
    }
  }
  let target: OrderStatus | null = so.status as StoreOrderStatus | null;
  if (target === "RETURNED" && order.status !== "DELIVERED") target = "CANCELLED";
  if (target && target !== order.status && RANK[target] > RANK[order.status]) {
    await changeStatusTx(tx, actor, orderId, target, date);
    if (target === "CANCELLED" || target === "RETURNED") {
      const paid = await paidSoFar(tx, orderId);
      if (paid.gt(0)) {
        const first = await tx.payment.findFirst({ where: { orderId, deletedAt: null, amount: { gt: 0 } }, orderBy: { date: "asc" } });
        await addPaymentTx(tx, actor, orderId, { amount: paid.neg().toFixed(2), method: first?.method ?? so.paymentMethod, accountId: first!.accountId, date, note: `استرداد ${STORE_LABEL[so.source]}` });
      }
    }
  }
  if (so.invoice && !order.officialInvoiceNo) {
    await tx.order.update({ where: { id: orderId }, data: { officialInvoiceNo: so.invoice.number, officialInvoiceUrl: so.invoice.url } });
  }
}

/**
 * يستقبل طلب من المتجر (أول مرة أو تحديث). آمن للتكرار: نفس الطلب ما يتسجل مرتين.
 * منتج SKU مو معروف → NEEDS_MAPPING. خطأ (مخزون ناقص…) → ERROR والرسالة تبان في شاشة الربط.
 */
export async function ingestStoreOrder(db: Db, so: StoreOrder, payload: unknown, actor: Actor = SYSTEM_ACTOR): Promise<ExternalOrder> {
  const key = { source_externalId: { source: so.source, externalId: so.externalId } };
  const json = payload as Prisma.InputJsonValue;
  try {
    await db.externalOrder.upsert({
      where: key,
      create: { source: so.source, externalId: so.externalId, reference: so.reference, status: "NEEDS_MAPPING", storeStatus: so.storeStatus, payload: json, missingSkus: [] },
      update: { payload: json, storeStatus: so.storeStatus, reference: so.reference, attempts: { increment: 1 } },
    });
  } catch (e) {
    // طلبين وصلوا بنفس اللحظة — الثاني يكمّل على نفس السجل
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  const settings = await getSettings(db);
  try {
    return await db.$transaction(
      async (tx) => {
        // قفل السجل عشان ما يتسجل الطلب مرتين لو وصل webhook ثاني بنفس الوقت
        await tx.$queryRaw`SELECT id FROM "ExternalOrder" WHERE source = ${so.source} AND "externalId" = ${so.externalId} FOR UPDATE`;
        const ext = await tx.externalOrder.findUniqueOrThrow({ where: key });
        if (ext.orderId) {
          await syncOrderTx(tx, actor, ext.orderId, so);
          return tx.externalOrder.update({ where: { id: ext.id }, data: { status: "SYNCED", error: null, missingSkus: [] } });
        }
        if (so.status === "CANCELLED" || so.status === "RETURNED") {
          return tx.externalOrder.update({ where: { id: ext.id }, data: { status: "IGNORED", error: null, missingSkus: [] } });
        }
        if (!so.items.length) throw new UserError("الطلب بدون منتجات");
        const skus = [...new Set(so.items.map((i) => i.sku))];
        const products = await tx.product.findMany({ where: { sku: { in: skus.filter(Boolean) }, deletedAt: null } });
        const bySku = new Map(products.map((p) => [p.sku!, p]));
        const missing = skus.filter((s) => !bySku.has(s)).map((s) => s || "(بدون SKU)");
        if (missing.length) return tx.externalOrder.update({ where: { id: ext.id }, data: { status: "NEEDS_MAPPING", missingSkus: missing, error: null } });

        const order = await createOrderTx(
          tx,
          actor,
          {
            date: so.date > new Date() || Number.isNaN(so.date.getTime()) ? new Date() : so.date,
            customer: { name: so.customer.name, phone: so.customer.phone },
            channel: STORE_CHANNEL,
            items: so.items.map((i) => ({ productId: bySku.get(i.sku)!.id, quantity: i.quantity, unitPrice: i.unitPrice })),
            discount: so.discount,
            shippingFee: so.shippingFee,
            status: "NEW",
            paymentMethod: so.paymentMethod,
            officialInvoiceNo: so.invoice?.number ?? null,
            officialInvoiceUrl: so.invoice?.url ?? null,
            note: `${STORE_LABEL[so.source]} #${so.reference ?? so.externalId}${so.total ? ` · إجمالي المتجر ${so.total}` : ""}`,
          },
          settings,
        );
        await tx.order.update({ where: { id: order.id }, data: { externalSource: so.source, externalId: so.externalId } });
        await syncOrderTx(tx, actor, order.id, so);
        await audit(tx, actor, "import", "Order", order.id, { after: { source: so.source, externalId: so.externalId } });
        return tx.externalOrder.update({ where: { id: ext.id }, data: { status: "SYNCED", orderId: order.id, error: null, missingSkus: [] } });
      },
      { timeout: 20000 },
    );
  } catch (e) {
    const msg = e instanceof UserError ? e.message : e instanceof Error ? e.message.slice(0, 300) : "خطأ غير معروف";
    if (!(e instanceof UserError)) console.error("store sync", so.source, so.externalId, e);
    return db.externalOrder.update({ where: key, data: { status: "ERROR", error: msg } });
  }
}

/** إعادة المحاولة من آخر نسخة محفوظة (بعد ربط SKU أو تسجيل مخزون) */
export async function retryExternalOrder(db: Db, id: string, actor: Actor = SYSTEM_ACTOR) {
  const ext = await db.externalOrder.findUniqueOrThrow({ where: { id } });
  const so = parseStorePayload(ext.source, ext.payload);
  if (!so) throw new UserError("النسخة المحفوظة مو طلب");
  return ingestStoreOrder(db, so, ext.payload, actor);
}

/** يربط SKU بمنتج ويعيد كل الطلبات المعلّقة عليه */
export async function mapSku(db: Db, actor: Actor, sku: string, productId: string) {
  const s = sku.trim();
  if (!s || s === "(بدون SKU)") throw new UserError("المنتج في المتجر ما له SKU — حط له رمز في لوحة المتجر أول");
  const taken = await db.product.findFirst({ where: { sku: s, id: { not: productId } } });
  if (taken) throw new UserError(`الرمز مربوط بـ «${taken.name}»`);
  const before = await db.product.findUniqueOrThrow({ where: { id: productId } });
  await db.product.update({ where: { id: productId }, data: { sku: s } });
  await audit(db, actor, "update", "Product", productId, { before: { sku: before.sku }, after: { sku: s } });
  const pending = await db.externalOrder.findMany({ where: { status: "NEEDS_MAPPING", missingSkus: { has: s } } });
  for (const p of pending) await retryExternalOrder(db, p.id, actor);
  return pending.length;
}

export function integrationStatus() {
  return { salla: !!process.env.SALLA_WEBHOOK_SECRET, zid: !!process.env.ZID_WEBHOOK_TOKEN };
}
