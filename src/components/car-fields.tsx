"use client";

import { useState } from "react";
import { Field, Input, Select, Textarea, cn } from "./ui";

export type CarFormValues = {
  make?: string;
  year?: number;
  mileage?: number | null;
  color?: string | null;
  specs?: string | null;
  vin?: string | null;
  source?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  marketPrices?: string[];
  askingPrice?: string | null;
  commissionType?: string | null;
  commissionValue?: string | null;
  notes?: string | null;
};

const n = (v: string) => Number(v.replace(/,/g, "")) || 0;

export function CarFields({ c = {}, type }: { c?: CarFormValues; type: "BROKERAGE" | "PURCHASE" }) {
  const [prices, setPrices] = useState<string[]>(() => {
    const p = c.marketPrices ?? [];
    return [...p, ...Array(Math.max(4 - p.length, 0)).fill("")];
  });
  const [asking, setAsking] = useState(c.askingPrice ?? "");
  const [ctype, setCtype] = useState(c.commissionType ?? "FIXED");
  const [cvalue, setCvalue] = useState(c.commissionValue ?? "");
  const valid = prices.map(n).filter((x) => x > 0);
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const commission = ctype === "PERCENT" ? (n(asking) * n(cvalue)) / 100 : n(cvalue);

  return (
    <>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="الشركة والموديل">
          <Input name="make" required defaultValue={c.make} placeholder="تويوتا كامري" />
        </Field>
        <Field label="السنة">
          <Input name="year" inputMode="numeric" required defaultValue={c.year ?? ""} className="num" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الممشى (كم)">
          <Input name="mileage" inputMode="numeric" defaultValue={c.mileage ?? ""} className="num" />
        </Field>
        <Field label="اللون">
          <Input name="color" defaultValue={c.color ?? ""} />
        </Field>
      </div>
      <Field label="الفئة والمواصفات" hint="تطلع في عرض السعر">
        <Textarea name="specs" defaultValue={c.specs ?? ""} rows={2} placeholder="فل كامل، بانوراما، فتحة، شاشة…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="رقم الهيكل (اختياري)">
          <Input name="vin" defaultValue={c.vin ?? ""} dir="ltr" />
        </Field>
        <Field label="المصدر">
          <Input name="source" defaultValue={c.source ?? ""} list="car-sources" />
          <datalist id="car-sources">
            <option value="حراج" />
            <option value="معرض" />
            <option value="مالك مباشر" />
            <option value="سيارة" />
          </datalist>
        </Field>
      </div>

      <Field label="أسعار إعلانات مشابهة (حتى 10)" hint={avg > 0 ? <>متوسط السوق <span className="num font-semibold text-fg">{fmt(avg)}</span> من {valid.length} إعلان</> : "من حراج أو سيارة أو غيرها"}>
        <div className="grid grid-cols-2 gap-2">
          {prices.map((p, i) => (
            <Input key={i} name="market" inputMode="numeric" value={p} onChange={(e) => setPrices((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} className="num h-10" placeholder={`إعلان ${i + 1}`} />
          ))}
        </div>
        {prices.length < 10 && (
          <button type="button" onClick={() => setPrices((ps) => [...ps, ""])} className="mt-2 text-sm text-primary">
            + سعر
          </button>
        )}
      </Field>

      <Field label="السعر المطلوب للبيع" hint={avg > 0 && n(asking) > 0 ? <><span className="num">{((n(asking) / avg) * 100).toFixed(0)}%</span> من متوسط السوق</> : undefined}>
        <Input name="askingPrice" inputMode="decimal" value={asking} onChange={(e) => setAsking(e.target.value)} className="num" />
      </Field>

      {type === "BROKERAGE" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="صاحب السيارة">
              <Input name="ownerName" defaultValue={c.ownerName ?? ""} />
            </Field>
            <Field label="جواله">
              <Input name="ownerPhone" inputMode="tel" defaultValue={c.ownerPhone ?? ""} dir="ltr" />
            </Field>
          </div>
          <Field label="عمولتك" hint={commission > 0 ? <>= <span className="num font-semibold text-fg">{fmt(commission)}</span> ريال</> : undefined}>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <Select name="commissionType" value={ctype} onChange={(e) => setCtype(e.target.value)}>
                <option value="FIXED">مبلغ ثابت</option>
                <option value="PERCENT">نسبة %</option>
              </Select>
              <Input name="commissionValue" inputMode="decimal" value={cvalue} onChange={(e) => setCvalue(e.target.value)} className={cn("num")} placeholder={ctype === "PERCENT" ? "مثلًا 2" : "مثلًا 1500"} />
            </div>
          </Field>
        </>
      )}
      <Field label="ملاحظات">
        <Textarea name="notes" defaultValue={c.notes ?? ""} rows={2} />
      </Field>
    </>
  );
}
