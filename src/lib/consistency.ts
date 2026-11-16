// Consistency scoring — title vs description vs script vs thumbnail.
// 100% rule-based and transparent: the score is the share of the title's
// content words that also appear in each of the other three parts. Every
// point comes from text the user can see (their own SEO pack). Nothing
// here invents views, rankings, or performance predictions.

import { scoreTitle, titleCase, type SeoPack, type SeoTitle } from "./generator";

// ── Pack-level scoring (shared by /api/consistency and /optimize/[id]) ───

export type StoredPack = SeoPack & { chosenTitle?: string; chosenAt?: string };

export function packTexts(pack: StoredPack) {
  return {
    description: pack.descriptionStarter ?? "",
    scriptText: (pack.scriptOutline ?? [])
      .flatMap((s) => [s.section, ...s.points])
      .join(" "),
    thumbnailText: (pack.thumbnailConcepts ?? [])
      .map((c) => `${c.bigText} ${c.layout}`)
      .join(" "),
  };
}

export function currentPackTitle(pack: StoredPack): string {
  return pack.chosenTitle ?? pack.bestTitle;
}

export function consistencyForPack(pack: StoredPack): ConsistencyResult {
  return scoreConsistency({ title: currentPackTitle(pack), ...packTexts(pack) });
}

export function alternativesForPack(
  pack: StoredPack,
  currentTitle: string,
  variant: number
): Array<{ title: string; score: number; titleScore: number; why: string }> {
  const texts = packTexts(pack);
  const pool =
    variant === 1 || variant === 2
      ? buildAlternateTitles(pack.topic, pack.channelTitle ?? null, variant)
      : (pack.titles ?? []);
  return pool
    .filter((t) => t.title !== currentTitle)
    .map((t) => ({
      title: t.title,
      score: scoreConsistency({ title: t.title, ...texts }).score,
      titleScore: t.score,
      why: t.why,
    }))
    .sort((a, b) => b.score - a.score || b.titleScore - a.titleScore)
    .slice(0, 3);
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "it", "its", "this", "that", "by", "at",
  "from", "as", "be", "has", "have", "had", "will", "would", "can",
  "about", "into", "over", "after", "before", "between", "how", "why",
  "what", "when", "who", "which", "you", "your", "we", "our", "they",
  "their", "he", "she", "his", "her", "not", "no", "but", "if", "so",
]);

/** Content words of a text (length > 2, not stopwords), de-duplicated. */
export function contentWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !STOPWORDS.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

export type ConsistencyPart = {
  key: string;
  label: string;
  /** 0–100 for this part. */
  score: number;
  detail: string;
};

export type ConsistencyResult = {
  /** 0–100 weighted match across the four parts. */
  score: number;
  parts: ConsistencyPart[];
  notes: string[];
};

export function scoreConsistency(input: {
  title: string;
  description: string;
  scriptText: string;
  thumbnailText: string;
}): ConsistencyResult {
  const titleWords = contentWords(input.title);
  const notes: string[] = [];
  if (titleWords.length === 0) {
    return {
      score: 0,
      parts: [],
      notes: ["The title has no content words to match against — write a title that names the topic."],
    };
  }

  const coverage = (text: string): { matched: number; total: number } => {
    const lower = text.toLowerCase();
    const matched = titleWords.filter((w) => lower.includes(w)).length;
    return { matched, total: titleWords.length };
  };

  const desc = coverage(input.description);
  const script = coverage(input.scriptText);
  const thumb = coverage(input.thumbnailText);

  const descWords = contentWords(input.description);
  const scriptLower = input.scriptText.toLowerCase();
  const descScriptMatched = descWords.filter((w) => scriptLower.includes(w)).length;

  const part = (
    key: string,
    label: string,
    matched: number,
    total: number,
    emptyNote: string
  ): ConsistencyPart => {
    if (total === 0) return { key, label, score: 0, detail: emptyNote };
    return {
      key,
      label,
      score: Math.round((matched / total) * 100),
      detail: `${matched} of ${total} title word${total === 1 ? "" : "s"} appear${matched === 1 ? "s" : ""} here.`,
    };
  };

  const parts: ConsistencyPart[] = [
    part(
      "title-description",
      "Title ↔ Description",
      desc.matched,
      desc.total,
      "No description saved yet — generate a pack first."
    ),
    part(
      "title-script",
      "Title ↔ Script",
      script.matched,
      script.total,
      "No script outline saved yet — generate a pack first."
    ),
    part(
      "title-thumbnail",
      "Title ↔ Thumbnail",
      thumb.matched,
      thumb.total,
      "No thumbnail text saved yet — generate a pack first."
    ),
    {
      key: "description-script",
      label: "Description ↔ Script",
      score:
        descWords.length === 0
          ? 0
          : Math.round((descScriptMatched / descWords.length) * 100),
      detail:
        descWords.length === 0
          ? "No description saved yet."
          : `${descScriptMatched} of ${descWords.length} description words also appear in the script.`,
    },
  ];

  // Weights: title↔description 30, title↔script 30, title↔thumbnail 25,
  // description↔script 15.
  const score = Math.round(
    (parts[0].score * 30 + parts[1].score * 30 + parts[2].score * 25 + parts[3].score * 15) / 100
  );

  if (score >= 80) {
    notes.push("Title, description, script and thumbnail tell the same story.");
  } else if (score >= 60) {
    notes.push("Mostly matched — fix the weakest part below to lift the score.");
  } else {
    notes.push("Mismatch — the title promises something the description, script or thumbnail don't say. Pick a suggested title below, or rewrite the weakest part.");
  }
  const weakest = [...parts].sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < 100) {
    notes.push(`Weakest link: ${weakest.label} (${weakest.score}/100).`);
  }
  return { score, parts, notes };
}

// ── Tag scoring ──────────────────────────────────────────────────────────
// Deterministic, explainable: a tag scores for matching the topic, the
// title, the description, a live trending keyword, and good length.
// No invented search volume — the "trending" points come from the real
// cached Google Trends snapshot passed in by the caller.

export type TagScore = { tag: string; score: number; signals: string[] };

export function scoreTag(
  tag: string,
  ctx: {
    title: string;
    description: string;
    topicKeywords: string[];
    trendingTitles: string[];
  }
): TagScore {
  const signals: string[] = [];
  let score = 0;
  const lower = tag.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);

  const topicHit = ctx.topicKeywords.filter((k) => lower.includes(k));
  if (topicHit.length > 0) {
    score += 40;
    signals.push(`Matches topic keyword${topicHit.length > 1 ? "s" : ""}: ${topicHit.join(", ")}`);
  }
  const titleLower = ctx.title.toLowerCase();
  if (titleLower.includes(lower) || words.some((w) => titleLower.includes(w))) {
    score += 20;
    signals.push("Appears in the video title");
  }
  const descLower = ctx.description.toLowerCase();
  if (descLower.includes(lower) || words.some((w) => descLower.includes(w))) {
    score += 15;
    signals.push("Appears in the description");
  }
  const trendHit = ctx.trendingTitles.some((t) => {
    const tl = t.toLowerCase();
    return tl.includes(lower) || words.filter((w) => tl.includes(w)).length >= 2;
  });
  if (trendHit) {
    score += 15;
    signals.push("Matches a trending search right now");
  }
  if (words.length >= 2 && words.length <= 4 && tag.length <= 40) {
    score += 10;
    signals.push("Good length (2–4 words)");
  } else if (words.length === 1) {
    signals.push("Single word — broad; pair it with a topic phrase for better targeting");
  } else {
    signals.push("Long tag — shorter tags are easier to match in search");
  }
  return { tag, score: Math.min(100, score), signals };
}

// ── Alternate title variants (for "Regenerate") ──────────────────────────
// Fixed template sets, scored with the same transparent title scorer as
// the main generator. Regenerate cycles variant 0 (the pack's own titles)
// → 1 → 2 → 0, so suggestions change without inventing anything.

function buildVariant(
  topic: string,
  channelTitle: string | null,
  drafts: string[]
): SeoTitle[] {
  return drafts
    .map((title) => {
      const { score, signals } = scoreTitle(title, topic);
      return { title, score, style: "Alternate", why: signals.join(" · ") };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildAlternateTitles(
  topic: string,
  channelTitle: string | null,
  variant: 1 | 2
): SeoTitle[] {
  const t = titleCase(topic);
  const suf = channelTitle ? ` | ${channelTitle}` : "";
  if (variant === 1) {
    return buildVariant(topic, channelTitle, [
      `${t}: The Untold Story${suf}`,
      `${t} — What Everyone Gets Wrong${suf}`,
      `What ${t} Means for You in 2026${suf}`,
      `The Real Story of ${t} — No Hype${suf}`,
      `I Looked Into ${t} — Here's What I Found${suf}`,
    ]);
  }
  return buildVariant(topic, channelTitle, [
    `${t}: Everything You Need to Know${suf}`,
    `Why ${t} Will Change How You Think${suf}`,
    `${t} in 8 Minutes: The Full Picture${suf}`,
    `Stop Believing These Myths About ${t}${suf}`,
    `${t} — The Evidence, Explained${suf}`,
  ]);
}
