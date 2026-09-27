import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/server/db";
import { REPORT_KEYS, REPORT_TITLES, buildReport, periodOf, type ColType, type ReportKey } from "@/server/services/reports";
import { money, int } from "@/lib/format";
import { Button, Card, Empty, Input, PageHeader, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

const PERIOD_FREE: ReportKey[] = ["aging", "ads", "cars"];

function cell(v: string | number | null | undefined, t: ColType) {
  if (v == null || v === "") return "—";
  if (t === "money") return money(v);
  if (t === "int") return int(v);
  if (t === "pct") return `${Number(v).toFixed(1)}%`;
  return String(v);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const key: ReportKey = REPORT_KEYS.includes(sp.r as ReportKey) ? (sp.r as ReportKey) : "income";
  const period = periodOf(sp.from, sp.to);
  const t = await buildReport(prisma, key, period);
  const qs = (extra: Record<string, string>) => new URLSearchParams({ from: period.fromKey, to: period.toKey, ...extra }).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="التقارير"
        subtitle="كل تقرير ينزل CSV، والكل مع بعض في ملف Excel واحد"
        action={
          <a href={`/api/reports?${qs({ key: "all", format: "xlsx" })}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg">
            <Download className="size-4" /> Excel
          </a>
        }
      />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {REPORT_KEYS.map((k) => (
          <Link key={k} href={`/reports?${qs({ r: k })}`} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", k === key ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
            {REPORT_TITLES[k]}
          </Link>
        ))}
      </div>
      {!PERIOD_FREE.includes(key) && (
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="r" value={key} />
          <label className="text-xs text-muted">
            من
            <Input type="date" name="from" defaultValue={period.fromKey} className="mt-1 h-9 w-40" />
          </label>
          <label className="text-xs text-muted">
            إلى
            <Input type="date" name="to" defaultValue={period.toKey} className="mt-1 h-9 w-40" />
          </label>
          <Button size="sm" variant="secondary">
            عرض
          </Button>
        </form>
      )}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div>
            <div className="font-semibold">{t.title}</div>
            {t.note && <div className="text-xs text-muted">{t.note}</div>}
          </div>
          <a href={`/api/reports?${qs({ key, format: "csv" })}`} className="text-sm text-primary">
            CSV
          </a>
        </div>
        {t.rows.length === 0 ? (
          <div className="p-4">
            <Empty>ما فيه بيانات في هالفترة.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-xs text-muted">
                <tr>
                  {t.columns.map((c) => (
                    <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 font-medium", c.type === "text" || c.type === "date" ? "text-start" : "text-end")}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...t.rows, ...(t.total ? [t.total] : [])].map((r, i) => (
                  <tr key={i} className={cn(t.total && i === t.rows.length && "bg-subtle font-semibold")}>
                    {t.columns.map((c) => {
                      const v = r[c.key];
                      const neg = typeof v === "number" && v < 0 && c.type === "money";
                      return (
                        <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", c.type === "text" || c.type === "date" ? "text-start" : "num text-end", neg && "text-danger")}>
                          {cell(v, c.type)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
