// Thumbnail tools: prompt builder, rule-based scorer, background presets.
// All scoring is labelled an editorial estimate — it is a checklist, not
// a prediction of clicks. Nothing here calls an image model; image
// generation (when a key is configured) lives in /api/thumbnail-image.
//
// STYLE — DECIDED 16 Nov 2026 from the user's 6 example thumbnails
// (THE SECRET OF TIME, MOTHER KILLED HER DAUGHTER?, THIS IS STRANGE!,
// ELON MUSK EXPOSED, THE 1947 FILES, UFO FILES EXPOSED): 1280×720,
// cinematic, dark moody background, strong red + blue rim lighting, high
// contrast. Big bold distressed white text across the TOP (usually 2
// lines); the punch word inside a solid RED box. Subject imagery fills
// the left/centre. FACE RULE: the ONLY face in the thumbnail is the
// person the video is about (supplied via the reference face upload) —
// NEVER the channel owner's / creator's face. Text is added afterwards
// in the editor with real fonts, never baked into generated art.

export type ThumbnailPromptInput = {
  topic: string;
  subject?: string;
  mood?: "dramatic" | "bold" | "curious" | "urgent" | "hopeful";
  punchWords?: string;
  /** Style notes from a reference thumbnail (style only, never its content). */
  styleNotes?: string;
};

export type BackgroundPreset = {
  name: string;
  from: string;
  to: string;
  accent: string;
};

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "Cinematic dark", from: "#0b0e14", to: "#1c2433", accent: "#d92d20" },
  { name: "Slate neutral", from: "#2b3440", to: "#12161c", accent: "#f5b301" },
  { name: "Warm grey", from: "#4a4440", to: "#1b1815", accent: "#f5b301" },
  { name: "Teal dark", from: "#07332f", to: "#041a17", accent: "#f5b301" },
  { name: "Charcoal", from: "#23272e", to: "#0c0e12", accent: "#d92d20" },
  { name: "Deep navy", from: "#0a1f3d", to: "#06101f", accent: "#d92d20" },
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
 * House-style thumbnail prompt (decided 16 Nov 2026 from the user's 6
 * example thumbnails): cinematic, dark and moody, red + blue rim light,
 * subject imagery left/centre, the subject's face on the right third,
 * and clear space at the TOP for text. Text is added afterwards in the
 * editor with real fonts — never baked into generated art. The punch
 * word goes in a solid red box at the top. When styleNotes are given
 * (from a reference thumbnail, style only), they are appended as guidance.
 */
export function buildThumbnailPrompt(input: ThumbnailPromptInput): string {
  const topic = input.topic.trim();
  const subject = (input.subject ?? "").trim();
  const mood = input.mood ?? "dramatic";
  const punch = (input.punchWords ?? "").trim();
  const styleNotes = (input.styleNotes ?? "").trim();
  const lines = [
    `YouTube thumbnail, 16:9, 1280x720, cinematic documentary style, for a video about: ${topic}.`,
    "Dark, moody background, almost black, with strong red rim light on one side and blue rim light on the other, high contrast, photorealistic, sharp focus.",
    subject
      ? `The person the video is about, on the right third of the frame: ${subject}, face clearly visible, looking at the camera, background removed, red and blue rim light on the face. This is the ONLY face in the thumbnail — no other person, no presenter, no creator face anywhere.`
      : "On the right third of the frame: the face of the person the video is about, clearly visible, looking at the camera, background removed, red and blue rim light. This is the ONLY face in the thumbnail — no other person, no presenter, no creator face anywhere.",
    "Left and centre: one strong cinematic image that proves the story — the key visual of the topic (a place, a document, an object, a moment), filling the frame, not a generic stock photo. No clutter, no extra faces.",
    `Mood: ${MOOD_LINES[mood]}.`,
    styleNotes ? `Style reference (layout, colours and feel only): ${styleNotes}` : "",
    "Layout: leave clear space across the TOP of the frame for text (two lines). NO text baked into the image — the text will be added afterwards in the editor with real fonts.",
    punch
      ? `The text added later reads: the main line in huge bold distressed white letters across the top, and the punch word "${punch}" in huge white letters inside a solid RED box.`
      : "The text added later will be short — a few huge bold distressed white words across the top, with one punch word in huge white letters inside a solid RED box.",
    "Style: cinematic, dramatic, high contrast, no watermark, no logo, no text in the image itself.",
  ];
  return lines.filter((l) => l.length > 0).join("\n");
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
    label: "Short text across the top (5 words or fewer)",
    pass: short,
    detail: words === 0 ? "No top text given." : `${words} word${words === 1 ? "" : "s"} — ${short ? "readable at a glance." : "too many words to read in a split second."}`,
  });
  if (short) score += 25;
  else if (words > 0) score += 8;
  if (!short && words > 0) fixes.push("Cut the top text to 5 words or fewer — viewers read a thumbnail in under a second.");

  const punch = (input.punchWord ?? "").trim();
  const punchOk = punch.length > 0 && punch.split(/\s+/).length <= 2;
  checks.push({
    label: "Punch word in a solid red box at the top",
    pass: punchOk,
    detail: punchOk ? `"${punch}" — short enough to be the biggest word, in white letters inside a solid red box.` : punch ? "Punch word should be 1–2 words." : "No punch word set — pick the single most striking word.",
  });
  if (punchOk) score += 20;
  if (!punchOk) fixes.push("Pick one punch word (1–2 words, e.g. “EXPOSED”, “1947”) and put it in a solid red box at the top, in huge white letters.");

  checks.push({
    label: "Subject's face only, on the right third",
    pass: input.facePresent,
    detail: input.facePresent ? "The face is the person the video is about — keep the background removed and the edge blended. Never add the channel owner's face." : "No face — the face of the person the video is about, on the right third, lifts clicks on documentary thumbnails.",
  });
  if (input.facePresent) score += 20;
  else fixes.push("Add the subject's face on the right third (background removed, red + blue rim light, blended edge) — the subject only, never the creator's face.");

  checks.push({
    label: "Dark, cinematic background (red + blue rim light)",
    pass: input.backgroundDark,
    detail: input.backgroundDark ? "Dark, moody background — the subject and the top text stand out." : "Busy or light background — the text and face may get lost.",
  });
  if (input.backgroundDark) score += 15;
  else fixes.push("Use a dark, cinematic background with red + blue rim light so the text and the face pop.");

  checks.push({
    label: "High contrast (face + text vs background)",
    pass: input.contrastHigh,
    detail: input.contrastHigh ? "High contrast — readable on a small phone screen." : "Low contrast — text may be unreadable at small sizes.",
  });
  if (input.contrastHigh) score += 20;
  else fixes.push("Raise the contrast: bright face, dark background, and bold distressed text — test it at phone size before publishing.");

  const label =
    score >= 85 ? "Strong concept" : score >= 65 ? "Good, needs a tweak" : score >= 40 ? "Weak — fix the basics" : "Needs a rethink";
  return { score, label, checks, fixes };
}
