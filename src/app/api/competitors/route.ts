import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  createSupabaseServer,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser, isOwner, ensureAppUser } from "@/lib/auth";
import { connectCompetitorChannel } from "@/lib/competitors";

// Competitor channels API — same connect flow as /api/channels, but the
// channel is stored with role='competitor'. Owner-only for adding.
// GET lists competitor channels with their stats. DELETE removes one.

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ competitors: [], configured: false });
  }
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("role", "competitor")
    .order("connected_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ competitors: data ?? [] });
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
      {
        error:
          "Adding competitors is coming soon for everyone. Right now only the workspace owner can add them.",
      },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { input?: string };
  const input = (body.input ?? "").trim();
  if (!input) {
    return NextResponse.json(
      { error: "Give a channel link, @handle or ID." },
      { status: 400 }
    );
  }
  const admin = createSupabaseAdmin();
  // Without an app_users row for this auth UID, the competitor upsert fails
  // on the channels_user_id_fkey foreign key (same bug as /api/generate).
  await ensureAppUser(admin, user);
  const result = await connectCompetitorChannel(input, user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can remove competitors." }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("channels")
    .delete()
    .eq("id", Number(id))
    .eq("role", "competitor");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
