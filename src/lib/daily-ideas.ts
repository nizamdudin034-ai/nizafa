// Daily video ideas — built from the channel's OWN data + trending topics.
// ZERO search.list calls: niche comes from the channel's own video titles,
// patterns come from its best-performing videos (views per hour), and
// trends come from the cached Google Trends snapshot. No numbers are
// invented: every view count quoted in a `whyFits` comes from the DB.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrendItem } from "./trends";

export type DailyIdea = {
  title: string;
  hook: string;
  whyFits: string;
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

/**
 * Build 5 ideas for a channel. Each `whyFits` cites real data: the
 * channel's own best video (title + real view count) or a real trending
 * topic from the snapshot. Falls back to generic-but-honest angles when
 * the channel has no videos yet.
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

  const nicheWords = new Set(themes.flatMap((t) => t.split(" ")));
  const matchingTrends = trends.filter((tr) =>
    tr.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .some((w) => nicheWords.has(w))
  );
  const trend = matchingTrends[0] ?? trends[0] ?? null;

  const ideas: DailyIdea[] = [];

  if (best && theme) {
    ideas.push({
      title: `The Untold Part of ${themeTitle} — What ${best.title.replace(/\s*[|–-].*$/, "").trim()} Left Out`,
      hook: `Your viewers already watched the first half of this story — now show them the part nobody covered.`,
      whyFits: `Follow-up to your best-performing video by views per hour, “${best.title}” (${fmt(best.viewCount)} views). Same niche (${theme}), new angle.`,
    });
  } else if (best) {
    ideas.push({
      title: `What ${best.title.replace(/\s*[|–-].*$/, "").trim()} Didn't Tell You`,
      hook: `The follow-up your audience is already asking for, in the comments of your biggest video.`,
      whyFits: `Follow-up to your best-performing video by views per hour, “${best.title}” (${fmt(best.viewCount)} views).`,
    });
  } else {
    ideas.push({
      title: `${themeTitle}: The Full Story, Explained Simply`,
      hook: `One clear explainer that turns a confusing topic into a story anyone can follow.`,
      whyFits: `Your channel has no videos saved yet, so this starts from your channel name and niche — connect the channel to get ideas from your real performance.`,
    });
  }

  if (trend && theme) {
    ideas.push({
      title: `${trend.title} — What It Means for ${themeTitle}`,
      hook: `Everyone is searching for this today. Here's the angle only your channel can give.`,
      whyFits: `Trending now (“${trend.title}”${trend.geo ? `, ${trend.geo}` : ""}) and it matches your niche (${theme}) from your own video titles.`,
    });
  } else if (trend) {
    ideas.push({
      title: `${trend.title}: The Full Story`,
      hook: `The trending topic of the day, explained the way your audience expects from you.`,
      whyFits: `Trending now (“${trend.title}”${trend.geo ? `, ${trend.geo}` : ""}). No strong niche match in your saved videos yet.`,
    });
  }

  if (bestByViews && theme) {
    ideas.push({
      title: `5 ${themeTitle} Facts That Change Everything`,
      hook: `Five facts, five minutes — the list format your audience already proved it watches.`,
      whyFits: `List format in your niche (${theme}); your most-viewed video overall is “${bestByViews.title}” (${fmt(bestByViews.viewCount)} views).`,
    });
  } else {
    ideas.push({
      title: `5 ${themeTitle} Facts That Change Everything`,
      hook: `Five facts, five minutes — a fast list video your audience can finish in one sitting.`,
      whyFits: `List format in your channel's niche (${themeTitle}). Add your videos to sharpen this with real performance data.`,
    });
  }

  if (theme) {
    ideas.push({
      title: `Why ${themeTitle} Deserves a Second Look`,
      hook: `Start with the one thing everyone gets wrong — then prove it, step by step.`,
      whyFits: `“Why it matters” angle on your strongest niche theme (${theme}) from your own video titles.`,
    });
    ideas.push({
      title: `${themeTitle}: The Mistake Everyone Makes`,
      hook: `The most common mistake, shown with a real example — then the fix.`,
      whyFits: `Myth-busting angle on your strongest niche theme (${theme}); pairs well with your explainer style.`,
    });
  } else {
    ideas.push({
      title: `Why ${channel.title} Exists — And What Comes Next`,
      hook: `Tell the story of the channel itself: what you cover, and why it matters.`,
      whyFits: `Channel-intro angle — useful while your video history is still building up.`,
    });
    ideas.push({
      title: `${channel.title}: 5 Questions, Answered Honestly`,
      hook: `Five real questions from your audience, answered in one video.`,
      whyFits: `Q&A format — a low-effort video that builds trust while your catalogue grows.`,
    });
  }

  return ideas.slice(0, 5);
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
        return {
          date: runDate,
          channelId: channel.id,
          channelTitle: channel.title,
          ideas: payload.ideas ?? [],
          created: false,
          nicheThemes: payload.nicheThemes ?? [],
        };
      }
    }
    // Run row exists but the package is missing: regenerate below.
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
