/**
 * كل الأرقام الحاكمة للقواعد هنا — قابلة للتعديل من شاشة الإعدادات
 * (بتتخزن في جدول Setting وتدمج فوق القيم الافتراضية دي).
 */
export const DEFAULT_SETTINGS = {
  // حالة الأداء مقابل الهدف (نسبة مئوية)
  statusOnTargetPct: 3, // ±3% = على الهدف (أزرق)
  statusDangerPct: 25, // أقل من −25% = أحمر، وبين −3% و −25% = أصفر

  // رأس المال
  receivableSecuredDays: 30, // الذمم المتأخرة أكتر من كده متدخلش في رأس المال
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

  // B2B
  b2bDepositPct: 50,

  // بيانات المنشأة (لعروض الأسعار لاحقًا)
  businessName: "",
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
    if (v !== undefined && v !== null && typeof v === typeof def) out[k] = v;
  }
  return out as Settings;
}
