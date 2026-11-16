// /analyze — in-app Analysis for ANY public YouTube video (competitor,
// research, trending, related). Video clicks anywhere in the app land
// here instead of youtube.com. Own videos redirect to /optimize/[id].
// All data is real: live public metadata from the YouTube API (cached
// 6h), the cached row when the API is unavailable, and 3 generated
// thumbnail concepts + 3 max-match titles scored with Nizafa's own
// consistency scorer. Nothing here pushes a title or thumbnail to
// YouTube — Apply saves to a Nizafa pack only.
import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { EmptyState } from "@/components/ui";
import AnalysisTabs, { type PreviewEntry } from "@/components/AnalysisTabs";
import {
  fetchVideoMeta,
  fetchVideoPublicMeta,
  formatDuration,
} from "@/lib/video-meta";
import { buildThumbnailConcepts, topicKeywords } from "@/lib/generator";
import { scoreVideoSeo, viewsPerHour } from "@/lib/audit";
import {
  contentWords,
  scoreTag,
  suggestTitlesForTexts,
} from "@/lib/consistency";
import { scoreVideoThumbnail, topicFromTitle } from "@/lib/seo-checklist";

export const dynamic = "force-dynamic";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function safeBackHref(from: string | undefined): string {
  if (from && from.startsWith("/") && !from.startsWith("//")) return from;
  return "/research";
}

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: { videoId?: string; from?: string };
}) {
  const videoId = (searchParams.videoId ?? "").trim();
  const configured = isSupabaseConfigured();

  if (!VIDEO_ID_RE.test(videoId)) {
    return (
      <EmptyState
        title="Invalid video link"
        body="That link does not look like a YouTube video. Go back and tap the video again."
        action={<Link href="/research" className="btn btn-primary">Back to Research</Link>}
      />
    );
  }

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

  // Own video? Send it to the Optimize Analysis instead.
  const { data: cachedRows } = await supabase
    .from("channel_videos")
    .select("video_id,title,published_at,view_count,like_count,comment_count,channel_id")
    .eq("video_id", videoId)
    .limit(5);
  const cached = ((cachedRows ?? []) as Array<{
    video_id: string;
    title: string;
    published_at: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
    channel_id: number;
  }>)[0] ?? null;
  if (cached) {
    const { data: chRole } = await supabase
      .from("channels")
      .select("role")
      .eq("id", cached.channel_id)
      .maybeSingle();
    if ((chRole as { role?: string } | null)?.role === "own") {
      redirect(`/optimize/${videoId}`);
    }
  }

  const [publicMap, metaMap, snapRes, chRes] = await Promise.all([
    fetchVideoPublicMeta([videoId]),
    fetchVideoMeta([videoId]),
    supabase
      .from("trending_snapshots")
      .select("items")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("channels").select("id,title,avatar_url,url,role"),
  ]);
  const pub = publicMap.get(videoId) ?? null;
  const meta = metaMap.get(videoId) ?? null;

  const title = pub?.title || cached?.title || "";
  if (!title) {
    return (
      <EmptyState
        title="Video not found"
        body="YouTube did not return this video — it may be private, deleted, or the YouTube API key is not set on the server. Try again later."
        action={<Link href="/research" className="btn btn-primary">Back to Research</Link>}
      />
    );
  }

  const publishedAt = pub?.publishedAt ?? cached?.published_at ?? null;
  const viewCount = pub?.viewCount ?? cached?.view_count ?? null;
  const likeCount = pub?.likeCount ?? cached?.like_count ?? null;
  const commentCount = pub?.commentCount ?? cached?.comment_count ?? null;
  const channelId = pub?.channelId ?? "";
  const channelTitle = pub?.channelTitle ?? "Unknown channel";

  const channels = (chRes.data ?? []) as Array<{
    id: number;
    title: string;
    avatar_url: string | null;
    url: string | null;
    role: string;
  }>;
  const matchedChannel = channelId
    ? channels.find((c) => c.url?.includes(channelId)) ?? null
    : null;
  const channelAvatar = matchedChannel?.avatar_url ?? null;

  const topic = topicFromTitle(title);
  const description = (pub?.description || meta?.description || "").trim();
  const descriptionSource: "live" | "pack" | "none" = description ? "live" : "none";
  const tags = pub?.tags?.length ? pub.tags : (meta?.tags ?? []);
  const tagsSource: "live" | "pack" | "none" = tags.length > 0 ? "live" : "none";

  // 3 thumbnail concepts, generated from the topic and ranked by score.
  const concepts = buildThumbnailConcepts(topic);
  const thumbConcepts = concepts.map((c) => ({
    bigText: c.bigText,
    layout: c.layout,
    imageIdea: c.imageIdea,
    score: scoreVideoThumbnail(c)?.score ?? 0,
  }));
  const thumbScore = concepts[0] ? scoreVideoThumbnail(concepts[0]) : null;
  const thumbnailText = concepts.map((c) => `${c.bigText} ${c.layout}`).join(" ");

  // 3 titles ranked by real title match. No script exists for an external
  // video, so the script part honestly scores 0 — the card says so.
  const suggestion = suggestTitlesForTexts({
    topic,
    channelTitle,
    description,
    scriptText: "",
    thumbnailText,
    currentTitle: title,
  });

  const titleChecks = scoreVideoSeo({
    title,
    publishedAt,
    viewCount,
    likeCount,
    commentCount,
  }).checks;

  const trendingItems = (snapRes.data?.items ?? []) as Array<{ title?: string }>;
  const trendingTitles = trendingItems.map((t) => t.title ?? "").filter(Boolean);
  const topicKws = topicKeywords(topic);

  // Recommended tags: real candidates from the topic + title words,
  // scored with the same tag scorer as the pack flow.
  const tagCandidates = [...new Set([topic, ...topicKws, ...contentWords(title).slice(0, 6)])]
    .filter((t) => t && t.length > 2)
    .map((t) =>
      scoreTag(t, {
        title,
        description,
        topicKeywords: topicKws,
        trendingTitles,
      })
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((t) => t.tag);

  // Preview feed: competitor videos + this video, ordered by VPH.
  const compList = channels.filter((c) => c.role === "competitor");
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
    videoId,
    title,
    channelTitle,
    channelAvatar,
    viewCount,
    vph: viewsPerHour(viewCount, publishedAt),
    publishedAt,
    duration: formatDuration(meta?.durationSeconds ?? null),
    isOwn: false,
  };
  preview = [...preview, ownEntry].sort((a, b) => b.vph - a.vph);

  return (
    <AnalysisTabs
      data={{
        video: {
          videoId,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt,
          viewCount,
          likeCount,
          commentCount,
          vph: viewsPerHour(viewCount, publishedAt),
          duration: formatDuration(meta?.durationSeconds ?? null),
          isShort: meta?.isShort ?? null,
          privacy: meta?.privacyStatus ?? null,
          titleChecks,
        },
        channelTitle,
        channelAvatar,
        description,
        descriptionSource,
        initialTags: tags,
        tagsSource,
        packId: null,
        packTopic: null,
        consistencyInitial: null,
        standalone: {
          currentTitle: title,
          consistency: suggestion.consistency,
          alternatives: suggestion.alternatives,
        },
        thumbSource: "generated",
        external: true,
        backHref: safeBackHref(searchParams.from),
        thumbScore,
        thumbConcepts,
        topicKeywords: topicKws,
        trendingTitles,
        trendingAvailable: trendingTitles.length > 0,
        packTags: tagCandidates,
        preview,
        generateTopic: topic,
      }}
    />
  );
}
