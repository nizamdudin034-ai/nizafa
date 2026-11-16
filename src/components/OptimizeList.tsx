// Optimize video list — mobile-app style (Videos / Shorts tabs, search,
// All / Public / Private filters, sort). Scores come from the server:
// title score from the rule-based title scorer (matched pack topic, or
// the video's own tags as the topic), thumbnail score from the saved
// pack's thumbnail concept. Videos with no pack and no tags show
// "Generate scores" instead of a made-up badge.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { thumbUrl, timeAgo, fmtViews } from "@/lib/seo-checklist";

export type OptimizeVideoItem = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  viewCount: number | null;
  vph: number;
  titleScore: number | null;
  thumbScore: number | null;
  topic: string | null;
  isShort: boolean | null;
  privacy: string | null;
  duration: string | null;
};

function chipClass(score: number): string {
  if (score >= 80) return "opt-chip chip-good";
  if (score >= 60) return "opt-chip chip-warn";
  return "opt-chip chip-bad";
}

type Tab = "videos" | "shorts";
type Privacy = "all" | "public" | "private";
type Sort = "newest" | "views" | "vph" | "title";

export default function OptimizeList({
  videos,
  metaAvailable,
}: {
  videos: OptimizeVideoItem[];
  metaAvailable: boolean;
}) {
  const [tab, setTab] = useState<Tab>("videos");
  const [query, setQuery] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const counts = useMemo(() => {
    const shorts = videos.filter((v) => v.isShort === true).length;
    return { videos: videos.length - shorts, shorts };
  }, [videos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = videos.filter((v) => {
      if (tab === "shorts" ? v.isShort !== true : v.isShort === true) return false;
      if (q && !v.title.toLowerCase().includes(q)) return false;
      if (privacy !== "all") {
        if (!v.privacy) return false;
        if (privacy === "public" && v.privacy !== "public") return false;
        if (privacy === "private" && v.privacy !== "private") return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "views") return (b.viewCount ?? 0) - (a.viewCount ?? 0);
      if (sort === "vph") return b.vph - a.vph;
      if (sort === "title") return a.title.localeCompare(b.title);
      return (
        new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
      );
    });
    return list;
  }, [videos, tab, query, privacy, sort]);

  return (
    <div>
      <div className="opt-tabs" role="tablist" aria-label="Video type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "videos"}
          className={`opt-tab ${tab === "videos" ? "active" : ""}`}
          onClick={() => setTab("videos")}
        >
          ▶ Videos <span className="opt-tab-count">{counts.videos}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shorts"}
          className={`opt-tab ${tab === "shorts" ? "active" : ""}`}
          onClick={() => setTab("shorts")}
        >
          Shorts <span className="opt-tab-count">{counts.shorts}</span>
        </button>
      </div>

      <div className="opt-search">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos…"
          aria-label="Search videos"
        />
      </div>

      <div className="opt-filter-row">
        <div className="opt-pills" role="group" aria-label="Privacy filter">
          {(["all", "public", "private"] as Privacy[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`opt-pill ${privacy === p ? "active" : ""}`}
              aria-pressed={privacy === p}
              onClick={() => setPrivacy(p)}
            >
              {p === "all" ? "All" : p === "public" ? "Public" : "Private"}
            </button>
          ))}
        </div>
        <label className="opt-sort">
          <span className="visually-hidden">Sort videos</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="views">Most views</option>
            <option value="vph">Views / hour</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </div>

      {!metaAvailable ? (
        <p className="small muted" style={{ marginTop: 12 }}>
          Durations and privacy need the YouTube API key on the server — until
          then every video is listed under Videos and Shorts cannot be split
          out.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ marginBottom: 0 }}>
            {tab === "shorts"
              ? metaAvailable
                ? "No Shorts found in the loaded videos — Shorts are videos of 60 seconds or less."
                : "Shorts cannot be detected without video durations (see the note above)."
              : query || privacy !== "all"
                ? "No videos match this search or filter."
                : "No videos loaded yet."}
          </p>
        </div>
      ) : (
        <div className="opt-list">
          {filtered.map((v) => (
            <article key={v.videoId} className="opt-card">
              <Link href={`/optimize/${v.videoId}`} aria-label={v.title}>
                <span className="opt-thumb-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl(v.videoId)}
                    alt=""
                    className="thumb-lg"
                    loading="lazy"
                  />
                  {v.duration ? (
                    <span className="opt-duration">{v.duration}</span>
                  ) : null}
                  {v.isShort ? <span className="opt-short-badge">SHORT</span> : null}
                </span>
              </Link>
              <div className="opt-score-row">
                {v.titleScore !== null || v.thumbScore !== null ? (
                  <>
                    {v.titleScore !== null ? (
                      <span className={chipClass(v.titleScore)}>
                        Title <strong>{v.titleScore}</strong>
                      </span>
                    ) : null}
                    {v.thumbScore !== null ? (
                      <span className={chipClass(v.thumbScore)}>
                        Thumbnail <strong>{v.thumbScore}</strong>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Link
                    className="btn btn-ghost btn-sm"
                    href={`/generate?topic=${encodeURIComponent(v.topic ?? v.title)}`}
                  >
                    Generate scores
                  </Link>
                )}
              </div>
              <Link
                href={`/optimize/${v.videoId}`}
                className="opt-card-title"
              >
                {v.title}
              </Link>
              <div className="opt-card-meta">
                {timeAgo(v.publishedAt)} • {fmtViews(v.viewCount)} Views
                {v.vph > 0 ? ` • ${v.vph}/h` : ""}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
