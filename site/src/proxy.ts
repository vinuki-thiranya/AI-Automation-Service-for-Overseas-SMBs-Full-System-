import { NextResponse, type NextRequest } from "next/server";

// en-AU is served without a prefix: "/packages" renders app/[locale] with locale "en-au", and
// "/en-au/packages" redirects to "/packages" so each page has exactly one URL.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/en-au" || pathname.startsWith("/en-au/")) {
    if (pathname.includes("/opengraph-image")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice("/en-au".length) || "/";
    return NextResponse.redirect(url, 308);
  }
  if (pathname === "/en-gb" || pathname.startsWith("/en-gb/") || pathname === "/en-us" || pathname.startsWith("/en-us/")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/en-au${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals, metadata files and anything with a file extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
