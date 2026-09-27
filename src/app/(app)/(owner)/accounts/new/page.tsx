import { prisma } from "@/server/db";
import { accountBalances } from "@/server/services/balances";
import { DEPOSIT_SOURCES, EXPENSE_CATEGORIES, WITHDRAWAL_PURPOSES } from "@/server/chart";
import { PageHeader } from "@/components/ui";
import { TransactionForm } from "./transaction-form";

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const [balances, engines] = await Promise.all([accountBalances(prisma), prisma.engine.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })]);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={type === "EXPENSE" ? "مصروف جديد" : "حركة نقدية"} />
      <TransactionForm
        initialType={(["DEPOSIT", "WITHDRAWAL", "TRANSFER", "EXPENSE"].includes(type ?? "") ? type : "EXPENSE") as "EXPENSE"}
        accounts={balances.filter((b) => b.isMoney).map((b) => ({ id: b.id, name: b.name, code: b.code, balance: b.balance.toFixed(2) }))}
        engines={engines.map((e) => ({ id: e.id, name: e.name, code: e.code }))}
        expenseCategories={EXPENSE_CATEGORIES}
        depositSources={DEPOSIT_SOURCES}
        withdrawalPurposes={WITHDRAWAL_PURPOSES}
      />
    </div>
  );
}
