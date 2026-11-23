// Nizafa.ai lives on its own site now: https://nizafa-ai.netlify.app
// The chatbot site is ONLY the chatbot — no SEO header, no SEO nav, no
// SEO pages. The shared layout hides its SEO chrome on the AI host (see
// Nav and SiteFooter), and this middleware sends every SEO page on the
// AI host back to the SEO site, so /research, /optimize, /thumbnails and
// the rest can never open there. On the SEO site (nizafa.netlify.app)
// every /ai request redirects to the standalone chatbot site. The
// chatbot site's own homepage (/) opens the chatbot landing (/ai)
// directly. /api and /auth keep working on both hosts.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SEO_HOST = "nizafa.netlify.app";
const AI_HOST = "nizafa-ai.netlify.app";
const SEO_SITE = "https://nizafa.netlify.app";
const AI_SITE = "https://nizafa-ai.netlify.app";

// Paths that belong on the chatbot site. Everything else on the AI host
// is an SEO page and belongs on the SEO site.
const AI_PATHS = ["/ai", "/api", "/auth"];

function isAiPath(pathname: string) {
  return AI_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;

  // SEO site: /ai* lives on the chatbot site now.
  if (host === SEO_HOST && pathname.startsWith("/ai")) {
    return NextResponse.redirect(new URL(pathname + search, AI_SITE), 308);
  }

  if (host === AI_HOST) {
    // Chatbot site homepage opens the chatbot.
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/ai", AI_SITE), 308);
    }
    // Any SEO page on the chatbot domain belongs on the SEO site.
    if (!isAiPath(pathname)) {
      return NextResponse.redirect(
        new URL(pathname + search, SEO_SITE),
        308
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|.*\\..*).*)",
  ],
};
