import bcrypt from "bcryptjs";
import type { ProductStatus } from "@prisma/client";
import productsJson from "../../seed/products.json";
import targetsJson from "../../seed/weekly_targets.json";
import { addDaysKey, getPlanStartKey, riyadhStartOfDay } from "@/domain/plan-calendar";
import { loadPlanStart } from "./services/settings";
import { AGENCY_SERVICE_NAME, CHART, ENGINES } from "./chart";
import type { Db } from "./db";
import { postEntry } from "./ledger";

const STATUS_MAP: Record<string, ProductStatus> = {
  "أولوية للاختبار": "PRIORITY_TEST",
  "قيد الاختبار": "TESTING",
  "مستمر": "ACTIVE",
  "موقوف": "STOPPED",
  "لاحقًا": "LATER",
  "تجنّب": "AVOID",
};

/** منتجات بتتباع لشركات كهدايا → محرك B2B. مستهلكات الشركات والتوريد → محرك التوريد. */
function engineCodeFor(p: { number: number; category: string }): string {
  if ([5, 14, 47].includes(p.number)) return "B2B";
  if (p.category === "B2B مستهلكات" || p.number === 48) return "SUPPLY";
  return "ECOM";
}

const clean = (v: string) => (v === "–" || v === "—" || v === "" ? null : v);

export interface SeedOptions {
  owner?: { email: string; password: string; name: string };
  openingBalance?: string;
}

/** بيانات أولية — آمنة للتشغيل أكثر من مرة */
export async function seedBase(db: Db, opts: SeedOptions = {}) {
  await loadPlanStart(db);
  const start = getPlanStartKey();
  for (const [i, e] of ENGINES.entries()) {
    await db.engine.upsert({ where: { code: e.code }, create: { code: e.code, name: e.name, sortOrder: i }, update: { name: e.name, sortOrder: i } });
  }
  for (const [i, a] of CHART.entries()) {
    const data = { name: a.name, type: a.type, kind: a.kind, isMoney: !!a.isMoney, isTaxReserve: !!a.isTaxReserve, sortOrder: i };
    await db.ledgerAccount.upsert({ where: { code: a.code }, create: { code: a.code, ...data }, update: data });
  }
  const engines = new Map((await db.engine.findMany()).map((e) => [e.code, e.id]));

  for (const p of productsJson) {
    const data = {
      name: p.name,
      category: p.category,
      engineId: engines.get(engineCodeFor(p))!,
      buyPriceRange: clean(p.buy_price_range),
      sellPriceRange: clean(p.sell_price_range),
      grossMarginNote: clean(p.gross_margin),
      turnover: clean(p.turnover),
      b2b: clean(p.b2b),
      brandPotential: clean(p.brand_potential),
      regulatoryNote: clean(p.regulatory_risk),
    };
    await db.product.upsert({
      where: { number: p.number },
      create: { number: p.number, status: STATUS_MAP[p.status] ?? "LATER", ...data },
      update: data, // الحالة ما تتغير لو المنتج موجود (ممكن تكون تعدّلت)
    });
  }

  for (const t of targetsJson) {
    const data = {
      days: t.days,
      // تواريخ الأسابيع تمشي من بداية التحدي (تتغير مع التصفير)
      weekStartDate: new Date(`${addDaysKey(start, (t.week - 1) * 7)}T00:00:00Z`),
      startCapitalTarget: String(t.start_capital_target),
      endCapitalTarget: String(t.end_capital_target),
      requiredNetProfit: String(t.required_net_profit),
    };
    await db.weeklyTarget.upsert({ where: { week: t.week }, create: { week: t.week, ...data }, update: data });
  }

  if (opts.owner) {
    const exists = await db.user.findUnique({ where: { email: opts.owner.email.toLowerCase() } });
    if (!exists) {
      await db.user.create({
        data: {
          email: opts.owner.email.toLowerCase(),
          name: opts.owner.name,
          role: "owner",
          passwordHash: await bcrypt.hash(opts.owner.password, 12),
        },
      });
    }
  }

  // منتج خدمة لاشتراكات الوكالة (بدون مخزون)
  if (!(await db.product.findFirst({ where: { kind: "SERVICE", name: AGENCY_SERVICE_NAME } }))) {
    await db.product.create({ data: { name: AGENCY_SERVICE_NAME, category: "خدمات", kind: "SERVICE", unit: "شهر", status: "ACTIVE", engineId: engines.get("AGENCY")! } });
  }

  const opening = opts.openingBalance ?? "20000";
  const hasOpening = await db.journalEntry.findFirst({ where: { sourceType: "OPENING" } });
  if (!hasOpening && Number(opening) > 0) {
    await db.$transaction((tx) =>
      postEntry(tx, {
        date: riyadhStartOfDay(start),
        description: "رصيد افتتاحي — رأس مال المالك",
        sourceType: "OPENING",
        lines: [
          { accountCode: "BANK", debit: opening },
          { accountCode: "OWNER_CAPITAL", credit: opening },
        ],
      }),
    );
  }
}
