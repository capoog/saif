import fs from "node:fs";
import path from "node:path";
import { D } from "@/domain/money";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (v: unknown) => Number(D(v as string).toFixed(2)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (d: Date) => new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(d);

let fontCss: string | null = null;
/** الخط مضمّن جوه الملف عشان الـ PDF يطلع بنفس الشكل في أي مكان */
function fonts(): string {
  if (fontCss) return fontCss;
  const dir = path.join(process.cwd(), "node_modules/@fontsource/ibm-plex-sans-arabic/files");
  const face = (subset: string, weight: number, range: string) => {
    const file = path.join(dir, `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`);
    const data = fs.readFileSync(file).toString("base64");
    return `@font-face{font-family:"Plex";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${range};}`;
  };
  const ar = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
  const la = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  fontCss = [face("arabic", 400, ar), face("arabic", 700, ar), face("latin", 400, la), face("latin", 700, la)].join("\n");
  return fontCss;
}

export interface QuoteDoc {
  numberLabel: string;
  date: Date;
  validUntil: Date;
  business: { name: string; cr: string; vatNo: string; phone: string };
  customer: { name: string; contact?: string | null; phone?: string | null; city?: string | null };
  items: { description: string; quantity: number; unitPrice: unknown; lineTotal: unknown }[];
  subtotal: unknown;
  discount: unknown;
  shippingFee: unknown;
  vatAmount: unknown;
  vatRatePct: unknown;
  pricesIncludeVat: boolean;
  total: unknown;
  depositPct: unknown;
  terms?: string | null;
}

export function renderQuoteHtml(q: QuoteDoc): string {
  const vatRate = Number(D(q.vatRatePct as string));
  const deposit = D(q.total as string).times(D(q.depositPct as string)).div(100);
  const rows = q.items
    .map(
      (it, i) => `<tr><td class="n">${i + 1}</td><td>${esc(it.description)}</td><td class="n">${it.quantity}</td><td class="n">${money(it.unitPrice)}</td><td class="n">${money(it.lineTotal)}</td></tr>`,
    )
    .join("");
  const line = (label: string, value: unknown, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="n">${money(value)}</td></tr>`;
  const biz = q.business;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عرض سعر ${esc(q.numberLabel)}</title>
<style>
${fonts()}
@page{size:A4;margin:14mm 12mm}
*{box-sizing:border-box}
body{font-family:"Plex",system-ui,sans-serif;color:#0f172a;font-size:12.5px;margin:0}
.n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums;text-align:left;white-space:nowrap}
header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:12px}
.brand{font-size:22px;font-weight:700;color:#0f766e}
.muted{color:#64748b;font-size:11px;line-height:1.7}
h1{font-size:18px;margin:0 0 4px}
.meta td{padding:2px 0 2px 16px}
.cards{display:flex;gap:12px;margin:16px 0}
.card{flex:1;background:#f1f5f9;border-radius:10px;padding:10px 12px}
.card b{display:block;margin-bottom:4px}
table.items{width:100%;border-collapse:collapse;margin-top:8px}
table.items th{background:#0f766e;color:#fff;font-weight:700;padding:8px;text-align:right}
table.items th.n{text-align:left}
table.items td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
table.items tr:nth-child(even) td{background:#f8fafc}
.totals{width:280px;margin-right:auto;margin-top:12px;border-collapse:collapse}
.totals td{padding:5px 8px}
.totals .grand td{font-size:15px;font-weight:700;border-top:2px solid #0f172a}
.totals .dep td{color:#0f766e;font-weight:700}
.terms{margin-top:22px;font-size:11.5px;line-height:1.9}
footer{margin-top:28px;display:flex;justify-content:space-between;font-size:11px;color:#64748b}
.sign{border-top:1px solid #94a3b8;width:180px;padding-top:6px;text-align:center}
</style></head><body>
<header>
  <div>
    <div class="brand">${esc(biz.name || "عرض سعر")}</div>
    <div class="muted">${biz.cr ? `سجل تجاري: <span class="n">${esc(biz.cr)}</span><br>` : ""}${biz.vatNo ? `الرقم الضريبي: <span class="n">${esc(biz.vatNo)}</span><br>` : ""}${biz.phone ? `جوال: <span class="n">${esc(biz.phone)}</span>` : ""}</div>
  </div>
  <div>
    <h1>عرض سعر</h1>
    <table class="meta muted"><tr><td>الرقم</td><td class="n">${esc(q.numberLabel)}</td></tr><tr><td>التاريخ</td><td>${date(q.date)}</td></tr><tr><td>صالح حتى</td><td>${date(q.validUntil)}</td></tr></table>
  </div>
</header>
<div class="cards">
  <div class="card"><b>مقدَّم إلى</b>${esc(q.customer.name)}${q.customer.contact ? `<br>${esc(q.customer.contact)}` : ""}${q.customer.phone ? `<br><span class="n">${esc(q.customer.phone)}</span>` : ""}${q.customer.city ? `<br>${esc(q.customer.city)}` : ""}</div>
  <div class="card"><b>الدفع</b>عربون <span class="n">${esc(D(q.depositPct as string).toString())}%</span> عند التوقيع (<span class="n">${money(deposit)}</span> ريال)، والباقي عند التسليم.</div>
</div>
<table class="items"><thead><tr><th class="n">#</th><th>البيان</th><th class="n">الكمية</th><th class="n">سعر الوحدة</th><th class="n">الإجمالي</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals">
${line("المجموع", q.subtotal)}
${D(q.discount as string).gt(0) ? line("الخصم", D(q.discount as string).neg()) : ""}
${D(q.shippingFee as string).gt(0) ? line("الشحن والتوصيل", q.shippingFee) : ""}
${vatRate > 0 ? line(`ضريبة القيمة المضافة <span class="n">${vatRate}%</span>${q.pricesIncludeVat ? " (شاملة)" : ""}`, q.vatAmount) : ""}
${line("الإجمالي (ريال سعودي)", q.total, "grand")}
${line(`العربون <span class="n">${D(q.depositPct as string).toString()}%</span>`, deposit, "dep")}
</table>
${q.terms ? `<div class="terms"><b>الشروط والملاحظات</b><br>${esc(q.terms).replace(/\n/g, "<br>")}</div>` : ""}
<div class="terms muted">${vatRate > 0 ? "الأسعار بالريال السعودي. الفاتورة الضريبية تصدر عند التسليم." : "الأسعار بالريال السعودي."} هذا العرض ليس فاتورة ضريبية.</div>
<footer><div class="sign">الختم والتوقيع</div><div class="sign">اعتماد العميل</div></footer>
</body></html>`;
}
