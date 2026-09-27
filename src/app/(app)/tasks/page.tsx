import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { date } from "@/lib/format";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FreelancerTask } from "./client";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { TODO: "جديدة", IN_PROGRESS: "شغّال عليها", DELIVERED: "سلّمتها — تنتظر الاعتماد", APPROVED: "معتمدة ✓", CANCELLED: "ملغية" };

/** صفحة المستقل: مهامه بس (بدون أي أرقام عن المنشأة أو العملاء) */
export default async function TasksPage() {
  const user = await requireUser(["freelancer"]);
  if (!user.freelancerId) return <Alert tone="warn">حسابك مو مربوط بمستقل. كلّم المالك.</Alert>;
  const tasks = await prisma.agencyTask.findMany({
    where: { freelancerId: user.freelancerId, status: { not: "CANCELLED" } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    include: { customer: { select: { name: true } } },
  });
  const now = new Date();
  return (
    <div className="space-y-3">
      <PageHeader title="مهامي" subtitle={`أهلًا ${user.name}`} />
      {tasks.length === 0 ? (
        <Empty>ما عندك مهام الحين.</Empty>
      ) : (
        tasks.map((t) => (
          <Card key={t.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-xs text-muted">
                  {t.customer.name}
                  {t.dueAt && ` · التسليم ${date(t.dueAt)}`} · المقابل <span className="num">{Number(t.cost).toLocaleString("en-US")}</span> ريال
                </div>
              </div>
              <Badge tone={t.status === "APPROVED" ? "ok" : t.status === "DELIVERED" ? "info" : t.dueAt && t.dueAt < now ? "danger" : "neutral"}>{STATUS[t.status]}</Badge>
            </div>
            {t.description && <p className="whitespace-pre-line text-sm">{t.description}</p>}
            {(t.status === "TODO" || t.status === "IN_PROGRESS") && <FreelancerTask id={t.id} status={t.status} />}
            {t.deliveryUrl && (
              <a href={t.deliveryUrl} target="_blank" rel="noreferrer" className="block text-xs text-primary" dir="ltr">
                {t.deliveryUrl}
              </a>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
