// POST /api/generate — rule-based SEO pack for a topic.
// Saves the pack as packages kind='package'. No AI, no external calls.
// Body: { topic, channelTitle?, length?: "long"|"short", variant?: 0|1,
//         save?: boolean } — save:false returns the pack without writing
// a row (used by per-section Regenerate, so it doesn't spam saved packs).
// GET /api/generate — the 10 most recent saved packs.
// PATCH /api/generate — { id, patch } merges patch into a saved pack's
// payload_json (edits made in the pack view are persisted).
// DELETE /api/generate?id= — deletes a saved pack.
import { NextResponse } from "next/server";
import { generateSeoPack, cleanTopic, type VideoLength } from "@/lib/generator";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser, ensureAppUser } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    channelTitle?: string;
    length?: VideoLength;
    variant?: number;
    save?: boolean;
  };
  const topic = cleanTopic(body.topic ?? "");
  if (topic.length < 3) {
    return NextResponse.json(
      { error: "Give a topic of at least 3 characters." },
      { status: 400 }
    );
  }
  const pack = generateSeoPack(topic, body.channelTitle, {
    length: body.length,
    variant: body.variant,
  });
  const wantSave = body.save !== false;

  // Save best-effort: the pack is returned even if the DB write fails
  // (e.g. Supabase not configured, or the user row is missing).
  let saved = false;
  let packageId: number | null = null;
  let saveError: string | null = null;
  if (!wantSave) {
    saveError = null;
  } else if (isSupabaseConfigured()) {
    try {
      const user = await getSessionUser();
      const admin = createSupabaseAdmin();
      // Without an app_users row for this auth UID, the insert fails on the
      // packages_user_id_fkey foreign key (bug reported 16 Nov 2026).
      if (user) await ensureAppUser(admin, user);
      const { data, error } = await admin
        .from("packages")
        .insert({
          user_id: user?.id ?? null,
          kind: "package",
          topic: pack.topic,
          payload_json: pack,
        })
        .select("id")
        .single();
      if (error) saveError = error.message;
      else if (data) {
        saved = true;
        packageId = data.id as number;
      }
    } catch (e) {
      saveError = e instanceof Error ? e.message : "Could not save pack.";
    }
  } else {
    saveError = "Supabase is not configured yet — pack was not saved.";
  }

  return NextResponse.json({ pack, saved, packageId, saveError });
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ packages: [], configured: false });
  }
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("packages")
      .select("id,topic,created_at,payload_json")
      .eq("kind", "package")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packages: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not list packs." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: number;
    patch?: Record<string, unknown>;
  };
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0 || !body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "Need a pack id and a patch object." }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  try {
    const admin = createSupabaseAdmin();
    const { data: row, error: readError } = await admin
      .from("packages")
      .select("payload_json")
      .eq("id", id)
      .eq("kind", "package")
      .single();
    if (readError || !row) {
      return NextResponse.json({ error: readError?.message ?? "Pack not found." }, { status: 404 });
    }
    const merged = { ...(row.payload_json as Record<string, unknown>), ...body.patch };
    const { error } = await admin
      .from("packages")
      .update({ payload_json: merged })
      .eq("id", id)
      .eq("kind", "package");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, pack: merged });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save changes." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Need a pack id." }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("packages")
      .delete()
      .eq("id", id)
      .eq("kind", "package");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not delete the pack." },
      { status: 500 }
    );
  }
}
