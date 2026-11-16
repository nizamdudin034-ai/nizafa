"use client";

// /research — vidIQ-style Research, wired to Nizafa's real data.
// - Keywords mode: rising keywords from stored Google Trends snapshots
//   (volume + growth vs the previous snapshot), topic + language filters,
//   checkbox save (saved on this device), keyword ideas + top videos from
//   the existing /api/research search (cached 24h, no quota per keystroke).
// - Videos / Shorts / Thumbnails modes: outlier videos across the user's
//   own + competitor channels — ratio = views vs that channel's own
//   saved-video average; Shorts classification from batched video
//   metadata (cached 6h) with a #shorts title fallback.
// - Channels mode: real channel summaries from the channels table.
// - Filters (subscribers + views-per-hour ranges) and Sort are FREE —
//   Nizafa has no Boost-style paywall here.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { KeywordIdea } from "@/lib/generator";
import { fmtViews, thumbUrl, timeAgo } from "@/lib/seo-checklist";
import { analysisHref } from "@/lib/video-links";

type Tab = "keywords" | "videos" | "shorts" | "channels" | "thumbnails";
type Period = "today" | "week" | "month";
type Sort = "best" | "recent" | "views" | "outlier";

type FeedVideo = {
  videoId: string;
  title: string;
  url: string;
  viewCount: number;
  publishedAt: string | null;
  ratio: number;
  vph: number;
  isShort: boolean | null;
  durationSeconds: number | null;
  isOwn: boolean;
  channel: { id: number; title: string; avatarUrl: string | null; subs: number | null };
};

type FeedChannel = {
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

type RisingKeyword = {
  title: string;
  geo: string;
  traffic: string;
  volume: number | null;
  growthPct: number | null;
  isNew: boolean;
  newsTitle?: string;
  newsSource?: string;
};

type FeedResponse = {
  feed: FeedVideo[];
  channels: FeedChannel[];
  topics: string[];
  keywords: Record<Period, RisingKeyword[]>;
  meta: { videoCount: number; channelCount: number; shortsUnknown: number };
  note?: string;
};

type ResearchResult = {
  query: string;
  keywordIdeas: KeywordIdea[];
  searchResults: Array<{ videoId: string; title: string; channelTitle: string }>;
  searchCached: boolean;
  searchAvailable: boolean;
  note?: string;
};

const TABS: Array<{ id: Tab; label: string; placeholder: string }> = [
  { id: "keywords", label: "Keywords", placeholder: "Search keywords…" },
  { id: "videos", label: "Videos", placeholder: "Find an outlier video…" },
  { id: "shorts", label: "Shorts", placeholder: "Discover a viral short…" },
  { id: "channels", label: "Channels", placeholder: "Find a channel…" },
  { id: "thumbnails", label: "Thumbnails", placeholder: "Find a thumbnail…" },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "best", label: "Best match" },
  { id: "recent", label: "Most recent" },
  { id: "views", label: "Highest views" },
  { id: "outlier", label: "Highest outlier score" },
];

const SAVED_KEY = "nizafa-saved-keywords";

function isUrdu(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function fmtDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function badgeClass(ratio: number): string {
  if (ratio >= 10) return "res-badge res-badge-red";
  if (ratio >= 3) return "res-badge res-badge-blue";
  return "res-badge res-badge-violet";
}

function badgeLabel(ratio: number): string {
  return ratio >= 100 ? ">100x" : `${ratio}x`;
}

function loadSaved(): RisingKeyword[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const parsed = raw ? (JSON.parse(raw) as RisingKeyword[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ResearchPage() {
  const [tab, setTab] = useState<Tab>("videos");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [kw, setKw] = useState<ResearchResult | null>(null);
  const [kwLoading, setKwLoading] = useState(false);
  const [kwError, setKwError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [period, setPeriod] = useState<Period>("today");
  const [topic, setTopic] = useState("all");
  const [lang, setLang] = useState<"all" | "en" | "ur">("all");
  const [savedView, setSavedView] = useState<"rising" | "saved">("rising");
  const [saved, setSaved] = useState<RisingKeyword[]>(loadSaved);
  const [sheet, setSheet] = useState<null | "filters" | "sort">(null);
  const [sort, setSort] = useState<Sort>("best");
  const [filters, setFilters] = useState({
    channelId: "",
    subsMin: "",
    subsMax: "",
    vphMin: "",
    vphMax: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/research/feed")
      .then(async (r) => {
        const d = (await r.json()) as FeedResponse & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Research feed failed.");
        setFeed(d);
      })
      .catch((err) => setFeedError(err instanceof Error ? err.message : "Research feed failed."))
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(q.trim()), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  // Keyword ideas + top videos (existing /api/research, cached 24h).
  useEffect(() => {
    if (tab !== "keywords" || debounced.length < 2) {
      setKw(null);
      setKwError(null);
      return;
    }
    setKwLoading(true);
    setKwError(null);
    const params = new URLSearchParams({ q: debounced });
    if (channelId) params.set("channelId", channelId);
    fetch(`/api/research?${params.toString()}`)
      .then(async (res) => {
        const d = (await res.json()) as ResearchResult & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Research failed.");
        setKw(d);
      })
      .catch((err) => setKwError(err instanceof Error ? err.message : "Research failed."))
      .finally(() => setKwLoading(false));
  }, [debounced, channelId, tab]);

  const ownChannels = useMemo(
    () => (feed?.channels ?? []).filter((c) => c.role === "own"),
    [feed]
  );

  function toggleSaved(kwItem: RisingKeyword) {
    setSaved((prev) => {
      const key = `${kwItem.geo}::${kwItem.title.toLowerCase()}`;
      const exists = prev.some(
        (s) => `${s.geo}::${s.title.toLowerCase()}` === key
      );
      const next = exists
        ? prev.filter((s) => `${s.geo}::${s.title.toLowerCase()}` !== key)
        : [...prev, kwItem];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        // Saving is a bonus; the list still works in memory.
      }
      return next;
    });
  }

  const isSaved = (k: RisingKeyword) =>
    saved.some((s) => `${s.geo}::${s.title.toLowerCase()}` === `${k.geo}::${k.title.toLowerCase()}`);

  // ── Keywords mode rows ──────────────────────────────────────────────
  const keywordRows = useMemo(() => {
    const base = savedView === "saved" ? saved : (feed?.keywords[period] ?? []);
    const needle = q.trim().toLowerCase();
    return base.filter((k) => {
      if (topic !== "all" && !k.title.toLowerCase().includes(topic.toLowerCase())) return false;
      if (lang === "en" && isUrdu(k.title)) return false;
      if (lang === "ur" && !isUrdu(k.title)) return false;
      if (needle && !k.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [savedView, saved, feed, period, topic, lang, q]);

  // ── Video feed: tab + search + filters + sort ───────────────────────
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.channelId) n += 1;
    if (filters.subsMin || filters.subsMax) n += 1;
    if (filters.vphMin || filters.vphMax) n += 1;
    return n;
  }, [filters]);

  const feedVideos = useMemo(() => {
    const all = feed?.feed ?? [];
    const needle = q.trim().toLowerCase();
    const subsMin = filters.subsMin ? Number(filters.subsMin) : null;
    const subsMax = filters.subsMax ? Number(filters.subsMax) : null;
    const vphMin = filters.vphMin ? Number(filters.vphMin) : null;
    const vphMax = filters.vphMax ? Number(filters.vphMax) : null;
    const list = all.filter((v) => {
      if (tab === "videos" && v.isShort === true) return false;
      if (tab === "shorts" && v.isShort !== true) return false;
      if (filters.channelId && v.channel.id !== Number(filters.channelId)) return false;
      if (subsMin !== null && (v.channel.subs ?? 0) < subsMin) return false;
      if (subsMax !== null && (v.channel.subs ?? Infinity) > subsMax) return false;
      if (vphMin !== null && v.vph < vphMin) return false;
      if (vphMax !== null && v.vph > vphMax) return false;
      if (needle && !`${v.title} ${v.channel.title}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "recent") {
      sorted.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    } else if (sort === "views") {
      sorted.sort((a, b) => b.viewCount - a.viewCount);
    } else if (sort === "outlier") {
      sorted.sort((a, b) => b.ratio - a.ratio);
    } else {
      // Best match: title matches first, then highest outlier ratio.
      sorted.sort((a, b) => {
        const am = needle ? (a.title.toLowerCase().includes(needle) ? 0 : 1) : 0;
        const bm = needle ? (b.title.toLowerCase().includes(needle) ? 0 : 1) : 0;
        return am - bm || b.ratio - a.ratio;
      });
    }
    return sorted;
  }, [feed, tab, q, filters, sort]);

  const channelList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (feed?.channels ?? []).filter(
      (c) => !needle || c.title.toLowerCase().includes(needle)
    );
  }, [feed, q]);

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];
  const sortLabel = SORTS.find((s) => s.id === sort)?.label ?? "Best match";

  function viewOutliers(channel: FeedChannel) {
    setFilters((f) => ({ ...f, channelId: String(channel.id) }));
    setTab("videos");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="res-wrap">
      <h1 className="res-title">Research</h1>

      <div className="res-search">
        <span aria-hidden="true">⌕</span>
        <input
          className="input res-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={activeTab.placeholder}
          aria-label="Search research"
          maxLength={200}
        />
        {q ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQ("")} aria-label="Clear search">
            ✕
          </button>
        ) : null}
      </div>

      <div className="res-tabs" role="tablist" aria-label="Research sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`res-tab${tab === t.id ? " res-tab-active" : ""}`}
            onClick={() => {
              setTab(t.id);
              setSheet(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {feedLoading ? <p className="muted" style={{ marginTop: 16 }}>Loading research…</p> : null}
      {feedError ? <div className="error" style={{ marginTop: 16 }}>{feedError}</div> : null}
      {feed?.note ? <div className="notice" style={{ marginTop: 16 }}>{feed.note}</div> : null}

      {feed && !feedLoading ? (
        <>
          {tab === "keywords" ? (
            <div style={{ marginTop: 16 }}>
              <div className="res-pills">
                <button
                  type="button"
                  className={`res-pill${savedView === "rising" ? " res-pill-active" : ""}`}
                  onClick={() => setSavedView("rising")}
                >
                  ↗ Rising Keywords
                </button>
                <button
                  type="button"
                  className={`res-pill${savedView === "saved" ? " res-pill-active" : ""}`}
                  onClick={() => setSavedView("saved")}
                >
                  ♡ Saved{saved.length > 0 ? ` (${saved.length})` : ""}
                </button>
              </div>

              {savedView === "rising" ? (
                <>
                  <div className="res-period" role="group" aria-label="Keyword period">
                    {(["today", "week", "month"] as Period[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`res-period-btn${period === p ? " res-period-btn-active" : ""}`}
                        onClick={() => setPeriod(p)}
                      >
                        {p === "today" ? "Today" : p === "week" ? "This week" : "This month"}
                      </button>
                    ))}
                  </div>
                  <div className="res-kw-filters">
                    <select
                      className="select input"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      aria-label="Topic filter"
                    >
                      <option value="all">Topics: All</option>
                      {(feed.topics ?? []).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      className="select input"
                      value={lang}
                      onChange={(e) => setLang(e.target.value as "all" | "en" | "ur")}
                      aria-label="Language filter"
                    >
                      <option value="all">Language: All</option>
                      <option value="en">English</option>
                      <option value="ur">اردو</option>
                    </select>
                  </div>
                </>
              ) : null}

              {keywordRows.length === 0 ? (
                <div style={{ marginTop: 16 }}>
                  <EmptyState
                    title={savedView === "saved" ? "No saved keywords yet" : "No rising keywords"}
                    body={
                      savedView === "saved"
                        ? "Tick the box next to a rising keyword to save it here."
                        : "Rising keywords appear once the daily trends snapshot has run."
                    }
                  />
                </div>
              ) : (
                <div className="card res-kw-card">
                  {keywordRows.map((k) => (
                    <div key={`${k.geo}-${k.title}`} className="res-kw-row">
                      <input
                        type="checkbox"
                        checked={isSaved(k)}
                        onChange={() => toggleSaved(k)}
                        aria-label={`Save keyword ${k.title}`}
                        className="res-kw-check"
                      />
                      <button
                        type="button"
                        className="res-kw-title"
                        onClick={() => setQ(k.title)}
                        title={`Search “${k.title}”`}
                      >
                        {k.title}
                        {k.newsTitle ? (
                          <span className="small muted res-kw-news">{k.newsTitle}</span>
                        ) : null}
                      </button>
                      <span className="res-kw-stats">
                        <span className="res-kw-vol">{k.volume != null ? fmtViews(k.volume) : "—"}</span>
                        {k.isNew ? (
                          <span className="badge badge-teal">New</span>
                        ) : k.growthPct != null ? (
                          <span className={k.growthPct >= 0 ? "res-kw-growth-up" : "res-kw-growth-down"}>
                            {k.growthPct >= 0 ? "↗" : "↘"} {Math.abs(k.growthPct).toLocaleString()}%
                          </span>
                        ) : null}
                        <span className="small muted">{k.geo}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="small muted" style={{ marginTop: 10 }}>
                Volume is the Google Trends search volume from the snapshot;
                growth is the change vs the previous snapshot for the same
                keyword and region. Saved keywords stay on this device.
              </p>

              {ownChannels.length > 1 ? (
                <div className="card" style={{ marginTop: 16 }}>
                  <label className="label" htmlFor="kw-channel">Outliers for channel</label>
                  <select
                    id="kw-channel"
                    className="select input"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  >
                    <option value="">First connected channel</option>
                    {ownChannels.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.title}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {kwLoading ? <p className="muted" style={{ marginTop: 16 }}>Researching…</p> : null}
              {kwError ? <div className="error" style={{ marginTop: 16 }}>{kwError}</div> : null}
              {kw ? (
                <div style={{ marginTop: 24 }}>
                  <div className="grid grid-2">
                    <div className="card">
                      <SectionTitle title="Keyword ideas" sub={`For “${kw.query}”`} />
                      {kw.keywordIdeas.map((k) => (
                        <div key={k.keyword} className="list-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{k.keyword}</div>
                            <div className="small muted">{k.angle}</div>
                          </div>
                          <CopyButton text={k.keyword} />
                        </div>
                      ))}
                    </div>
                    <div className="card">
                      <SectionTitle
                        title="Top videos for this phrase"
                        sub={
                          kw.searchCached
                            ? "From cache (24h) — no quota spent."
                            : kw.searchAvailable
                              ? "Live YouTube search, now cached for 24h."
                              : "YouTube search is not configured on the server."
                        }
                      />
                      {kw.searchResults.length === 0 ? (
                        <EmptyState
                          title="No videos found"
                          body="Try a broader phrase, or check that the YouTube API key is set on the server."
                        />
                      ) : (
                        kw.searchResults.map((v) => (
                          <div key={v.videoId} className="list-row">
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Link
                                href={analysisHref(v.videoId, false)}
                                style={{ fontWeight: 700, overflowWrap: "anywhere" }}
                              >
                                {v.title}
                              </Link>
                              <div className="small muted">{v.channelTitle}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : tab === "channels" ? (
            <div style={{ marginTop: 16 }}>
              {channelList.length === 0 ? (
                <EmptyState
                  title="No channels yet"
                  body="Connect your channel from Home, or add competitor channels on the Optimize page, to research them here."
                />
              ) : (
                channelList.map((c) => (
                  <div key={c.id} className="card res-channel-card">
                    <div className="res-channel-head">
                      {c.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.avatarUrl} alt="" width={48} height={48} className="res-channel-avatar" />
                      ) : (
                        <span className="res-channel-avatar res-channel-avatar-fallback">
                          {c.title.slice(0, 1)}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, overflowWrap: "anywhere" }}>{c.title}</div>
                        <div className="small muted">
                          {c.subs != null ? `${fmtViews(c.subs)} subscribers` : "Subscribers unknown"}
                          {c.role === "own" ? " · Your channel" : " · Competitor"}
                        </div>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => viewOutliers(c)}>
                        View outliers →
                      </button>
                    </div>
                    <div className="res-channel-stats">
                      <span><strong>{c.videoCount}</strong> saved videos</span>
                      <span><strong>{fmtViews(c.totalViews)}</strong> total views</span>
                      <span><strong>{fmtViews(c.avgViews)}</strong> avg / video</span>
                      <span><strong>{c.outlierCount}</strong> outliers ≥1.5×</span>
                    </div>
                    {c.topVideo ? (
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Top video: “{c.topVideo.title}” ({fmtViews(c.topVideo.views)} views)
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="res-toolbar">
                <span className="small muted">
                  {feedVideos.length} video{feedVideos.length === 1 ? "" : "s"} · ratio vs each
                  channel&apos;s own average (saved videos)
                </span>
                <span className="res-toolbar-btns">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet("filters")}>
                    ⫯ Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet("sort")} aria-label="Sort by">
                    ↕ {sortLabel}
                  </button>
                </span>
              </div>

              {tab === "shorts" && feed.meta.shortsUnknown > 0 ? (
                <p className="small muted">
                  Durations could not be loaded for {feed.meta.shortsUnknown} video
                  {feed.meta.shortsUnknown === 1 ? "" : "s"} — those are listed
                  under Videos, not here.
                </p>
              ) : null}

              {feedVideos.length === 0 ? (
                <EmptyState
                  title={tab === "shorts" ? "No Shorts found" : "No videos found"}
                  body={
                    feed.feed.length === 0
                      ? "No videos saved yet — connect your channel from Home, or add competitor channels on the Optimize page."
                      : "Nothing matches the current search or filters — try clearing them."
                  }
                />
              ) : tab === "shorts" ? (
                <div className="res-shorts-grid">
                  {feedVideos.map((v) => (
                    <Link key={v.videoId} href={analysisHref(v.videoId, v.isOwn)} className="res-short-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbUrl(v.videoId, "hq")} alt="" loading="lazy" className="res-short-thumb" />
                      {v.ratio >= 1.5 ? (
                        <span className={badgeClass(v.ratio)}>{badgeLabel(v.ratio)}</span>
                      ) : null}
                      {v.durationSeconds != null ? (
                        <span className="res-duration">{fmtDuration(v.durationSeconds)}</span>
                      ) : null}
                      <span className="res-short-meta">
                        <span className="res-short-title">{v.title}</span>
                        <span className="small">
                          {fmtViews(v.viewCount)} views · {timeAgo(v.publishedAt)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="res-video-list">
                  {feedVideos.map((v) => (
                    <article key={v.videoId} className="res-video-card">
                      <Link href={analysisHref(v.videoId, v.isOwn)} className="res-video-thumb-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbUrl(v.videoId, "hq")} alt="" loading="lazy" className="res-video-thumb" />
                        {v.ratio >= 1.5 ? (
                          <span className={badgeClass(v.ratio)}>{badgeLabel(v.ratio)}</span>
                        ) : null}
                      </Link>
                      <Link href={analysisHref(v.videoId, v.isOwn)} className="res-video-title">
                        {v.title}
                      </Link>
                      <p className="small muted" style={{ margin: "4px 0 0" }}>
                        {v.channel.title}
                        {v.channel.subs != null ? ` · ${fmtViews(v.channel.subs)} subscribers` : ""}
                      </p>
                      <p className="small muted" style={{ margin: "2px 0 0" }}>
                        {fmtViews(v.viewCount)} views · {timeAgo(v.publishedAt)}
                        {v.ratio >= 1.5 ? ` · ${badgeLabel(v.ratio)} vs channel average` : ""}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      {sheet ? (
        <div className="res-sheet-backdrop" onClick={() => setSheet(null)}>
          <div
            className="res-sheet"
            role="dialog"
            aria-label={sheet === "filters" ? "Filters" : "Sort by"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="res-sheet-grip" aria-hidden="true" />
            {sheet === "filters" ? (
              <>
                <h2 className="res-sheet-title">Filters</h2>
                <p className="small muted" style={{ marginTop: 0 }}>
                  All filters are free in Nizafa.
                </p>
                <label className="label" htmlFor="res-filter-channel">Channel</label>
                <select
                  id="res-filter-channel"
                  className="select input"
                  value={filters.channelId}
                  onChange={(e) => setFilters((f) => ({ ...f, channelId: e.target.value }))}
                >
                  <option value="">All channels</option>
                  {(feed?.channels ?? []).map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.title}</option>
                  ))}
                </select>

                <div className="res-filter-group">
                  <div className="res-filter-head">
                    <label className="label" style={{ marginBottom: 0 }}>Subscribers</label>
                    <button
                      type="button"
                      className="link-btn small"
                      onClick={() => setFilters((f) => ({ ...f, subsMin: "", subsMax: "" }))}
                    >
                      Reset
                    </button>
                  </div>
                  <p className="small muted">Range (0–10M+)</p>
                  <div className="res-range-row">
                    <input
                      type="number"
                      min={0}
                      className="input"
                      placeholder="Min"
                      value={filters.subsMin}
                      onChange={(e) => setFilters((f) => ({ ...f, subsMin: e.target.value }))}
                      aria-label="Minimum subscribers"
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      placeholder="Max"
                      value={filters.subsMax}
                      onChange={(e) => setFilters((f) => ({ ...f, subsMax: e.target.value }))}
                      aria-label="Maximum subscribers"
                    />
                  </div>
                </div>

                <div className="res-filter-group">
                  <div className="res-filter-head">
                    <label className="label" style={{ marginBottom: 0 }}>Views Per Hour</label>
                    <button
                      type="button"
                      className="link-btn small"
                      onClick={() => setFilters((f) => ({ ...f, vphMin: "", vphMax: "" }))}
                    >
                      Reset
                    </button>
                  </div>
                  <p className="small muted">Range (0–1000+)</p>
                  <div className="res-range-row">
                    <input
                      type="number"
                      min={0}
                      className="input"
                      placeholder="Min"
                      value={filters.vphMin}
                      onChange={(e) => setFilters((f) => ({ ...f, vphMin: e.target.value }))}
                      aria-label="Minimum views per hour"
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      placeholder="Max"
                      value={filters.vphMax}
                      onChange={(e) => setFilters((f) => ({ ...f, vphMax: e.target.value }))}
                      aria-label="Maximum views per hour"
                    />
                  </div>
                </div>

                <div className="res-sheet-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setFilters({ channelId: "", subsMin: "", subsMax: "", vphMin: "", vphMax: "" });
                    }}
                  >
                    Reset all
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setSheet(null)}>
                    Show results
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="res-sheet-title">Sort by</h2>
                {SORTS.map((s) => (
                  <label key={s.id} className="res-sort-option">
                    <input
                      type="radio"
                      name="res-sort"
                      checked={sort === s.id}
                      onChange={() => {
                        setSort(s.id);
                        setSheet(null);
                      }}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
