// Nizafa.ai lives on its own site now: https://nizafa-ai.netlify.app
// On the SEO site (nizafa.netlify.app) every /ai request redirects to the
// standalone chatbot site. On nizafa-ai.netlify.app (and localhost) the
// chatbot serves normally. The chatbot site's own homepage (/) opens the
// chatbot landing (/ai) directly. No other path is touched.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SEO_HOST = "nizafa.netlify.app";
const AI_HOST = "nizafa-ai.netlify.app";
const AI_SITE = "https://nizafa-ai.netlify.app";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (
    host === SEO_HOST &&
    request.nextUrl.pathname.startsWith("/ai")
  ) {
    const url = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      AI_SITE
    );
    return NextResponse.redirect(url, 308);
  }
  if (host === AI_HOST && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/ai", AI_SITE), 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/ai/:path*"],
};
