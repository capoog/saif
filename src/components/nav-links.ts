import {
  ArrowLeftRight,
  Boxes,
  CalendarCheck,
  FileText,
  Gift,
  LayoutDashboard,
  Megaphone,
  Menu,
  PackagePlus,
  PhoneCall,
  Receipt,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export const TABS = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/orders", label: "الطلبات", icon: ShoppingBag },
  { href: "/crm", label: "العملاء", icon: Users },
  { href: "/products", label: "المخزون", icon: Boxes },
  { href: "/more", label: "المزيد", icon: Menu },
];

export const MORE_LINKS = [
  { href: "/accounts", label: "الحسابات والنقد", icon: Wallet },
  { href: "/close", label: "الإغلاق الأسبوعي", icon: CalendarCheck },
  { href: "/quotes", label: "عروض الأسعار", icon: FileText },
  { href: "/b2b", label: "عقود B2B ورمضان", icon: Gift },
  { href: "/suppliers", label: "الموردين وأوامر الشراء", icon: Truck },
  { href: "/ads", label: "الإعلانات", icon: Megaphone },
  { href: "/customers", label: "كل العملاء", icon: Users },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export const QUICK = [
  { href: "/orders/new", label: "طلب جديد", icon: ShoppingBag },
  { href: "/crm#log", label: "تواصل +1", icon: PhoneCall },
  { href: "/accounts/new?type=EXPENSE", label: "مصروف", icon: Receipt },
  { href: "/quotes/new", label: "عرض سعر", icon: FileText },
  { href: "/inventory/new", label: "شراء دفعة", icon: PackagePlus },
  { href: "/accounts/new", label: "حركة نقدية", icon: ArrowLeftRight },
];
