// Latest video card — the channel's newest video with its real stats.
// Thumbnail URL is derived from the video ID (YouTube's own thumbnail
// host). Performance compares this video's views/hour with the channel
// median — no invented benchmarks. Clicks open the in-app Analysis,
// never YouTube.
import Link from "next/link";
import { analysisHref } from "@/lib/video-links";

export type LatestVideoData = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  viewCount: number | null;
  likeCount: number | null;
  vph: number;
  medianVph: number;
  rankLabel: string;
  /** True when the video belongs to the user's own channel. */
  isOwn: boolean;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function LatestVideoCard({ video }: { video: LatestVideoData }) {
  const pct =
    video.medianVph > 0
      ? Math.round(((video.vph - video.medianVph) / video.medianVph) * 100)
      : 0;
  const band =
    pct >= 20 ? "Overperforming" : pct <= -20 ? "Underperforming" : "Average";
  // Slider position: -100% → 0, 0% → 50, +100% → 100 (clamped).
  const pos = Math.max(4, Math.min(96, 50 + pct / 2));
  const thumb = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Latest Video</h2>
          <div className="small muted">{timeAgo(video.publishedAt)}</div>
        </div>
        <span className="badge badge-teal">{band}</span>
      </div>
      <Link href={analysisHref(video.videoId, video.isOwn)} aria-label={video.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={video.title}
          className="thumb-lg"
          loading="lazy"
        />
      </Link>
      <Link
        href={analysisHref(video.videoId, video.isOwn)}
        style={{ color: "var(--ink)", fontWeight: 700, display: "block", marginTop: 10 }}
      >
        {video.title}
      </Link>
      <div className="perf-grid">
        <div>
          <div className="stat-label">Performance</div>
          <strong>
            {pct >= 0 ? "+" : ""}
            {pct}%
          </strong>
        </div>
        <div>
          <div className="stat-label">Views</div>
          <strong>{(video.viewCount ?? 0).toLocaleString()}</strong>
        </div>
        <div>
          <div className="stat-label">Ranking</div>
          <strong>{video.rankLabel}</strong>
        </div>
      </div>
      <div className="perf-track" aria-label={`Performance: ${band}`}>
        <span className="perf-dot" style={{ left: `${pos}%` }} />
      </div>
      <div className="perf-labels">
        <span>Underperforming</span>
        <span>Average</span>
        <span>Overperforming</span>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {video.vph}/h since publish · channel median {video.medianVph}/h ·{" "}
        {(video.likeCount ?? 0).toLocaleString()} likes
      </p>
    </div>
  );
}
