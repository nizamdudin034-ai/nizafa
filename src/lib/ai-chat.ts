// Nizafa.ai public chatbot — server helpers.
// LLM: Pollinations (free, no key) OpenAI-compatible streaming endpoint.
// Web research: DuckDuckGo Instant Answer API + Google News RSS + Wikipedia.
// Language: auto-detect the user's language and answer in it (Urdu script,
// Roman Urdu, Pashto, English).

export const AI_DAILY_LIMIT = 50;

export type AiMode = "chat" | "image" | "research" | "deep";
export type AiLang = "ur" | "ur-roman" | "ps" | "en";

const PASHTO_LETTERS = /[ځڅډړږښګڼېۍ]/;
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;
const ROMAN_URDU_WORDS =
  /\b(hai|hain|kya|kyun|kaise|kaisa|mera|meri|mere|mujhe|tum|tumhara|aap|nahi|nahin|acha|achha|batao|batain|karo|karna|kia|ka|ki|ko|se|mein|main|aur|yeh|ye|woh|wo|kuch|kab|kahan|kaun|kaisa|theek|zaroor|shukriya|allah|hafiz|salam)\b/i;

/** Detect the language the user wrote in, so replies match it. */
export function detectChatLang(text: string): AiLang {
  const t = (text || "").trim();
  if (!t) return "en";
  if (ARABIC_SCRIPT.test(t)) {
    return PASHTO_LETTERS.test(t) ? "ps" : "ur";
  }
  if (ROMAN_URDU_WORDS.test(t)) return "ur-roman";
  return "en";
}

const LANG_NAMES: Record<AiLang, string> = {
  ur: "Urdu, written in Urdu script",
  "ur-roman": "Roman Urdu (Urdu written in Latin letters)",
  ps: "Pashto",
  en: "English",
};

export function systemPrompt(lang: AiLang, mode: AiMode): string {
  const base = [
    "You are Nizafa.ai, a helpful AI assistant made in Pakistan, for everyone — especially Pakistanis.",
    `Reply in the SAME language the user wrote in: ${LANG_NAMES[lang]}. Never switch languages unless the user switches first.`,
    "Be concise and helpful. Use short paragraphs and simple lists when they fit. If you do not know something, say so honestly instead of guessing.",
    "Never claim to be ChatGPT, Muse, or any other assistant. You are Nizafa.ai.",
  ];
  if (mode === "research" || mode === "deep") {
    base.push(
      "You were given fresh web results below. Ground your answer in them, mention the source names, and say clearly when the web had nothing useful."
    );
  }
  if (mode === "image") {
    base.push("The user wants a picture made. Describe the picture briefly in one line.");
  }
  return base.join("\n");
}

// ── Pollinations chat (OpenAI-compatible, streaming, no key) ───────────────

const POLLINATIONS_CHAT_URL = "https://text.pollinations.ai/openai";

export type ChatMsg = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export async function streamChatCompletion(
  messages: ChatMsg[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<Response> {
  const res = await fetch(POLLINATIONS_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages,
      stream: true,
      max_tokens: opts.maxTokens ?? 900,
      temperature: opts.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `AI service failed (${res.status}): ${detail.slice(0, 200)}`
    );
  }
  return res;
}

// ── Image making (Pollinations, free, no key) ──────────────────────────────

export function imageUrl(prompt: string, width = 1024, height = 1024): string {
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

// ── Image-generation intent (typed requests, no mode button needed) ────────
// "Draw a picture" lives in Plugins → Chat tools, but most people just type
// "make me a picture". When the message asks to CREATE an image (creation
// verb + image noun, Urdu/English/Roman Urdu) and no photo is attached,
// treat it as image mode.
const IMAGE_VERBS =
  /\b(make|draw|generate|create|design|paint|sketch|render|banao|bana|banado|banakar)\b|بناؤ|بنائیں|بنا دو|بنا کر|ڈیزائن/i;
const IMAGE_NOUNS =
  /\b(picture|image|photo|logo|poster|wallpaper|thumbnail|art|pic|tasveer|tasweer)\b|تصویر|لوگو|پوسٹر/i;

export function wantsImage(message: string): boolean {
  return IMAGE_VERBS.test(message) && IMAGE_NOUNS.test(message);
}

// ── Pollinations image generation, verified before replying ───────────────
// The free image API rate-limits (503 "Classic API is at its limit — retry
// after 10s"), so the server checks the picture actually loads (up to 2
// tries) instead of sending the user a broken image link.
export async function verifiedImageUrl(prompt: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const url = imageUrl(prompt);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.startsWith("image/")) return url;
    } catch {
      // fall through to retry
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 6000));
  }
  return null;
}

// ── Google Gemini (free API key) — the only vision model we have ──────────
// The free Pollinations text model cannot read images at all (400 "model
// does not support image input"). Gemini Flash reads photos; the key lives
// in GEMINI_API_KEY on Netlify. Verified 23 Nov 2026: gemini-2.5-flash is
// retired for new keys (404); gemini-3.8-flash 503s under high demand;
// gemini-3.5-flash works — so try it first, then the others. Returns null
// when the key is missing or every call fails, so the caller can answer
// honestly instead.
// NOTE: Gemini IMAGE generation is NOT free for this key — the image models
// return 429 "quota exceeded, limit: 0" on the free tier. Pictures stay on
// Pollinations (verifiedImageUrl); do not route image mode through Gemini.
const GEMINI_VISION_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
];

export async function describeImageWithGemini(
  imageDataUrl: string,
  question: string,
  lang: AiLang
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const [, mimeType, data] = m;
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data } },
          {
            text: `Look at this photo carefully and answer the user's question about it. Reply in the SAME language the user wrote in: ${LANG_NAMES[lang]}. Be specific about what is actually visible in the photo. If something is not clear in the photo, say so honestly instead of guessing.\n\nUser's question: ${question || "What is in this photo?"}`,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 900, temperature: 0.7 },
  });
  for (const model of GEMINI_VISION_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(45_000),
        }
      );
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      } | null;
      const text = json?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (text) return text;
    } catch {
      // try the next model
    }
  }
  return null;
}

// ── Live web research (all free, no key) ───────────────────────────────────

export type WebResult = { title: string; url: string; snippet: string };

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Nizafa.ai/1.0 (+https://nizafa.netlify.app)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function fetchText(url: string, timeoutMs = 6000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Nizafa.ai/1.0 (+https://nizafa.netlify.app)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return "";
  return res.text().catch(() => "");
}

export async function webSearch(query: string): Promise<WebResult[]> {
  const out: WebResult[] = [];
  const seen = new Set<string>();
  const push = (r: WebResult) => {
    if (!r.url || seen.has(r.url) || !r.title) return;
    seen.add(r.url);
    out.push(r);
  };

  // 1. DuckDuckGo Instant Answer (abstract + related topics).
  try {
    const ddg = (await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    )) as {
      Abstract?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    } | null;
    if (ddg?.Abstract) {
      push({
        title: ddg.AbstractSource || "DuckDuckGo",
        url: ddg.AbstractURL || "https://duckduckgo.com",
        snippet: ddg.Abstract.slice(0, 400),
      });
    }
    for (const t of ddg?.RelatedTopics ?? []) {
      if (t.Text && t.FirstURL) {
        push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text.slice(0, 300) });
      }
      if (out.length >= 6) break;
    }
  } catch {
    // fall through to the next source
  }

  // 2. Google News RSS (fresh headlines).
  try {
    const xml = await fetchText(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-PK&gl=PK&ceid=PK:en`
    );
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    for (const item of items.slice(0, 4)) {
      const title = stripTags(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
      const link = (item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const desc = stripTags(item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
      if (title && link && title !== "Google News") {
        push({ title, url: link, snippet: desc.slice(0, 300) });
      }
      if (out.length >= 6) break;
    }
  } catch {
    // fall through
  }

  // 3. Wikipedia search (factual background).
  try {
    const wiki = (await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3`
    )) as { query?: { search?: Array<{ title: string; snippet: string }> } } | null;
    for (const s of wiki?.query?.search ?? []) {
      push({
        title: `${s.title} — Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
        snippet: stripTags(s.snippet).slice(0, 300),
      });
      if (out.length >= 6) break;
    }
  } catch {
    // fall through
  }

  return out.slice(0, 6);
}

// ── Daily usage (free plan: 50 user messages/day, UTC day) ────────────────

export function startOfUtcDayIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

import type { SupabaseClient } from "@supabase/supabase-js";

/** Count today's user messages for one user. Fails open (0) on query error. */
export async function countTodayUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("chat_messages")
      .select("id, chat_conversations!inner(user_id)", { count: "exact", head: true })
      .eq("role", "user")
      .eq("chat_conversations.user_id", userId)
      .gte("created_at", startOfUtcDayIso());
    if (error) {
      console.error("ai usage count failed:", error);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.error("ai usage count threw:", e);
    return 0;
  }
}
