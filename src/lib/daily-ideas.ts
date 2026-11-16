// Daily video ideas — built from the channel's OWN data + trending topics.
// ZERO search.list calls: niche comes from the channel's own video titles,
// patterns come from its best-performing videos (views per hour), and
// trends come from the cached Google Trends snapshot. No numbers are
// invented: every view count quoted in a `whyFits` comes from the DB.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrendItem } from "./trends";

export type ViewPrediction = "Very high" | "High" | "Medium";

/** Nizafa gives 4 fresh ideas per day per connected channel. */
export const DAILY_IDEAS_PER_DAY = 4;

export type DailyIdea = {
  title: string;
  hook: string;
  whyFits: string;
  /** View prediction, computed from real channel + trend data (never random). */
  prediction: ViewPrediction;
  /** One short, factual reason for the prediction (real numbers only). */
  predictionWhy: string;
};

export type ChannelForIdeas = {
  id: number;
  title: string;
  description?: string | null;
};

export type VideoForIdeas = {
  title: string;
  viewCount: number;
  likeCount?: number | null;
  publishedAt?: string | null;
};

const IDEA_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "it", "its", "this", "that", "by", "at",
  "from", "as", "be", "has", "have", "had", "will", "would", "can",
  "about", "into", "over", "after", "before", "between", "how", "why",
  "what", "when", "who", "which", "you", "your", "we", "our", "they",
  "their", "he", "she", "his", "her", "not", "no", "but", "if", "so",
  "video", "part", "episode", "new", "full", "watch", "please", "like",
  "subscribe", "official", "trailer", "shorts", "short", "live", "2024",
  "2025", "2026",
]);

/** UTC date string (YYYY-MM-DD) used as the daily-idea run key. */
export function todayDateString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function wordsOf(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !IDEA_STOPWORDS.has(w));
}

/**
 * Niche themes from the channel's own video titles: the most frequent
 * content words and two-word phrases, most frequent first.
 */
export function nicheThemes(videos: VideoForIdeas[], max = 6): string[] {
  const single = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const v of videos) {
    const words = wordsOf(v.title);
    for (const w of words) single.set(w, (single.get(w) ?? 0) + 1);
    for (let i = 0; i + 1 < words.length; i++) {
      const p = `${words[i]} ${words[i + 1]}`;
      pairs.set(p, (pairs.get(p) ?? 0) + 1);
    }
  }
  const ranked = [...pairs.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
  for (const [w] of [...single.entries()].sort((a, b) => b[1] - a[1])) {
    if (ranked.length >= max) break;
    if (!ranked.some((r) => r.includes(w))) ranked.push(w);
  }
  return ranked.slice(0, max);
}

/** Views per hour since publish — the fair way to compare old vs new videos. */
export function viewsPerHour(v: VideoForIdeas, now = Date.now()): number {
  if (!v.publishedAt) return v.viewCount;
  const hours = Math.max(1, (now - new Date(v.publishedAt).getTime()) / 3_600_000);
  return v.viewCount / hours;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function titleCaseTheme(theme: string): string {
  return theme
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "100,000+" → 100000; "1.5M+" → 1500000; "" → null. */
function trendVolume(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().replace(/,/g, "").replace(/\+$/, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult =
    m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return Math.round(n * mult);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * View prediction from real data — never random:
 * - follow-up ideas: the source video's views-per-hour vs the channel median.
 * - trend ideas: the trend's search volume + whether it matches the niche.
 * - list ideas: the source video's views vs the channel average.
 * - niche ideas: how often the theme already appears in the channel's titles.
 */
function predictFollowUp(
  best: VideoForIdeas | null
): { prediction: ViewPrediction; predictionWhy: string } {
  if (!best) {
    return {
      prediction: "Medium",
      predictionWhy: "No video history yet — this starts from your channel name and niche.",
    };
  }
  return {
    prediction: "High",
    predictionWhy: `Follow-up to your best video by views per hour, “${best.title}” (${fmt(best.viewCount)} views).`,
  };
}

/**
 * Build 4 ideas for a channel. Each `whyFits` cites real data: the
 * channel's own best video (title + real view count) or a real trending
 * topic from the snapshot. Falls back to generic-but-honest angles when
 * the channel has no videos yet. Every idea carries a `prediction`
 * computed from the same real data (see predictFollowUp and the inline
 * rules below) — never random, never invented.
 */
export function buildDailyIdeas(
  channel: ChannelForIdeas,
  videos: VideoForIdeas[],
  trends: TrendItem[]
): DailyIdea[] {
  const themes = nicheThemes(videos);
  const theme = themes[0] ?? null;
  const themeTitle = theme ? titleCaseTheme(theme) : channel.title;
  const sorted = [...videos].sort((a, b) => viewsPerHour(b) - viewsPerHour(a));
  const best = sorted[0] ?? null;
  const bestByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount)[0] ?? null;
  const vphs = videos.map((v) => viewsPerHour(v));
  const medianVph = median(vphs);
  const avgViews =
    videos.length > 0
      ? videos.reduce((s, v) => s + v.viewCount, 0) / videos.length
      : 0;

  const nicheWords = new Set(themes.flatMap((t) => t.split(" ")));
  const matchingTrends = trends.filter((tr) =>
    tr.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((w) => nicheWords.has(w))
  );
  const trend = matchingTrends[0] ?? trends[0] ?? null;
  const trendIsNicheMatch = trend != null && matchingTrends.length > 0;
  const trendVol = trend ? trendVolume(trend.traffic) : null;

  const ideas: DailyIdea[] = [];

  // 1 — Follow-up to the best-performing video (by views per hour).
  const bestVph = best ? viewsPerHour(best) : 0;
  const followUp = predictFollowUp(best);
  const followUpPrediction: ViewPrediction =
    best && medianVph > 0 && bestVph >= 2 * medianVph
      ? "Very high"
      : best
        ? followUp.prediction
        : "Medium";
  if (best && theme) {
    ideas.push({
      title: `The Untold Part of ${themeTitle} — What ${best.title.replace(/\s*[|–-].*$/, "").trim()} Left Out`,
      hook: `Your viewers already watched the first half of this story — now show them the part nobody covered.`,
      whyFits: `Follow-up to your best-performing video by views per hour, “${best.title}” (${fmt(best.viewCount)} views). Same niche (${theme}), new angle.`,
      prediction: followUpPrediction,
      predictionWhy:
        bestVph >= 2 * medianVph && medianVph > 0
          ? `Your best video by views per hour, “${best.title}”, is running at ${Math.round(bestVph / medianVph)}× your channel median.`
          : followUp.predictionWhy,
    });
  } else if (best) {
    ideas.push({
      title: `What ${best.title.replace(/\s*[|–-].*$/, "").trim()} Didn't Tell You`,
      hook: `The follow-up your audience is already asking for, in the comments of your biggest video.`,
      whyFits: `Follow-up to your best-performing video by views per hour, “${best.title}” (${fmt(best.viewCount)} views).`,
      prediction: followUpPrediction,
      predictionWhy: followUp.predictionWhy,
    });
  } else {
    ideas.push({
      title: `${themeTitle}: The Full Story, Explained Simply`,
      hook: `One clear explainer that turns a confusing topic into a story anyone can follow.`,
      whyFits: `Your channel has no videos saved yet, so this starts from your channel name and niche — connect the channel to get ideas from your real performance.`,
      prediction: "Medium",
      predictionWhy: "No video history yet — this starts from your channel name and niche.",
    });
  }

  // 2 — Today's trending topic, angled for this channel's niche.
  if (trend && theme && trendIsNicheMatch) {
    ideas.push({
      title: `${trend.title} — What It Means for ${themeTitle}`,
      hook: `Everyone is searching for this today. Here's the angle only your channel can give.`,
      whyFits: `Trending now (“${trend.title}”${trend.geo ? `, ${trend.geo}` : ""}) and it matches your niche (${theme}) from your own video titles.`,
      prediction: trendVol != null && trendVol >= 500_000 ? "Very high" : "High",
      predictionWhy:
        trendVol != null
          ? `Trending now with about ${fmt(trendVol)} searches, and it matches your niche (${theme}).`
          : `Trending now and it matches your niche (${theme}) from your own video titles.`,
    });
  } else if (trend) {
    ideas.push({
      title: `${trend.title}: The Full Story`,
      hook: `The trending topic of the day, explained the way your audience expects from you.`,
      whyFits: `Trending now (“${trend.title}”${trend.geo ? `, ${trend.geo}` : ""}). No strong niche match in your saved videos yet.`,
      prediction: "Medium",
      predictionWhy: "Trending now, but no strong niche match in your saved videos yet.",
    });
  } else if (bestByViews) {
    // No trend in the snapshot: a sequel to the most-viewed video instead.
    const ratio = avgViews > 0 ? bestByViews.viewCount / avgViews : 0;
    ideas.push({
      title: `The Sequel Your Audience Is Waiting For — ${bestByViews.title.replace(/\s*[|–-].*$/, "").trim()}`,
      hook: `Your biggest video left questions unanswered — answer them.`,
      whyFits: `Sequel to your most-viewed video overall, “${bestByViews.title}” (${fmt(bestByViews.viewCount)} views).`,
      prediction: ratio >= 2 ? "Very high" : ratio >= 1.2 ? "High" : "Medium",
      predictionWhy: `Your most-viewed video, “${bestByViews.title}” (${fmt(bestByViews.viewCount)} views), is ${ratio >= 1 ? `${Math.round(ratio * 10) / 10}×` : "below"} your channel average.`,
    });
  } else {
    ideas.push({
      title: `${themeTitle}: What Beginners Get Wrong`,
      hook: `Start with the one thing everyone gets wrong — then prove it, step by step.`,
      whyFits: `Myth-busting angle on your channel's niche (${themeTitle}). Add your videos to sharpen this with real performance data.`,
      prediction: "Medium",
      predictionWhy: "No video history and no trend in today's snapshot — a niche explainer is the safe start.",
    });
  }

  // 3 — List format, anchored on the most-viewed video.
  if (bestByViews && theme) {
    const ratio = avgViews > 0 ? bestByViews.viewCount / avgViews : 0;
    ideas.push({
      title: `5 ${themeTitle} Facts That Change Everything`,
      hook: `Five facts, five minutes — the list format your audience already proved it watches.`,
      whyFits: `List format in your niche (${theme}); your most-viewed video overall is “${bestByViews.title}” (${fmt(bestByViews.viewCount)} views).`,
      prediction: ratio >= 2 ? "Very high" : ratio >= 1.2 ? "High" : "Medium",
      predictionWhy: `Your most-viewed video, “${bestByViews.title}” (${fmt(bestByViews.viewCount)} views), is ${ratio >= 1 ? `${Math.round(ratio * 10) / 10}×` : "below"} your channel average.`,
    });
  } else {
    ideas.push({
      title: `5 ${themeTitle} Facts That Change Everything`,
      hook: `Five facts, five minutes — a fast list video your audience can finish in one sitting.`,
      whyFits: `List format in your channel's niche (${themeTitle}). Add your videos to sharpen this with real performance data.`,
      prediction: "Medium",
      predictionWhy: "No video history yet — the list format is proven in your niche, not yet on your channel.",
    });
  }

  // 4 — "Why it matters" on the strongest niche theme (or channel intro).
  if (theme) {
    const themeWords = theme.split(" ");
    const themeCount = videos.filter((v) =>
      themeWords.every((w) => v.title.toLowerCase().includes(w))
    ).length;
    ideas.push({
      title: `Why ${themeTitle} Deserves a Second Look`,
      hook: `Start with the one thing everyone gets wrong — then prove it, step by step.`,
      whyFits: `“Why it matters” angle on your strongest niche theme (${theme}) from your own video titles.`,
      prediction: themeCount >= 3 ? "High" : "Medium",
      predictionWhy:
        themeCount > 0
          ? `Your niche theme “${theme}” appears in ${themeCount} of your saved video titles.`
          : `Your strongest niche theme from your own video titles is “${theme}”.`,
    });
  } else {
    ideas.push({
      title: `Why ${channel.title} Exists — And What Comes Next`,
      hook: `Tell the story of the channel itself: what you cover, and why it matters.`,
      whyFits: `Channel-intro angle — useful while your video history is still building up.`,
      prediction: "Medium",
      predictionWhy: "No niche theme in your saved videos yet — the channel intro builds the base.",
    });
  }

  return ideas.slice(0, DAILY_IDEAS_PER_DAY);
}

export type DailyIdeasResult = {
  date: string;
  channelId: number;
  channelTitle: string;
  ideas: DailyIdea[];
  /** True when this call generated and stored fresh ideas. */
  created: boolean;
  nicheThemes: string[];
};

/**
 * Ensure today's ideas exist for one channel: return the stored package
 * when a run already exists for today, otherwise generate from cached
 * channel videos + the latest trending snapshot and store both the
 * packages row (kind='daily-ideas') and the daily_idea_runs row.
 * `admin` is the service-role Supabase client (server only).
 */
export async function ensureDailyIdeasForChannel(
  admin: SupabaseClient,
  channel: ChannelForIdeas,
  runDate = todayDateString()
): Promise<DailyIdeasResult> {
  // Already run today? Return the stored ideas.
  const { data: run } = await admin
    .from("daily_idea_runs")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("run_date", runDate)
    .maybeSingle();
  if (run) {
    const { data: pkgs } = await admin
      .from("packages")
      .select("payload_json")
      .eq("kind", "daily-ideas")
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of pkgs ?? []) {
      const payload = row.payload_json as {
        channelId?: number;
        date?: string;
        ideas?: DailyIdea[];
        nicheThemes?: string[];
      } | null;
      if (payload && payload.channelId === channel.id && payload.date === runDate) {
        const ideas = payload.ideas ?? [];
        // Current format = 4 ideas, each with a prediction. Older runs
        // (5 ideas, no predictions) regenerate below instead of serving
        // stale-format ideas.
        const current =
          ideas.length === DAILY_IDEAS_PER_DAY &&
          ideas.every((i) => i && typeof i.prediction === "string");
        if (current) {
          return {
            date: runDate,
            channelId: channel.id,
            channelTitle: channel.title,
            ideas,
            created: false,
            nicheThemes: payload.nicheThemes ?? [],
          };
        }
      }
    }
    // Run row exists but the package is missing or old-format: regenerate below.
  }

  const [{ data: videoRows }, { data: snap }] = await Promise.all([
    admin
      .from("channel_videos")
      .select("title,view_count,like_count,published_at")
      .eq("channel_id", channel.id)
      .order("published_at", { ascending: false })
      .limit(50),
    admin
      .from("trending_snapshots")
      .select("items")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const videos: VideoForIdeas[] = (videoRows ?? []).map((v) => ({
    title: (v.title as string) ?? "",
    viewCount: Number(v.view_count ?? 0),
    likeCount: v.like_count == null ? null : Number(v.like_count),
    publishedAt: (v.published_at as string | null) ?? null,
  }));
  const trends = ((snap?.items ?? []) as TrendItem[]).filter(
    (t) => t && typeof t.title === "string"
  );
  const themes = nicheThemes(videos);
  const ideas = buildDailyIdeas(channel, videos, trends);

  const payload = {
    channelId: channel.id,
    channelTitle: channel.title,
    date: runDate,
    nicheThemes: themes,
    ideas,
    generatedAt: new Date().toISOString(),
  };
  await admin.from("packages").insert({
    kind: "daily-ideas",
    topic: channel.title,
    payload_json: payload,
  });
  await admin
    .from("daily_idea_runs")
    .upsert(
      { channel_id: channel.id, run_date: runDate, idea_count: ideas.length },
      { onConflict: "channel_id,run_date" }
    );

  return {
    date: runDate,
    channelId: channel.id,
    channelTitle: channel.title,
    ideas,
    created: true,
    nicheThemes: themes,
  };
}
