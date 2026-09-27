/**
 * تقويم الخطة: اليوم 1 = 27 سبتمبر 2026 (توقيت الرياض، UTC+3 بدون توقيت صيفي).
 * 229 يوم = 33 أسبوع (آخر أسبوع 5 أيام).
 */
export const PLAN_START_KEY = "2026-09-27";
export const PLAN_TOTAL_DAYS = 229;
export const PLAN_TOTAL_WEEKS = 33;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** تاريخ اليوم في الرياض بصيغة YYYY-MM-DD */
export function riyadhDateKey(date: Date): string {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** بداية اليوم (منتصف الليل بتوقيت الرياض) كـ Date بتوقيت UTC */
export function riyadhStartOfDay(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - RIYADH_OFFSET_MS);
}

/** نهاية اليوم بتوقيت الرياض (آخر ملّي ثانية) */
export function riyadhEndOfDay(key: string): Date {
  return new Date(riyadhStartOfDay(key).getTime() + DAY_MS - 1);
}

function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** رقم اليوم في الخطة (1 = 27 سبتمبر 2026). ممكن يكون ≤ 0 قبل البداية أو > 229 بعد النهاية. */
export function planDay(date: Date): number {
  return daysBetweenKeys(PLAN_START_KEY, riyadhDateKey(date)) + 1;
}

/** رقم الأسبوع (1–33) مقصوص على حدود الخطة */
export function planWeek(date: Date): number {
  const day = Math.min(Math.max(planDay(date), 1), PLAN_TOTAL_DAYS);
  return Math.floor((day - 1) / 7) + 1;
}

export function daysRemaining(date: Date): number {
  return Math.max(PLAN_TOTAL_DAYS - planDay(date), 0);
}

export function addDaysKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** أول وآخر يوم في أسبوع الخطة (مفاتيح تاريخ) */
export function weekRange(week: number): { startKey: string; endKey: string } {
  const startKey = addDaysKey(PLAN_START_KEY, (week - 1) * 7);
  const lastDay = Math.min(week * 7, PLAN_TOTAL_DAYS);
  return { startKey, endKey: addDaysKey(PLAN_START_KEY, lastDay - 1) };
}

export function ageInDays(from: Date, to: Date): number {
  return daysBetweenKeys(riyadhDateKey(from), riyadhDateKey(to));
}
