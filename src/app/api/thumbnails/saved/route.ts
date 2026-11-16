import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";

// /api/thumbnails/saved — saved Thumbnail Studio compositions.
// A composition is SETTINGS only (prompt, texts, colours, size, preset) —
// uploaded face/background images are never stored or uploaded anywhere,
// so loading a saved composition restores the settings and the user
// re-attaches images if needed. Stored in the existing `packages` table
// (kind='thumbnail-saved', one row per composition, no new table).
//
// GET → { compositions: [...] } for the signed-in user.
// POST { composition } → { composition } (saved).
// DELETE ?id=… → { ok: true } (own rows only).

export type SavedThumbnail = {
  id: number;
  name: string;
  topic: string;
  subject: string;
  mood: string;
  punchWords: string;
  size: string;
  preset: number;
  /** Main top text (white distressed line). */
  topText: string;
  /** Punch word inside the solid red box. */
  punchWord: string;
  /** Colour of the punch-word box (default red). */
  boxColor: string;
  /** Colour of the main top text (default white). */
  textColor: string;
  showText: boolean;
  fontFamily: string;
  styleNotes: string;
  createdAt: string;
};

function cleanStr(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ compositions: [], configured: false });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("packages")
    .select("id,topic,payload_json,created_at")
    .eq("user_id", user.id)
    .eq("kind", "thumbnail-saved")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const compositions: SavedThumbnail[] = (data ?? []).map((row) => {
    const p = (row.payload_json ?? {}) as Partial<SavedThumbnail>;
    return {
      id: row.id as number,
      name: (row.topic as string) || "Untitled thumbnail",
      topic: p.topic ?? "",
      subject: p.subject ?? "",
      mood: p.mood ?? "dramatic",
      punchWords: p.punchWords ?? "",
      size: p.size ?? "16:9",
      preset: typeof p.preset === "number" ? p.preset : 0,
      topText: p.topText ?? "",
      punchWord: p.punchWord ?? "",
      boxColor: p.boxColor ?? "#d92d20",
      textColor: p.textColor ?? "#ffffff",
      showText: p.showText !== false,
      fontFamily: p.fontFamily ?? "Arial, Helvetica, sans-serif",
      styleNotes: p.styleNotes ?? "",
      createdAt: (row.created_at as string) ?? "",
    };
  });
  return NextResponse.json({ compositions });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    composition?: Partial<SavedThumbnail>;
  };
  const c = body.composition ?? {};
  const topic = cleanStr(c.topic, 120);
  const name = cleanStr(c.name, 120) || topic || cleanStr(c.topText, 120) || "Untitled thumbnail";
  const payload: Omit<SavedThumbnail, "id" | "name" | "createdAt"> = {
    topic,
    subject: cleanStr(c.subject),
    mood: ["dramatic", "bold", "curious", "urgent", "hopeful"].includes(c.mood ?? "")
      ? (c.mood as string)
      : "dramatic",
    punchWords: cleanStr(c.punchWords, 80),
    size: ["16:9", "9:16", "1:1"].includes(c.size ?? "") ? (c.size as string) : "16:9",
    preset: typeof c.preset === "number" && c.preset >= 0 && c.preset < 20 ? c.preset : 0,
    topText: cleanStr(c.topText, 120),
    punchWord: cleanStr(c.punchWord, 80),
    boxColor: /^#[0-9a-fA-F]{6}$/.test(c.boxColor ?? "") ? (c.boxColor as string) : "#d92d20",
    textColor: /^#[0-9a-fA-F]{6}$/.test(c.textColor ?? "") ? (c.textColor as string) : "#ffffff",
    showText: c.showText !== false,
    fontFamily: cleanStr(c.fontFamily, 120) || "Arial, Helvetica, sans-serif",
    styleNotes: cleanStr(c.styleNotes, 500),
  };
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("packages")
    .insert({ user_id: user.id, kind: "thumbnail-saved", topic: name, payload_json: payload })
    .select("id,created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save composition." }, { status: 500 });
  }
  return NextResponse.json({
    composition: { ...payload, id: data.id as number, name, createdAt: data.created_at as string },
  });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("packages")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("kind", "thumbnail-saved");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
