import { Field, Input, Select, Textarea } from "./ui";

const TYPES = [
  ["QUALIFICATION", "تأهيل وتسجيل"],
  ["PRIVATE_SUPPLY", "توريد خاص"],
  ["GOV_TENDER", "مناقصة حكومية"],
  ["SUBCONTRACT", "مقاولات باطن"],
  ["DIRECT_CONTRACT", "مقاولات مباشرة"],
];
type P = { type?: string; name?: string; customerId?: string; value?: string; advancePct?: string; bankGuarantee?: string; expectedCollectionDays?: number; startDate?: string; notes?: string | null; status?: string };

export function ProjectFields({ p = {}, customers, withStatus }: { p?: P; customers: { id: string; name: string }[]; withStatus?: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع">
          <Select name="type" defaultValue={p.type ?? "PRIVATE_SUPPLY"}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        {withStatus ? (
          <Field label="الحالة">
            <Select name="status" defaultValue={p.status}>
              <option value="BIDDING">تقديم / تأهيل</option>
              <option value="ACTIVE">قيد التنفيذ</option>
              <option value="COMPLETED">مكتمل</option>
              <option value="LOST">ما ترسى</option>
              <option value="CANCELLED">ملغي</option>
            </Select>
          </Field>
        ) : (
          <Field label="الجهة">
            <Select name="customerId" defaultValue={p.customerId}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {withStatus && <input type="hidden" name="customerId" value={p.customerId} />}
      <Field label="اسم المشروع">
        <Input name="name" required defaultValue={p.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="قيمة العقد">
          <Input name="value" inputMode="decimal" required defaultValue={p.value} className="num" />
        </Field>
        <Field label="الدفعة المقدمة %">
          <Input name="advancePct" inputMode="decimal" defaultValue={p.advancePct ?? "0"} className="num" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="الضمان البنكي">
          <Input name="bankGuarantee" inputMode="decimal" defaultValue={p.bankGuarantee ?? "0"} className="num" />
        </Field>
        <Field label="مدة التحصيل (يوم)">
          <Input name="expectedCollectionDays" inputMode="numeric" defaultValue={p.expectedCollectionDays ?? 60} className="num" />
        </Field>
        <Field label="البداية">
          <Input name="startDate" type="date" defaultValue={p.startDate} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={p.notes ?? ""} rows={2} />
      </Field>
    </>
  );
}
