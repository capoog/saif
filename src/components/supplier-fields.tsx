import { Field, Input, Select, Textarea } from "./ui";

const TYPES = ["مصنع", "موزع", "سوق جملة", "منشأة تعبئة", "محمصة", "مطبعة", "أخرى"];
type S = { name?: string; type?: string; phone?: string | null; contact?: string | null; city?: string | null; rating?: number | null; notes?: string | null };

export function SupplierFields({ s = {} }: { s?: S }) {
  return (
    <>
      <Field label="الاسم">
        <Input name="name" required defaultValue={s.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع">
          <Select name="type" defaultValue={s.type ?? "موزع"}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="التقييم">
          <Select name="rating" defaultValue={s.rating?.toString() ?? ""}>
            <option value="">—</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{"★".repeat(r)}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="الجوال">
          <Input name="phone" inputMode="tel" defaultValue={s.phone ?? ""} dir="ltr" />
        </Field>
        <Field label="المسؤول">
          <Input name="contact" defaultValue={s.contact ?? ""} />
        </Field>
        <Field label="المدينة">
          <Input name="city" defaultValue={s.city ?? ""} />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={s.notes ?? ""} placeholder="حد أدنى للطلب، مدة التوريد، جودة…" />
      </Field>
    </>
  );
}
