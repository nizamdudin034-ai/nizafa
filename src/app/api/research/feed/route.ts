// GET /api/research/feed — the Research feed: outlier videos across the
// user's own + competitor channels, channel summaries, niche topics, and
// rising keywords with real volume + growth computed from stored
// trending snapshots. No fake numbers: ratios are views vs the channel's
// own saved-video average; Shorts classification comes from the batched
// videos.list metadata (cached 6h) with a #shorts title fallback; growth
// is the change vs the previous snapshot for the same title + region.
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { fetchVideoMeta } from "@/lib/video-meta";
import { nicheThemes } from "@/lib/daily-ideas";
import type { TrendItem } from "@/lib/trends";

export const dynamic = "force-dynamic";

export type FeedVideo = {
  videoId: string;
  title: string;
  url: string;
  viewCount: number;
  publishedAt: string | null;
  ratio: number;
  vph: number;
  isShort: boolean | null;
  durationSeconds: number | null;
  /** True when the video belongs to the user's own channel. */
  isOwn: boolean;
  channel: { id: number; title: string; avatarUrl: string | null; subs: number | null };
};

export type FeedChannel = {
  id: number;
  title: string;
  avatarUrl: string | null;
  subs: number | null;
  role: string;
  videoCount: number;
  totalViews: number;
  avgViews: number;
  outlierCount: number;
  topVideo: { title: string; views: number } | null;
};

export type RisingKeyword = {
  title: string;
  geo: string;
  traffic: string;
  volume: number | null;
  growthPct: number | null;
  isNew: boolean;
  newsTitle?: string;
  newsSource?: string;
};

/** "100,000+" → 100000; "1.5M+" → 1500000; "" → null. */
function parseTraffic(raw: string): number | null {
  const s = (raw ?? "").trim().replace(/,/g, "").replace(/\+$/, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return Math.round(n * mult);
}

function vphOf(views: number, publishedAt: string | null): number {
  if (!publishedAt) return 0;
  const hours = Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  return Math.round(views / hours);
}

type SnapRow = { fetched_at: string; items: TrendItem[] };

function dedupKeywords(
  items: TrendItem[],
  baseline: Map<string, number>
): RisingKeyword[] {
  const best = new Map<string, RisingKeyword>();
  for (const t of items) {
    if (!t || typeof t.title !== "string") continue;
    const key = `${t.geo}::${t.title.toLowerCase()}`;
    const volume = parseTraffic(t.traffic);
    const prev = baseline.get(key);
    const growthPct =
      prev != null && prev > 0 && volume != null
        ? Math.round(((volume - prev) / prev) * 100)
        : null;
    const isNew = prev == null;
    const cur = best.get(key);
    const cand: RisingKeyword = {
      title: t.title,
      geo: t.geo,
      traffic: t.traffic ?? "",
      volume,
      growthPct,
      isNew,
      newsTitle: t.newsTitle,
      newsSource: t.newsSource,
    };
    // Keep the highest-volume entry when a title appears twice.
    if (!cur || (volume ?? 0) > (cur.volume ?? 0)) best.set(key, cand);
  }
  const list = [...best.values()];
  list.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if ((b.growthPct ?? -1) !== (a.growthPct ?? -1)) return (b.growthPct ?? -1) - (a.growthPct ?? -1);
    return (b.volume ?? 0) - (a.volume ?? 0);
  });
  return list.slice(0, 30);
}

function snapshotVolumes(items: TrendItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of items) {
    if (!t || typeof t.title !== "string") continue;
    const v = parseTraffic(t.traffic);
    if (v != null) map.set(`${t.geo}::${t.title.toLowerCase()}`, v);
  }
  return map;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      feed: [],
      channels: [],
      topics: [],
      keywords: { today: [], week: [], month: [] },
      meta: { videoCount: 0, channelCount: 0, shortsUnknown: 0 },
      note: "Supabase is not configured — connect the database to load Research.",
    });
  }
  const admin = createSupabaseAdmin();
  const user = await getSessionUser();

  let chQuery = admin
    .from("channels")
    .select("id,title,avatar_url,subscriber_count,role")
    .order("role", { ascending: true })
    .order("connected_at", { ascending: true });
  if (user) chQuery = chQuery.eq("user_id", user.id);
  const { data: channelRows } = await chQuery;
  const channels = (channelRows ?? []) as Array<{
    id: number;
    title: string;
    avatar_url: string | null;
    subscriber_count: number | null;
    role: string;
  }>;

  const feed: FeedVideo[] = [];
  const summaries: FeedChannel[] = [];
  let ownVideosForTopics: Array<{ title: string; viewCount: number; publishedAt?: string | null }> = [];

  for (const ch of channels) {
    const limit = ch.role === "own" ? 50 : 30;
    const { data: vids } = await admin
      .from("channel_videos")
      .select("video_id,title,url,view_count,published_at")
      .eq("channel_id", ch.id)
      .order("published_at", { ascending: false })
      .limit(limit);
    const rows = (vids ?? []) as Array<{
      video_id: string;
      title: string;
      url: string;
      view_count: number | null;
      published_at: string | null;
    }>;
    if (rows.length === 0) {
      summaries.push({
        id: ch.id,
        title: ch.title,
        avatarUrl: ch.avatar_url,
        subs: ch.subscriber_count,
        role: ch.role,
        videoCount: 0,
        totalViews: 0,
        avgViews: 0,
        outlierCount: 0,
        topVideo: null,
      });
      continue;
    }
    const views = rows.map((v) => Number(v.view_count ?? 0));
    const avg = views.reduce((a, b) => a + b, 0) / views.length;
    const total = views.reduce((a, b) => a + b, 0);
    const top = rows.reduce((best, v) =>
      Number(v.view_count ?? 0) > Number(best.view_count ?? 0) ? v : best
    );
    const outlierCount = avg > 0 ? rows.filter((v) => Number(v.view_count ?? 0) / avg >= 1.5).length : 0;
    summaries.push({
      id: ch.id,
      title: ch.title,
      avatarUrl: ch.avatar_url,
      subs: ch.subscriber_count,
      role: ch.role,
      videoCount: rows.length,
      totalViews: total,
      avgViews: Math.round(avg),
      outlierCount,
      topVideo: { title: top.title, views: Number(top.view_count ?? 0) },
    });
    if (ch.role === "own") {
      ownVideosForTopics = rows.map((v) => ({
        title: v.title,
        viewCount: Number(v.view_count ?? 0),
        publishedAt: v.published_at,
      }));
    }
    for (const v of rows) {
      feed.push({
        videoId: v.video_id,
        title: v.title,
        url: v.url,
        viewCount: Number(v.view_count ?? 0),
        publishedAt: v.published_at,
        ratio: avg > 0 ? Math.round((Number(v.view_count ?? 0) / avg) * 10) / 10 : 0,
        vph: vphOf(Number(v.view_count ?? 0), v.published_at),
        isShort: null,
        durationSeconds: null,
        isOwn: ch.role === "own",
        channel: {
          id: ch.id,
          title: ch.title,
          avatarUrl: ch.avatar_url,
          subs: ch.subscriber_count,
        },
      });
    }
  }

  // Durations (Shorts classification), batched 50 at a time, cached 6h.
  const ids = feed.map((v) => v.videoId);
  const meta = new Map<string, { isShort: boolean | null; durationSeconds: number | null }>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = await fetchVideoMeta(ids.slice(i, i + 50));
    for (const [id, m] of chunk) {
      meta.set(id, { isShort: m.isShort, durationSeconds: m.durationSeconds });
    }
  }
  let shortsUnknown = 0;
  for (const v of feed) {
    const m = meta.get(v.videoId);
    if (m) {
      v.isShort = m.isShort ?? (/#shorts/i.test(v.title) ? true : null);
      v.durationSeconds = m.durationSeconds;
    } else {
      // No live metadata: the title itself is the only honest signal.
      v.isShort = /#shorts/i.test(v.title) ? true : null;
    }
    if (v.isShort === null) shortsUnknown += 1;
  }
  feed.sort((a, b) => b.ratio - a.ratio);

  // ── Rising keywords: snapshots from the last 31 days. ──
  const { data: snapRows } = await admin
    .from("trending_snapshots")
    .select("fetched_at,items")
    .order("fetched_at", { ascending: false })
    .limit(31);
  const snaps = (snapRows ?? []) as SnapRow[];
  const latest = snaps[0]?.items ?? [];
  const prev = snaps[1]?.items ?? [];
  const today = dedupKeywords(latest, snapshotVolumes(prev));

  const now = Date.now();
  const inWindow = (days: number) =>
    snaps.filter(
      (s) => now - new Date(s.fetched_at).getTime() <= days * 24 * 3_600_000
    );
  const weekSnaps = inWindow(7);
  const monthSnaps = inWindow(30);
  const windowKeywords = (window: SnapRow[]) => {
    if (window.length === 0) return [];
    const earliest = window[window.length - 1].items ?? [];
    const baseline = snapshotVolumes(earliest);
    const all = window.flatMap((s) => s.items ?? []);
    return dedupKeywords(all, baseline);
  };
  const week = windowKeywords(weekSnaps);
  const month = windowKeywords(monthSnaps);

  const topics = nicheThemes(ownVideosForTopics, 6);

  return NextResponse.json({
    feed: feed.slice(0, 80),
    channels: summaries,
    topics,
    keywords: { today, week, month },
    meta: {
      videoCount: feed.length,
      channelCount: channels.length,
      shortsUnknown,
    },
  });
}
