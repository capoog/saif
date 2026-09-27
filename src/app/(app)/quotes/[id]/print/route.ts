import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { quoteHtml } from "@/server/pdf/quote";

export const runtime = "nodejs";

/** نسخة HTML للطباعة (حفظ كـ PDF من المتصفح) — بديل لو توليد الـ PDF فشل */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return new Response("غير مسموح", { status: 401 });
  const doc = await quoteHtml(prisma, (await params).id);
  if (!doc) return new Response("غير موجود", { status: 404 });
  const html = doc.html.replace("</body>", "<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body>");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
