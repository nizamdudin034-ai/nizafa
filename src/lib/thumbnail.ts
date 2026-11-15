// Thumbnail tools: prompt builder, rule-based scorer, background presets.
// All scoring is labelled an editorial estimate — it is a checklist, not
// a prediction of clicks. Nothing here calls an image model; image
// generation (when a key is configured) lives in /api/thumbnail-image.

export type ThumbnailPromptInput = {
  topic: string;
  subject?: string;
  mood?: "dramatic" | "bold" | "curious" | "urgent" | "hopeful";
  punchWords?: string;
};

export type BackgroundPreset = {
  name: string;
  from: string;
  to: string;
  accent: string;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "Deep navy", from: "#0a1f3d", to: "#06101f", accent: "#d92d20" },
  { name: "Teal dark", from: "#07332f", to: "#041a17", accent: "#f5b301" },
  { name: "Charcoal", from: "#23272e", to: "#0c0e12", accent: "#d92d20" },
  { name: "Midnight blue", from: "#1b2a6b", to: "#0a1030", accent: "#f5b301" },
  { name: "Burgundy", from: "#4a1020", to: "#1c050c", accent: "#f5b301" },
  { name: "Forest", from: "#123524", to: "#071710", accent: "#d92d20" },
];

const MOOD_LINES: Record<NonNullable<ThumbnailPromptInput["mood"]>, string> = {
  dramatic: "dramatic, high-contrast lighting, serious and cinematic",
  bold: "bold, punchy, high-energy, confident",
  curious: "mysterious and curious, a question hanging in the air",
  urgent: "urgent, breaking-news energy, high tension",
  hopeful: "hopeful and uplifting, warm light breaking through the dark",
};

/**
 * Nizafa-style thumbnail prompt: dark navy background, the face on the
 * right third, a shock/evidence image on the left, a solid red banner
 * across the bottom with huge clean text and the punch word in yellow.
 * Text is added afterwards in the editor with real fonts — never baked
 * into generated art.
 */
export function buildThumbnailPrompt(input: ThumbnailPromptInput): string {
  const topic = input.topic.trim();
  const subject = (input.subject ?? "").trim();
  const mood = input.mood ?? "dramatic";
  const punch = (input.punchWords ?? "").trim();
  const lines = [
    `YouTube thumbnail, 16:9, for a documentary video about: ${topic}.`,
    subject
      ? `Main subject on the right third of the frame: ${subject}, face clearly visible, looking at the camera, background removed, subtle blue rim light.`
      : "Main subject on the right third of the frame: a clear, expressive face, looking at the camera, background removed, subtle blue rim light.",
    "Left and centre: one strong shock or evidence image that proves the story — no clutter, no extra faces.",
    "Background: dark navy, almost black, with a soft vignette so the subject stands out.",
    `Mood: ${MOOD_LINES[mood]}.`,
    "Layout: solid red banner across the bottom third for text. NO text baked into the image — the text will be added afterwards in the editor with real fonts.",
    punch
      ? `The banner text will read the punch words: "${punch}" — the punch word in huge yellow letters on the red banner, the rest in huge clean white letters.`
      : "The banner will carry huge clean white text with one punch word in yellow.",
    "Style: photorealistic, sharp focus, high contrast, no watermark, no logo, no text in the image itself.",
  ];
  return lines.join("\n");
}

// ── Rule-based thumbnail scorer (editorial estimate) ─────────────────────

export type ThumbnailScoreInput = {
  bigText: string;
  punchWord?: string;
  facePresent: boolean;
  backgroundDark: boolean;
  contrastHigh: boolean;
  textWords?: number; // derived from bigText when omitted
};

export type ThumbnailScore = {
  score: number;
  label: string;
  checks: Array<{ label: string; pass: boolean; detail: string }>;
  fixes: string[];
};

export function scoreThumbnailConcept(input: ThumbnailScoreInput): ThumbnailScore {
  const checks: ThumbnailScore["checks"] = [];
  const fixes: string[] = [];
  let score = 0;

  const text = input.bigText.trim();
  const words = input.textWords ?? (text ? text.split(/\s+/).length : 0);

  const short = words > 0 && words <= 5;
  checks.push({
    label: "Short text (5 words or fewer)",
    pass: short,
    detail: words === 0 ? "No banner text given." : `${words} word${words === 1 ? "" : "s"} — ${short ? "readable at a glance." : "too many words to read in a split second."}`,
  });
  if (short) score += 25;
  else if (words > 0) score += 8;
  if (!short && words > 0) fixes.push("Cut the banner text to 5 words or fewer — viewers read a thumbnail in under a second.");

  const punch = (input.punchWord ?? "").trim();
  const punchOk = punch.length > 0 && punch.split(/\s+/).length <= 2;
  checks.push({
    label: "One punch word, highlighted in yellow",
    pass: punchOk,
    detail: punchOk ? `"${punch}" — short enough to make the biggest word on the banner.` : punch ? "Punch word should be 1–2 words." : "No punch word set — pick the single most shocking word.",
  });
  if (punchOk) score += 20;
  if (!punchOk) fixes.push("Pick one punch word (1–2 words, e.g. “EXPOSED”, “$480BN”) and make it the biggest word on the banner, in yellow on red.");

  checks.push({
    label: "Face on the right third",
    pass: input.facePresent,
    detail: input.facePresent ? "Face present — keep the background removed and add a blue rim light." : "No face — a clear face on the right third lifts clicks on documentary thumbnails.",
  });
  if (input.facePresent) score += 20;
  else fixes.push("Add a cutout face on the right third (background removed, blue rim light) — no pasted rectangle edge.");

  checks.push({
    label: "Dark background",
    pass: input.backgroundDark,
    detail: input.backgroundDark ? "Dark navy background — the subject and red banner will stand out." : "Light or busy background — the banner and face will get lost.",
  });
  if (input.backgroundDark) score += 15;
  else fixes.push("Use a dark navy background so the red banner and the face pop.");

  checks.push({
    label: "High contrast (face + banner vs background)",
    pass: input.contrastHigh,
    detail: input.contrastHigh ? "High contrast — readable on a small phone screen." : "Low contrast — text may be unreadable at small sizes.",
  });
  if (input.contrastHigh) score += 20;
  else fixes.push("Raise the contrast: bright face, dark background, and a solid red banner — test it at phone size before publishing.");

  const label =
    score >= 85 ? "Strong concept" : score >= 65 ? "Good, needs a tweak" : score >= 40 ? "Weak — fix the basics" : "Needs a rethink";
  return { score, label, checks, fixes };
}
