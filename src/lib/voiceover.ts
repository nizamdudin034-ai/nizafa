// Voiceover generation — shared limits, voices, chunking, key lookup.
// Provider: ElevenLabs (server-side, xi-api-key). KikiVoice has NO public
// API (verified 16 Nov 2026 — browser-only, no API planned), so the
// KikiVoice "Julian" Urdu voice from the tutorial CANNOT be used inside
// Nizafa; Urdu voiceover uses ElevenLabs multilingual voices instead.
// Browser Web Speech API is a zero-key PREVIEW only (plays aloud, no MP3).
// The key is never logged and never sent to the browser: it comes from
// the ELEVENLABS_API_KEY env var (preferred) or the owner-saved
// `elevenlabs_api_key` row in the settings table (Settings page, owner-only).
import { createSupabaseAdmin, isSupabaseConfigured } from "./supabase-server";

/** Fair use (free on every plan — plans.ts defines no voiceover limit). */
export const VOICEOVER_DAILY_LIMIT = 3; // generations per user per day
export const VOICEOVER_DAILY_CHARS = 10000; // characters per user per day
export const VOICEOVER_CHUNK_CHARS = 2500; // per ElevenLabs request (limit is 5000)
export const VOICEOVER_MAX_TEXT = 10000; // max characters per generation

export type VoiceoverLanguage = "en" | "ur";

export type VoiceOption = {
  id: string;
  name: string;
  note: string;
};

/**
 * Curated fallback voices — used ONLY when no key is configured (so
 * generation is unavailable anyway) or the live voice list can't be
 * fetched. With a key set, the route returns the account's real voices
 * from ElevenLabs instead. IDs are ElevenLabs' public stock voices;
 * "Helio" is the channel's own voice (avocado_v2:MAI_03) — if it is not
 * in the account's live list, ElevenLabs will reject it honestly.
 */
export const FALLBACK_VOICES: VoiceOption[] = [
  { id: "avocado_v2:MAI_03", name: "Helio — channel voice", note: "Your channel voice (ElevenLabs)" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", note: "Calm, clear narrator" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "Deep, confident narrator" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", note: "Warm, well-rounded" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", note: "Soft, expressive" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", note: "Young, energetic" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", note: "Strong, confident" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", note: "Crisp, authoritative" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", note: "Casual, conversational" },
];

/** ElevenLabs model: turbo for English, multilingual for Urdu. */
export function voiceoverModelFor(language: VoiceoverLanguage): string {
  return language === "ur" ? "eleven_multilingual_v2" : "eleven_turbo_v2_5";
}

/**
 * Split script text into chunks on sentence boundaries, never breaking a
 * sentence unless a single sentence is longer than the chunk limit.
 */
export function chunkText(text: string, maxChars: number = VOICEOVER_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences =
    clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < s.length; i += maxChars) {
        chunks.push(s.slice(i, i + maxChars));
      }
      continue;
    }
    if (current && current.length + 1 + s.length > maxChars) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Today's date key (PKT) for the daily fair-use bucket. */
export function voiceoverDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve the ElevenLabs key: Netlify env var first, then the owner-saved
 * settings row. Server-only — never call from client code.
 */
export async function getElevenLabsKey(): Promise<string | null> {
  const env = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (env) return env;
  if (!isSupabaseConfigured()) return null;
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", "elevenlabs_api_key")
      .maybeSingle();
    const v = (data?.value as string | undefined)?.trim();
    return v || null;
  } catch {
    return null;
  }
}
