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
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";
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
  return NextResponse.redirect(new URL(next, origin));
}
