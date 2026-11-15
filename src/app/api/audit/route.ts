import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";
import { runAudit } from "@/lib/audit";

// Channel audit API.
// POST { channelId } — runs a fresh rule-based audit from cached video
// data (refreshes from YouTube only if the cache is older than 6h),
// stores it in `audits`, and returns the report. Owner-only.
// GET ?channelId= — returns the latest saved audit for the channel.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const channelId = new URL(req.url).searchParams.get("channelId");
  if (!channelId || Number.isNaN(Number(channelId))) {
    return NextResponse.json({ error: "channelId query param is required." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("audits")
    .select("id,report,created_at")
    .eq("channel_id", Number(channelId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ audit: null });
  return NextResponse.json({ audit: data });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  if (!isOwner(user)) {
    return NextResponse.json(
      { error: "Audits are available to the workspace owner in this version." },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { channelId?: number | string };
  const channelId = Number(body.channelId);
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required." }, { status: 400 });
  }
  try {
    const report = await runAudit(channelId);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not run the audit." },
      { status: 502 }
    );
  }
}
