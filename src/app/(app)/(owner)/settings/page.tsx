import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { dateTime } from "@/lib/format";
import { Card, CardTitle, PageHeader } from "@/components/ui";
import { PasswordForm, SettingsForm, TwoFactor } from "./forms";
import { UsersPanel } from "./users";
import { accountBalances } from "@/server/services/balances";
import { commissionBalances } from "@/server/services/users";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, logs, users, freelancers, balances, commissions] = await Promise.all([
    getSettings(prisma),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { user: { select: { name: true } } } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { freelancer: { select: { name: true } } } }),
    prisma.freelancer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    accountBalances(prisma),
    commissionBalances(prisma),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="الإعدادات" subtitle="كل حدود القواعد قابلة للتعديل هنا — ما فيه أرقام ثابتة في الكود." />
      <SettingsForm settings={settings} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>التحقق الثنائي (2FA)</CardTitle>
          <TwoFactor enabled={user.totpEnabled} />
        </Card>
        <Card>
          <CardTitle>تغيير كلمة المرور</CardTitle>
          <PasswordForm />
        </Card>
      </div>
      <Card>
        <CardTitle>المستخدمين والصلاحيات</CardTitle>
        <UsersPanel
          users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, commissionPct: u.commissionPct?.toString() ?? "", freelancer: u.freelancer?.name ?? null, due: commissions.get(u.id)?.due.toFixed(2) ?? "0" }))}
          freelancers={freelancers}
          accounts={balances.filter((b) => b.isMoney && !b.isTaxReserve).map((b) => ({ id: b.id, name: b.name, code: b.code }))}
        />
      </Card>
      <Card>
        <CardTitle>سجل التعديلات (آخر 40)</CardTitle>
        <div className="divide-y divide-border text-xs">
          {logs.map((l) => (
            <div key={l.id} className="flex justify-between gap-2 py-1.5">
              <span>
                <span className="font-semibold">{l.action}</span> · {l.entity}
                {l.reason && <span className="text-muted"> · {l.reason}</span>}
              </span>
              <span className="shrink-0 text-muted">{l.user?.name ?? "النظام"} · {dateTime(l.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
