import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { quoteHtml } from "@/server/pdf/quote";
import { htmlToPdf } from "@/server/pdf/render";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "sales")) return new Response("غير مسموح", { status: 401 });
  if (user.role === "sales" && !(await prisma.quote.findFirst({ where: { id: (await params).id, createdById: user.id }, select: { id: true } }))) {
    return new Response("غير مسموح", { status: 403 });
  }
  const doc = await quoteHtml(prisma, (await params).id);
  if (!doc) return new Response("غير موجود", { status: 404 });
  try {
    const pdf = await htmlToPdf(doc.html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("PDF failed", e);
    // بديل: نسخة للطباعة من المتصفح
    return Response.redirect(new URL(`/quotes/${(await params).id}/print`, _req.url), 302);
  }
}
