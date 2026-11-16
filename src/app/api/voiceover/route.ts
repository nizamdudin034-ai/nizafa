import { NextResponse } from "next/server";
import { getSessionUser, ensureAppUser } from "@/lib/auth";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import {
  FALLBACK_VOICES,
  VOICEOVER_CHUNK_CHARS,
  VOICEOVER_DAILY_CHARS,
  VOICEOVER_DAILY_LIMIT,
  VOICEOVER_MAX_TEXT,
  chunkText,
  getElevenLabsKey,
  voiceoverDayKey,
  voiceoverModelFor,
  type VoiceOption,
  type VoiceoverLanguage,
} from "@/lib/voiceover";

// Voiceover generation for the Generate flow.
// Provider: ElevenLabs, server-side only (xi-api-key). The key comes from
// ELEVENLABS_API_KEY (Netlify env, preferred) or the owner-saved
// `elevenlabs_api_key` settings row. It is NEVER logged or returned.
// KikiVoice has no public API, so it is not a path here.
// Fair use: 3 generations / 10,000 chars per user per day, counted in the
// existing `packages` table (kind='voiceover-usage', one row per user +
// day — no new table or migration, same pattern as daily-idea-states).
// If no key is configured the route answers honestly with
// { status: "unavailable" } — it NEVER fakes audio, and there is no
// Boost-style lock anywhere.

export const maxDuration = 120;

const USAGE_KIND = "voiceover-usage";

type Usage = { count: number; chars: number };

function usageTopic(day: string): string {
  return `voiceover-usage:${day}`;
}

async function loadUsage(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  day: string
): Promise<Usage> {
  try {
    const { data } = await admin
      .from("packages")
      .select("payload_json")
      .eq("user_id", userId)
      .eq("kind", USAGE_KIND)
      .eq("topic", usageTopic(day))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = data?.payload_json as Usage | null;
    return {
      count: typeof p?.count === "number" ? p.count : 0,
      chars: typeof p?.chars === "number" ? p.chars : 0,
    };
  } catch {
    return { count: 0, chars: 0 };
  }
}

async function recordUsage(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  day: string,
  next: Usage
): Promise<void> {
  try {
    const { data: existing } = await admin
      .from("packages")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", USAGE_KIND)
      .eq("topic", usageTopic(day))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await admin
        .from("packages")
        .update({ payload_json: next })
        .eq("id", (existing as { id: number }).id);
    } else {
      await admin.from("packages").insert({
        user_id: userId,
        kind: USAGE_KIND,
        topic: usageTopic(day),
        payload_json: next,
      });
    }
  } catch {
    // Usage counting is best-effort — never block a generation on it.
  }
}

async function fetchLiveVoices(key: string): Promise<VoiceOption[] | null> {
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      voices?: Array<{ voice_id?: string; name?: string; labels?: Record<string, string> }>;
    };
    const list = (data.voices ?? [])
      .filter((v) => v.voice_id && v.name)
      .map((v) => ({
        id: v.voice_id as string,
        name: v.name as string,
        note:
          v.labels?.accent || v.labels?.use_case
            ? [v.labels.accent, v.labels.use_case].filter(Boolean).join(" · ")
            : "Your ElevenLabs voice",
      }));
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const key = await getElevenLabsKey();
  const configured = Boolean(key);
  let voices: VoiceOption[] = FALLBACK_VOICES;
  let live = false;
  if (key) {
    const liveVoices = await fetchLiveVoices(key);
    if (liveVoices) {
      voices = liveVoices;
      live = true;
    }
  }
  let usage: Usage = { count: 0, chars: 0 };
  if (isSupabaseConfigured()) {
    try {
      const admin = createSupabaseAdmin();
      await ensureAppUser(admin, user);
      usage = await loadUsage(admin, user.id, voiceoverDayKey());
    } catch {
      usage = { count: 0, chars: 0 };
    }
  }
  return NextResponse.json({
    configured,
    provider: configured ? "elevenlabs" : null,
    voices,
    liveVoices: live,
    limits: { perDay: VOICEOVER_DAILY_LIMIT, charsPerDay: VOICEOVER_DAILY_CHARS },
    usage,
    note: configured
      ? undefined
      : "No ElevenLabs key configured — add one in Settings (owner) or set ELEVENLABS_API_KEY in Netlify. The free browser preview still works.",
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    voiceId?: string;
    language?: string;
  };
  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Script text is required." }, { status: 400 });
  }
  if (text.length > VOICEOVER_MAX_TEXT) {
    return NextResponse.json(
      {
        error: `Script is too long for one voiceover (${text.length.toLocaleString()} characters; max ${VOICEOVER_MAX_TEXT.toLocaleString()}). Shorten the script or split it.`,
      },
      { status: 400 }
    );
  }
  const voiceId = (body.voiceId ?? "").trim().slice(0, 100);
  if (!voiceId) {
    return NextResponse.json({ error: "Pick a voice first." }, { status: 400 });
  }
  const language: VoiceoverLanguage = body.language === "ur" ? "ur" : "en";

  // Fair use first — never burn the owner's ElevenLabs credits on a
  // request that would exceed the daily cap.
  const day = voiceoverDayKey();
  let usage: Usage = { count: 0, chars: 0 };
  let admin: ReturnType<typeof createSupabaseAdmin> | null = null;
  if (isSupabaseConfigured()) {
    try {
      admin = createSupabaseAdmin();
      await ensureAppUser(admin, user);
      usage = await loadUsage(admin, user.id, day);
    } catch {
      admin = null;
      usage = { count: 0, chars: 0 };
    }
  }
  if (usage.count >= VOICEOVER_DAILY_LIMIT) {
    return NextResponse.json(
      {
        status: "limit",
        reason: `Daily voiceover limit reached (${VOICEOVER_DAILY_LIMIT} a day). It resets tomorrow — the browser preview still works.`,
      },
      { status: 429 }
    );
  }
  if (usage.chars + text.length > VOICEOVER_DAILY_CHARS) {
    return NextResponse.json(
      {
        status: "limit",
        reason: `Daily character limit reached (${VOICEOVER_DAILY_CHARS.toLocaleString()} a day; ${usage.chars.toLocaleString()} used). It resets tomorrow — the browser preview still works.`,
      },
      { status: 429 }
    );
  }

  const key = await getElevenLabsKey();
  if (!key) {
    return NextResponse.json({
      status: "unavailable",
      reason:
        "No ElevenLabs key configured — add one in Settings (owner) or set ELEVENLABS_API_KEY in Netlify. The free browser preview still works.",
    });
  }

  const chunks = chunkText(text, VOICEOVER_CHUNK_CHARS);
  const modelId = voiceoverModelFor(language);
  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let res: Response;
    try {
      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: chunks[i],
            model_id: modelId,
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0,
              use_speaker_boost: true,
            },
          }),
        }
      );
    } catch (e) {
      return NextResponse.json(
        { status: "error", reason: e instanceof Error ? e.message : "ElevenLabs request failed." },
        { status: 502 }
      );
    }
    if (!res.ok) {
      let detail = "";
      try {
        const errJson = (await res.json()) as { detail?: { message?: string } | string };
        detail =
          typeof errJson.detail === "string"
            ? errJson.detail
            : (errJson.detail?.message ?? "");
      } catch {
        detail = "";
      }
      return NextResponse.json(
        {
          status: "error",
          reason: `ElevenLabs ${res.status}${detail ? `: ${detail}` : ""}. Check the voice and the API key in Settings.`,
        },
        { status: 502 }
      );
    }
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }

  // MP3 frames are independent, so chunk buffers concatenate cleanly.
  const audio = Buffer.concat(buffers);
  const nextUsage: Usage = { count: usage.count + 1, chars: usage.chars + text.length };
  if (admin) await recordUsage(admin, user.id, day, nextUsage);

  return new NextResponse(audio, {
    headers: {
      "content-type": "audio/mpeg",
      "content-disposition": 'attachment; filename="nizafa-voiceover.mp3"',
      "x-voiceover-provider": "elevenlabs",
      "x-voiceover-chunks": String(chunks.length),
      "x-voiceover-chars": String(text.length),
      "x-voiceover-used-today": String(nextUsage.count),
      "x-voiceover-chars-today": String(nextUsage.chars),
    },
  });
}
