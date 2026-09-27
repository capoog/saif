import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { REPORT_KEYS, buildReport, periodOf, toCsv, toXlsx, type ReportKey } from "@/server/services/reports";

export const runtime = "nodejs";

/** /api/reports?key=income&format=csv|xlsx&from=YYYY-MM-DD&to=YYYY-MM-DD — key=all يطلع كل التقارير في ملف Excel واحد */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return new Response("غير مسموح", { status: 401 });
  const q = new URL(req.url).searchParams;
  const period = periodOf(q.get("from") ?? undefined, q.get("to") ?? undefined);
  const key = q.get("key") ?? "all";
  const keys: ReportKey[] = key === "all" ? [...REPORT_KEYS] : REPORT_KEYS.includes(key as ReportKey) ? [key as ReportKey] : [];
  if (keys.length === 0) return new Response("تقرير غير معروف", { status: 400 });
  const tables = [];
  for (const k of keys) tables.push(await buildReport(prisma, k, period));
  const base = `${key === "all" ? "reports" : key}_${period.fromKey}_${period.toKey}`;
  const headers = { "Cache-Control": "private, no-store" };

  if (q.get("format") === "csv") {
    if (tables.length !== 1) return new Response("CSV لتقرير واحد بس", { status: 400 });
    return new Response(toCsv(tables[0]), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }
  const buf = await toXlsx(tables, period);
  return new Response(new Uint8Array(buf), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}
