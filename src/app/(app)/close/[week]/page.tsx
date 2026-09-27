import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { weekRange } from "@/domain/plan-calendar";
import { STATUS_LABELS, type CapitalStatus } from "@/domain/status";
import { STATUS_TONE } from "@/lib/labels";
import { date, dateTime, money, pct } from "@/lib/format";
import { Badge, Card, CardTitle } from "@/components/ui";
import { DecisionEdit, ExportButtons } from "./client";

export const dynamic = "force-dynamic";

type Breakdown = Record<string, string | null>;
type EngineRow = { code: string; name: string; profit: string; capitalUsed: string; returnPct: string | null };

export default async function SnapshotPage({ params }: { params: Promise<{ week: string }> }) {
  const week = Number((await params).week);
  const snap = Number.isInteger(week) ? await prisma.weeklySnapshot.findUnique({ where: { week } }) : null;
  if (!snap) notFound();
  const b = snap.breakdown as Breakdown;
  const engines = (snap.engines as EngineRow[]).filter((e) => Number(e.profit) !== 0 || Number(e.capitalUsed) !== 0);
  const status = snap.status as CapitalStatus;
  const { startKey, endKey } = weekRange(week);
  const firstDay = (week - 1) * 7 + 1;

  const neg = (v: string | null) => (v && Number(v) !== 0 ? `-${v}` : v);
  const rows: [string, string | null][] = [
    ["النقد والمحافظ", b.liquidity],
    ["المخزون بالتكلفة", b.inventory],
    ["الذمم المضمونة", b.receivablesSecured],
    ["الالتزامات", neg(b.liabilities)],
    ["ضريبة محصّلة غير مسددة", neg(b.vatPayable)],
    ["مخصص الزكاة (تقديري)", neg(b.zakatProvision)],
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <ExportButtons week={week} />
      <div id="snapshot" className="space-y-3 rounded-3xl bg-bg p-1">
        <Card className="text-center">
          <div className="text-sm text-muted">كشف رأس المال</div>
          <div className="mt-1 text-lg font-bold">
            أسبوع <span className="num">{week}</span> · الأيام <span className="num">{firstDay}–{Math.min(week * 7, 229)}</span>
          </div>
          <div className="text-xs text-muted">{date(new Date(`${startKey}T12:00:00Z`))} — {date(new Date(`${endKey}T12:00:00Z`))}</div>
          <div className="num mt-4 text-4xl font-bold">{money(snap.capital)}</div>
          <div className="mt-1 text-sm text-muted">
            الهدف <span className="num">{money(snap.target)}</span>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
            <span className="num font-semibold">{money(snap.gap)}</span>
            <span className="num text-sm text-muted">({pct(snap.gapPct.toString(), 2)})</span>
          </div>
        </Card>
        <Card>
          <div className="divide-y divide-border text-sm">
            {rows.map(([l, v]) => (
              <div key={l} className="flex justify-between py-2">
                <span>{l}</span>
                <span className="num">{money(v)}</span>
              </div>
            ))}
          </div>
        </Card>
        {engines.length > 0 && (
          <Card>
            <CardTitle>المحركات</CardTitle>
            <div className="divide-y divide-border text-sm">
              {engines.map((e) => (
                <div key={e.code} className="flex justify-between py-2">
                  <span>{e.name}</span>
                  <span className="num">
                    {money(e.profit)} {e.returnPct && <span className="text-muted">({Number(e.returnPct).toFixed(1)}%)</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <CardTitle>القرار</CardTitle>
          <p className="text-sm text-muted">المقترح: {snap.suggestedDecision}</p>
          {snap.actualDecision && <p className="mt-2 text-sm font-medium">الفعلي: {snap.actualDecision}</p>}
        </Card>
        <p className="text-center text-xs text-muted">انقفل {dateTime(snap.createdAt)} · الهدف تشغيلي وغير مضمون</p>
      </div>
      <Card className="no-print">
        <CardTitle>تعديل القرار الفعلي (المالك + سبب)</CardTitle>
        <DecisionEdit week={week} decision={snap.actualDecision ?? ""} />
      </Card>
    </div>
  );
}
