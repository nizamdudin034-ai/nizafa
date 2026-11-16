// /optimize/[videoId] — per-video Analysis (Title / Thumbnail / SEO /
// Preview). All data is real: the video row from the cache, live
// metadata (description, tags, duration, privacy) from the YouTube API
// via the shared yt_cache, the best-matching saved SEO pack, the cached
// trending snapshot, and competitor videos for the feed preview.
import Link from "next/link";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { EmptyState } from "@/components/ui";
import AnalysisTabs, { type PreviewEntry } from "@/components/AnalysisTabs";
import { fetchVideoMeta, formatDuration } from "@/lib/video-meta";
import {
  alternativesForPack,
  consistencyForPack,
  currentPackTitle,
  suggestTitlesForTexts,
} from "@/lib/consistency";
import { scoreVideoSeo, viewsPerHour } from "@/lib/audit";
import { buildThumbnailConcepts, topicKeywords, type SeoPack } from "@/lib/generator";
import {
  matchPackToVideo,
  scoreVideoThumbnail,
  topicFromTitle,
  type PackRow,
} from "@/lib/seo-checklist";

export const dynamic = "force-dynamic";

type VideoRow = {
  video_id: string;
  title: string;
  url: string;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  channel_id: number;
};

export default async function AnalysisPage({
  params,
}: {
  params: { videoId: string };
}) {
  const videoId = params.videoId;
  const configured = isSupabaseConfigured();

  if (!configured) {
    return (
      <EmptyState
        title="Setup needed"
        body="Supabase is not configured yet. Add the env vars from .env.example and redeploy."
        action={<Link href="/" className="btn btn-primary">Go home</Link>}
      />
    );
  }

  const supabase = createSupabaseServer();
  const { data: videoRows } = await supabase
    .from("channel_videos")
    .select("*")
    .eq("video_id", videoId)
    .limit(5);
  const video = ((videoRows ?? []) as VideoRow[])[0] ?? null;

  if (!video) {
    return (
      <EmptyState
        title="Video not found"
        body="This video is not in Nizafa's cache yet. Open Optimize and wait for the channel refresh, or check the link."
        action={<Link href="/optimize" className="btn btn-primary">Back to Optimize</Link>}
      />
    );
  }

  const [chRes, packRes, snapRes] = await Promise.all([
    supabase.from("channels").select("id,title,avatar_url,role").eq("id", video.channel_id).maybeSingle(),
    supabase
      .from("packages")
      .select("id,topic,payload_json")
      .eq("kind", "package")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("trending_snapshots")
      .select("items")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const channel = chRes.data as { id: number; title: string; avatar_url: string | null; role: string } | null;
  const packs = ((packRes.data ?? []) as PackRow[]).filter(
    (p) => p.payload_json && typeof p.payload_json === "object"
  );
  const pack = matchPackToVideo(video.title, packs);
  const packPayload = (pack?.payload_json ?? null) as SeoPack | null;

  const metaMap = await fetchVideoMeta([videoId]);
  const meta = metaMap.get(videoId) ?? null;

  const trendingItems = (snapRes.data?.items ?? []) as Array<{ title?: string }>;
  const trendingTitles = trendingItems
    .map((t) => t.title ?? "")
    .filter(Boolean);

  const description =
    meta?.description?.trim() ||
    packPayload?.descriptionStarter ||
    "";
  const descriptionSource: "live" | "pack" | "none" = meta?.description?.trim()
    ? "live"
    : packPayload?.descriptionStarter
      ? "pack"
      : "none";
  const tags =
    (meta?.tags?.length ? meta.tags : packPayload?.tags ?? []);
  const tagsSource: "live" | "pack" | "none" = meta?.tags?.length
    ? "live"
    : (packPayload?.tags?.length ?? 0) > 0
      ? "pack"
      : "none";

  const topic = pack?.topic ?? topicFromTitle(video.title);
  const topicKws = topicKeywords(topic);

  const concepts =
    (packPayload?.thumbnailConcepts?.length ?? 0) > 0
      ? packPayload!.thumbnailConcepts
      : buildThumbnailConcepts(topic);
  const thumbSource: "pack" | "generated" =
    (packPayload?.thumbnailConcepts?.length ?? 0) > 0 ? "pack" : "generated";
  const thumbScore = concepts[0] ? scoreVideoThumbnail(concepts[0]) : null;
  const thumbConcepts = concepts.map((c) => ({
    bigText: c.bigText,
    layout: c.layout,
    imageIdea: c.imageIdea,
    score: scoreVideoThumbnail(c)?.score ?? 0,
  }));

  const storedPack = packPayload as
    | (SeoPack & { chosenTitle?: string; chosenAt?: string })
    | null;
  const consistencyInitial = pack && storedPack
    ? {
        packageId: pack.id,
        topic: pack.topic,
        currentTitle: currentPackTitle(storedPack),
        consistency: consistencyForPack(storedPack),
        alternatives: alternativesForPack(
          storedPack,
          currentPackTitle(storedPack),
          0
        ),
      }
    : null;

  // No pack yet: standalone consistency + 3 max-match titles from the live
  // description and the generated concepts. No script exists, so the
  // script part honestly scores 0 — the card says so.
  const standalone = consistencyInitial
    ? null
    : (() => {
        const thumbText = thumbConcepts
          .map((c) => `${c.bigText} ${c.layout}`)
          .join(" ");
        const s = suggestTitlesForTexts({
          topic,
          channelTitle: channel?.title ?? null,
          description,
          scriptText: "",
          thumbnailText: thumbText,
          currentTitle: video.title,
        });
        return {
          currentTitle: video.title,
          consistency: s.consistency,
          alternatives: s.alternatives,
        };
      })();

  const titleChecks = scoreVideoSeo({
    title: video.title,
    publishedAt: video.published_at,
    viewCount: video.view_count,
    likeCount: video.like_count,
    commentCount: video.comment_count,
  }).checks;

  // ── Preview feed: competitor videos + this video, ordered by VPH ──
  const { data: compChannels } = await supabase
    .from("channels")
    .select("id,title,avatar_url")
    .eq("role", "competitor");
  const compList = (compChannels ?? []) as Array<{ id: number; title: string; avatar_url: string | null }>;
  let preview: PreviewEntry[] = [];
  if (compList.length > 0) {
    const { data: compVideos } = await supabase
      .from("channel_videos")
      .select("video_id,title,published_at,view_count,channel_id")
      .in("channel_id", compList.map((c) => c.id))
      .order("published_at", { ascending: false })
      .limit(10);
    const rows = (compVideos ?? []) as Array<{
      video_id: string;
      title: string;
      published_at: string | null;
      view_count: number | null;
      channel_id: number;
    }>;
    const compMeta = await fetchVideoMeta(rows.map((r) => r.video_id));
    const byId = new Map(compList.map((c) => [c.id, c]));
    preview = rows.map((r) => ({
      videoId: r.video_id,
      title: r.title,
      channelTitle: byId.get(r.channel_id)?.title ?? "Unknown channel",
      channelAvatar: byId.get(r.channel_id)?.avatar_url ?? null,
      viewCount: r.view_count,
      vph: viewsPerHour(r.view_count, r.published_at),
      publishedAt: r.published_at,
      duration: formatDuration(compMeta.get(r.video_id)?.durationSeconds ?? null),
      isOwn: false,
    }));
  }
  const ownEntry: PreviewEntry = {
    videoId: video.video_id,
    title: video.title,
    channelTitle: channel?.title ?? "Your channel",
    channelAvatar: channel?.avatar_url ?? null,
    viewCount: video.view_count,
    vph: viewsPerHour(video.view_count, video.published_at),
    publishedAt: video.published_at,
    duration: formatDuration(meta?.durationSeconds ?? null),
    isOwn: true,
  };
  preview = [...preview, ownEntry].sort((a, b) => b.vph - a.vph);

  return (
    <AnalysisTabs
      data={{
        video: {
          videoId: video.video_id,
          title: video.title,
          url: video.url,
          publishedAt: video.published_at,
          viewCount: video.view_count,
          likeCount: video.like_count,
          commentCount: video.comment_count,
          vph: viewsPerHour(video.view_count, video.published_at),
          duration: formatDuration(meta?.durationSeconds ?? null),
          isShort: meta?.isShort ?? null,
          privacy: meta?.privacyStatus ?? null,
          titleChecks,
        },
        channelTitle: channel?.title ?? "Your channel",
        channelAvatar: channel?.avatar_url ?? null,
        description,
        descriptionSource,
        initialTags: tags,
        tagsSource,
        packId: pack?.id ?? null,
        packTopic: pack?.topic ?? null,
        consistencyInitial,
        standalone,
        thumbSource,
        external: false,
        backHref: null,
        thumbScore,
        thumbConcepts,
        topicKeywords: topicKws,
        trendingTitles,
        trendingAvailable: trendingTitles.length > 0,
        packTags: packPayload?.tags ?? [],
        preview,
        generateTopic: topic,
      }}
    />
  );
}
