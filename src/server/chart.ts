import type { AccountKind, AccountType } from "@prisma/client";

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  kind: AccountKind;
  isMoney?: boolean;
  isTaxReserve?: boolean;
}

/** دليل الحسابات الثابت. الحسابات النقدية (isMoney) هي اللي تظهر في شاشة "الحسابات والنقد". */
export const CHART: ChartAccount[] = [
  { code: "BANK", name: "البنك التجاري", type: "ASSET", kind: "CASH", isMoney: true },
  { code: "CASH_BOX", name: "نقد (الصندوق)", type: "ASSET", kind: "CASH", isMoney: true },
  { code: "TAX_RESERVE", name: "حساب الضريبة", type: "ASSET", kind: "CASH", isMoney: true, isTaxReserve: true },
  { code: "WALLET_CARDS", name: "مدى / Apple Pay (تسويات)", type: "ASSET", kind: "WALLET", isMoney: true },
  { code: "WALLET_BNPL", name: "تابي / تمارا (مستحقات)", type: "ASSET", kind: "WALLET", isMoney: true },
  { code: "INVENTORY", name: "المخزون", type: "ASSET", kind: "INVENTORY" },
  { code: "CAR_STOCK", name: "سيارات للبيع (بالتكلفة)", type: "ASSET", kind: "INVENTORY" },
  { code: "CUSTOMERS", name: "العملاء (ذمم وعرابين)", type: "ASSET", kind: "CUSTOMER" },
  { code: "SUPPLIERS", name: "مستحقات الموردين", type: "LIABILITY", kind: "SUPPLIER_PAYABLE" },
  { code: "FREELANCERS", name: "مستحقات المستقلين", type: "LIABILITY", kind: "FREELANCER_PAYABLE" },
  { code: "LOANS", name: "قروض", type: "LIABILITY", kind: "LOAN" },
  { code: "VAT_PAYABLE", name: "ضريبة القيمة المضافة المحصّلة", type: "LIABILITY", kind: "VAT_PAYABLE" },
  { code: "ZAKAT_PROVISION", name: "مخصص الزكاة", type: "LIABILITY", kind: "ZAKAT_PROVISION" },
  { code: "OWNER_CAPITAL", name: "رأس مال المالك", type: "EQUITY", kind: "OWNER_CAPITAL" },
  { code: "PARTNER_CAPITAL", name: "رأس مال شريك", type: "EQUITY", kind: "PARTNER_CAPITAL" },
  { code: "REVENUE", name: "المبيعات", type: "INCOME", kind: "REVENUE" },
  { code: "OTHER_INCOME", name: "دخل آخر", type: "INCOME", kind: "OTHER_INCOME" },
  { code: "COGS", name: "تكلفة البضاعة المباعة", type: "EXPENSE", kind: "COGS" },
  { code: "EXP_MARKETING", name: "تسويق وإعلانات", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_SHIPPING", name: "شحن", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_TOOLS", name: "أدوات واشتراكات", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_ADMIN", name: "إداري", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_TRANSPORT", name: "نقل", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_FEES", name: "رسوم", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_OTHER", name: "مصروفات أخرى", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_INV_ADJ", name: "فروقات جرد", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_RECON", name: "فروقات مطابقة الحسابات", type: "EXPENSE", kind: "EXPENSE" },
  { code: "EXP_ZAKAT", name: "زكاة (تقديري)", type: "EXPENSE", kind: "EXPENSE" },
];

export const EXPENSE_CATEGORIES: { code: string; label: string }[] = [
  { code: "EXP_MARKETING", label: "تسويق" },
  { code: "EXP_SHIPPING", label: "شحن" },
  { code: "EXP_TOOLS", label: "أدوات" },
  { code: "EXP_ADMIN", label: "إداري" },
  { code: "EXP_TRANSPORT", label: "نقل" },
  { code: "EXP_FEES", label: "رسوم" },
  { code: "EXP_OTHER", label: "أخرى" },
];

/** مصادر الإيداع → الحساب الدائن */
export const DEPOSIT_SOURCES: { code: string; label: string; account: string }[] = [
  { code: "OWNER_CAPITAL", label: "رأس مال من المالك", account: "OWNER_CAPITAL" },
  { code: "PARTNER_CAPITAL", label: "تمويل شريك (لا يُحسب في الهدف)", account: "PARTNER_CAPITAL" },
  { code: "LOAN", label: "قرض", account: "LOANS" },
  { code: "OTHER_INCOME", label: "دخل آخر", account: "OTHER_INCOME" },
];

/** أغراض السحب → الحساب المدين */
export const WITHDRAWAL_PURPOSES: { code: string; label: string; account: string }[] = [
  { code: "OWNER_DRAW", label: "مسحوبات شخصية", account: "OWNER_CAPITAL" },
  { code: "SUPPLIER_PAYMENT", label: "سداد مورد", account: "SUPPLIERS" },
  { code: "FREELANCER_PAYMENT", label: "سداد مستقل", account: "FREELANCERS" },
  { code: "LOAN_REPAYMENT", label: "سداد قرض", account: "LOANS" },
  { code: "VAT_PAYMENT", label: "سداد ضريبة القيمة المضافة", account: "VAT_PAYABLE" },
  { code: "ZAKAT_PAYMENT", label: "سداد زكاة", account: "ZAKAT_PROVISION" },
];

export const ENGINES = [
  { code: "ECOM", name: "منتجات وتجارة إلكترونية" },
  { code: "B2B", name: "هدايا الشركات B2B" },
  { code: "AGENCY", name: "وكالة رقمية" },
  { code: "CARS", name: "سيارات" },
  { code: "SUPPLY", name: "توريد ومقاولات" },
] as const;

export const CHANNELS = [
  "Instagram",
  "TikTok",
  "Snapchat",
  "WhatsApp",
  "سلة / زد",
  "نون",
  "أمازون",
  "حراج",
  "مباشر",
  "B2B",
] as const;

export const PAYMENT_METHODS: { code: string; label: string; defaultAccount: string }[] = [
  { code: "cash", label: "نقد", defaultAccount: "CASH_BOX" },
  { code: "transfer", label: "تحويل بنكي", defaultAccount: "BANK" },
  { code: "mada", label: "مدى / Apple Pay", defaultAccount: "WALLET_CARDS" },
  { code: "bnpl", label: "تابي / تمارا", defaultAccount: "WALLET_BNPL" },
  { code: "cod", label: "الدفع عند الاستلام", defaultAccount: "CASH_BOX" },
];
