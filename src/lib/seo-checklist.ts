// SEO checklist + pack matching for the Optimize / Analysis pages.
// All scores are rule-based and computed from data the user can see:
// the video's live title/description/tags (YouTube API) or the saved
// SEO pack, plus the cached Google Trends snapshot. When a source is
// missing, the item is marked "no data" instead of a fake zero.

import {
  contentWords,
  scoreTag,
  type TagScore,
} from "./consistency";
import { scoreThumbnailConcept, type ThumbnailScore } from "./thumbnail";
import { topicKeywords, type SeoPack, type ThumbnailConcept } from "./generator";

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function fmtViews(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

/** YouTube thumbnail URL derived from the video ID (YouTube's own host). */
export function thumbUrl(videoId: string, quality: "mq" | "hq" = "mq"): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}default.jpg`;
}

/** "The AI King… | Nizam Afridi" → "The AI King…" (drops the channel suffix). */
export function stripChannelSuffix(title: string): string {
  return title.replace(/\s*\|\s*[^|]+$/, "").trim();
}

export function topicFromTitle(title: string): string {
  return stripChannelSuffix(title);
}

export type PackRow = {
  id: number;
  topic: string;
  payload_json: SeoPack;
};

/**
 * Best-matching saved pack for a video title: the pack whose topic
 * shares the most content words with the title. Needs at least 2 shared
 * words, otherwise the pack is about something else and must not be
 * used to score this video.
 */
export function matchPackToVideo(
  videoTitle: string,
  packs: PackRow[]
): PackRow | null {
  const titleWords = contentWords(stripChannelSuffix(videoTitle));
  if (titleWords.length === 0) return null;
  let best: PackRow | null = null;
  let bestShared = 0;
  for (const p of packs) {
    const topicWords = contentWords(p.topic);
    const shared = topicWords.filter((w) =>
      titleWords.some((t) => t === w || t.includes(w) || w.includes(t))
    ).length;
    if (shared > bestShared) {
      bestShared = shared;
      best = p;
    }
  }
  return bestShared >= 2 ? best : null;
}

// ── SEO checklist (the 5 "Actionable items" × 10) ───────────────────────

export type ChecklistItem = {
  key: string;
  label: string;
  /** null = no data to score this item (never a fake zero). */
  score: number | null;
  detail: string;
};

export type ChecklistResult = {
  items: ChecklistItem[];
  /** Sum of scored items. */
  total: number;
  /** 10 × number of scored items. */
  max: number;
};

function tagWords(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    for (const w of contentWords(t)) {
      if (!seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
  }
  return out;
}

function trendingHit(tag: string, trendingTitles: string[]): boolean {
  const lower = tag.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return trendingTitles.some((t) => {
    const tl = t.toLowerCase();
    return tl.includes(lower) || words.filter((w) => tl.includes(w)).length >= 2;
  });
}

export function scoreSeoChecklist(input: {
  title: string;
  description: string;
  tags: string[];
  topicKeywords: string[];
  trendingTitles: string[];
  trendingAvailable: boolean;
}): ChecklistResult {
  const { title, description, tags, trendingTitles } = input;
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const words = tagWords(tags);

  const items: ChecklistItem[] = [];

  // 1. Tag count — 10+ tags earns full marks.
  items.push({
    key: "tag-count",
    label: "Tag count",
    score: Math.min(10, tags.length),
    detail:
      tags.length === 0
        ? "No tags on this video — add 10–15 tags from the recommendations below."
        : `${tags.length} tag${tags.length === 1 ? "" : "s"} — aim for 10–15.`,
  });

  // 2. Tag volume — share of tags matching a live trending search.
  if (!input.trendingAvailable) {
    items.push({
      key: "tag-volume",
      label: "Tag volume",
      score: null,
      detail: "No trending snapshot saved yet — open Research once so Nizafa can compare your tags with live searches.",
    });
  } else {
    const hits = tags.filter((t) => trendingHit(t, trendingTitles)).length;
    items.push({
      key: "tag-volume",
      label: "Tag volume",
      score: tags.length === 0 ? 0 : Math.round((hits / tags.length) * 10),
      detail:
        tags.length === 0
          ? "No tags to compare with trending searches."
          : `${hits} of ${tags.length} tags match a trending search right now.`,
    });
  }

  // 3. Keywords in title — share of tag words appearing in the title.
  items.push({
    key: "keywords-title",
    label: "Keywords in title",
    score:
      words.length === 0
        ? 0
        : Math.round(
            (words.filter((w) => titleLower.includes(w)).length / words.length) * 10
          ),
    detail:
      words.length === 0
        ? "Add tags first — there are no tag keywords to check against the title."
        : `${words.filter((w) => titleLower.includes(w)).length} of ${words.length} tag keywords appear in the title.`,
  });

  // 4. Keywords in description — share of tag words in the description.
  items.push({
    key: "keywords-description",
    label: "Keywords in description",
    score:
      words.length === 0
        ? 0
        : description.trim().length === 0
          ? 0
          : Math.round(
              (words.filter((w) => descLower.includes(w)).length / words.length) * 10
            ),
    detail:
      words.length === 0
        ? "Add tags first — there are no tag keywords to check against the description."
        : description.trim().length === 0
          ? "No description saved — write one that repeats your main keywords in the first 2 lines."
          : `${words.filter((w) => descLower.includes(w)).length} of ${words.length} tag keywords appear in the description.`,
  });

  // 5. Same keyword in Title, Description & Tags.
  const shared = words.filter(
    (w) => titleLower.includes(w) && descLower.includes(w)
  );
  items.push({
    key: "same-keyword",
    label: "Same keyword used in Title, Description & Tags",
    score: Math.min(10, shared.length * 2),
    detail:
      shared.length === 0
        ? "No single keyword runs through title, description and tags — pick one main keyword and use it in all three."
        : `Running through all three: ${shared.slice(0, 5).join(", ")}${shared.length > 5 ? ` +${shared.length - 5} more` : ""}.`,
  });

  const scored = items.filter((i) => i.score !== null);
  return {
    items,
    total: scored.reduce((s, i) => s + (i.score ?? 0), 0),
    max: scored.length * 10,
  };
}

// ── Recommended tags ─────────────────────────────────────────────────────

export function recommendTags(input: {
  packTags: string[];
  currentTags: string[];
  title: string;
  description: string;
  topic: string;
  trendingTitles: string[];
  limit?: number;
}): TagScore[] {
  const current = new Set(input.currentTags.map((t) => t.toLowerCase()));
  const kws = topicKeywords(input.topic);
  return input.packTags
    .filter((t) => t && !current.has(t.toLowerCase()))
    .map((t) =>
      scoreTag(t, {
        title: input.title,
        description: input.description,
        topicKeywords: kws,
        trendingTitles: input.trendingTitles,
      })
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 6);
}

// ── Thumbnail concept scoring (from the saved pack) ──────────────────────
// The pack's own concept text is all we can score honestly: the concept
// layout says whether it has a face, a dark background and high contrast.
// The flags are derived from the concept's own words and the result is
// labelled "concept score" — it is not a pixel analysis of the live image.

export type VideoThumbnailScore = ThumbnailScore & { source: "pack" | "none" };

export function scoreVideoThumbnail(
  concept: ThumbnailConcept | null
): VideoThumbnailScore | null {
  if (!concept) return null;
  const text = `${concept.bigText} ${concept.layout} ${concept.imageIdea}`;
  const punch =
    concept.bigText
      .split(/\s+/)
      .filter((w) => /[A-Z]{2,}/.test(w) || /\$|\d/.test(w))
      .slice(0, 2)
      .join(" ") || undefined;
  return {
    ...scoreThumbnailConcept({
      bigText: concept.bigText,
      punchWord: punch,
      facePresent: /face/i.test(text),
      backgroundDark: /dark|navy|black/i.test(text),
      contrastHigh: /contrast|red banner|bold|high/i.test(text),
    }),
    source: "pack",
  };
}
