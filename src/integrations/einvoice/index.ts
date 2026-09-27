/**
 * واجهة مزوّد الفوترة الإلكترونية (فاتورة / ZATCA).
 * النظام نفسه لا يصدر فواتير ضريبية رسمية — هذي تطلع من مزوّد معتمد.
 * لما تحدد المزوّد (نظام محاسبة أو منصة متجر) نكتب Adapter يطبّق الواجهة هذي بس.
 */
export interface OfficialInvoice {
  number: string;
  url?: string;
  issuedAt: Date;
}

export interface EInvoiceOrderPayload {
  orderId: string;
  orderNumber: number;
  date: Date;
  customer?: { name: string; vatNumber?: string | null; phone?: string | null };
  lines: { description: string; quantity: number; unitPrice: string }[];
  discount: string;
  shippingFee: string;
  vatRatePct: number;
  pricesIncludeVat: boolean;
}

export interface EInvoiceProvider {
  readonly name: string;
  /** يصدر فاتورة رسمية عند المزوّد ويرجّع رقمها ورابطها */
  issueInvoice(payload: EInvoiceOrderPayload): Promise<OfficialInvoice>;
  /** إشعار دائن للمرتجع */
  issueCreditNote(originalInvoiceNumber: string, payload: EInvoiceOrderPayload): Promise<OfficialInvoice>;
}

/** الافتراضي: إدخال يدوي لرقم الفاتورة من شاشة الطلب */
export class ManualEInvoiceProvider implements EInvoiceProvider {
  readonly name = "manual";
  async issueInvoice(): Promise<OfficialInvoice> {
    throw new Error("الفاتورة الرسمية تتسجل يدويًا من شاشة الطلب لين ما يتحدد مزوّد معتمد");
  }
  async issueCreditNote(): Promise<OfficialInvoice> {
    throw new Error("إشعار الدائن يتسجل يدويًا لين ما يتحدد مزوّد معتمد");
  }
}

export function getEInvoiceProvider(): EInvoiceProvider {
  return new ManualEInvoiceProvider();
}
