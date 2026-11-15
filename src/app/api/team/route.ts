import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";

// Team members API (supporting route for the Team section in /settings).
// Owner only. GET lists, POST adds, DELETE removes (team_members table).

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can manage the team." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ members: [], configured: false });
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("team_members")
    .select("id,name,email,role,created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can manage the team." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; role?: string };
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "editor").trim().slice(0, 40) || "editor";
  if (!name || name.length > 80) return NextResponse.json({ error: "Enter the member's name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data: appUser } = await admin.from("app_users").select("id").eq("id", user.id).maybeSingle();
  if (!appUser) {
    await admin.from("app_users").insert({
      id: user.id,
      google_sub: user.id,
      email: user.email ?? "unknown@nizafa.app",
      plan: "free",
    });
  }
  const { data, error } = await admin
    .from("team_members")
    .insert({ user_id: user.id, name, email, role })
    .select("id,name,email,role,created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not add member." }, { status: 500 });
  }
  return NextResponse.json({ member: data });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can manage the team." }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("team_members").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
