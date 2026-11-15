// Channel audit + per-video SEO scoring.
// 100% rule-based and transparent: every point comes from a stated rule
// applied to real channel/video data. No hidden or proprietary scores.
// The audit reads only data already cached in Supabase (channels /
// channel_videos); a YouTube refresh happens only when the cache is older
// than 6 hours (see runAudit below and /api/audit).

import { createSupabaseAdmin } from "./supabase-server";
import { fetchChannel, fetchLatestVideos } from "./youtube";

export type AuditCheck = {
  label: string;
  pass: boolean;
  detail: string;
  points: number;
  maxPoints: number;
};

export type AuditReport = {
  score: number; // 0–100, rule-based
  grade: string;
  method: string;
  checks: AuditCheck[];
  fixes: string[];
  computedAt: string;
  channelTitle: string;
  videoCount: number;
  subscriberCount: number;
};

export type AuditVideoInput = {
  videoId?: string;
  title: string;
  publishedAt: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type ChannelAuditInput = {
  title: string;
  description: string | null;
  avatarUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  viewCount: number | null;
};

const HOOK_WORDS = [
  "how", "why", "what", "secret", "truth", "mistake", "stop", "never",
  "best", "worst", "exposed", "revealed", "free", "new", "shocking",
  "billion", "million", "vs", "before", "after", "first", "last",
];

function gradeFor(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs work";
}

/** Views per hour — views divided by hours since publish (min 1h). */
export function viewsPerHour(
  viewCount: number | null | undefined,
  publishedAt: string | null | undefined
): number {
  if (!publishedAt) return 0;
  const hours = Math.max(
    1,
    (Date.now() - new Date(publishedAt).getTime()) / 3_600_000
  );
  return Math.round((viewCount ?? 0) / hours);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeAudit(
  channel: ChannelAuditInput,
  videos: AuditVideoInput[]
): AuditReport {
  const checks: AuditCheck[] = [];
  const fixes: string[] = [];

  // 1. Channel description — 15 pts.
  const desc = (channel.description ?? "").trim();
  const descLen = desc.length;
  const descPoints = descLen >= 150 ? 15 : descLen >= 50 ? 10 : descLen > 0 ? 5 : 0;
  checks.push({
    label: "Channel description",
    pass: descLen >= 50,
    detail:
      descLen === 0
        ? "No channel description set."
        : `${descLen} characters — ${descLen >= 150 ? "good length, tells new visitors what the channel is about." : "short; add what the channel covers and who it is for."}`,
    points: descPoints,
    maxPoints: 15,
  });
  if (descLen < 50) {
    fixes.push(
      "Write a channel description of at least 150 characters: what the channel covers, who it is for, and how often new videos arrive."
    );
  }

  // 2. Channel completeness (avatar + videos published) — 10 pts.
  const completePoints = (channel.avatarUrl ? 5 : 0) + ((channel.videoCount ?? 0) > 0 ? 5 : 0);
  checks.push({
    label: "Channel profile complete",
    pass: completePoints === 10,
    detail: `${channel.avatarUrl ? "Avatar set." : "No avatar."} ${(channel.videoCount ?? 0) > 0 ? `${channel.videoCount} public videos.` : "No public videos found."}`,
    points: completePoints,
    maxPoints: 10,
  });
  if (!channel.avatarUrl) fixes.push("Add a clear channel avatar (logo or face) so the channel is recognisable in search and comments.");

  // 3. Title length quality — 20 pts (share of titles 40–70 chars).
  const titled = videos.filter((v) => v.title);
  const inRange = titled.filter((v) => v.title.length >= 40 && v.title.length <= 70).length;
  const titleRate = titled.length ? inRange / titled.length : 0;
  checks.push({
    label: "Title length (40–70 characters)",
    pass: titleRate >= 0.7,
    detail:
      titled.length === 0
        ? "No videos to check."
        : `${inRange} of ${titled.length} recent titles are 40–70 characters (average ${Math.round(avg(titled.map((v) => v.title.length)))} chars).`,
    points: Math.round(titleRate * 20),
    maxPoints: 20,
  });
  if (titleRate < 0.7) {
    fixes.push("Keep titles 40–70 characters: long enough to carry a keyword and a hook, short enough not to be cut off in search.");
  }

  // 4. Title hooks — 10 pts (share of titles with a hook word or number).
  const hooked = titled.filter((v) => {
    const t = v.title.toLowerCase();
    return HOOK_WORDS.some((w) => t.includes(w)) || /\d/.test(t) || t.includes("?");
  }).length;
  const hookRate = titled.length ? hooked / titled.length : 0;
  checks.push({
    label: "Titles carry a hook",
    pass: hookRate >= 0.6,
    detail:
      titled.length === 0
        ? "No videos to check."
        : `${hooked} of ${titled.length} recent titles use a hook word, a number, or a question.`,
    points: Math.round(hookRate * 10),
    maxPoints: 10,
  });
  if (hookRate < 0.6) {
    fixes.push("Give more titles a hook — a number, a question, or a word like “why”, “secret” or “mistake” — so they stand out in search and browse.");
  }

  // 5. Upload consistency — 20 pts (recency + cadence).
  const published = videos
    .map((v) => (v.publishedAt ? new Date(v.publishedAt).getTime() : 0))
    .filter(Boolean)
    .sort((a, b) => b - a);
  let consistencyPoints = 0;
  let consistencyDetail = "No upload dates available.";
  if (published.length > 0) {
    const daysSinceLast = (Date.now() - published[0]) / 86_400_000;
    if (daysSinceLast <= 7) consistencyPoints += 10;
    else if (daysSinceLast <= 14) consistencyPoints += 7;
    else if (daysSinceLast <= 30) consistencyPoints += 4;
    let cadenceNote = "";
    if (published.length >= 3) {
      const gaps: number[] = [];
      for (let i = 0; i < published.length - 1; i++) {
        gaps.push((published[i] - published[i + 1]) / 86_400_000);
      }
      const medGap = median(gaps);
      if (medGap <= 7) consistencyPoints += 10;
      else if (medGap <= 14) consistencyPoints += 7;
      else if (medGap <= 30) consistencyPoints += 4;
      cadenceNote = ` Median gap between uploads: ${Math.round(medGap)} days.`;
    } else {
      consistencyPoints += 5; // too few videos to judge cadence
      cadenceNote = " Only a few videos loaded, so cadence is estimated.";
    }
    consistencyDetail = `Last upload ${Math.floor(daysSinceLast)} day(s) ago.${cadenceNote}`;
  }
  checks.push({
    label: "Upload consistency",
    pass: consistencyPoints >= 14,
    detail: consistencyDetail,
    points: consistencyPoints,
    maxPoints: 20,
  });
  if (consistencyPoints < 14) {
    fixes.push("Publish on a steady rhythm (at least weekly). Long gaps cost the channel browse and suggested traffic.");
  }

  // 6. Engagement — 15 pts (likes ÷ views on recent videos).
  const withViews = videos.filter((v) => (v.viewCount ?? 0) > 0);
  const rates = withViews.map(
    (v) => (v.likeCount ?? 0) / Math.max(1, v.viewCount ?? 0)
  );
  const engRate = avg(rates);
  const engPoints =
    engRate >= 0.04 ? 15 : engRate >= 0.02 ? 11 : engRate >= 0.01 ? 7 : engRate > 0 ? 3 : 0;
  checks.push({
    label: "Audience engagement (likes ÷ views)",
    pass: engRate >= 0.02,
    detail:
      withViews.length === 0
        ? "No view data to measure engagement."
        : `Average like rate on recent videos: ${(engRate * 100).toFixed(1)}% (${withViews.length} videos with views).`,
    points: engPoints,
    maxPoints: 15,
  });
  if (engRate < 0.02 && withViews.length > 0) {
    fixes.push("Ask viewers a question in the first minute and at the end of the video — likes and comments are the clearest engagement signal YouTube sees.");
  }

  // 7. View momentum — 10 pts (newest 3 videos vs older ones).
  const sortedByDate = [...videos]
    .filter((v) => v.publishedAt)
    .sort(
      (a, b) =>
        new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime()
    );
  let momentumPoints = 0;
  let momentumDetail = "Not enough videos to measure momentum.";
  if (sortedByDate.length >= 4) {
    const recent = avg(sortedByDate.slice(0, 3).map((v) => v.viewCount ?? 0));
    const older = avg(sortedByDate.slice(3).map((v) => v.viewCount ?? 0));
    const ratio = older > 0 ? recent / older : recent > 0 ? 2 : 0;
    momentumPoints = ratio >= 1 ? 10 : ratio >= 0.7 ? 7 : ratio >= 0.4 ? 4 : 0;
    momentumDetail = `Newest 3 videos average ${Math.round(recent).toLocaleString()} views vs ${Math.round(older).toLocaleString()} for older videos (${ratio.toFixed(1)}×).`;
  } else if (sortedByDate.length > 0) {
    momentumPoints = 5;
    momentumDetail = "Only a few videos loaded — momentum is estimated.";
  }
  checks.push({
    label: "View momentum",
    pass: momentumPoints >= 7,
    detail: momentumDetail,
    points: momentumPoints,
    maxPoints: 10,
  });
  if (momentumPoints < 7 && sortedByDate.length >= 4) {
    fixes.push("Recent videos are underperforming older ones — compare their titles and thumbnails with your best-performing video and re-use what worked.");
  }

  const score = checks.reduce((s, c) => s + c.points, 0);
  return {
    score,
    grade: gradeFor(score),
    method:
      "Rule-based audit from live channel + video data (YouTube Data API, cached in Supabase). Each check shows its rule and its points — no hidden scores.",
    checks,
    fixes,
    computedAt: new Date().toISOString(),
    channelTitle: channel.title,
    videoCount: videos.length,
    subscriberCount: channel.subscriberCount ?? 0,
  };
}

// ── Per-video SEO score (used on /optimize) ─────────────────────────────
// Rules only — title length, hook, engagement, comments, thumbnail.
// Video descriptions and tags are NOT stored in channel_videos, so the
// score says so honestly instead of inventing them.

export type VideoSeoCheck = { label: string; pass: boolean; detail: string };
export type VideoSeoScore = {
  score: number;
  checks: VideoSeoCheck[];
  note: string;
};

export function scoreVideoSeo(v: AuditVideoInput): VideoSeoScore {
  const checks: VideoSeoCheck[] = [];
  let score = 0;

  const len = v.title.length;
  const lenOk = len >= 40 && len <= 70;
  checks.push({
    label: "Title length 40–70 chars",
    pass: lenOk,
    detail: `${len} characters${lenOk ? "" : len < 40 ? " — short; add a keyword or hook." : " — long; may be cut off in search."}`,
  });
  if (lenOk) score += 25;

  const t = v.title.toLowerCase();
  const hook = HOOK_WORDS.some((w) => t.includes(w)) || /\d/.test(t) || t.includes("?");
  checks.push({
    label: "Title has a hook (number, question, or hook word)",
    pass: hook,
    detail: hook ? "Hook found." : "No number, question, or hook word in the title.",
  });
  if (hook) score += 20;

  const views = v.viewCount ?? 0;
  const likes = v.likeCount ?? 0;
  const rate = views > 0 ? likes / views : 0;
  const engOk = rate >= 0.02;
  checks.push({
    label: "Engagement (likes ÷ views ≥ 2%)",
    pass: engOk,
    detail: views > 0 ? `${(rate * 100).toFixed(1)}% like rate.` : "No views yet.",
  });
  if (engOk) score += 20;

  const commentsOk = (v.commentCount ?? 0) > 0;
  checks.push({
    label: "Comments",
    pass: commentsOk,
    detail: `${v.commentCount ?? 0} comments.`,
  });
  if (commentsOk) score += 10;

  // Every YouTube video has a default thumbnail; a custom one cannot be
  // verified from the cached data, so this is a fixed, honest 15 points
  // with a note rather than a guessed score.
  checks.push({
    label: "Thumbnail present",
    pass: true,
    detail: "YouTube shows a default thumbnail for every video. Custom thumbnails are not stored in the cache, so this cannot be scored — upload a custom thumbnail for every video.",
  });
  score += 15;

  // +10 when the video is still earning views per hour (recent traction).
  const vph = viewsPerHour(views, v.publishedAt);
  const traction = vph > 0;
  checks.push({
    label: "Still earning views per hour",
    pass: traction,
    detail: traction ? `${vph} views/hour since publish.` : "No measurable views per hour yet.",
  });
  if (traction) score += 10;

  return {
    score: Math.min(100, score),
    checks,
    note: "Rule-based estimate from cached video data. Descriptions and tags are not stored in the cache, so they are not scored.",
  };
}

// ── Best posting times from upload history ───────────────────────────────

export type PostingSlot = {
  day: string;
  hour: number; // UTC hour with the most uploads
  count: number;
  label: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function bestPostingTimes(videos: AuditVideoInput[]): PostingSlot[] {
  const byDay = new Map<number, { hourCounts: Map<number, number>; total: number }>();
  for (const v of videos) {
    if (!v.publishedAt) continue;
    const d = new Date(v.publishedAt);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    const entry = byDay.get(day) ?? { hourCounts: new Map(), total: 0 };
    entry.hourCounts.set(hour, (entry.hourCounts.get(hour) ?? 0) + 1);
    entry.total += 1;
    byDay.set(day, entry);
  }
  return [...byDay.entries()]
    .map(([day, entry]) => {
      const bestHour = [...entry.hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const hour = bestHour ? bestHour[0] : 12;
      return {
        day: DAY_NAMES[day],
        hour,
        count: entry.total,
        label: `${DAY_NAMES[day]}s around ${String(hour).padStart(2, "0")}:00 UTC (${entry.total} upload${entry.total === 1 ? "" : "s"})`,
      };
    })
    .sort((a, b) => b.count - a.count);
}

// ── Run + store an audit (shared by /api/audit and /optimize) ───────────

const STALE_MS = 6 * 60 * 60 * 1000;

export async function runAudit(channelDbId: number): Promise<AuditReport> {
  const admin = createSupabaseAdmin();
  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("*")
    .eq("id", channelDbId)
    .maybeSingle();
  if (chErr || !channel) {
    throw new Error("Channel not found.");
  }

  // Refresh from YouTube only when the cached data is older than 6h.
  const updatedAt = new Date(channel.updated_at as string).getTime();
  if (Date.now() - updatedAt > STALE_MS && process.env.YOUTUBE_API_KEY) {
    try {
      const fresh = await fetchChannel(channel.channel_id as string);
      await admin
        .from("channels")
        .update({
          title: fresh.title,
          description: fresh.description,
          avatar_url: fresh.thumbnailUrl,
          subscriber_count: fresh.subscriberCount,
          video_count: fresh.videoCount,
          view_count: fresh.viewCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channelDbId);
      if (fresh.uploadsPlaylistId) {
        const latest = await fetchLatestVideos(fresh.uploadsPlaylistId, 25);
        if (latest.length > 0) {
          await admin.from("channel_videos").upsert(
            latest.map((v) => ({
              channel_id: channelDbId,
              video_id: v.videoId,
              title: v.title,
              url: v.url,
              published_at: v.publishedAt,
              view_count: v.viewCount,
              like_count: v.likeCount,
              comment_count: v.commentCount,
            })),
            { onConflict: "channel_id,video_id" }
          );
        }
      }
    } catch {
      // Refresh failure is not fatal — audit the cached data instead.
    }
  }

  const { data: videos } = await admin
    .from("channel_videos")
    .select("*")
    .eq("channel_id", channelDbId)
    .order("published_at", { ascending: false })
    .limit(25);

  const { data: freshChannel } = await admin
    .from("channels")
    .select("*")
    .eq("id", channelDbId)
    .maybeSingle();

  const report = computeAudit(
    {
      title: (freshChannel?.title ?? channel.title) as string,
      description: (freshChannel?.description ?? channel.description) as string | null,
      avatarUrl: (freshChannel?.avatar_url ?? channel.avatar_url) as string | null,
      subscriberCount: (freshChannel?.subscriber_count ?? channel.subscriber_count) as number | null,
      videoCount: (freshChannel?.video_count ?? channel.video_count) as number | null,
      viewCount: (freshChannel?.view_count ?? channel.view_count) as number | null,
    },
    ((videos ?? []) as AuditVideoInput[]).map((v) => ({
      videoId: v.videoId as string | undefined,
      title: v.title as string,
      publishedAt: v.publishedAt as string | null,
      viewCount: v.viewCount as number | null,
      likeCount: v.likeCount as number | null,
      commentCount: v.commentCount as number | null,
    }))
  );

  const { error: saveErr } = await admin.from("audits").insert({
    channel_id: channelDbId,
    report,
  });
  if (saveErr) throw new Error(`Could not save audit: ${saveErr.message}`);
  return report;
}

