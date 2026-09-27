import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { ORDER_TRANSITIONS, orderBalanceDue } from "@/server/services/orders";
import { PAYMENT_METHODS } from "@/server/chart";
import { ORDER_STATUS, ORDER_STATUS_TONE, PAYMENT_STATUS } from "@/lib/labels";
import { dateTime } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, PageHeader } from "@/components/ui";
import { InvoiceForm, PaymentForm, StatusActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { customer: true, engine: true, items: { include: { product: true } }, payments: { where: { deletedAt: null }, orderBy: { date: "asc" } } },
  });
  if (!order) notFound();
  const balances = await accountBalances(prisma);
  const accounts = balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  const names = new Map(balances.map((b) => [b.id, b.name]));
  const paid = order.payments.reduce((s, p) => s + Number(p.amount), 0);
  const due = orderBalanceDue(order.total, order.payments);
  const closed = order.status === "RETURNED" || order.status === "CANCELLED";
  const cogs = order.items.reduce((s, i) => s + Number(i.cogs ?? 0), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {created && <Alert tone="ok" title="تسجّل الطلب ✔" />}
      <PageHeader
        title={`طلب #${order.number}`}
        subtitle={<>{dateTime(order.date)} · {order.channel} · {order.engine.name}{order.customer && ` · ${order.customer.name}`}{order.customer?.phone && ` (${order.customer.phone})`}</>}
        action={
          <div className="flex flex-col items-end gap-1">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS[order.status]}</Badge>
            <Badge>{PAYMENT_STATUS[order.paymentStatus]}</Badge>
          </div>
        }
      />

      <Card>
        <div className="divide-y divide-border text-sm">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2 py-2">
              <span>
                {i.product.name} <span className="num text-muted">× {i.quantity} @ {Number(i.unitPrice).toFixed(2)}</span>
              </span>
              <Money value={i.lineTotal.toString()} />
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          {!order.discount.isZero() && <Row label="خصم" value={`-${order.discount}`} />}
          {!order.shippingFee.isZero() && <Row label="شحن" value={order.shippingFee.toString()} />}
          {!order.vatAmount.isZero() && <Row label="ضريبة القيمة المضافة (ليست إيراد)" value={order.vatAmount.toString()} />}
          <Row label="الإجمالي" value={order.total.toString()} bold />
          <Row label="المدفوع" value={paid.toFixed(2)} />
          {!closed && <Row label="المتبقي" value={due.toFixed(2)} bold />}
          {order.status === "DELIVERED" && (
            <>
              <Row label="تكلفة البضاعة (FIFO)" value={cogs.toFixed(2)} />
              <Row label="الربح الإجمالي" value={(Number(order.netRevenue) - cogs).toFixed(2)} bold />
            </>
          )}
        </div>
        {closed && paid > 0 && (
          <div className="mt-3">
            <Alert tone="warn" title={`مبلغ مستحق للعميل: ${paid.toFixed(2)}`}>مسجّل كالتزام لين ما ترجّعه.</Alert>
          </div>
        )}
      </Card>

      <StatusActions id={order.id} next={ORDER_TRANSITIONS[order.status].filter((s) => s !== "NEW")} paid={paid} accounts={accounts} />

      {order.payments.length > 0 && (
        <Card>
          <CardTitle>الدفعات</CardTitle>
          <div className="divide-y divide-border text-sm">
            {order.payments.map((p) => (
              <div key={p.id} className="flex justify-between py-2">
                <span className="text-muted">
                  {dateTime(p.date)} · {names.get(p.accountId)} {Number(p.amount) < 0 && "· استرداد"}
                </span>
                <Money value={p.amount.toString()} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!closed && due.gt(0) && (
        <Card>
          <CardTitle>{order.status === "DELIVERED" ? "تحصيل" : "دفعة / عربون"}</CardTitle>
          <PaymentForm id={order.id} due={due.toFixed(2)} methods={PAYMENT_METHODS.map((m) => ({ code: m.code, label: m.label, accountId: balances.find((b) => b.code === m.defaultAccount)!.id }))} accounts={accounts} />
        </Card>
      )}

      <Card>
        <CardTitle>الفاتورة الضريبية الرسمية</CardTitle>
        <p className="mb-3 text-xs text-muted">الفاتورة الرسمية تطلع من نظام الفوترة المعتمد. سجّل رقمها ورابطها هنا.</p>
        <InvoiceForm id={order.id} no={order.officialInvoiceNo ?? ""} url={order.officialInvoiceUrl ?? ""} />
      </Card>
      {order.contractId && (
        <Link href={`/b2b/${order.contractId}`} className="block text-sm text-primary">
          جزء من عقد B2B ← افتح العقد
        </Link>
      )}
      {order.note && <p className="text-sm text-muted">ملاحظة: {order.note}</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <Money value={value} />
    </div>
  );
}
