import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// Supabase Auth callback: exchanges the OAuth code for a session, then
// returns the user home. Used by Google sign-in (Supabase Auth provider).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const supabase = createSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
