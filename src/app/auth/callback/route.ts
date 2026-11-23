import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Supabase Auth callback: exchanges the OAuth code for a session, then
// returns the user home. Used by Google sign-in (Supabase Auth provider).
//
// NOTE: on Netlify the route handler runs behind the CDN, so `req.url`
// can carry the internal deploy URL (e.g. <deploy-id>--nizafa.netlify.app)
// instead of the public site host. Redirecting to `url.origin` would drop
// the user onto the deploy URL, where the session cookie (set for the
// public host) does not apply and the user looks signed out. Use the
// original public host from the forwarded headers instead.
function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Return destination: ?next= param first, then the nizafa-next cookie
  // set by the chatbot sign-in screen (the redirectTo URL itself must
  // stay exactly matching Supabase's allowlist, so it carries no query).
  const rawNext =
    url.searchParams.get("next") ??
    getCookie(req.headers.get("cookie"), "nizafa-next") ??
    "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  if (code) {
    const supabase = createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth/callback exchange failed:", error.message);
    }
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? url.origin);
  const res = NextResponse.redirect(new URL(next, origin));
  // One-time cookie: clear it so a later sign-in starts fresh.
  res.cookies.set("nizafa-next", "", { maxAge: 0, path: "/" });
  return res;
}
