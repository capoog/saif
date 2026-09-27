import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { accountBalances, getCapital } from "@/server/services/balances";
import { INVOICE_STATUS, PROJECT_STATUS, PROJECT_TYPES, projectSummary } from "@/server/services/projects";
import { getSettings } from "@/server/services/settings";
import { EXPENSE_CATEGORIES } from "@/server/chart";
import { date } from "@/lib/format";
import { Alert, Badge, Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";
import { EditProject, InvoiceActions, NewInvoice, ProjectMoney } from "./client";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.bigProject.findUnique({ where: { id }, include: { customer: true, invoices: { orderBy: { number: "asc" } } } });
  if (!p) notFound();
  const [cap, s, balances, costs] = await Promise.all([
    getCapital(prisma),
    getSettings(prisma),
    accountBalances(prisma),
    prisma.transaction.findMany({ where: { refType: "PROJECT", refId: id, deletedAt: null }, orderBy: { date: "desc" } }),
  ]);
  const sum = await projectSummary(prisma, id, cap.capital, s);
  const accounts = balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  const advanceLeft = Math.max(Number(sum.advanceTarget) - Number(sum.advanceReceived), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={p.name}
        subtitle={
          <>
            {PROJECT_TYPES[p.type]} · <Link href={`/customers/${p.customerId}`} className="text-primary">{p.customer.name}</Link>
          </>
        }
        action={<Badge tone={p.status === "ACTIVE" ? "info" : p.status === "COMPLETED" ? "ok" : "warn"}>{PROJECT_STATUS[p.status]}</Badge>}
      />
      {sum.warnings.map((w) => (
        <Alert key={w} tone="warn">{w}</Alert>
      ))}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="قيمة العقد" value={<Money value={p.value.toString()} />} sub={`منفّذ ${sum.progressPct.toFixed(0)}%`} />
        <Stat label="الدفعة المقدمة" value={<Money value={sum.advanceReceived.toString()} />} sub={`من ${sum.advanceTarget.toFixed(0)} (${p.advancePct.toString()}%)`} />
        <Stat label={sum.balance.gte(0) ? "مستحق لك" : "مقدمة ما انخصمت"} value={<Money value={sum.balance.abs().toString()} />} tone={sum.balance.gt(0) ? "warn" : undefined} />
        <Stat label="الربح للحين" value={<Money value={sum.profit.toString()} />} sub={<>مصروفات <Money value={sum.costs.toString()} /></>} tone={sum.profit.lt(0) ? "danger" : undefined} />
      </div>

      <Card>
        <CardTitle>المستخلصات</CardTitle>
        {p.invoices.length === 0 ? (
          <p className="text-sm text-muted">ما فيه مستخلصات.</p>
        ) : (
          <div className="divide-y divide-border">
            {p.invoices.map((i) => {
              const net = Number(i.amount) + Number(i.vatAmount) - Number(i.advanceDeduction);
              return (
                <div key={i.id} className="space-y-1 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      مستخلص <span className="num">{i.number}</span> · {date(i.date)}
                    </span>
                    <Badge tone={i.status === "PAID" ? "ok" : i.status === "APPROVED" ? "info" : "neutral"}>{INVOICE_STATUS[i.status]}</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    الأعمال <Money value={i.amount.toString()} />
                    {Number(i.vatAmount) > 0 && <> + ضريبة <Money value={i.vatAmount.toString()} /></>} − مقدمة <Money value={i.advanceDeduction.toString()} /> = الصافي <Money value={net.toFixed(2)} className="font-semibold text-fg" />
                  </div>
                  {i.status !== "PAID" && <InvoiceActions invoiceId={i.id} status={i.status} net={net.toFixed(2)} accounts={accounts} />}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 border-t border-border pt-3">
          <NewInvoice id={p.id} />
        </div>
      </Card>

      <Card>
        <CardTitle>الفلوس</CardTitle>
        <ProjectMoney
          id={p.id}
          accounts={accounts}
          advanceLeft={advanceLeft.toFixed(2)}
          guarantee={{ amount: p.bankGuarantee.toString(), held: p.guaranteeMargin.toString() }}
          categories={EXPENSE_CATEGORIES}
        />
        {costs.length > 0 && (
          <div className="mt-3 divide-y divide-border border-t border-border text-sm">
            {costs.map((c) => (
              <div key={c.id} className="flex justify-between py-2">
                <span className="text-muted">
                  {date(c.date)} · {c.note}
                </span>
                <Money value={`-${c.amount}`} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>بيانات المشروع</CardTitle>
        <EditProject
          id={p.id}
          p={{ type: p.type, name: p.name, customerId: p.customerId, value: p.value.toString(), advancePct: p.advancePct.toString(), bankGuarantee: p.bankGuarantee.toString(), expectedCollectionDays: p.expectedCollectionDays, startDate: p.startDate?.toISOString().slice(0, 10), notes: p.notes, status: p.status }}
        />
      </Card>
    </div>
  );
}
