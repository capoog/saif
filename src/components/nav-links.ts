import {
  ArrowLeftRight,
  Boxes,
  Store,
  Calculator,
  Plug,
  BarChart3,
  Building2,
  Clapperboard,
  Car,
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
  { href: "/businesses", label: "الأنشطة (أضف نشاط)", icon: Store },
  { href: "/sell", label: "بيع سريع (كاشير)", icon: Calculator },
  { href: "/accounts", label: "الحسابات والنقد", icon: Wallet },
  { href: "/close", label: "الإغلاق الأسبوعي", icon: CalendarCheck },
  { href: "/quotes", label: "عروض الأسعار", icon: FileText },
  { href: "/reports", label: "التقارير والتصدير", icon: BarChart3 },
  { href: "/agency", label: "الوكالة الرقمية", icon: Clapperboard },
  { href: "/cars", label: "السيارات", icon: Car },
  { href: "/projects", label: "التوريد والمقاولات", icon: Building2 },
  { href: "/b2b", label: "عقود B2B ورمضان", icon: Gift },
  { href: "/suppliers", label: "الموردين وأوامر الشراء", icon: Truck },
  { href: "/ads", label: "الإعلانات", icon: Megaphone },
  { href: "/customers", label: "كل العملاء", icon: Users },
  { href: "/integrations", label: "ربط سلة وزد", icon: Plug },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export const QUICK = [
  { href: "/orders/new", label: "طلب جديد", icon: ShoppingBag },
  { href: "/sell", label: "بيع سريع", icon: Calculator },
  { href: "/crm#log", label: "تواصل +1", icon: PhoneCall },
  { href: "/accounts/new?type=EXPENSE", label: "مصروف", icon: Receipt },
  { href: "/quotes/new", label: "عرض سعر", icon: FileText },
  { href: "/inventory/new", label: "شراء دفعة", icon: PackagePlus },
  { href: "/accounts/new", label: "حركة نقدية", icon: ArrowLeftRight },
];

/** المندوب: عملاؤه وعروضه وعمولاته بس — بدون أي أرقام مالية للمنشأة */
export const SALES_TABS = [
  { href: "/crm", label: "صفقاتي", icon: Users },
  { href: "/customers", label: "عملائي", icon: Users },
  { href: "/quotes", label: "عروضي", icon: FileText },
  { href: "/my", label: "عمولاتي", icon: Wallet },
];

export const SALES_QUICK = [
  { href: "/crm#log", label: "تواصل +1", icon: PhoneCall },
  { href: "/quotes/new", label: "عرض سعر", icon: FileText },
  { href: "/customers/new", label: "عميل جديد", icon: Users },
  { href: "/crm/deals/new", label: "صفقة جديدة", icon: Receipt },
];

export const FREELANCER_TABS = [{ href: "/tasks", label: "مهامي", icon: CalendarCheck }];
