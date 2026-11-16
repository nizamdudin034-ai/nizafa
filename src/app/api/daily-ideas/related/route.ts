// GET /api/daily-ideas/related?title=… — Top 10 ranked videos in YouTube
// search for one idea title. Uses the YouTube Data API search (ordered by
// view count) + one batched videos.list call for views + publish dates.
// Results are cached in yt_cache for 24h per title, so expanding an idea
// never spends quota twice. When the API key is missing, `available` is
// false and the page says so instead of showing fake videos.
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { searchVideos } from "@/lib/youtube";
import { cleanTopic } from "@/lib/generator";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type RelatedVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string | null;
  viewCount: number | null;
};

async function enrich(ids: string[]): Promise<Map<string, { publishedAt: string | null; viewCount: number | null }>> {
  const out = new Map<string, { publishedAt: string | null; viewCount: number | null }>();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || ids.length === 0) return out;
  try {
    const params = new URLSearchParams({
      part: "statistics,snippet",
      id: ids.slice(0, 10).join(","),
      key,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`
    );
    if (!res.ok) return out;
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        statistics?: { viewCount?: string };
        snippet?: { publishedAt?: string };
      }>;
    };
    for (const item of data.items ?? []) {
      out.set(item.id, {
        publishedAt: item.snippet?.publishedAt ?? null,
        viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
      });
    }
  } catch {
    // Enrichment is best-effort; search rows still render without stats.
  }
  return out;
}

export async function GET(req: Request) {
  const title = cleanTopic(new URL(req.url).searchParams.get("title") ?? "");
  if (title.length < 3) {
    return NextResponse.json(
      { error: "Give an idea title of at least 3 characters (use ?title=…)." },
      { status: 400 }
    );
  }
  const available = Boolean(process.env.YOUTUBE_API_KEY);
  const empty = { title, videos: [] as RelatedVideo[], cached: false, available };
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ...empty, note: "Supabase is not configured — related videos need the database cache." });
  }
  const admin = createSupabaseAdmin();
  const cacheKey = `related:${title.toLowerCase()}`;
  const { data: cached } = await admin
    .from("yt_cache")
    .select("payload,fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  const fresh =
    cached &&
    Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_TTL_MS;
  if (fresh && Array.isArray(cached.payload)) {
    return NextResponse.json({ ...empty, videos: cached.payload as RelatedVideo[], cached: true });
  }
  if (!available) {
    return NextResponse.json({
      ...empty,
      videos: (cached?.payload ?? []) as RelatedVideo[],
      cached: Boolean(cached),
    });
  }
  try {
    const found = await searchVideos(title, 10);
    const stats = await enrich(found.map((v) => v.videoId));
    const videos: RelatedVideo[] = found.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.channelTitle,
      publishedAt: stats.get(v.videoId)?.publishedAt ?? null,
      viewCount: stats.get(v.videoId)?.viewCount ?? null,
    }));
    await admin.from("yt_cache").upsert(
      { cache_key: cacheKey, payload: videos, fetched_at: new Date().toISOString() },
      { onConflict: "cache_key" }
    );
    return NextResponse.json({ ...empty, videos });
  } catch {
    return NextResponse.json({
      ...empty,
      videos: (cached?.payload ?? []) as RelatedVideo[],
      cached: Boolean(cached),
      available: false,
    });
  }
}
