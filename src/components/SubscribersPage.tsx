"use client";

// /subscribers — vidIQ-style Subscribers, wired to Nizafa's real data.
// - Best time to post: a REAL day × daypart heatmap from the own channel's
//   upload history (UTC), plus the top proven slots. FREE in Nizafa —
//   vidIQ's "Unlock with Boost" lock is NOT copied.
// - Trending videos / Top channels: Nizafa cannot see what a user's
//   subscribers watch (no such API data), so these show trending videos
//   among the user's own + tracked competitor channels and the top channels
//   in the niche — labelled honestly as such, never as subscriber data.
import { Fragment, useMemo, useState } from "react";
import { fmtViews, thumbUrl, timeAgo } from "@/lib/seo-checklist";

export type SubscriberVideoItem = {
  videoId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  viewCount: number;
  vph: number;
  ratio: number;
  channelId: number;
  channelTitle: string;
  isOwn: boolean;
};

export type SubscriberChannelItem = {
  id: number;
  title: string;
  url: string;
  avatarUrl: string | null;
  subs: number | null;
  videoCount: number | null;
  totalViews: number;
  avgViews: number;
  topVideo: { title: string; views: number } | null;
  isOwn: boolean;
};

type Tab = "videos" | "channels";
type Sort = "vph" | "views" | "outlier" | "recent";

export default function SubscribersPage({
  ownTitle,
  videoCount,
  heatmap,
  dayNames,
  dayparts,
  bestSlots,
  trending,
  topChannels,
}: {
  ownTitle: string;
  videoCount: number;
  heatmap: number[][];
  dayNames: string[];
  dayparts: Array<{ label: string; short: string }>;
  bestSlots: Array<{ day: string; hour: number; count: number; label: string }>;
  trending: SubscriberVideoItem[];
  topChannels: SubscriberChannelItem[];
}) {
  const [tab, setTab] = useState<Tab>("videos");
  const [sort, setSort] = useState<Sort>("vph");

  const maxCell = Math.max(0, ...heatmap.flat());
  const totalUploads = heatmap.flat().reduce((a, b) => a + b, 0);

  const sortedVideos = useMemo(() => {
    const list = [...trending];
    if (sort === "views") list.sort((a, b) => b.viewCount - a.viewCount);
    else if (sort === "vph") list.sort((a, b) => b.vph - a.vph);
    else if (sort === "outlier") list.sort((a, b) => b.ratio - a.ratio);
    else {
      list.sort((a, b) => {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [trending, sort]);

  return (
    <div className="subs-wrap">
      {/* Best time to post — real heatmap, free. */}
      <section className="section">
        <h2>Best time to post</h2>
        <div className="card">
          {totalUploads === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              No upload history loaded yet for “{ownTitle}”. Once videos are
              loaded, this heatmap shows the days and times you actually
              published — your proven windows, not a generic chart.
            </p>
          ) : (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                When “{ownTitle}” published its {videoCount} loaded videos
                (UTC). Darker = more uploads in that slot.
              </p>
              <div className="subs-heatmap" role="table" aria-label="Uploads by day and time">
                <div className="subs-heat-head" role="columnheader" aria-label="Day" />
                {dayparts.map((p) => (
                  <div key={p.label} className="subs-heat-head" role="columnheader" title={p.label}>
                    {p.short}
                  </div>
                ))}
                {dayNames.map((day, di) => (
                  <Fragment key={day}>
                    <div className="subs-heat-day" role="rowheader">
                      {day.slice(0, 3)}
                    </div>
                    {heatmap[di].map((count, pi) => (
                      <div
                        key={`${day}-${pi}`}
                        role="cell"
                        className={
                          "subs-heat-cell" +
                          (count > 0 && count === maxCell ? " hot" : count > 0 ? " warm" : "")
                        }
                        title={`${day} ${dayparts[pi].label}: ${count} upload${count === 1 ? "" : "s"}`}
                      >
                        {count || ""}
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
              {bestSlots.length > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <strong>Your best windows</strong>
                  <ol style={{ margin: "6px 0 0", paddingInlineStart: 20 }}>
                    {bestSlots.map((s) => (
                      <li key={s.day} style={{ marginBottom: 6 }}>
                        <strong>{s.label}</strong>
                        <div className="small muted">
                          {s.hour}:00–{s.hour + 1}:00 UTC was your most-used hour that day.
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <p className="small muted" style={{ margin: "12px 0 0" }}>
                Times are in UTC, as stored by YouTube. Posting near your
                proven windows usually performs best — and in Nizafa this is
                free on every plan.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Trending in the niche + top channels. */}
      <section className="section">
        <div className="opt-tabs" role="tablist" aria-label="Subscriber ecosystem">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "videos"}
            className={`opt-tab ${tab === "videos" ? "active" : ""}`}
            onClick={() => setTab("videos")}
          >
            Top videos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "channels"}
            className={`opt-tab ${tab === "channels" ? "active" : ""}`}
            onClick={() => setTab("channels")}
          >
            Top channels
          </button>
        </div>

        {tab === "videos" ? (
          <>
            <h2 style={{ marginTop: 16 }}>Trending videos in your niche &amp; competitors</h2>
            <p className="small muted">
              YouTube doesn&apos;t share what your subscribers watch, so this
              shows what&apos;s trending among the channels you track and your
              own channel instead — ranked by views per hour.
            </p>
            <div className="comp-selects">
              <label className="comp-select-label">
                <span className="muted">Sort by:</span>
                <select
                  className="select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Sort by"
                >
                  <option value="vph">Views per hour</option>
                  <option value="views">Views</option>
                  <option value="outlier">Outlier score</option>
                  <option value="recent">Most recent</option>
                </select>
              </label>
            </div>
            {sortedVideos.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>
                No videos loaded yet — connect a channel and add competitors
                to see what&apos;s trending around you.
              </p>
            ) : (
              <div className="comp-video-list">
                {sortedVideos.map((v) => (
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
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 16 }}>Top channels in your niche</h2>
            <p className="small muted">
              The channels you track, ranked by subscribers. YouTube
              doesn&apos;t share which channels your subscribers follow, so
              this shows your tracked competitors and your own channel
              instead.
            </p>
            {topChannels.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>
                No channels tracked yet — add competitors to compare them here.
              </p>
            ) : (
              <div className="subs-channel-list">
                {topChannels.map((c) => (
                  <div key={c.id} className="card res-channel-card">
                    <div className="res-channel-head">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" width={48} height={48} className="res-channel-avatar" />
                      ) : (
                        <span className="res-channel-avatar res-channel-avatar-fallback" aria-hidden="true">
                          {(c.title || "?").slice(0, 1)}
                        </span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 700 }}>
                          {c.title}
                        </a>
                        {c.isOwn ? <span className="badge badge-teal" style={{ marginInlineStart: 8 }}>You</span> : null}
                        <div className="small muted">
                          {c.subs === null ? "—" : fmtViews(c.subs)} subscribers
                        </div>
                      </div>
                    </div>
                    <div className="res-channel-stats">
                      <span>{c.videoCount === null ? "—" : fmtViews(c.videoCount)} videos</span>
                      <span>{fmtViews(c.totalViews)} total views</span>
                      <span>{fmtViews(c.avgViews)} avg views / video</span>
                    </div>
                    {c.topVideo ? (
                      <p className="small" style={{ marginBottom: 0 }}>
                        Top video: <strong>{c.topVideo.title}</strong>{" "}
                        <span className="muted">({fmtViews(c.topVideo.views)} views)</span>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
