export const ORDER_STATUS: Record<string, string> = {
  NEW: "جديد",
  CONFIRMED: "مؤكد",
  SHIPPED: "مشحون",
  DELIVERED: "مسلّم",
  RETURNED: "مرتجع",
  CANCELLED: "ملغي",
};

export const PAYMENT_STATUS: Record<string, string> = {
  UNPAID: "غير مدفوع",
  PARTIAL: "مدفوع جزئيًا",
  PAID: "مدفوع",
  REFUNDED: "مسترد",
};

export const PRODUCT_STATUS: Record<string, string> = {
  PRIORITY_TEST: "أولوية للاختبار",
  TESTING: "قيد الاختبار",
  ACTIVE: "مستمر",
  STOPPED: "موقوف",
  LATER: "لاحقًا",
  AVOID: "تجنّب",
};

export const TX_TYPE: Record<string, string> = {
  DEPOSIT: "إيداع",
  WITHDRAWAL: "سحب",
  TRANSFER: "تحويل",
  EXPENSE: "مصروف",
};

export const STATUS_TONE = { above: "ok", on: "info", below: "warn", danger: "danger" } as const;

export const ORDER_STATUS_TONE: Record<string, "ok" | "info" | "warn" | "danger" | "neutral"> = {
  NEW: "neutral",
  CONFIRMED: "info",
  SHIPPED: "info",
  DELIVERED: "ok",
  RETURNED: "danger",
  CANCELLED: "danger",
};
