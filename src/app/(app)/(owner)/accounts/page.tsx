import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { TX_TYPE } from "@/lib/labels";
import { dateTime } from "@/lib/format";
import { ButtonLink, Card, CardTitle, Empty, Money, PageHeader } from "@/components/ui";
import { DEPOSIT_SOURCES, EXPENSE_CATEGORIES, WITHDRAWAL_PURPOSES } from "@/server/chart";
import { DeleteTransaction } from "./delete-transaction";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL = new Map<string, string>([
  ...EXPENSE_CATEGORIES.map((c) => [c.code, c.label] as [string, string]),
  ...DEPOSIT_SOURCES.map((c) => [c.code, c.label] as [string, string]),
  ...WITHDRAWAL_PURPOSES.map((c) => [c.code, c.label] as [string, string]),
]);

export default async function AccountsPage() {
  const [balances, txs] = await Promise.all([
    accountBalances(prisma),
    prisma.transaction.findMany({ where: { deletedAt: null }, orderBy: { date: "desc" }, take: 50, include: { engine: true } }),
  ]);
  const money = balances.filter((b) => b.isMoney);
  const liabilities = balances.filter((b) => b.type === "LIABILITY" && !b.balance.isZero());
  const names = new Map(balances.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-4">
      <PageHeader title="الحسابات والنقد" action={<ButtonLink href="/accounts/new" size="sm">+ حركة</ButtonLink>} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {money.map((a) => (
          <Card key={a.id} className="p-3">
            <div className="text-xs text-muted">{a.name}</div>
            <div className="mt-1 text-end text-lg font-bold">
              <Money value={a.balance.toString()} />
            </div>
            {a.isTaxReserve && <div className="text-xs text-muted">مخصص لسداد الضريبة</div>}
          </Card>
        ))}
      </div>

      {liabilities.length > 0 && (
        <Card>
          <CardTitle>الالتزامات القائمة</CardTitle>
          <div className="divide-y divide-border text-sm">
            {liabilities.map((l) => (
              <div key={l.id} className="flex justify-between py-2">
                <span>{l.name}</span>
                <Money value={l.balance.toString()} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">العرابين تظهر في شاشة الطلبات لكل طلب.</p>
        </Card>
      )}

      <Card>
        <CardTitle>آخر الحركات</CardTitle>
        {txs.length === 0 ? (
          <Empty>ما فيه حركات للحين. الرصيد الافتتاحي مسجّل تلقائيًا.</Empty>
        ) : (
          <div className="divide-y divide-border">
            {txs.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">
                    {TX_TYPE[t.type]}
                    {t.category && ` · ${CATEGORY_LABEL.get(t.category) ?? t.category}`}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {dateTime(t.date)} · {names.get(t.accountId)}
                    {t.toAccountId && ` ← ${names.get(t.toAccountId)}`}
                    {t.engine && ` · ${t.engine.name}`}
                    {t.note && ` · ${t.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Money value={(t.type === "DEPOSIT" ? "" : "-") + t.amount.toString()} className="font-semibold" />
                  <DeleteTransaction id={t.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
