import { Field, Input, Select, Textarea } from "./ui";

type C = { name?: string; type?: string; phone?: string | null; email?: string | null; city?: string | null; sector?: string | null; contact?: string | null; channel?: string | null; notes?: string | null };

export function CustomerFields({ c = {} }: { c?: C }) {
  return (
    <>
      <Field label="الاسم">
        <Input name="name" required defaultValue={c.name} autoFocus={!c.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="النوع">
          <Select name="type" defaultValue={c.type ?? "company"}>
            <option value="company">شركة / مؤسسة</option>
            <option value="individual">فرد</option>
          </Select>
        </Field>
        <Field label="الجوال">
          <Input name="phone" inputMode="tel" defaultValue={c.phone ?? ""} dir="ltr" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="جهة الاتصال">
          <Input name="contact" defaultValue={c.contact ?? ""} placeholder="الاسم والمنصب" />
        </Field>
        <Field label="القطاع">
          <Input name="sector" defaultValue={c.sector ?? ""} placeholder="مقاولات، عيادات…" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="المدينة">
          <Input name="city" defaultValue={c.city ?? ""} />
        </Field>
        <Field label="القناة">
          <Input name="channel" defaultValue={c.channel ?? ""} placeholder="لينكدإن، إحالة…" />
        </Field>
        <Field label="الإيميل">
          <Input name="email" type="email" defaultValue={c.email ?? ""} dir="ltr" />
        </Field>
      </div>
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={c.notes ?? ""} />
      </Field>
    </>
  );
}
