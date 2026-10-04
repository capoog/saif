import { after } from "next/server";

/**
 * تنبيه تيليجرام لكل عملية يسويها مستخدم (إضافة/تعديل/حذف/...).
 * المصدر الوحيد: سجل التدقيق — كل audit() يدخل هنا. العمليات اللي تصير في نفس الطلب تتجمع في رسالة وحدة
 * تنرسل بعد ما يخلص الرد (after)، وقبل الإرسال نتأكد إن سجل التدقيق انحفظ فعلًا (لو المعاملة رجعت ما نرسل شي).
 */

export interface ActionEvent {
  auditId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  at: Date;
}

// الدخول له تنبيه خاص، والعمليات التلقائية (webhooks، cron) مو من المستخدم
const SKIP_ACTIONS = new Set(["login", "login_failed"]);
const MAX_EVENTS = 15;

const pending = new Map<string, ActionEvent[]>();

export function queueActionAlert(ev: ActionEvent) {
  if (!ev.userId || SKIP_ACTIONS.has(ev.action)) return;
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const key = ev.userId;
  const list = pending.get(key);
  if (list) {
    list.push(ev);
    return;
  }
  try {
    after(() => flush(key));
    pending.set(key, [ev]);
  } catch {
    // برا نطاق طلب (seed، سكربتات، اختبارات) — ما فيه تنبيه
  }
}

async function flush(key: string) {
  const list = pending.get(key);
  pending.delete(key);
  if (!list?.length) return;
  try {
    const [{ prisma }, { notifyOwner }] = await Promise.all([import("./db"), import("./notify")]);
    const saved = new Set(
      (await prisma.auditLog.findMany({ where: { id: { in: list.map((e) => e.auditId) } }, select: { id: true } })).map((r) => r.id),
    );
    const events = list.filter((e) => saved.has(e.auditId));
    if (!events.length) return;
    const user = await prisma.user.findUnique({ where: { id: key }, select: { name: true, role: true } });
    const labels = new Map<string, string | null>();
    for (const e of events.slice(0, MAX_EVENTS)) labels.set(e.auditId, recordLabel(e) ?? (await lookupLabel(prisma, e)));
    await notifyOwner(formatActionMessage(user, events, labels));
  } catch (e) {
    console.error("action alert failed:", e instanceof Error ? e.message : "unknown");
  }
}

export function formatActionMessage(user: { name: string; role: string } | null, events: ActionEvent[], labels: Map<string, string | null>) {
  const lines = [`🔔 ${user?.name ?? "مستخدم"} (${ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? "؟"})`, `🕒 ${riyadhTime(events[0].at)}`, ""];
  for (const e of events.slice(0, MAX_EVENTS)) {
    const label = labels.get(e.auditId) ?? recordLabel(e);
    lines.push(`${ACTION_ICON[e.action] ?? "•"} ${ACTION_LABEL[e.action] ?? e.action} ${ENTITY_LABEL[e.entity] ?? e.entity}${label ? `: ${label}` : ""}`);
    for (const d of details(e)) lines.push(`   ${d}`);
  }
  if (events.length > MAX_EVENTS) lines.push(`+ ${events.length - MAX_EVENTS} عمليات أخرى`);
  return lines.join("\n");
}

// ———————————————————— التنسيق ————————————————————

const ROLE_LABEL: Record<string, string> = { owner: "المالك", sales: "مندوب", freelancer: "مستقل" };

const ACTION_LABEL: Record<string, string> = {
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  status: "تغيير حالة",
  stage: "تغيير مرحلة",
  cancel: "إلغاء",
  sell: "بيع",
  buy: "شراء",
  receive: "استلام",
  charge: "فوترة",
  collect: "تحصيل",
  approve: "اعتماد",
  advance: "دفعة مقدمة",
  guarantee: "ضمان",
  adjust: "جرد",
  reconcile: "مطابقة",
  close: "إغلاق",
  reopen: "إعادة فتح",
  import: "استيراد",
  reset: "تصفير",
  override: "تجاوز قاعدة في",
  checklist: "تحديث قائمة فحص",
  followup: "موعد متابعة",
  commission: "عمولة",
  cost: "تكلفة تجهيز",
  activity: "تسجيل نشاط مع",
  enable_2fa: "تفعيل التحقق الثنائي",
  disable_2fa: "إيقاف التحقق الثنائي",
  change_password: "تغيير كلمة المرور",
};

const ACTION_ICON: Record<string, string> = {
  create: "➕",
  update: "✏️",
  delete: "🗑️",
  status: "🔄",
  stage: "🔄",
  cancel: "❌",
  sell: "💰",
  buy: "🛍️",
  receive: "📦",
  collect: "💵",
  charge: "🧾",
  approve: "✅",
  reset: "⚠️",
  override: "⚠️",
  enable_2fa: "🔐",
  disable_2fa: "🔓",
  change_password: "🔑",
};

const ENTITY_LABEL: Record<string, string> = {
  Order: "طلب",
  Payment: "دفعة",
  Customer: "عميل",
  Deal: "صفقة",
  Product: "منتج",
  InventoryBatch: "دفعة مخزون",
  Supplier: "مورد",
  PurchaseOrder: "أمر شراء",
  Transaction: "حركة مالية",
  CarDeal: "سيارة",
  BigProject: "مشروع",
  ProjectInvoice: "فاتورة مشروع",
  Quote: "عرض سعر",
  B2BContract: "عقد",
  Subscription: "اشتراك",
  AgencyTask: "مهمة وكالة",
  Freelancer: "مستقل",
  Engine: "نشاط",
  AdCampaign: "حملة إعلانية",
  Recipe: "مكونات بوكس",
  Setting: "إعداد",
  User: "مستخدم",
  WeeklySnapshot: "أسبوع",
  ZakatAccrual: "زكاة",
  LedgerAccount: "حساب",
  Challenge: "التحدي",
};

const FIELD_LABEL: Record<string, string> = {
  status: "الحالة",
  stage: "المرحلة",
  amount: "المبلغ",
  total: "الإجمالي",
  price: "السعر",
  salePrice: "سعر البيع",
  purchasePrice: "سعر الشراء",
  netRevenue: "صافي الإيراد",
  cost: "التكلفة",
  profit: "الربح",
  commission: "العمولة",
  commissionPct: "نسبة العمولة",
  name: "الاسم",
  phone: "الجوال",
  email: "البريد",
  role: "الدور",
  active: "مفعّل",
  quantity: "الكمية",
  counted: "العدد الفعلي",
  onHand: "المخزون",
  value: "القيمة",
  paidNow: "المدفوع الآن",
  margin: "الهامش",
  description: "الوصف",
  type: "النوع",
  count: "العدد",
  sku: "SKU",
  actualDecision: "القرار",
  officialInvoiceNo: "رقم الفاتورة",
  nextFollowUpAt: "المتابعة",
  created: "أضيف",
  duplicates: "مكرر",
  skipped: "متجاهل",
  period: "الفترة",
  items: "البنود",
  passwordChanged: "تغيّرت كلمة المرور",
};

// مفاتيح نعرضها لو العملية إضافة (after بس) — بالترتيب
const KEY_FIELDS = Object.keys(FIELD_LABEL);
const IGNORED = /^(id|createdAt|updatedAt|deletedAt|journalEntryId|createdById|payload)$|Id$/;
const SENSITIVE = /password(?!Changed)|hash|secret|token|totp/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function fmt(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const s = /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v;
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  }
  return null; // كائنات ومصفوفات ما نعرضها
}

function recordLabel(e: ActionEvent): string | null {
  const o = isObj(e.after) ? e.after : isObj(e.before) ? e.before : null;
  if (o) {
    if (typeof o.name === "string") return o.name;
    if (typeof o.title === "string") return o.title;
    if (typeof o.make === "string") return `${o.make}${o.year ? ` ${o.year}` : ""}`;
    if (o.number !== undefined && o.number !== null) return `#${o.number}`;
    if (typeof o.email === "string") return o.email;
    if (typeof o.description === "string") return fmt(o.description);
  }
  // مفاتيح مقروءة (إعداد، رقم أسبوع) — مو cuid
  if (e.entityId && e.entityId.length < 20) return e.entityId;
  return null;
}

/** لو السجل ما فيه اسم (تعديل حالة مثلًا) نجيبه من قاعدة البيانات */
async function lookupLabel(db: unknown, e: ActionEvent): Promise<string | null> {
  if (!e.entityId) return null;
  const model = e.entity[0].toLowerCase() + e.entity.slice(1);
  const delegate = (db as Record<string, { findUnique?: (a: unknown) => Promise<unknown> } | undefined>)[model];
  if (!delegate?.findUnique) return null;
  try {
    const row = await delegate.findUnique({ where: { id: e.entityId } });
    return row ? recordLabel({ ...e, after: row, before: undefined, entityId: null }) : null;
  } catch {
    return null;
  }
}

function details(e: ActionEvent): string[] {
  const out: string[] = [];
  const { before: b, after: a } = e;
  if (isObj(b) && isObj(a)) {
    // تعديل: الحقول اللي تغيّرت بس
    for (const k of Object.keys(a)) {
      if (IGNORED.test(k) || SENSITIVE.test(k)) continue;
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      const from = fmt(b[k]);
      const to = fmt(a[k]);
      if (from === null || to === null) continue;
      out.push(`${FIELD_LABEL[k] ?? k}: ${from} ← ${to}`);
      if (out.length >= 6) break;
    }
  } else if (isObj(a) || (a === undefined && isObj(b))) {
    // إضافة: أهم الحقول من الجديد، حذف/إلغاء: من القديم
    const o = (isObj(a) ? a : b) as Record<string, unknown>;
    for (const k of KEY_FIELDS) {
      if (!(k in o) || SENSITIVE.test(k) || ["name", "description"].includes(k)) continue;
      const v = Array.isArray(o[k]) ? String((o[k] as unknown[]).length) : fmt(o[k]);
      if (v !== null && v !== "—") out.push(`${FIELD_LABEL[k]}: ${v}`);
      if (out.length >= 5) break;
    }
  } else if (a !== undefined && !isObj(b)) {
    const from = fmt(b);
    const to = fmt(a);
    if (to !== null) out.push(b !== undefined && from !== null ? `${from} ← ${to}` : to);
  }
  if (e.reason) out.push(`السبب: ${fmt(e.reason)}`);
  return out;
}

function riyadhTime(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) + " (الرياض)";
}
