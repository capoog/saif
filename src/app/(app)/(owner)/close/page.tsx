import Link from "next/link";
import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { closeDraft } from "@/server/services/close";
import { stockLevels } from "@/server/services/inventory";
import { planDay, planWeek } from "@/domain/plan-calendar";
import { STATUS_LABELS } from "@/domain/status";
import { STATUS_TONE } from "@/lib/labels";
import { money, pct } from "@/lib/format";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { CloseWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ClosePage() {
  const now = new Date();
  const week = planWeek(now);
  const [draft, balances, levels, existing, history] = await Promise.all([
    closeDraft(prisma, now),
    accountBalances(prisma),
    stockLevels(prisma),
    prisma.weeklySnapshot.findUnique({ where: { week } }),
    prisma.weeklySnapshot.findMany({ orderBy: { week: "desc" } }),
  ]);
  const products = await prisma.product.findMany({ where: { id: { in: [...levels.values()].filter((l) => l.onHand.gt(0)).map((l) => l.productId) } }, orderBy: { name: "asc" } });
  const isThursday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short" }).format(now) === "Thu";
  const b = draft.breakdown;

  return (
    <div className="space-y-4">
      <PageHeader title={`الإغلاق الأسبوعي — أسبوع ${week}`} subtitle={<>اليوم <span className="num">{planDay(now)}</span>{isThursday ? " · اليوم الخميس، يوم الإغلاق" : " · الإغلاق المعتاد يوم الخميس"}</>} />
      <CloseWizard
        week={week}
        existing={existing ? { week: existing.week } : null}
        accounts={balances.filter((x) => x.isMoney).map((x) => ({ id: x.id, name: x.name, balance: x.balance.toFixed(2) }))}
        products={products.map((p) => ({ id: p.id, name: p.name, onHand: levels.get(p.id)?.onHand.toString() ?? "0" }))}
        draft={{
          capital: b.capital.toFixed(2),
          target: draft.target.toFixed(2),
          gap: draft.gap.toFixed(2),
          gapPct: draft.gapPct.toFixed(2),
          status: draft.status,
          statusLabel: STATUS_LABELS[draft.status],
          tone: STATUS_TONE[draft.status],
          suggested: draft.suggestedDecision,
          lines: [
            ["النقد والمحافظ", b.liquidity.toFixed(2)],
            ["+ المخزون بالتكلفة", b.inventory.toFixed(2)],
            ["+ الذمم المضمونة", b.receivablesSecured.toFixed(2)],
            ["− الالتزامات (موردين، مستقلين، عرابين، قروض)", (b.liabilities.isZero() ? "0.00" : b.liabilities.neg().toFixed(2))],
            ["− ضريبة محصّلة غير مسددة", (b.vatPayable.isZero() ? "0.00" : b.vatPayable.neg().toFixed(2))],
            ["− مخصص الزكاة", (b.zakatProvision.isZero() ? "0.00" : b.zakatProvision.neg().toFixed(2))],
            ...(b.partnerCapital.isZero() ? [] : [["− رأس مال الشريك (خارج الهدف)", b.partnerCapital.neg().toFixed(2)] as [string, string]]),
          ],
        }}
      />

      {history.length > 0 && (
        <Card>
          <CardTitle>الأسابيع المقفولة</CardTitle>
          <div className="divide-y divide-border text-sm">
            {history.map((s) => (
              <Link key={s.id} href={`/close/${s.week}`} className="flex items-center justify-between py-2.5">
                <span>أسبوع <span className="num">{s.week}</span></span>
                <span className="flex items-center gap-2">
                  <span className="num">{money(s.capital)}</span>
                  <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>{pct(s.gapPct.toString())}</Badge>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
