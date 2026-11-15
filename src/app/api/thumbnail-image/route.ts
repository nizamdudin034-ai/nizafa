import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// AI thumbnail image generation.
// If REPLICATE_API_TOKEN is set, Replicate is tried first; otherwise
// OPENAI_API_KEY is used. If neither is configured the route answers
// honestly with { status: "unavailable" } — it NEVER fakes an image.
// No key is ever sent to the browser or logged.

export const maxDuration = 120;

type SizeKey = "16:9" | "9:16" | "1:1";

const OPENAI_SIZE: Record<SizeKey, string> = {
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "1:1": "1024x1024",
};

async function generateWithReplicate(
  prompt: string,
  size: SizeKey
): Promise<{ imageUrl: string } | { error: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { error: "Replicate is not configured." };
  try {
    const create = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: { prompt, aspect_ratio: size, output_format: "png" },
        }),
      }
    );
    if (!create.ok) {
      return { error: `Replicate ${create.status}: ${(await create.text()).slice(0, 200)}` };
    }
    const prediction = (await create.json()) as {
      status?: string;
      output?: string | string[];
      urls?: { get?: string };
      error?: unknown;
    };
    let current = prediction;
    // Poll until the prediction finishes (max ~75s).
    for (let i = 0; i < 25 && current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled"; i++) {
      if (!current.urls?.get) break;
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(current.urls.get, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!poll.ok) break;
      current = (await poll.json()) as typeof current;
    }
    if (current.status !== "succeeded") {
      return { error: `Replicate prediction ended with status: ${current.status ?? "unknown"}.` };
    }
    const out = current.output;
    const url = Array.isArray(out) ? out[0] : out;
    if (!url) return { error: "Replicate returned no image." };
    return { imageUrl: url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Replicate request failed." };
  }
}

async function generateWithOpenAI(
  prompt: string,
  size: SizeKey
): Promise<{ imageUrl: string } | { error: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "OpenAI is not configured." };
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        size: OPENAI_SIZE[size],
        n: 1,
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      return { error: `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return { error: "OpenAI returned no image." };
    return { imageUrl: `data:image/png;base64,${b64}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "OpenAI request failed." };
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    size?: string;
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  const size: SizeKey =
    body.size === "9:16" || body.size === "1:1" ? body.size : "16:9";

  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!hasReplicate && !hasOpenAI) {
    return NextResponse.json({
      status: "unavailable",
      reason:
        "No image-generation key configured — use the canvas composer on the Thumbnail Studio page instead.",
    });
  }

  if (hasReplicate) {
    const result = await generateWithReplicate(prompt, size);
    if ("imageUrl" in result) {
      return NextResponse.json({ status: "ok", provider: "replicate", imageUrl: result.imageUrl });
    }
    // Replicate failed — fall back to OpenAI if available, else report it.
    if (!hasOpenAI) {
      return NextResponse.json({ status: "error", reason: result.error }, { status: 502 });
    }
  }
  const openAi = await generateWithOpenAI(prompt, size);
  if ("imageUrl" in openAi) {
    return NextResponse.json({ status: "ok", provider: "openai", imageUrl: openAi.imageUrl });
  }
  return NextResponse.json({ status: "error", reason: openAi.error }, { status: 502 });
}
