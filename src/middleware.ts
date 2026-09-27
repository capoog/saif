import { NextResponse, type NextRequest } from "next/server";

// فحص سريع لوجود الجلسة. التحقق الفعلي (صلاحية الجلسة والدور) بيحصل في السيرفر مع كل صفحة و action.
export function middleware(req: NextRequest) {
  if (!req.cookies.has("saif_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/webhooks|_next/static|_next/image|favicon.ico|icon|robots.txt).*)"],
};
