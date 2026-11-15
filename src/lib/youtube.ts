// YouTube Data API v3 client — SERVER ONLY (key never leaves the server).
// Quota discipline (the whole app shares 10,000 units/day and only
// 100 search.list calls/day): NEVER call search.list per click. Channel
// and video data is cached in Supabase (channels / channel_videos) and
// refreshed only when older than 6 hours (see /api/channels).

const YT = "https://www.googleapis.com/youtube/v3";

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured.");
  return key;
}

async function yt(path: string): Promise<unknown> {
  const res = await fetch(`${YT}${path}`, { next: { revalidate: 0 } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export type YtChannel = {
  channelId: string;
  title: string;
  description: string;
  url: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string | null;
};

export type YtVideo = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
};

type ChannelItem = {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails?: { default?: { url: string } };
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

function toChannel(item: ChannelItem): YtChannel {
  return {
    channelId: item.id,
    title: item.snippet.title,
    description: item.snippet.description ?? "",
    url: `https://www.youtube.com/channel/${item.id}`,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
    videoCount: Number(item.statistics?.videoCount ?? 0),
    viewCount: Number(item.statistics?.viewCount ?? 0),
    uploadsPlaylistId:
      item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

/** Accepts a channel ID (UC...), @handle, handle, or any youtube.com URL. */
export function parseChannelInput(raw: string): {
  kind: "id" | "handle" | "custom";
  value: string;
} {
  const input = raw.trim();
  const urlMatch = input.match(/youtube\.com\/(@[^/?#]+|channel\/([A-Za-z0-9_-]+)|c\/([^/?#]+)|user\/([^/?#]+))/);
  if (urlMatch) {
    if (urlMatch[2]) return { kind: "id", value: urlMatch[2] };
    if (urlMatch[1]) return { kind: "handle", value: urlMatch[1] };
    return { kind: "custom", value: urlMatch[3] ?? urlMatch[4] ?? input };
  }
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(input)) return { kind: "id", value: input };
  if (input.startsWith("@")) return { kind: "handle", value: input };
  return { kind: "handle", value: `@${input}` };
}

export async function fetchChannel(input: string): Promise<YtChannel> {
  const parsed = parseChannelInput(input);
  const key = apiKey();
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    key,
  });
  if (parsed.kind === "id") params.set("id", parsed.value);
  else if (parsed.kind === "handle") params.set("forHandle", parsed.value);
  else params.set("forUsername", parsed.value);
  const data = (await yt(`/channels?${params.toString()}`)) as {
    items?: ChannelItem[];
  };
  const item = data.items?.[0];
  if (!item) throw new Error("Channel not found. Check the link or @handle.");
  return toChannel(item);
}

export async function fetchLatestVideos(
  uploadsPlaylistId: string,
  max = 10
): Promise<YtVideo[]> {
  const key = apiKey();
  const params = new URLSearchParams({
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(max, 25)),
    key,
  });
  const data = (await yt(`/playlistItems?${params.toString()}`)) as {
    items?: Array<{
      snippet?: {
        title: string;
        publishedAt: string;
        resourceId?: { videoId: string };
        thumbnails?: { default?: { url: string } };
      };
    }>;
  };
  const basics = (data.items ?? [])
    .map((it) => ({
      videoId: it.snippet?.resourceId?.videoId ?? "",
      title: it.snippet?.title ?? "",
      publishedAt: it.snippet?.publishedAt ?? "",
      thumbnailUrl: it.snippet?.thumbnails?.default?.url ?? null,
    }))
    .filter((v) => v.videoId);
  if (basics.length === 0) return [];
  // One batched statistics call for all videos (1 unit, not N).
  const vparams = new URLSearchParams({
    part: "statistics",
    id: basics.map((b) => b.videoId).join(","),
    key,
  });
  const vdata = (await yt(`/videos?${vparams.toString()}`)) as {
    items?: Array<{
      id: string;
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };
  const stats = new Map(
    (vdata.items ?? []).map((v) => [
      v.id,
      {
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
      },
    ])
  );
  return basics.map((b) => ({
    ...b,
    url: `https://www.youtube.com/watch?v=${b.videoId}`,
    viewCount: stats.get(b.videoId)?.views ?? 0,
    likeCount: stats.get(b.videoId)?.likes ?? 0,
    commentCount: stats.get(b.videoId)?.comments ?? 0,
  }));
}

/** Quota-guarded search (used ONLY by keyword research, with caching). */
export async function searchVideos(
  query: string,
  max = 10
): Promise<Array<{ videoId: string; title: string; channelTitle: string }>> {
  const key = apiKey();
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(Math.min(max, 10)),
    order: "viewCount",
    key,
  });
  const data = (await yt(`/search?${params.toString()}`)) as {
    items?: Array<{
      id?: { videoId: string };
      snippet?: { title: string; channelTitle: string };
    }>;
  };
  return (data.items ?? [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      videoId: it.id!.videoId,
      title: it.snippet?.title ?? "",
      channelTitle: it.snippet?.channelTitle ?? "",
    }));
}
