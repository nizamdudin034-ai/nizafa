"use client";

// /competitors — vidIQ-style Competitors, wired to Nizafa's real data.
// - Overview: competitor rows with growth % / subscribers gained / views
//   gained over 7/30/90 days, computed ONLY from stored channel_snapshots.
//   No earlier snapshot → "—" and "Not tracked yet", never an invented
//   baseline. Add (channel link/@handle/ID) and Remove are real; Refresh
//   re-fetches live stats and records a new snapshot.
// - Top videos: the competitors' (and optionally your own) top videos from
//   the saved channel_videos cache, with real views, VPH and outlier score
//   (views vs that channel's own saved-video average).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtViews, thumbUrl, timeAgo } from "@/lib/seo-checklist";
import type { GrowthResult } from "@/lib/channel-snapshots";

export type CompetitorItem = {
  id: number;
  title: string;
  url: string;
  avatarUrl: string | null;
  subs: number | null;
  views: number | null;
  videoCount: number | null;
  updatedAt: string;
  growth: Record<7 | 30 | 90, GrowthResult | null>;
  viewsGrowth: Record<7 | 30 | 90, GrowthResult | null>;
  snapshotCount: number;
};

export type CompetitorVideoItem = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  viewCount: number;
  vph: number;
  ratio: number;
  channelId: number;
  channelTitle: string;
  channelAvatar: string | null;
  isOwn: boolean;
};

type Tab = "overview" | "top";
type Metric = "growth" | "gained" | "views";
type Period = 7 | 30 | 90;
type TopPeriod = "week" | "month" | "all";
type Sort = "views" | "vph" | "outlier" | "recent";

function fmtPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function growthColor(pct: number): string {
  if (pct > 0) return "comp-growth-up";
  if (pct < 0) return "comp-growth-down";
  return "";
}

export default function CompetitorsPage({
  own,
  competitors,
  videos,
  owner,
  anySnapshots,
  addAction,
  removeAction,
}: {
  own: { id: number; title: string; avatarUrl: string | null } | null;
  competitors: CompetitorItem[];
  videos: CompetitorVideoItem[];
  owner: boolean;
  anySnapshots: boolean;
  addAction: (formData: FormData) => void;
  removeAction: (formData: FormData) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [metric, setMetric] = useState<Metric>("growth");
  const [period, setPeriod] = useState<Period>(30);
  const [addOpen, setAddOpen] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  // Top-videos controls.
  const [channelId, setChannelId] = useState<string>("all");
  const [topPeriod, setTopPeriod] = useState<TopPeriod>("month");
  const [includeOwn, setIncludeOwn] = useState(true);
  const [sort, setSort] = useState<Sort>("views");

  const sortedCompetitors = useMemo(() => {
    const key = (c: CompetitorItem): number | null => {
      if (metric === "growth") return c.growth[period]?.pct ?? null;
      if (metric === "gained") return c.growth[period]?.gained ?? null;
      return c.viewsGrowth[period]?.gained ?? null;
    };
    return [...competitors].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      return kb - ka;
    });
  }, [competitors, metric, period]);

  const topVideos = useMemo(() => {
    const now = Date.now();
    const cutoff =
      topPeriod === "week"
        ? now - 7 * 24 * 60 * 60 * 1000
        : topPeriod === "month"
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;
    let list = videos.filter((v) => {
      if (channelId !== "all" && v.channelId !== Number(channelId)) return false;
      if (!includeOwn && v.isOwn) return false;
      if (cutoff && (!v.publishedAt || new Date(v.publishedAt).getTime() < cutoff)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "views") return b.viewCount - a.viewCount;
      if (sort === "vph") return b.vph - a.vph;
      if (sort === "outlier") return b.ratio - a.ratio;
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });
    return list.slice(0, 30);
  }, [videos, channelId, topPeriod, includeOwn, sort]);

  async function refreshCompetitor(id: number) {
    setRefreshingId(id);
    setRefreshMsg(null);
    try {
      const r = await fetch("/api/competitors/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Refresh failed.");
      setRefreshMsg("Stats refreshed — a new snapshot was recorded for growth tracking.");
      router.refresh();
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="comp-wrap">
      <div className="opt-tabs" role="tablist" aria-label="Competitors sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "overview"}
          className={`opt-tab ${tab === "overview" ? "active" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "top"}
          className={`opt-tab ${tab === "top" ? "active" : ""}`}
          onClick={() => setTab("top")}
        >
          Top videos
        </button>
      </div>

      {tab === "overview" ? (
        <>
          <div className="comp-actions">
            <button
              type="button"
              className="btn btn-ghost comp-action-btn"
              onClick={() => {
                setAddOpen((v) => !v);
                setRemoveMode(false);
              }}
            >
              Add competitors
            </button>
            <button
              type="button"
              className={`btn btn-ghost comp-action-btn ${removeMode ? "comp-action-active" : ""}`}
              onClick={() => {
                setRemoveMode((v) => !v);
                setAddOpen(false);
              }}
              disabled={competitors.length === 0}
            >
              Remove competitors
            </button>
          </div>

          {addOpen ? (
            owner ? (
              <form action={addAction} className="card comp-add-form">
                <label htmlFor="comp-add-input" className="label">
                  Add a competitor
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    id="comp-add-input"
                    name="input"
                    className="input"
                    style={{ flex: "1 1 220px" }}
                    placeholder="Channel link, @handle or ID"
                    required
                  />
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
                <p className="small muted" style={{ margin: "10px 0 0" }}>
                  Adding a competitor records its first stats snapshot — growth
                  appears once a snapshot from before your chosen period exists.
                </p>
              </form>
            ) : (
              <p className="muted">Only the workspace owner can add competitors in this version.</p>
            )
          ) : null}

          {removeMode ? (
            <p className="small muted">
              Remove mode is on — tap <strong>Remove</strong> next to a channel to stop tracking it.
            </p>
          ) : null}
          {refreshMsg ? <p className="small" style={{ marginTop: 8 }}>{refreshMsg}</p> : null}

          <section className="section">
            <h2>Competitors performance</h2>
            <div className="comp-selects">
              <label className="comp-select-label">
                <span className="muted">Metric:</span>
                <select
                  className="select"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as Metric)}
                  aria-label="Metric"
                >
                  <option value="growth">Growth %</option>
                  <option value="gained">Subscribers gained</option>
                  <option value="views">Views gained</option>
                </select>
              </label>
              <label className="comp-select-label">
                <span className="muted">Period:</span>
                <select
                  className="select"
                  value={String(period)}
                  onChange={(e) => setPeriod(Number(e.target.value) as Period)}
                  aria-label="Period"
                >
                  <option value="7">Past 7 days</option>
                  <option value="30">Past 30 days</option>
                  <option value="90">Past 90 days</option>
                </select>
              </label>
            </div>

            {competitors.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>
                No competitors added yet. Add one above to start tracking its
                growth and top videos.
              </p>
            ) : (
              <>
                {!anySnapshots ? (
                  <p className="small muted" style={{ marginTop: 12 }}>
                    Growth tracking just started — snapshots are recorded when a
                    competitor is added or refreshed. Values will appear once a
                    snapshot from before your chosen period exists.
                  </p>
                ) : null}
                <div className="comp-list">
                  {sortedCompetitors.map((c) => {
                    const g = metric === "views" ? c.viewsGrowth[period] : c.growth[period];
                    const main =
                      metric === "growth"
                        ? g
                          ? fmtPct(g.pct)
                          : "—"
                        : g
                          ? fmtViews(g.gained)
                          : "—";
                    return (
                      <div key={c.id} className="comp-row">
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt="" width={48} height={48} className="comp-avatar" />
                        ) : (
                          <span className="comp-avatar comp-avatar-fallback" aria-hidden="true">
                            {(c.title || "?").slice(0, 1)}
                          </span>
                        )}
                        <div className="comp-row-main">
                          <a href={c.url} target="_blank" rel="noreferrer" className="comp-name">
                            {c.title}
                          </a>
                          <div className="small muted">
                            {c.subs === null ? "—" : fmtViews(c.subs)} subscribers
                          </div>
                        </div>
                        <div className="comp-growth">
                          <strong className={g ? growthColor(g.pct) : ""}>{main}</strong>
                          <div className="small muted">
                            {g
                              ? `Past ${period} days`
                              : "Not tracked yet"}
                          </div>
                        </div>
                        <span className="badge comp-gained-pill">
                          👥{" "}
                          {metric === "views"
                            ? g
                              ? `${fmtViews(g.gained)} views`
                              : "— views"
                            : g
                              ? `${fmtViews(g.gained)} subscribers`
                              : "— subscribers"}
                        </span>
                        <div className="comp-row-actions">
                          {owner ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => refreshCompetitor(c.id)}
                              disabled={refreshingId === c.id}
                            >
                              {refreshingId === c.id ? "Refreshing…" : "Refresh"}
                            </button>
                          ) : null}
                          {removeMode && owner ? (
                            <form action={removeAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <button type="submit" className="btn btn-ghost btn-sm">
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="small muted" style={{ marginTop: 12 }}>
                  Growth compares the latest snapshot with the snapshot from
                  before the period. “Refresh” fetches live stats from YouTube
                  and records a new snapshot.
                </p>
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="section">
            <h2>Top videos from your competitors</h2>
            <div className="comp-selects">
              <label className="comp-select-label">
                <span className="muted">Channels:</span>
                <select
                  className="select"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  aria-label="Channels"
                >
                  <option value="all">All</option>
                  {own ? <option value={String(own.id)}>{own.title} (yours)</option> : null}
                  {competitors.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.title}</option>
                  ))}
                </select>
              </label>
              <label className="comp-select-label">
                <span className="muted">Filter by:</span>
                <select
                  className="select"
                  value={topPeriod}
                  onChange={(e) => setTopPeriod(e.target.value as TopPeriod)}
                  aria-label="Filter by period"
                >
                  <option value="month">This Month</option>
                  <option value="week">This Week</option>
                  <option value="all">All time</option>
                </select>
              </label>
            </div>

            <label className="comp-toggle">
              <input
                type="checkbox"
                checked={includeOwn}
                onChange={(e) => setIncludeOwn(e.target.checked)}
              />
              <span>Your channel</span>
              <span className="small muted">— include your own videos in the list</span>
            </label>

            <div className="comp-selects">
              <label className="comp-select-label">
                <span className="muted">Sort by:</span>
                <select
                  className="select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Sort by"
                >
                  <option value="views">Views</option>
                  <option value="vph">Views per hour</option>
                  <option value="outlier">Outlier score</option>
                  <option value="recent">Most recent</option>
                </select>
              </label>
            </div>

            {topVideos.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>
                No videos in this range yet — add competitors, or widen the
                period filter.
              </p>
            ) : (
              <div className="comp-video-list">
                {topVideos.map((v) => (
                  <div key={v.videoId} className="comp-video-row">
                    <a href={v.url} target="_blank" rel="noreferrer" className="comp-video-thumb">
                      <img src={thumbUrl(v.videoId, "mq")} alt="" loading="lazy" />
                    </a>
                    <div className="comp-video-body">
                      <a href={v.url} target="_blank" rel="noreferrer" className="comp-video-title">
                        {v.title}
                      </a>
                      <div className="small muted">
                        {v.channelTitle}
                        {v.isOwn ? " · yours" : ""} • {timeAgo(v.publishedAt)}
                      </div>
                      <div className="comp-video-pills">
                        <span className="badge">{fmtViews(v.viewCount)} Views</span>
                        <span className="badge">{fmtViews(v.vph)} VPH</span>
                        {v.ratio >= 1.5 ? (
                          <span className="badge comp-outlier-badge">
                            {v.ratio >= 100 ? ">100x" : `${v.ratio}x`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="small muted" style={{ marginTop: 12 }}>
              Outlier score = views vs that channel&apos;s own saved-video
              average. Videos come from the saved cache (refreshed when a
              competitor is added or refreshed).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
