import { D, toDb2 } from "@/domain/money";
import { dropZeroLines, validateLines, type LineInput } from "@/domain/ledger";
import type { Tx } from "./db";

export async function accountIds(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.ledgerAccount.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

export interface PostEntryInput {
  date: Date;
  description: string;
  sourceType: string;
  sourceId?: string | null;
  orderId?: string | null;
  projectId?: string | null;
  createdById?: string | null;
  lines: LineInput[];
}

/** يسجّل قيد متوازن. أي خلل في التوازن = استثناء والعملية كلها تترجع. */
export async function postEntry(tx: Tx, input: PostEntryInput) {
  const lines = dropZeroLines(input.lines);
  validateLines(lines);
  const ids = await accountIds(tx);
  return tx.journalEntry.create({
    data: {
      date: input.date,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      orderId: input.orderId ?? null,
      projectId: input.projectId ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: lines.map((l) => {
          const accountId = ids.get(l.accountCode);
          if (!accountId) throw new Error(`حساب غير معروف: ${l.accountCode}`);
          return {
            accountId,
            debit: toDb2(D(l.debit)),
            credit: toDb2(D(l.credit)),
            engineId: l.engineId ?? null,
            supplierId: l.supplierId ?? null,
            freelancerId: l.freelancerId ?? null,
            salesUserId: l.salesUserId ?? null,
            memo: l.memo,
          };
        }),
      },
    },
  });
}

/** قيد عكسي بنفس الأسطر (مدين ↔ دائن). القيد الأصلي يفضل موجود للتاريخ. */
export async function reverseEntry(tx: Tx, entryId: string, date: Date, description: string, createdById?: string | null) {
  const original = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true, reversedBy: true } });
  if (original.reversedBy) throw new Error("القيد هذا متعكس قبل كذا");
  return tx.journalEntry.create({
    data: {
      date,
      description,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      orderId: original.orderId,
      projectId: original.projectId,
      reversalOfId: original.id,
      createdById: createdById ?? null,
      lines: {
        create: original.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.credit,
          credit: l.debit,
          engineId: l.engineId,
          supplierId: l.supplierId,
          freelancerId: l.freelancerId,
          salesUserId: l.salesUserId,
          memo: l.memo,
        })),
      },
    },
  });
}
