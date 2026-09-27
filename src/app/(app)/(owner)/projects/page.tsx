import Link from "next/link";
import { prisma } from "@/server/db";
import { PROJECT_STATUS, PROJECT_TYPES } from "@/server/services/projects";
import { Badge, ButtonLink, Card, Empty, Money, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.bigProject.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { customer: { select: { name: true } }, invoices: { select: { amount: true } } } });
  return (
    <div className="space-y-4">
      <PageHeader title="التوريد والمقاولات" subtitle="التأهيل من اليوم 60، التوريد الخاص من 200 ألف، المقاولات من 500 ألف" action={<ButtonLink href="/projects/new" size="sm">+ مشروع</ButtonLink>} />
      {projects.length === 0 ? (
        <Empty>ما فيه مشاريع للحين.</Empty>
      ) : (
        projects.map((p) => {
          const invoiced = p.invoices.reduce((s, i) => s + Number(i.amount), 0);
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="block">
              <Card className="mb-2 p-3 hover:border-primary/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">
                      {PROJECT_TYPES[p.type]} · {p.customer.name}
                    </div>
                  </div>
                  <div className="text-end">
                    <Money value={p.value.toString()} className="font-bold" />
                    <div className="text-xs text-muted">مستخلصات <span className="num">{Number(p.value) > 0 ? Math.round((invoiced / Number(p.value)) * 100) : 0}%</span></div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Badge tone={p.status === "ACTIVE" ? "info" : p.status === "COMPLETED" ? "ok" : p.status === "BIDDING" ? "warn" : "danger"}>{PROJECT_STATUS[p.status]}</Badge>
                  {Number(p.advancePct) === 0 && p.status !== "COMPLETED" && <Badge tone="danger">بدون مقدمة</Badge>}
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
