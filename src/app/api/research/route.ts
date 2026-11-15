// GET /api/research?q=…[&channelId=…] — keyword research.
// - Keyword ideas: pure token expansions (no API call).
// - Search suggestions: cached in yt_cache for 24h; searchVideos is called
//   ONLY on a cache miss, max 10 results, never per keystroke (the page
//   debounces its input).
// - Outlier videos: cached channel_videos + ONE batched videos.list call
//   to refresh stats; each video's views vs the channel average.
// - Rising keywords: the latest trending_snapshots row.
import { NextResponse } from "next/server";
import { buildKeywordIdeas, cleanTopic } from "@/lib/generator";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { searchVideos } from "@/lib/youtube";
import type { TrendItem } from "@/lib/trends";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CachedVideo = {
  video_id: string;
  title: string;
  url: string;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string | null;
};

/** One batched videos.list call (statistics only) for up to 50 videos. */
async function refreshVideoStats(
  videoIds: string[]
): Promise<Map<string, { views: number; likes: number; comments: number }>> {
  const out = new Map<string, { views: number; likes: number; comments: number }>();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || videoIds.length === 0) return out;
  try {
    const params = new URLSearchParams({
      part: "statistics",
      id: videoIds.slice(0, 50).join(","),
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`
    );
    if (!res.ok) return out;
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    };
    for (const item of data.items ?? []) {
      out.set(item.id, {
        views: Number(item.statistics?.viewCount ?? 0),
        likes: Number(item.statistics?.likeCount ?? 0),
        comments: Number(item.statistics?.commentCount ?? 0),
      });
    }
  } catch {
    // Stats refresh is best-effort; cached values are still usable.
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = cleanTopic(url.searchParams.get("q") ?? "");
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Give a keyword of at least 2 characters (use ?q=…)." },
      { status: 400 }
    );
  }
  const channelIdParam = url.searchParams.get("channelId");
  const keywordIdeas = buildKeywordIdeas(q);

  const result: {
    query: string;
    keywordIdeas: ReturnType<typeof buildKeywordIdeas>;
    searchResults: Array<{ videoId: string; title: string; channelTitle: string }>;
    searchCached: boolean;
    searchAvailable: boolean;
    outliers: Array<{
      videoId: string;
      title: string;
      url: string;
      viewCount: number;
      ratio: number;
    }>;
    channelAverageViews: number | null;
    channel: { id: number; title: string } | null;
    rising: TrendItem[];
  } = {
    query: q,
    keywordIdeas,
    searchResults: [],
    searchCached: false,
    searchAvailable: Boolean(process.env.YOUTUBE_API_KEY),
    outliers: [],
    channelAverageViews: null,
    channel: null,
    rising: [],
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ...result,
      note: "Supabase is not configured — search cache, outliers and rising keywords need the database.",
    });
  }

  const admin = createSupabaseAdmin();

  // ── Rising keywords: latest trending snapshot (no live fetch here). ──
  const { data: snap } = await admin
    .from("trending_snapshots")
    .select("items")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  result.rising = (((snap?.items ?? []) as TrendItem[]).filter(
    (t) => t && typeof t.title === "string"
  )).slice(0, 10);

  // ── Search suggestions via yt_cache (24h TTL), live call only on miss. ──
  const cacheKey = `search:${q.toLowerCase()}`;
  const { data: cached } = await admin
    .from("yt_cache")
    .select("payload,fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  const fresh =
    cached &&
    Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_TTL_MS;
  if (fresh) {
    result.searchResults = (cached.payload ?? []) as typeof result.searchResults;
    result.searchCached = true;
  } else if (process.env.YOUTUBE_API_KEY) {
    try {
      const live = await searchVideos(q, 10);
      result.searchResults = live;
      await admin.from("yt_cache").upsert(
        { cache_key: cacheKey, payload: live, fetched_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
    } catch {
      // Live search failed: fall back to the stale cache row if any.
      result.searchResults = (cached?.payload ?? []) as typeof result.searchResults;
      result.searchCached = Boolean(cached);
      result.searchAvailable = false;
    }
  }

  // ── Outliers: pick a channel, then cached videos + one batched refresh. ──
  let channelRow: { id: number; title: string } | null = null;
  if (channelIdParam) {
    const { data } = await admin
      .from("channels")
      .select("id,title")
      .eq("id", Number(channelIdParam))
      .maybeSingle();
    if (data) channelRow = data as { id: number; title: string };
  }
  if (!channelRow) {
    const user = await getSessionUser();
    let query = admin
      .from("channels")
      .select("id,title")
      .eq("role", "own")
      .order("connected_at", { ascending: true })
      .limit(1);
    if (user) query = query.eq("user_id", user.id);
    const { data } = await query.maybeSingle();
    if (data) channelRow = data as { id: number; title: string };
  }
  if (channelRow) {
    result.channel = channelRow;
    const { data: videos } = await admin
      .from("channel_videos")
      .select("video_id,title,url,view_count,like_count,comment_count,published_at")
      .eq("channel_id", channelRow.id)
      .order("published_at", { ascending: false })
      .limit(50);
    const rows = (videos ?? []) as CachedVideo[];
    if (rows.length > 0) {
      const stats = await refreshVideoStats(rows.map((v) => v.video_id));
      // Write refreshed stats back to the cache (best effort).
      const updates = rows
        .filter((v) => stats.has(v.video_id))
        .map((v) => {
          const s = stats.get(v.video_id)!;
          return {
            channel_id: channelRow!.id,
            video_id: v.video_id,
            title: v.title,
            url: v.url,
            published_at: v.published_at,
            view_count: s.views,
            like_count: s.likes,
            comment_count: s.comments,
          };
        });
      if (updates.length > 0) {
        await admin
          .from("channel_videos")
          .upsert(updates, { onConflict: "channel_id,video_id" });
      }
      const withViews = rows.map((v) => ({
        videoId: v.video_id,
        title: v.title,
        url: v.url,
        viewCount: stats.get(v.video_id)?.views ?? Number(v.view_count ?? 0),
      }));
      const avg =
        withViews.reduce((sum, v) => sum + v.viewCount, 0) / withViews.length;
      result.channelAverageViews = Math.round(avg);
      result.outliers = withViews
        .filter((v) => avg > 0 && v.viewCount / avg >= 1.5)
        .map((v) => ({
          ...v,
          ratio: Math.round((v.viewCount / avg) * 10) / 10,
        }))
        .sort((a, b) => b.ratio - a.ratio);
    }
  }

  return NextResponse.json(result);
}
