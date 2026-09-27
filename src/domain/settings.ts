/**
 * كل الأرقام الحاكمة للقواعد هنا — قابلة للتعديل من شاشة الإعدادات
 * (بتتخزن في جدول Setting وتدمج فوق القيم الافتراضية هذي).
 */
export const DEFAULT_SETTINGS = {
  // حالة الأداء مقابل الهدف (نسبة مئوية)
  statusOnTargetPct: 3, // ±3% = على الهدف (أزرق)
  statusDangerPct: 25, // أقل من −25% = أحمر، وبين −3% و −25% = أصفر

  // رأس المال
  receivableSecuredDays: 30, // الذمم المتأخرة أكثر من كذا ما تدخل في رأس المال
  zakatAnnualRatePct: 2.5, // يتحسب شهريًا = السنوي ÷ 12 (تقدير — الحساب الرسمي مع المحاسب)

  // الضريبة
  vatRegistered: false,
  vatRatePct: 15,
  pricesIncludeVat: true,
  vatRegistrationThreshold: 375000,

  // قواعد المخاطر (تتفعل في المرحلة 2)
  emergencyCapital: 15000,
  maxDealPct: 25,
  maxCarDealPct: 35,
  carDealUnlockCapital: 50000,
  minLiquidityPct: 15,
  minLiquidityAbs: 5000,
  maxInventoryPct: 50,
  maxInventoryPctCovered: 60,
  dealLossRedPct: 5,
  monthLossRedPct: 10,
  batchWindowDays: 14,
  batchSlowPct: 30,
  batchFastPct: 70,
  doubleMinRoas: 3,
  doubleMinOrders: 20,
  inventoryAgeMarkdownDays: 21,
  inventoryAgeLiquidateDays: 30,
  engineMinMonthlyReturnPct: 5,

  // قرارات الإغلاق
  surplusToTopEnginePct: 70,
  onTargetAdBoostPct: 20,

  // السيارات
  carMaxMarketPct: 85, // سعر الشراء لا يتعدى هذي النسبة من متوسط السوق
  carMarkdownDay: 14, // خفّض لنقطة التعادل
  carSellNowDay: 21, // بع فورًا بخسارة لا تتعدى carMaxLossPct
  carMaxLossPct: 5,

  // B2B وعروض الأسعار
  b2bDepositPct: 50,
  quoteValidityDays: 7,
  ramadanContractsTarget: 20,
  ramadanDeadline: "2027-01-24",

  // CRM — عدّادات اليوم
  dailyOutreachMin: 30,
  dailyOutreachMax: 50,
  dailyQuotesMin: 3,
  dailyQuotesMax: 8,

  // الإعلانات: بعد إنفاق X على منتج، لو تكلفة الطلب > Y% من الربح الإجمالي للطلب → أوقف
  adStopMinSpend: 1000,
  adStopCpaMarginPct: 40,

  // بيانات المنشأة (لعروض الأسعار لاحقًا)
  businessName: "الغباشي للمقاولات والتجارة",
  businessCr: "",
  businessVatNo: "",
  businessPhone: "",
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export function mergeSettings(stored: Partial<Record<string, unknown>>): Settings {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = stored[k];
    if (v === undefined || v === null || typeof v !== typeof def) continue;
    // نص فاضي مايلغيش قيمة افتراضية (زي اسم المنشأة)
    if (typeof v === "string" && v.trim() === "" && def !== "") continue;
    out[k] = v;
  }
  return out as Settings;
}
