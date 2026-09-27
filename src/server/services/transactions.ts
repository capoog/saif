import type { TransactionType } from "@prisma/client";
import { D, toDb2 } from "@/domain/money";
import { DEPOSIT_SOURCES, EXPENSE_CATEGORIES, WITHDRAWAL_PURPOSES } from "../chart";
import type { Db, Tx } from "../db";
import { audit, type Actor } from "../audit";
import { UserError } from "../errors";
import { postEntry, reverseEntry } from "../ledger";
import { accountBalance } from "./balances";
import { enforceRules, type Override } from "../rules";

export interface TransactionInput {
  type: TransactionType;
  date: Date;
  amount: string;
  accountId: string;
  toAccountId?: string | null;
  category?: string | null;
  engineId?: string | null;
  note?: string | null;
  refType?: string | null;
  refId?: string | null;
  /** سداد مورد: المورد اللي بتسدد له (دفتر فرعي) */
  supplierId?: string | null;
  /** سداد مستقل / عمولة مندوب (دفتر فرعي) */
  freelancerId?: string | null;
  salesUserId?: string | null;
  /** سبب تجاوز قواعد المخاطر */
  override?: Override;
  /** داخلي فقط: العملية الأم فحصت القواعد بالفعل (زي استلام أمر شراء) */
  skipRules?: boolean;
}

async function moneyAccount(tx: Tx, id: string) {
  const a = await tx.ledgerAccount.findUnique({ where: { id } });
  if (!a || !a.isMoney) throw new UserError("اختار حساب نقدي صالح");
  return a;
}

/** يمنع إن حساب نقدي يصير بالسالب */
export async function assertSufficient(tx: Tx, accountId: string, amount: ReturnType<typeof D>, name: string) {
  const bal = await accountBalance(tx, accountId);
  if (bal.lt(amount)) throw new UserError(`رصيد «${name}» غير كافٍ (المتاح ${bal.toFixed(2)})`);
}

export async function createTransaction(db: Db, actor: Actor, input: TransactionInput) {
  return db.$transaction((tx) => createTransactionTx(tx, actor, input));
}

export async function createTransactionTx(tx: Tx, actor: Actor, input: TransactionInput) {
  const amount = D(input.amount);
  if (!amount.isFinite() || amount.lte(0)) throw new UserError("المبلغ لازم يكون أكبر من صفر");
  {
    const acct = await moneyAccount(tx, input.accountId);
    let lines;
    let description: string;
    switch (input.type) {
      case "DEPOSIT": {
        const src = DEPOSIT_SOURCES.find((s) => s.code === input.category);
        if (!src) throw new UserError("اختار مصدر الإيداع");
        lines = [
          { accountCode: acct.code, debit: amount },
          { accountCode: src.account, credit: amount, engineId: src.account === "OTHER_INCOME" ? input.engineId : null },
        ];
        description = `إيداع: ${src.label}`;
        break;
      }
      case "WITHDRAWAL": {
        const p = WITHDRAWAL_PURPOSES.find((s) => s.code === input.category);
        if (!p) throw new UserError("اختار غرض السحب");
        await assertSufficient(tx, acct.id, amount, acct.name);
        let supplierId: string | null = null;
        if (p.code === "SUPPLIER_PAYMENT" && input.supplierId) {
          const sup = await tx.supplier.findUnique({ where: { id: input.supplierId } });
          if (!sup) throw new UserError("المورد غير موجود");
          supplierId = sup.id;
        }
        // المسحوبات الشخصية بتقلل رأس المال، والسداد بيقلل النقد والالتزام بنفس القيمة
        if (!input.skipRules) {
          await enforceRules(
            tx,
            actor,
            { kind: "CASH_OUT", amount, cashOut: amount, capitalChange: p.code === "OWNER_DRAW" ? amount.neg() : 0 },
            input.override,
            { entity: "Transaction" },
          );
        }
        if (p.code === "FREELANCER_PAYMENT" && !input.freelancerId) throw new UserError("اختر المستقل");
        if (p.code === "COMMISSION_PAYMENT" && !input.salesUserId) throw new UserError("اختر المندوب");
        lines = [
          {
            accountCode: p.account,
            debit: amount,
            supplierId,
            freelancerId: p.code === "FREELANCER_PAYMENT" ? input.freelancerId : null,
            salesUserId: p.code === "COMMISSION_PAYMENT" ? input.salesUserId : null,
          },
          { accountCode: acct.code, credit: amount },
        ];
        description = `سحب: ${p.label}`;
        break;
      }
      case "TRANSFER": {
        if (!input.toAccountId || input.toAccountId === acct.id) throw new UserError("اختار حساب التحويل");
        const to = await moneyAccount(tx, input.toAccountId);
        await assertSufficient(tx, acct.id, amount, acct.name);
        lines = [
          { accountCode: to.code, debit: amount },
          { accountCode: acct.code, credit: amount },
        ];
        description = `تحويل من ${acct.name} إلى ${to.name}`;
        break;
      }
      case "EXPENSE": {
        const cat = EXPENSE_CATEGORIES.find((c) => c.code === input.category);
        if (!cat) throw new UserError("اختار تصنيف المصروف");
        await assertSufficient(tx, acct.id, amount, acct.name);
        if (!input.skipRules) {
          await enforceRules(tx, actor, { kind: "CASH_OUT", amount, cashOut: amount, capitalChange: amount.neg() }, input.override, { entity: "Transaction" });
        }
        lines = [
          { accountCode: cat.code, debit: amount, engineId: input.engineId },
          { accountCode: acct.code, credit: amount },
        ];
        description = `مصروف: ${cat.label}`;
        break;
      }
    }
    if (input.note) description += ` — ${input.note}`;

    const trx = await tx.transaction.create({
      data: {
        type: input.type,
        date: input.date,
        amount: toDb2(amount),
        accountId: acct.id,
        toAccountId: input.toAccountId ?? null,
        category: input.category ?? null,
        engineId: input.engineId ?? null,
        note: input.note ?? null,
        refType: input.refType ?? (input.supplierId ? "SUPPLIER" : null),
        refId: input.refId ?? input.supplierId ?? null,
        createdById: actor.userId,
      },
    });
    const entry = await postEntry(tx, {
      date: input.date,
      description,
      sourceType: "TRANSACTION",
      sourceId: trx.id,
      createdById: actor.userId,
      lines,
    });
    const saved = await tx.transaction.update({ where: { id: trx.id }, data: { journalEntryId: entry.id } });
    await audit(tx, actor, "create", "Transaction", trx.id, { after: saved });
    return saved;
  }
}

/** حذف ناعم: قيد عكسي + تعليم الحركة كمحذوفة */
export async function deleteTransaction(db: Db, actor: Actor, id: string, reason: string) {
  if (!reason?.trim()) throw new UserError("اكتب سبب الحذف");
  return db.$transaction(async (tx) => {
    const trx = await tx.transaction.findUniqueOrThrow({ where: { id } });
    if (trx.deletedAt) throw new UserError("الحركة محذوفة بالفعل");
    if (trx.journalEntryId) await reverseEntry(tx, trx.journalEntryId, new Date(), `إلغاء حركة: ${reason}`, actor.userId);
    const saved = await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, actor, "delete", "Transaction", id, { before: trx, reason });
    return saved;
  });
}
