import { checkOperation, type ProposedOperation, type Violation } from "@/domain/rules";
import type { Tx } from "./db";
import { audit, type Actor } from "./audit";
import { UserError } from "./errors";
import { getCapital } from "./services/balances";
import { getSettings } from "./services/settings";

/** العملية اتعترضت بقاعدة أو أكتر — الواجهة بتعرضها وتطلب سبب للتجاوز */
export class RuleViolationError extends UserError {
  constructor(public readonly violations: Violation[]) {
    super(violations.map((v) => v.title).join(" · "));
    this.name = "RuleViolationError";
  }
}

/** تجاوز القواعد: سبب مكتوب إلزامي، وبيتسجل في سجل التعديلات */
export type Override = string | null | undefined;

/**
 * يفحص العملية قبل الحفظ. لو فيه مخالفة ومفيش تجاوز → RuleViolationError (والعملية كلها بتترجع).
 * لو فيه تجاوز بسبب → يتسجل في الـ audit log ويكمل.
 */
export async function enforceRules(
  tx: Tx,
  actor: Actor,
  op: ProposedOperation,
  override: Override,
  context: { entity: string; entityId?: string | null },
): Promise<Violation[]> {
  const [cap, settings] = await Promise.all([getCapital(tx), getSettings(tx)]);
  const violations = checkOperation(op, cap, settings);
  if (violations.length === 0) return [];
  const reason = override?.trim();
  if (!reason) throw new RuleViolationError(violations);
  await audit(tx, actor, "override", context.entity, context.entityId ?? null, {
    after: { operation: op, violations },
    reason,
  });
  return violations;
}
