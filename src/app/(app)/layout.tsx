import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { daysRemaining, planDay, planWeek, PLAN_TOTAL_DAYS } from "@/domain/plan-calendar";
import { homeFor, requireUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";
import { BottomNav, QuickAdd, SideNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme";
import { prisma } from "@/server/db";
import { loadPlanStart } from "@/server/services/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["owner", "sales", "freelancer"]);
  await loadPlanStart(prisma);
  const now = new Date();
  const day = planDay(now);
  return (
    <div className="min-h-dvh pb-44 md:pb-28">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href={homeFor(user.role)} className="text-sm">
            <span className="font-bold">
              اليوم <span className="num">{Math.max(day, 0)}</span>
              <span className="text-muted">/{PLAN_TOTAL_DAYS}</span>
            </span>
            <span className="text-muted">
              {" "}· أسبوع <span className="num">{planWeek(now)}</span> · باقي <span className="num">{daysRemaining(now)}</span> يوم
            </span>
          </Link>
          <div className="flex items-center">
            <ThemeToggle />
            {user.role === "owner" && (
              <Link href="/settings" aria-label="الإعدادات" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-subtle">
                <Settings className="size-5" />
              </Link>
            )}
            <form action={logoutAction}>
              <button aria-label="خروج" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-subtle">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-5xl gap-6 px-4 pt-4">
        <SideNav role={user.role} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <QuickAdd role={user.role} />
      <BottomNav role={user.role} />
    </div>
  );
}
