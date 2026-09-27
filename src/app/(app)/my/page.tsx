import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { commissionBalances } from "@/server/services/users";
import { date } from "@/lib/format";
import { Card, CardTitle, Money, PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/** صفحة المندوب: عمولاته بس */
export default async function MyPage() {
  const user = await requireUser(["sales"]);
  const [bal, contracts, dealsWon] = await Promise.all([
    commissionBalances(prisma).then((m) => m.get(user.id)),
    prisma.b2BContract.findMany({ where: { salesUserId: user.id }, orderBy: { signedAt: "desc" }, include: { customer: { select: { name: true } } } }),
    prisma.deal.count({ where: { ownerId: user.id, stage: "WON" } }),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="عمولاتي" subtitle={`نسبتك ${user.commissionPct?.toString() ?? 0}% من صافي الصفقة بعد ما العميل يدفع كامل`} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="المستحق لك" value={<Money value={bal?.due.toString() ?? "0"} />} tone="ok" />
        <Stat label="انصرف لك" value={<Money value={bal?.paid.toString() ?? "0"} />} />
        <Stat label="صفقات تمت" value={dealsWon} />
      </div>
      <Card>
        <CardTitle>العقود</CardTitle>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted">ما فيه عقود مكتملة للحين. العمولة تنحسب لما العقد يتسلّم ويتحصّل كامل.</p>
        ) : (
          contracts.map((c) => (
            <div key={c.id} className="flex justify-between py-2 text-sm">
              <span>
                {c.customer.name} · عقد <span className="num">#{c.number}</span> · {date(c.signedAt)}
              </span>
              <Money value={c.commissionAccrued?.toString() ?? "0"} className="font-semibold" />
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
