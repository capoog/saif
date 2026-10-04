import { prisma } from "@/server/db";
import { quoteHtml } from "@/server/pdf/quote";
import { htmlToPdf } from "@/server/pdf/render";
import { verifyShareToken } from "@/server/share";

export const runtime = "nodejs";
export const maxDuration = 30;

/** عرض السعر للعميل: رابط عام موقّع، يفتح PDF (أو نسخة HTML لو التوليد فشل) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params;
  if (!verifyShareToken("quote", id, token)) return new Response("الرابط غير صالح", { status: 404 });
  const doc = await quoteHtml(prisma, id);
  if (!doc) return new Response("غير موجود", { status: 404 });
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
  try {
    const pdf = await htmlToPdf(doc.html);
    return new Response(new Uint8Array(pdf), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"` },
    });
  } catch (e) {
    console.error("share PDF failed", e);
    return new Response(doc.html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
}
