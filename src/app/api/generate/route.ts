// POST /api/generate — rule-based SEO pack for a topic.
// Saves the pack as packages kind='package'. No AI, no external calls.
// GET /api/generate — the 10 most recent saved packs.
import { NextResponse } from "next/server";
import { generateSeoPack, cleanTopic } from "@/lib/generator";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    channelTitle?: string;
  };
  const topic = cleanTopic(body.topic ?? "");
  if (topic.length < 3) {
    return NextResponse.json(
      { error: "Give a topic of at least 3 characters." },
      { status: 400 }
    );
  }
  const pack = generateSeoPack(topic, body.channelTitle);

  // Save best-effort: the pack is returned even if the DB write fails
  // (e.g. Supabase not configured, or the user row is missing).
  let saved = false;
  let packageId: number | null = null;
  let saveError: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const user = await getSessionUser();
      const admin = createSupabaseAdmin();
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
