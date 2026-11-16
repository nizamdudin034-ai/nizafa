// Thumbnail text — the ONE shared helper for putting text on thumbnails.
//
// WORKFLOW (user-confirmed 16 Nov 2026): the user takes Nizafa's thumbnail
// prompt and generates the image himself in FLUX. FLUX renders text well,
// so the prompt MUST carry the exact on-image text (see
// `textSpecToPromptLines` and `buildThumbnailPrompt` in lib/thumbnail.ts):
// the exact words, their placement (across the TOP, max 2 lines) and their
// style (big bold distressed white, punch word in a solid RED box). The
// old "never bake text into generated art" rule was for other models and
// does NOT apply to this FLUX workflow.
//
// The canvas editor in Thumbnail Studio stays as the fallback: the text is
// drawn there with real fonts and stays editable (move/change/hide), and
// Download PNG always exports the composed canvas — text included.
//
// API (kept small on purpose — the Analysis Thumbnail tab will use this
// too, so do not grow it without a reason):
//   ThumbnailTextSpec        — the text on one thumbnail (top text + punch)
//   splitTopText(text)       — split the top text into at most 2 lines
//   defaultTextSpec(topic, punchWords?) — a starting spec from a topic
//   textSpecToPromptLines(spec) — the exact FLUX prompt lines for the text
//   fitFont(ctx, …)          — shrink a font until the text fits a width
//   drawThumbnailText(ctx, spec, w, h) — draw the text on a sized canvas
//   renderCompositedThumbnail(base, spec, w, h, preset?) — full preview
//     canvas: base image (cover) or a dark gradient when base is null,
//     then the text on top. Returns the canvas (never a bare image).
//
// Colours/fonts are the house style (decided 16 Nov 2026 from the user's
// 6 Imtinan-style examples): distressed white top text, punch word in a
// solid red box, Arial Black default.

export type ThumbnailTextSpec = {
  /** Main line across the top (usually 2 lines, 5 words or fewer). */
  topText: string;
  /** Punch word, drawn in huge white letters inside a solid red box. */
  punchWord: string;
  /** Punch-box colour — solid red is the house default. */
  boxColor?: string;
  /** Main top-text colour — distressed white is the house default. */
  textColor?: string;
  /** Real font family — Arial Black default (closest to distressed). */
  fontFamily?: string;
  /** Text on by default; false hides the text layer entirely. */
  showText?: boolean;
};

export const THUMBNAIL_TEXT_DEFAULTS = {
  boxColor: "#d92d20",
  textColor: "#ffffff",
  fontFamily: "'Arial Black', Arial, sans-serif",
} as const;

/** Words that carry no meaning on a thumbnail — dropped when a top text
 *  is derived from a topic. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "why", "how", "what", "is", "are", "was", "were", "be", "by", "at",
  "from", "into", "about", "over", "after", "before", "this", "that",
  "it", "its", "as", "so", "do", "does", "did", "will", "would", "can",
  "could", "should", "than", "then", "when", "while", "who", "whom",
]);

/**
 * Split the top text into at most 2 lines, balanced by word count.
 * House rule: 5 words or fewer across the top, so a thumbnail reads in
 * under a second. Longer input is kept to its first 5 meaningful words —
 * the caller should show the full text in the editor, not silently cut
 * a word the user typed. (This function only splits; it never truncates
 * a user-typed string — truncation happens in defaultTextSpec only.)
 */
export function splitTopText(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];
  // Balance: first line gets ceil(n/2) words, second line the rest.
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/**
 * A starting text spec from a video topic: the top text is the topic's
 * most meaningful words (up to 5, stopwords dropped, original order kept)
 * and the punch word comes from the form's punch-words field. Used when a
 * base image is generated or uploaded and no text has been typed yet —
 * the user can edit both afterwards.
 */
export function defaultTextSpec(topic: string, punchWords = ""): ThumbnailTextSpec {
  const words = topic
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
  const top = words.slice(0, 5).join(" ");
  return {
    topText: top || topic.trim(),
    punchWord: punchWords.trim(),
    boxColor: THUMBNAIL_TEXT_DEFAULTS.boxColor,
    textColor: THUMBNAIL_TEXT_DEFAULTS.textColor,
    fontFamily: THUMBNAIL_TEXT_DEFAULTS.fontFamily,
    showText: true,
  };
}

/**
 * The exact FLUX prompt lines for the on-image text. The words are quoted
 * verbatim so FLUX spells them exactly — no extra words, no other text.
 * The main line is split into its (at most 2) lines, exactly as it will
 * appear across the top of the image.
 */
export function textSpecToPromptLines(spec: ThumbnailTextSpec): string[] {
  const lines: string[] = [];
  const main = spec.topText.trim();
  const punch = spec.punchWord.trim();
  if (!main && !punch) {
    return [
      "Text in the image: none — the image is a clean cinematic frame with clear space across the top for text to be added later.",
    ];
  }
  if (main) {
    // Quoted in capitals, exactly as the words will appear on the image.
    const parts = splitTopText(main).map((p) => p.toUpperCase());
    const quoted =
      parts.length === 2 ? `line 1 "${parts[0]}" and line 2 "${parts[1]}"` : `"${parts[0]}"`;
    lines.push(
      `Text rendered IN the image, across the TOP, in huge bold distressed white capital letters, easy to read at a glance: ${quoted}.`
    );
  }
  if (punch) {
    lines.push(
      `Below the main text, the punch word "${punch.toUpperCase()}" in huge bold white capital letters inside a solid RED rectangular box.`
    );
  }
  lines.push(
    "Spell every word exactly as written above — no extra words, no misspellings, no other text anywhere in the image."
  );
  return lines;
}

/** Shrink a font until the text fits maxWidth (never below 18px). */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  family: string,
  weight = 800
): number {
  let px = startPx;
  while (px > 18) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 4;
  }
  return px;
}

export type DrawnThumbnailText = {
  /** True when any text (main line or punch) was drawn. */
  drawn: boolean;
  /** The top-text lines actually drawn (0–2). */
  lines: string[];
  /** True when the punch word + red box were drawn. */
  punchDrawn: boolean;
};

/**
 * Draw the text layer on a canvas of width w and height h, house style:
 * main line(s) in huge bold distressed white across the top, punch word
 * in a solid red box underneath. Returns what was drawn, so callers (and
 * tests) can confirm the text is really on the image. Draws a faint
 * "YOUR TEXT HERE" placeholder only when showText is on and both fields
 * are empty — never a bare image without any indication text belongs here.
 */
export function drawThumbnailText(
  ctx: CanvasRenderingContext2D,
  spec: ThumbnailTextSpec,
  w: number,
  h: number
): DrawnThumbnailText {
  if (spec.showText === false) return { drawn: false, lines: [], punchDrawn: false };
  const main = spec.topText.trim();
  const punch = spec.punchWord.trim();
  const textColor = spec.textColor ?? THUMBNAIL_TEXT_DEFAULTS.textColor;
  const boxColor = spec.boxColor ?? THUMBNAIL_TEXT_DEFAULTS.boxColor;
  const fontFamily = spec.fontFamily ?? THUMBNAIL_TEXT_DEFAULTS.fontFamily;
  const ctxLS = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  ctxLS.letterSpacing = "2px";
  let y = Math.round(h * 0.045);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  const lines = main ? splitTopText(main) : [];
  let drawn = false;
  for (const line of lines) {
    const upper = line.toUpperCase();
    const px = fitFont(ctx, upper, w * 0.92, Math.round(h * 0.11), fontFamily, 900);
    ctx.fillStyle = textColor;
    ctx.font = `900 ${px}px ${fontFamily}`;
    ctx.fillText(upper, w / 2, y);
    y += Math.round(px * 1.18);
    drawn = true;
  }

  let punchDrawn = false;
  if (punch) {
    const upper = punch.toUpperCase();
    const punchPx = fitFont(ctx, upper, w * 0.86, Math.round(h * 0.13), fontFamily, 900);
    ctx.font = `900 ${punchPx}px ${fontFamily}`;
    const tw = ctx.measureText(upper).width;
    const boxPadX = Math.round(punchPx * 0.45);
    const boxW = tw + boxPadX * 2;
    const boxH = Math.round(punchPx * 1.45);
    const boxX = (w - boxW) / 2;
    ctx.fillStyle = boxColor;
    ctx.fillRect(boxX, y, boxW, boxH);
    const lightBox = boxColor.toLowerCase() === "#f5f5f0" || boxColor.toLowerCase() === "#ffffff";
    ctx.fillStyle = lightBox ? "#d92d20" : "#ffffff";
    ctx.fillText(upper, w / 2, y + Math.round((boxH - punchPx) / 2));
    punchDrawn = true;
    drawn = true;
  }

  if (!drawn) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const px = Math.round(h * 0.045);
    ctx.font = `700 ${px}px ${fontFamily}`;
    ctx.fillText("YOUR TEXT HERE", w / 2, y);
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctxLS.letterSpacing = "0px";
  return { drawn, lines, punchDrawn };
}

export type ThumbnailPreset = { from: string; to: string; accent: string };

/**
 * Compose a full thumbnail preview canvas: base image drawn cover (or a
 * dark cinematic gradient when base is null), then the text layer on top
 * via drawThumbnailText. The result ALWAYS carries the text — never a
 * bare image. Runs in the browser only (needs document/canvas).
 */
export function renderCompositedThumbnail(
  base: HTMLImageElement | null,
  spec: ThumbnailTextSpec,
  w: number,
  h: number,
  preset: ThumbnailPreset = { from: "#0b0e14", to: "#1c2433", accent: "#d92d20" }
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  if (base) {
    const scale = Math.max(w / base.width, h / base.height);
    const dw = base.width * scale;
    const dh = base.height * scale;
    ctx.drawImage(base, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, preset.from);
    grad.addColorStop(1, preset.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  drawThumbnailText(ctx, spec, w, h);
  return canvas;
}
