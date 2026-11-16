// Live video metadata from the YouTube Data API — SERVER ONLY.
// channel_videos stores only title/views/likes/comments, so duration,
// privacy, description and tags come from one batched videos.list call
// (part=snippet,contentDetails,status — 1 quota unit for up to 50 ids).
// Results are cached in yt_cache for 6h, same pattern as /api/research.
// When the API key is missing or the call fails, callers get an empty
// map and must render from cached data with an honest note — never fake
// durations or privacy states.
import { createSupabaseAdmin } from "./supabase-server";

const YT = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type VideoMeta = {
  videoId: string;
  /** Seconds, or null when YouTube did not return a duration. */
  durationSeconds: number | null;
  /** True when the video is 60s or shorter (YouTube Shorts are ≤ 60s). */
  isShort: boolean | null;
  /** "public" | "private" | "unlisted" | null when unknown. */
  privacyStatus: string | null;
  description: string;
  tags: string[];
  thumbnailUrl: string | null;
};

function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Batched metadata for up to 50 video IDs. Returns a map keyed by video
 * ID; IDs with no live data are simply absent from the map.
 */
export async function fetchVideoMeta(
  videoIds: string[]
): Promise<Map<string, VideoMeta>> {
  const out = new Map<string, VideoMeta>();
  const ids = [...new Set(videoIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return out;

  const cacheKey = `video-meta:v1:${[...ids].sort().join(",")}`;
  try {
    const admin = createSupabaseAdmin();
    const { data: cached } = await admin
      .from("yt_cache")
      .select("payload,fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    const fresh =
      cached &&
      Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_TTL_MS;
    if (fresh && Array.isArray(cached.payload)) {
      for (const m of cached.payload as VideoMeta[]) {
        if (m?.videoId) out.set(m.videoId, m);
      }
      return out;
    }

    const params = new URLSearchParams({
      part: "snippet,contentDetails,status",
      id: ids.join(","),
      key,
    });
    const res = await fetch(`${YT}/videos?${params.toString()}`);
    if (!res.ok) return out;
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        snippet?: {
          description?: string;
          tags?: string[];
          thumbnails?: { medium?: { url: string }; high?: { url: string } };
        };
        contentDetails?: { duration?: string };
        status?: { privacyStatus?: string };
      }>;
    };
    for (const it of data.items ?? []) {
      const durationSeconds = parseDuration(it.contentDetails?.duration);
      const meta: VideoMeta = {
        videoId: it.id,
        durationSeconds,
        isShort:
          durationSeconds === null ? null : durationSeconds <= 60,
        privacyStatus: it.status?.privacyStatus ?? null,
        description: it.snippet?.description ?? "",
        tags: it.snippet?.tags ?? [],
        thumbnailUrl:
          it.snippet?.thumbnails?.medium?.url ??
          it.snippet?.thumbnails?.high?.url ??
          null,
      };
      out.set(it.id, meta);
    }
    const payload = [...out.values()];
    if (payload.length > 0) {
      await admin.from("yt_cache").upsert(
        { cache_key: cacheKey, payload, fetched_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
    }
  } catch {
    // Live metadata is a bonus — the pages render from cached data.
  }
  return out;
}
