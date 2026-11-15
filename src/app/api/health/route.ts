import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-server";

// Health check: reports which integrations are configured (never values).
export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    supabase: isSupabaseConfigured(),
    youtubeKey: Boolean(process.env.YOUTUBE_API_KEY),
    googleOAuth:
      Boolean(process.env.GOOGLE_CLIENT_ID) &&
      Boolean(process.env.GOOGLE_CLIENT_SECRET),
  });
}
