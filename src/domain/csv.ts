/** قارئ CSV بسيط: بيدعم علامات التنصيص والفواصل جوه القيم، وفاصل , أو ; أو Tab */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** أسماء الأعمدة المقبولة (عربي أو إنجليزي) → الحقل */
const HEADER_MAP: Record<string, string> = {
  name: "name", "الاسم": "name", "اسم": "name", "العميل": "name", "اسم العميل": "name",
  phone: "phone", mobile: "phone", "الجوال": "phone", "جوال": "phone", "الهاتف": "phone", "رقم": "phone",
  type: "type", "النوع": "type",
  sector: "sector", "القطاع": "sector",
  contact: "contact", "جهة الاتصال": "contact", "المسؤول": "contact",
  email: "email", "الايميل": "email", "البريد": "email", "الإيميل": "email",
  city: "city", "المدينة": "city",
  channel: "channel", "القناة": "channel",
  notes: "notes", "ملاحظات": "notes",
};

export interface CsvCustomer {
  name: string;
  phone?: string;
  type?: "individual" | "company";
  sector?: string;
  contact?: string;
  email?: string;
  city?: string;
  channel?: string;
  notes?: string;
}

/** السعودية: 05xxxxxxxx أو 9665xxxxxxxx أو +966… → 05xxxxxxxx */
export function normalizePhone(p: string | undefined | null): string | undefined {
  if (!p) return undefined;
  const digits = p.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("9665") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("5") && digits.length === 9) return "0" + digits;
  return digits;
}

export function csvToCustomers(text: string): { customers: CsvCustomer[]; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { customers: [], skipped: 0 };
  const header = rows[0].map((h) => HEADER_MAP[h.toLowerCase()] ?? HEADER_MAP[h] ?? null);
  const hasHeader = header.includes("name");
  const cols = hasHeader ? header : ["name", "phone", "type", "sector", "contact", "city", "notes"];
  const body = hasHeader ? rows.slice(1) : rows;
  const customers: CsvCustomer[] = [];
  let skipped = 0;
  for (const r of body) {
    const o: Record<string, string> = {};
    cols.forEach((c, i) => c && r[i] && (o[c] = r[i]));
    if (!o.name) {
      skipped++;
      continue;
    }
    const t = (o.type ?? "").toLowerCase();
    customers.push({
      name: o.name,
      phone: normalizePhone(o.phone),
      type: t === "company" || t.includes("شرك") || t.includes("مؤسس") ? "company" : "individual",
      sector: o.sector,
      contact: o.contact,
      email: o.email,
      city: o.city,
      channel: o.channel,
      notes: o.notes,
    });
  }
  return { customers, skipped };
}
