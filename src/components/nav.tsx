"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, Boxes, CalendarCheck, LayoutDashboard, Plus, Receipt, ShoppingBag, Wallet, X, PackagePlus } from "lucide-react";
import { cn } from "./ui";

const TABS = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/products", label: "المخزون", icon: Boxes },
  { href: "/accounts", label: "الحسابات", icon: Wallet },
  { href: "/close", label: "الإغلاق", icon: CalendarCheck },
];

const QUICK = [
  { href: "/orders/new", label: "طلب جديد", icon: ShoppingBag },
  { href: "/accounts/new?type=EXPENSE", label: "مصروف", icon: Receipt },
  { href: "/inventory/new", label: "شراء دفعة", icon: PackagePlus },
  { href: "/accounts/new", label: "حركة نقدية", icon: ArrowLeftRight },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href) || (href === "/products" && path.startsWith("/inventory"));
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive(path, href) ? "text-primary" : "text-muted")}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="no-print hidden w-52 shrink-0 space-y-1 md:block">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm", isActive(path, href) ? "bg-primary/10 font-semibold text-primary" : "text-muted hover:bg-subtle")}>
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** زر "+ إضافة سريعة" ثابت في كل الشاشات، في متناول الإبهام */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  return (
    <div className="no-print">
      {open && <button aria-label="إغلاق" className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />}
      {open && (
        <div className="fixed inset-x-3 bottom-36 z-50 mx-auto grid max-w-sm grid-cols-2 gap-2 md:bottom-24">
          {QUICK.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-card text-sm font-semibold shadow-lg">
              <Icon className="size-6 text-primary" />
              {label}
            </Link>
          ))}
        </div>
      )}
      <button
        aria-label="إضافة سريعة"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-20 left-4 z-50 grid size-14 place-items-center rounded-full bg-primary text-primary-fg shadow-xl md:bottom-6 md:left-6"
      >
        {open ? <X className="size-7" /> : <Plus className="size-7" />}
      </button>
    </div>
  );
}
