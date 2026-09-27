import { Prisma, type AccountKind } from "@prisma/client";
import { computeCapital, type CapitalBreakdown } from "@/domain/capital";
import { D, Decimal, ZERO } from "@/domain/money";
import type { Db, Tx } from "../db";
import { getSettings } from "./settings";

export interface AccountBalance {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  type: string;
  isMoney: boolean;
  isTaxReserve: boolean;
  /** بالاتجاه الطبيعي للحساب (أصول ومصروفات: مدين − دائن، الباقي: دائن − مدين) */
  balance: Decimal;
}

export async function accountBalances(db: Db | Tx, asOf?: Date): Promise<AccountBalance[]> {
  const [accounts, sums] = await Promise.all([
    db.ledgerAccount.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: asOf ? { entry: { date: { lte: asOf } } } : undefined,
      _sum: { debit: true, credit: true },
    }),
  ]);
  const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
  return accounts.map((a) => {
    const s = byId.get(a.id);
    const dr = D(s?.debit);
    const cr = D(s?.credit);
    const debitNormal = a.type === "ASSET" || a.type === "EXPENSE";
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      kind: a.kind,
      type: a.type,
      isMoney: a.isMoney,
      isTaxReserve: a.isTaxReserve,
      balance: debitNormal ? dr.minus(cr) : cr.minus(dr),
    };
  });
}

export async function accountBalance(db: Db | Tx, accountId: string): Promise<Decimal> {
  const s = await db.journalLine.aggregate({ where: { accountId }, _sum: { debit: true, credit: true } });
  return D(s._sum.debit).minus(D(s._sum.credit));
}

export interface OrderCustomerBalance {
  orderId: string;
  engineId: string;
  balance: Decimal;
  dueFrom: Date;
}

/** رصيد العميل لكل طلب (مدين − دائن على حساب العملاء) */
export async function customerBalances(db: Db | Tx, asOf?: Date): Promise<OrderCustomerBalance[]> {
  const dateFilter = asOf ? Prisma.sql`AND e."date" <= ${asOf}` : Prisma.empty;
  const rows = await db.$queryRaw<{ orderId: string; engineId: string; balance: Prisma.Decimal; dueFrom: Date }[]>`
    SELECT e."orderId" AS "orderId", o."engineId" AS "engineId",
           SUM(l."debit" - l."credit") AS "balance",
           COALESCE(o."deliveredAt", o."date") AS "dueFrom"
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "LedgerAccount" a ON a."id" = l."accountId"
    JOIN "Order" o ON o."id" = e."orderId"
    WHERE a."kind" = 'CUSTOMER' ${dateFilter}
    GROUP BY e."orderId", o."engineId", o."deliveredAt", o."date"
    HAVING SUM(l."debit" - l."credit") <> 0`;
  return rows.map((r) => ({ orderId: r.orderId, engineId: r.engineId, balance: D(r.balance), dueFrom: r.dueFrom }));
}

function sumKind(balances: AccountBalance[], kind: AccountKind): Decimal {
  return balances.filter((b) => b.kind === kind).reduce((s, b) => s.plus(b.balance), ZERO);
}

export async function getCapital(db: Db | Tx, asOf: Date = new Date()): Promise<CapitalBreakdown> {
  const [balances, customers, projects, settings] = await Promise.all([
    accountBalances(db, asOf),
    customerBalances(db, asOf),
    projectBalances(db, asOf),
    getSettings(db),
  ]);
  return computeCapital({
    asOf,
    cash: sumKind(balances, "CASH"),
    wallets: sumKind(balances, "WALLET"),
    restrictedCash: sumKind(balances, "RESTRICTED_CASH"),
    inventory: sumKind(balances, "INVENTORY"),
    customerBalances: [...customers, ...projects],
    supplierPayable: sumKind(balances, "SUPPLIER_PAYABLE"),
    freelancerPayable: sumKind(balances, "FREELANCER_PAYABLE"),
    loans: sumKind(balances, "LOAN"),
    vatPayable: sumKind(balances, "VAT_PAYABLE"),
    zakatProvision: sumKind(balances, "ZAKAT_PROVISION"),
    partnerCapital: sumKind(balances, "PARTNER_CAPITAL"),
    receivableSecuredDays: settings.receivableSecuredDays,
  });
}

/**
 * رصيد الجهة لكل مشروع على حساب العملاء: دائن = دفعة مقدمة (التزام)، مدين = مستخلصات معتمدة ما تحصّلت (ذمة).
 * تاريخ الاستحقاق = آخر مستخلص اعتُمد.
 */
export async function projectBalances(db: Db | Tx, asOf?: Date): Promise<OrderCustomerBalance[]> {
  const dateFilter = asOf ? Prisma.sql`AND e."date" <= ${asOf}` : Prisma.empty;
  const rows = await db.$queryRaw<{ projectId: string; balance: Prisma.Decimal; dueFrom: Date }[]>`
    SELECT e."projectId" AS "projectId", SUM(l."debit" - l."credit") AS "balance",
           COALESCE((SELECT MAX(i."approvedAt") FROM "ProjectInvoice" i WHERE i."projectId" = e."projectId" AND i."approvedAt" IS NOT NULL), MIN(e."date")) AS "dueFrom"
    FROM "JournalLine" l
    JOIN "JournalEntry" e ON e."id" = l."entryId"
    JOIN "LedgerAccount" a ON a."id" = l."accountId"
    WHERE a."kind" = 'CUSTOMER' AND e."projectId" IS NOT NULL ${dateFilter}
    GROUP BY e."projectId"
    HAVING SUM(l."debit" - l."credit") <> 0`;
  if (rows.length === 0) return [];
  const supply = await db.engine.findUnique({ where: { code: "SUPPLY" } });
  return rows.map((r) => ({ orderId: `project:${r.projectId}`, engineId: supply?.id ?? "", balance: D(r.balance), dueFrom: r.dueFrom }));
}
