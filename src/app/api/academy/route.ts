import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";

// Academy progress API (supporting route for /academy).
// GET → { progress: [{ lesson_id, done }] } for the signed-in user.
// POST { lessonId, done } → upserts academy_progress for that user.

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ progress: [], configured: false });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("academy_progress")
    .select("lesson_id,done")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ progress: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { lessonId?: string; done?: boolean };
  const lessonId = (body.lessonId ?? "").trim();
  if (!lessonId || lessonId.length > 64) {
    return NextResponse.json({ error: "Missing lesson id." }, { status: 400 });
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
  const done = body.done !== false;
  const { error } = await admin.from("academy_progress").upsert(
    { user_id: user.id, lesson_id: lessonId, done, updated_at: new Date().toISOString() },
    { onConflict: "user_id,lesson_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lessonId, done });
}
