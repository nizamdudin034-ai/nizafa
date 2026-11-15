import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";

// API keys — create (full key returned ONCE), list (prefix only), revoke.
// Only the SHA-256 hash is stored; the full key is never saved anywhere.

// POST /api/keys → { key, prefix, id } (key shown once)
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
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
  // 32 random characters, URL-safe.
  const key = `nzf_${randomBytes(24).toString("base64url")}`;
  const prefix = key.slice(0, 12);
  const keyHash = createHash("sha256").update(key).digest("hex");
  const { data, error } = await admin
    .from("api_keys")
    .insert({ user_id: user.id, prefix, key_hash: keyHash })
    .select("id,prefix,created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not create key." }, { status: 500 });
  }
  return NextResponse.json({
    key,
    prefix: data.prefix,
    id: data.id,
    created_at: data.created_at,
    note: "Copy this key now — it will never be shown again.",
  });
}

// GET /api/keys → { keys: [{ id, prefix, created_at, revoked_at }] }
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ keys: [], configured: false });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,prefix,created_at,revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ keys: data ?? [] });
}

// DELETE /api/keys?id=… → revokes the key (sets revoked_at).
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", Number(id))
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
