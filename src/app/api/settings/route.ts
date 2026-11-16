import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner, ownerEmail } from "@/lib/auth";
import { referralCodeFor } from "@/lib/plans";

// Settings API.
// GET → public status (never values, only set / not-set) + the owner's
// payment receiving numbers for signed-in users + the caller's own plan
// and referral code. Owner-only fields are marked as such.
// POST { easypaisaNumber, jazzcashNumber, paymentNote } — owner only,
// writes the settings table.

type SettingsMap = Record<string, string>;

async function readSettings(): Promise<SettingsMap> {
  const out: SettingsMap = {};
  if (!isSupabaseConfigured()) return out;
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin.from("settings").select("key,value");
    for (const row of data ?? []) {
      out[row.key as string] = row.value as string;
    }
  } catch {
    // Settings read failure → treat as unset, do not block the page.
  }
  return out;
}

export async function GET() {
  const user = await getSessionUser();
  const settings = await readSettings();
  const easypaisa = settings.easypaisa_number ?? "";
  const jazzcash = settings.jazzcash_number ?? "";
  const paymentNote = settings.payment_note ?? "";

  let plan = "free";
  if (user && isSupabaseConfigured()) {
    try {
      const admin = createSupabaseAdmin();
      const { data } = await admin.from("app_users").select("plan").eq("id", user.id).maybeSingle();
      if (data?.plan) plan = data.plan as string;
    } catch {
      plan = "free";
    }
  }

  return NextResponse.json({
    configured: isSupabaseConfigured(),
    youtubeApiKeySet: Boolean(process.env.YOUTUBE_API_KEY),
    elevenlabsKeySet: Boolean(
      process.env.ELEVENLABS_API_KEY || settings.elevenlabs_api_key
    ),
    googleOAuthSet: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    signedIn: !!user,
    email: user?.email ?? null,
    isOwner: isOwner(user),
    ownerEmail: ownerEmail(),
    plan,
    referralCode: user ? referralCodeFor(user.id) : null,
    // Receiving numbers are shown to signed-in users so they can pay;
    // editing them is owner-only (see POST).
    easypaisaNumber: user ? easypaisa : "",
    jazzcashNumber: user ? jazzcash : "",
    easypaisaSet: Boolean(easypaisa),
    jazzcashSet: Boolean(jazzcash),
    paymentNote,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isOwner(user)) {
    return NextResponse.json(
      { error: "Only the workspace owner can change these settings." },
      { status: 403 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    easypaisaNumber?: string;
    jazzcashNumber?: string;
    paymentNote?: string;
    elevenlabsApiKey?: string;
  };
  const rows: Array<{ key: string; value: string }> = [];
  // ElevenLabs key (voiceover on /generate). Empty string removes it.
  // The value is NEVER returned by GET — only a set / not-set boolean.
  // The ELEVENLABS_API_KEY env var (Netlify) takes precedence over this row.
  if (body.elevenlabsApiKey !== undefined) {
    const v = body.elevenlabsApiKey.trim();
    if (v && !/^sk_[A-Za-z0-9]{16,}$/.test(v)) {
      return NextResponse.json(
        { error: "That doesn't look like an ElevenLabs API key (it starts with sk_)." },
        { status: 400 }
      );
    }
    if (!v) {
      const admin = createSupabaseAdmin();
      const { error } = await admin
        .from("settings")
        .delete()
        .eq("key", "elevenlabs_api_key");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, elevenlabsRemoved: true });
    }
    rows.push({ key: "elevenlabs_api_key", value: v });
  }
  if (body.easypaisaNumber !== undefined) {
    const v = body.easypaisaNumber.trim();
    if (v && !/^\+?[0-9\s-]{7,20}$/.test(v)) {
      return NextResponse.json({ error: "Easypaisa number looks invalid." }, { status: 400 });
    }
    rows.push({ key: "easypaisa_number", value: v });
  }
  if (body.jazzcashNumber !== undefined) {
    const v = body.jazzcashNumber.trim();
    if (v && !/^\+?[0-9\s-]{7,20}$/.test(v)) {
      return NextResponse.json({ error: "JazzCash number looks invalid." }, { status: 400 });
    }
    rows.push({ key: "jazzcash_number", value: v });
  }
  if (body.paymentNote !== undefined) {
    rows.push({ key: "payment_note", value: body.paymentNote.trim().slice(0, 500) });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("settings").upsert(
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: "key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
