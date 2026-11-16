// Video Analysis — 4 tabs (Title / Thumbnail / SEO / Preview) in the
// mobile-app style. Everything shown comes from real data: the video's
// live YouTube metadata, the matched saved SEO pack, and competitor
// videos from the cache. Scores are rule-based estimates, labelled as
// such; where data does not exist the UI says so instead of a fake zero.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ConsistencyCard, { type ConsistencyInitial } from "@/components/ConsistencyCard";
import { thumbUrl, timeAgo, fmtViews } from "@/lib/seo-checklist";
import {
  recommendTags,
  scoreSeoChecklist,
  type VideoThumbnailScore,
} from "@/lib/seo-checklist";
import type { TagScore } from "@/lib/consistency";
import type { VideoSeoCheck } from "@/lib/audit";

export type PreviewEntry = {
  videoId: string;
  title: string;
  channelTitle: string;
  channelAvatar: string | null;
  viewCount: number | null;
  vph: number;
  publishedAt: string | null;
  duration: string | null;
  isOwn: boolean;
};

export type ThumbConceptView = {
  bigText: string;
  layout: string;
  imageIdea: string;
  score: number;
};

export type AnalysisData = {
  video: {
    videoId: string;
    title: string;
    url: string;
    publishedAt: string | null;
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    vph: number;
    duration: string | null;
    isShort: boolean | null;
    privacy: string | null;
    titleChecks: VideoSeoCheck[];
  };
  channelTitle: string;
  channelAvatar: string | null;
  description: string;
  descriptionSource: "live" | "pack" | "none";
  initialTags: string[];
  tagsSource: "live" | "pack" | "none";
  packId: number | null;
  packTopic: string | null;
  consistencyInitial: ConsistencyInitial | null;
  thumbScore: VideoThumbnailScore | null;
  thumbConcepts: ThumbConceptView[];
  topicKeywords: string[];
  trendingTitles: string[];
  trendingAvailable: boolean;
  packTags: string[];
  preview: PreviewEntry[];
  generateTopic: string;
};

type Tab = "title" | "thumbnail" | "seo" | "preview";

function scoreColor(score: number): string {
  if (score >= 80) return "var(--teal-600)";
  if (score >= 60) return "#b45309";
  return "#b91c1c";
}

export default function AnalysisTabs({ data }: { data: AnalysisData }) {
  const [tab, setTab] = useState<Tab>("title");
  const [tags, setTags] = useState<string[]>(data.initialTags);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [tagMsg, setTagMsg] = useState<string | null>(null);
  const [tagErr, setTagErr] = useState<string | null>(null);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [conceptIdx, setConceptIdx] = useState(0);

  const checklist = useMemo(
    () =>
      scoreSeoChecklist({
        title: data.video.title,
        description: data.description,
        tags,
        topicKeywords: data.topicKeywords,
        trendingTitles: data.trendingTitles,
        trendingAvailable: data.trendingAvailable,
      }),
    [data, tags]
  );

  const recommended = useMemo(
    () =>
      recommendTags({
        packTags: data.packTags,
        currentTags: tags,
        title: data.video.title,
        description: data.description,
        topic: data.packTopic ?? data.generateTopic,
        trendingTitles: data.trendingTitles,
      }),
    [data, tags]
  );

  async function mutateTag(tag: string, action: "add" | "remove") {
    if (!data.packId) return;
    setTagBusy(true);
    setTagErr(null);
    setTagMsg(null);
    try {
      const res = await fetch("/api/optimize/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: data.packId, tag, action }),
      });
      const d = (await res.json()) as { tags?: string[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not save the tag.");
      if (d.tags) setTags(d.tags);
      setTagMsg(
        action === "add"
          ? "Tag added to your saved pack — copy the tags into YouTube Studio to publish them."
          : "Tag removed from your saved pack."
      );
    } catch (e) {
      setTagErr(e instanceof Error ? e.message : "Could not save the tag.");
    } finally {
      setTagBusy(false);
    }
  }

  async function copyTags() {
    try {
      await navigator.clipboard.writeText(tags.join(", "));
      setTagMsg("Tags copied — paste them into YouTube Studio.");
    } catch {
      setTagErr("Copy failed — select the tags and copy them manually.");
    }
  }

  const v = data.video;
  const descShort =
    data.description.length > 320 && !showFullDesc
      ? `${data.description.slice(0, 320)}…`
      : data.description;
  const concept = data.thumbConcepts[conceptIdx] ?? null;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "title", label: "Title" },
    { key: "thumbnail", label: "Thumbnail" },
    { key: "seo", label: "SEO" },
    { key: "preview", label: "Preview" },
  ];

  return (
    <div>
      <div className="analysis-head">
        <Link href="/optimize" className="analysis-back" aria-label="Back to Optimize">
          ←
        </Link>
        <h1>Analysis</h1>
        <span style={{ width: 36 }} aria-hidden />
      </div>

      <div className="analysis-tabs" role="tablist" aria-label="Analysis sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`analysis-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "title" ? (
        <section>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(v.videoId, "hq")} alt={v.title} className="thumb-lg" />
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
            {data.channelAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.channelAvatar}
                alt={data.channelTitle}
                width={40}
                height={40}
                style={{ borderRadius: "50%", flex: "none" }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{v.title}</div>
              <div className="small muted">
                {timeAgo(v.publishedAt)} • {fmtViews(v.viewCount)} Views
              </div>
            </div>
          </div>

          {data.consistencyInitial ? (
            <>
              {data.consistencyInitial.currentTitle !== v.title ? (
                <p className="small muted" style={{ marginTop: 12 }}>
                  Your saved pack’s title differs from the live video title —
                  apply a suggestion below to update the pack, then copy it
                  into YouTube Studio.
                </p>
              ) : null}
              <div style={{ marginTop: 16 }}>
                <ConsistencyCard initial={data.consistencyInitial} />
              </div>
            </>
          ) : (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-head">
                <div>
                  <h2 style={{ marginBottom: 2 }}>Title checks</h2>
                  <div className="small muted">
                    Rule-based checks from the live video — no saved pack
                    matches this video yet.
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {v.titleChecks.map((c) => (
                  <div key={c.label} className="list-row" style={{ padding: "6px 0" }}>
                    <span className={`badge ${c.pass ? "badge-teal" : "badge-red"}`}>
                      {c.pass ? "✓" : "✗"}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <strong>{c.label}</strong>
                      <div className="small muted">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 14, marginBottom: 0 }}>
                <Link
                  className="btn btn-primary"
                  href={`/generate?topic=${encodeURIComponent(data.generateTopic)}`}
                >
                  Generate a pack for this video
                </Link>
              </p>
              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                A pack unlocks the full consistency score, 3 suggested titles
                with scores, and one-click apply.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "thumbnail" ? (
        <section>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(v.videoId, "hq")} alt={v.title} className="thumb-lg" />
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
            {data.channelAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.channelAvatar}
                alt={data.channelTitle}
                width={40}
                height={40}
                style={{ borderRadius: "50%", flex: "none" }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{v.title}</div>
              <div className="small muted">
                {timeAgo(v.publishedAt)} • {fmtViews(v.viewCount)} Views
              </div>
            </div>
          </div>

          <div className="opt-compare-row">
            <Link
              href="/thumbnails"
              className="opt-add-slot"
              aria-label="Build a new thumbnail to compare"
            >
              +
            </Link>
            <span className="opt-compare-current">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(v.videoId)} alt="Current thumbnail" />
            </span>
          </div>

          {data.thumbScore ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-head">
                <div>
                  <h2 style={{ marginBottom: 2 }}>Thumbnail concept score</h2>
                  <div className="small muted">
                    From your saved pack’s concept — an editorial checklist,
                    not a pixel analysis of the live image.
                  </div>
                </div>
                <span
                  className="score-badge"
                  style={{
                    background: "var(--surface-2)",
                    color: scoreColor(data.thumbScore.score),
                  }}
                >
                  {data.thumbScore.score}
                </span>
              </div>
              <p style={{ marginTop: 0 }}>
                <strong>{data.thumbScore.label}</strong>
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {data.thumbScore.checks.map((c) => (
                  <div key={c.label} className="list-row" style={{ padding: "6px 0" }}>
                    <span className={`badge ${c.pass ? "badge-teal" : "badge-red"}`}>
                      {c.pass ? "✓" : "✗"}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <strong>{c.label}</strong>
                      <div className="small muted">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {data.thumbScore.fixes.length > 0 ? (
                <>
                  <h3 style={{ marginTop: 14 }}>Fixes to try first</h3>
                  <ul style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
                    {data.thumbScore.fixes.map((f) => (
                      <li key={f} className="small" style={{ marginBottom: 6 }}>{f}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 6 }}>No thumbnail concept saved</h2>
              <p className="muted" style={{ marginBottom: 12 }}>
                This video has no saved pack, so there is no concept to score
                yet.
              </p>
              <Link
                className="btn btn-primary"
                href={`/generate?topic=${encodeURIComponent(data.generateTopic)}`}
              >
                Generate a pack for this video
              </Link>
            </div>
          )}

          {data.thumbConcepts.length > 1 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 4 }}>Concepts from your pack</h2>
              <p className="small muted" style={{ marginTop: 0 }}>
                Tap a concept to see its banner text and layout.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {data.thumbConcepts.map((c, i) => (
                  <button
                    key={c.bigText}
                    type="button"
                    className={`suggest-row ${conceptIdx === i ? "active" : ""}`}
                    onClick={() => setConceptIdx(i)}
                  >
                    <span
                      className="score-badge"
                      style={{
                        background: "var(--surface-2)",
                        color: scoreColor(c.score),
                      }}
                    >
                      {c.score}
                    </span>
                    <span style={{ minWidth: 0, textAlign: "start" }}>
                      <span style={{ display: "block", fontWeight: 700 }}>{c.bigText}</span>
                      <span className="small muted" style={{ display: "block" }}>
                        {c.imageIdea}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {concept ? (
                <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Layout: {concept.layout}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "seo" ? (
        <section>
          <div className="section-head">
            <h2 style={{ marginBottom: 0 }}>Description</h2>
            <Link
              className="btn btn-ghost btn-sm"
              href={`/generate?topic=${encodeURIComponent(data.generateTopic)}`}
            >
              Generate
            </Link>
          </div>
          <div className="card">
            {data.description ? (
              <>
                <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{descShort}</p>
                {data.description.length > 320 ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setShowFullDesc((s) => !s)}
                  >
                    {showFullDesc ? "Show less" : "Show full description"}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                No description found for this video yet.
              </p>
            )}
            <p className="small muted" style={{ marginBottom: 0, marginTop: 10 }}>
              {data.descriptionSource === "live"
                ? "Live description from YouTube."
                : data.descriptionSource === "pack"
                  ? "From your saved pack — the live description was not available."
                  : "No description in the live data or in a saved pack."}
            </p>
          </div>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h2 style={{ marginBottom: 0 }}>Tags</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={copyTags}
              disabled={tags.length === 0}
            >
              ⧉ Copy all
            </button>
          </div>
          <div className="card">
            {tags.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                No tags on this video yet — add some below.
              </p>
            ) : (
              <div className="opt-tag-chips">
                {tags.map((t) => (
                  <span key={t} className="opt-tag-chip">
                    {t}
                    {data.packId ? (
                      <button
                        type="button"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => mutateTag(t, "remove")}
                        disabled={tagBusy}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
            {data.packId ? (
              <form
                style={{ display: "flex", gap: 8, marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tagInput.trim()) {
                    mutateTag(tagInput.trim(), "add");
                    setTagInput("");
                  }
                }}
              >
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add Tag"
                  aria-label="Add a tag"
                />
                <button type="submit" className="btn btn-primary" disabled={tagBusy || !tagInput.trim()}>
                  Add
                </button>
              </form>
            ) : (
              <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Tags here are the live YouTube tags (read-only). Generate a
                pack to edit tags in Nizafa, then copy them into YouTube
                Studio.
              </p>
            )}
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Tags are saved in your Nizafa pack — copy them into YouTube
              Studio to publish them on the video.
            </p>
            {tagMsg ? <p className="small" style={{ color: "var(--teal-600)", marginTop: 8, marginBottom: 0 }}>{tagMsg}</p> : null}
            {tagErr ? <p className="error small" style={{ marginTop: 8, marginBottom: 0 }}>{tagErr}</p> : null}
          </div>

          <h2 style={{ marginTop: 20 }}>Recommended</h2>
          {recommended.length === 0 ? (
            <p className="muted small">
              No more recommendations — every tag from your pack is already on
              this video.
            </p>
          ) : (
            <div className="opt-rec-list">
              {recommended.map((r: TagScore) => (
                <div key={r.tag} className="opt-rec-row">
                  <span
                    className="opt-rec-score"
                    style={{ color: scoreColor(r.score) }}
                  >
                    {r.score}
                  </span>
                  <span className="opt-rec-tag" title={r.signals.join(" · ")}>
                    {r.tag}
                  </span>
                  <button
                    type="button"
                    className="opt-rec-add"
                    aria-label={`Add tag ${r.tag}`}
                    onClick={() => mutateTag(r.tag, "add")}
                    disabled={tagBusy || !data.packId}
                    title={
                      data.packId
                        ? r.signals.join(" · ")
                        : "Generate a pack first to add tags"
                    }
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="section-head" style={{ marginTop: 20 }}>
            <h2 style={{ marginBottom: 0 }}>Actionable items</h2>
            <strong style={{ color: checklist.total >= checklist.max * 0.6 ? "var(--teal-600)" : "#b91c1c" }}>
              {checklist.total}/{checklist.max}
            </strong>
          </div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {checklist.items.map((it) => (
              <div key={it.key} className="opt-check-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{it.label}</div>
                  <div className="small muted">{it.detail}</div>
                </div>
                <strong style={{ flex: "none" }}>
                  {it.score === null ? "—" : `${it.score}/10`}
                </strong>
              </div>
            ))}
          </div>
          <p className="small muted">
            Each item is scored 0–10 from your real title, description and
            tags. Items with “—” have no data yet and are left out of the
            total.
          </p>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h2 style={{ marginBottom: 0 }}>Performance</h2>
            <strong>—/10</strong>
          </div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="opt-check-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Tags for search terms this video is ranking for</div>
                <div className="small muted">Not tracked yet — Nizafa does not measure search rankings.</div>
              </div>
              <strong style={{ flex: "none" }}>—/5</strong>
            </div>
            <div className="opt-check-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Tags for high volume search terms this video is ranking for</div>
                <div className="small muted">Not tracked yet — “Tag volume” above is the closest live signal.</div>
              </div>
              <strong style={{ flex: "none" }}>—/5</strong>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "preview" ? (
        <section>
          <div className="opt-device-row">
            <div className="opt-device-toggle" role="group" aria-label="Preview device">
              <button
                type="button"
                className={device === "mobile" ? "active" : ""}
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                ▯ Mobile
              </button>
              <button
                type="button"
                className={device === "desktop" ? "active" : ""}
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                ▭ Desktop
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => window.location.reload()}
              aria-label="Refresh preview"
            >
              ⟳
            </button>
          </div>
          <p className="small muted">
            How this video would sit in a feed next to competitor videos —
            ordered by views per hour, your video highlighted.
          </p>
          {data.preview.length === 0 ? (
            <div className="card">
              <p className="muted" style={{ marginBottom: 0 }}>
                No competitor videos cached yet — add a competitor from
                Optimize to see your video next to theirs.
              </p>
            </div>
          ) : (
            <div className={device === "mobile" ? "opt-feed-mobile" : "opt-feed-desktop"}>
              {data.preview.map((e) => (
                <article
                  key={`${e.videoId}-${e.isOwn ? "own" : "comp"}`}
                  className={`opt-feed-entry ${e.isOwn ? "own" : ""}`}
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${e.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(e.videoId)}
                      alt={e.title}
                      className="opt-feed-thumb"
                      loading="lazy"
                    />
                    {e.duration ? (
                      <span className="opt-duration">{e.duration}</span>
                    ) : null}
                  </a>
                  <div className="opt-feed-body">
                    {e.channelAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.channelAvatar}
                        alt={e.channelTitle}
                        width={36}
                        height={36}
                        className="opt-feed-avatar"
                      />
                    ) : null}
                    <div style={{ minWidth: 0 }}>
                      <div className="opt-feed-title">
                        {e.isOwn ? <span className="badge badge-teal">Your video</span> : null}{" "}
                        {e.title}
                      </div>
                      <div className="small muted">
                        {e.channelTitle} • {fmtViews(e.viewCount)} views •{" "}
                        {timeAgo(e.publishedAt)}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
