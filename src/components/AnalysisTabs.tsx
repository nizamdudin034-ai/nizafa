// Video Analysis — 4 tabs (Title / Thumbnail / SEO / Preview) in the
// mobile-app style. Everything shown comes from real data: the video's
// live YouTube metadata, the matched saved SEO pack, and competitor
// videos from the cache. Scores are rule-based estimates, labelled as
// such; where data does not exist the UI says so instead of a fake zero.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ConsistencyCard, { type ConsistencyInitial, type AlternativeTitle } from "@/components/ConsistencyCard";
import { thumbUrl, timeAgo, fmtViews } from "@/lib/seo-checklist";
import { renderCompositedThumbnail, type ThumbnailTextSpec } from "@/lib/thumbnail-text";
import type { ConsistencyResult } from "@/lib/consistency";
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
  /** Standalone (no-pack) consistency + 3 suggested titles, ranked by title match. */
  standalone: {
    currentTitle: string;
    consistency: ConsistencyResult;
    alternatives: AlternativeTitle[];
  } | null;
  /** "pack" = concepts from the saved pack; "generated" = built from the topic. */
  thumbSource: "pack" | "generated";
  /** External (non-own) video: Apply saves to a new pack instead of the matched pack. */
  external: boolean;
  /** Back link target; defaults to /optimize. */
  backHref: string | null;
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

/** Punch word(s) of a concept's big text — first ALL-CAPS / $ / number words. */
function punchWordOf(bigText: string): string {
  return (
    bigText
      .split(/\s+/)
      .filter((w) => /[A-Z]{2,}/.test(w) || /\$|\d/.test(w))
      .slice(0, 2)
      .join(" ") || bigText.split(/\s+/)[0] || ""
  );
}

/**
 * Concept preview — the concept's text composited ON the video's thumbnail
 * via the shared helper (src/lib/thumbnail-text.ts): the video thumbnail
 * as the base image, the concept text in huge bold distressed white across
 * the top, the punch word in a solid red box underneath. A bare image with
 * no text is not a thumbnail concept — the text is the concept. If the
 * thumbnail fails to load, the helper falls back to a dark gradient, and
 * the text is still drawn.
 */
function ConceptThumb({
  videoId,
  bigText,
  punch,
}: {
  videoId: string;
  bigText: string;
  punch: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = 640;
    const H = 360;
    const spec: ThumbnailTextSpec = { topText: bigText, punchWord: punch };
    const paint = (base: HTMLImageElement | null) => {
      const composed = renderCompositedThumbnail(base, spec, W, H);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(composed, 0, 0);
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => paint(img);
    img.onerror = () => paint(null);
    img.src = thumbUrl(videoId, "hq");
  }, [videoId, bigText, punch]);

  return (
    <canvas
      ref={ref}
      width={640}
      height={360}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
      aria-label={`Thumbnail concept: ${bigText}`}
    />
  );
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
  // Concepts ranked by concept score, highest first.
  const rankedConcepts = useMemo(
    () => [...data.thumbConcepts].sort((a, b) => b.score - a.score),
    [data.thumbConcepts]
  );
  const [extCurrentTitle, setExtCurrentTitle] = useState(
    data.standalone?.currentTitle ?? ""
  );
  const [extBusy, setExtBusy] = useState(false);
  const [extMsg, setExtMsg] = useState<string | null>(null);
  const [extErr, setExtErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setTagErr("Copy failed — select the text and copy it manually.");
    }
  }

  /** Apply a suggested title for a video with no saved pack: save a new
   *  pack for the topic, then set the title as its chosen title. This
   *  changes Nizafa's pack only — never the video on YouTube. */
  async function applyExternalTitle(title: string) {
    setExtBusy(true);
    setExtErr(null);
    setExtMsg(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: data.generateTopic, save: true }),
      });
      const d = (await res.json()) as { packageId?: number; error?: string };
      if (!res.ok || !d.packageId) {
        throw new Error(d.error ?? "Could not save a pack.");
      }
      const res2 = await fetch("/api/generate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: d.packageId,
          patch: {
            bestTitle: title,
            chosenTitle: title,
            chosenAt: new Date().toISOString(),
          },
        }),
      });
      const d2 = (await res2.json()) as { error?: string };
      if (!res2.ok) throw new Error(d2.error ?? "Could not apply the title.");
      setExtCurrentTitle(title);
      setExtMsg(`Saved to a new Nizafa pack as “${title}”.`);
    } catch (e) {
      setExtErr(e instanceof Error ? e.message : "Could not apply the title.");
    } finally {
      setExtBusy(false);
    }
  }

  const v = data.video;
  const descShort =
    data.description.length > 320 && !showFullDesc
      ? `${data.description.slice(0, 320)}…`
      : data.description;
  const concept = rankedConcepts[conceptIdx] ?? null;
  // Standalone (no-pack) >95% bookkeeping, same rule as the pack card.
  const sa = data.standalone;
  const saReached95 = sa ? sa.alternatives.filter((a) => a.score > 95).length : 0;
  const saTitleParts = sa
    ? sa.consistency.parts.filter((p) => p.key.startsWith("title-"))
    : [];
  const saWeakest = [...saTitleParts].sort((a, b) => a.score - b.score)[0];

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "title", label: "Title" },
    { key: "thumbnail", label: "Thumbnail" },
    { key: "seo", label: "SEO" },
    { key: "preview", label: "Preview" },
  ];

  return (
    <div>
      <div className="analysis-head">
        <Link href={data.backHref ?? "/optimize"} className="analysis-back" aria-label="Back">
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
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="small muted"
              >
                Watch on YouTube ↗
              </a>
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
          ) : sa ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-head">
                <div>
                  <h2 style={{ marginBottom: 2 }}>Title match &amp; consistency</h2>
                  <div className="small muted">
                    One score for title + description + script + thumbnail —
                    from this video&apos;s live description and generated
                    thumbnail concepts. No script is saved for this video, so
                    the script part scores 0.
                  </div>
                </div>
                <span
                  className="score-badge"
                  style={{
                    background: "var(--surface-2)",
                    color: scoreColor(sa.consistency.score),
                  }}
                >
                  {sa.consistency.score}
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div className="small" style={{ fontWeight: 700 }}>Current title</div>
                <div>{extCurrentTitle || sa.currentTitle}</div>
              </div>

              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                {sa.consistency.parts.map((p) => (
                  <div key={p.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span className="small" style={{ fontWeight: 600 }}>{p.label}</span>
                      <strong className="small">{p.score}/100</strong>
                    </div>
                    <div className="meter" style={{ marginTop: 4 }}>
                      <span style={{ width: `${p.score}%` }} />
                    </div>
                    <div className="small muted">{p.detail}</div>
                  </div>
                ))}
              </div>

              {sa.consistency.notes.map((n) => (
                <p key={n} className="small muted" style={{ marginBottom: 6 }}>
                  {n}
                </p>
              ))}

              <div className="drawer-section" style={{ margin: "16px 0 8px" }}>
                Suggested titles — ranked by match, highest first
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                Match = share of the title&apos;s words that also appear in
                the description, script and thumbnail. Titles leave off the
                channel suffix — those words aren&apos;t in the script or
                thumbnail text, so adding it would drop the match below 95%.
              </p>
              {saReached95 > 0 ? (
                <p className="small" style={{ color: "var(--teal-600)", marginTop: 0 }}>
                  ✓ {saReached95} of these reach 95%+ match with the
                  description, script and thumbnail.
                </p>
              ) : (
                <p className="small muted" style={{ marginTop: 0 }}>
                  None of these titles reaches 95% match yet
                  {saWeakest
                    ? ` — weakest part is ${saWeakest.label} (${saWeakest.score}/100). Add the missing words to the description, script or thumbnail text to lift it.`
                    : "."}
                </p>
              )}
              {sa.alternatives.length === 0 ? (
                <p className="muted small">
                  No alternative titles could be built for this video.
                </p>
              ) : (
                sa.alternatives.map((a) => (
                  <div key={a.title} className="suggest-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      style={{ flex: 1, minWidth: 0, textAlign: "start", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit" }}
                      onClick={() => applyExternalTitle(a.title)}
                      disabled={extBusy}
                      title="Click to apply this title — saves it to a new Nizafa pack"
                    >
                      <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span
                          className="score-badge"
                          style={{
                            background: "var(--surface-2)",
                            color: scoreColor(a.score),
                          }}
                        >
                          {a.score}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 600 }}>{a.title}</span>
                          <span className="small muted" style={{ display: "block" }}>
                            Match {a.score}/100 · Title score {a.titleScore}/100 — {a.why}
                          </span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => copyText(a.title)}
                      disabled={extBusy}
                      title="Copy this title for YouTube Studio"
                    >
                      {copied === a.title ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                ))
              )}
              <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
                Applying saves the title to a new Nizafa pack — it does NOT
                change the title on YouTube. Copy the new title into YouTube
                Studio to change it there.
              </p>
              {extMsg ? (
                <div style={{ marginTop: 12 }}>
                  <p className="small" style={{ color: "var(--teal-600)", marginTop: 0, marginBottom: 6 }}>{extMsg}</p>
                  <p style={{ margin: 0, fontWeight: 600 }}>{extCurrentTitle}</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => copyText(extCurrentTitle)}
                  >
                    {copied === extCurrentTitle ? "Copied ✓ — paste it into YouTube Studio" : "Copy title for YouTube Studio"}
                  </button>
                </div>
              ) : null}
              {extErr ? <p className="error small" style={{ marginTop: 10, marginBottom: 0 }}>{extErr}</p> : null}
              <p style={{ marginTop: 14, marginBottom: 0 }}>
                <Link
                  className="btn btn-primary"
                  href={`/generate?topic=${encodeURIComponent(data.generateTopic)}`}
                >
                  Generate a pack for this video
                </Link>
              </p>
            </div>
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
                    {data.thumbSource === "generated"
                      ? "Generated from the video's topic — an editorial checklist, not a pixel analysis of the live image."
                      : "From your saved pack's concept — an editorial checklist, not a pixel analysis of the live image."}
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

          {rankedConcepts.length > 1 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h2 style={{ marginBottom: 4 }}>
                {data.thumbSource === "generated"
                  ? "Concepts for this video"
                  : "Concepts from your pack"}
              </h2>
              <p className="small muted" style={{ marginTop: 0 }}>
                Ranked by concept score, highest first. Each preview shows the
                concept&apos;s text composited on the video&apos;s thumbnail —
                the text is the concept. Tap one to open it in Thumbnail Studio.
              </p>
              <div style={{ display: "grid", gap: 12 }}>
                {rankedConcepts.map((c, i) => (
                  <button
                    key={c.bigText}
                    type="button"
                    className={`suggest-row ${conceptIdx === i ? "active" : ""}`}
                    onClick={() => setConceptIdx(i)}
                    style={{ display: "block", padding: 10, textAlign: "start" }}
                  >
                    <ConceptThumb
                      videoId={data.video.videoId}
                      bigText={c.bigText}
                      punch={punchWordOf(c.bigText)}
                    />
                    <span
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        marginTop: 8,
                      }}
                    >
                      <span
                        className="score-badge"
                        style={{
                          background: "var(--surface-2)",
                          color: scoreColor(c.score),
                          flexShrink: 0,
                        }}
                      >
                        {c.score}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 700 }}>{c.bigText}</span>
                        <span className="small muted" style={{ display: "block" }}>
                          {c.imageIdea}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {concept ? (
                <>
                  <p className="small muted" style={{ marginTop: 12, marginBottom: 6 }}>
                    Layout: {concept.layout}
                  </p>
                  <p style={{ marginTop: 0, marginBottom: 0 }}>
                    <Link
                      className="btn btn-ghost btn-sm"
                      href={`/thumbnails?topText=${encodeURIComponent(concept.bigText)}&punch=${encodeURIComponent(punchWordOf(concept.bigText))}&topic=${encodeURIComponent(data.generateTopic)}&notes=${encodeURIComponent(concept.layout)}`}
                    >
                      Open this concept in Thumbnail Studio →
                    </Link>
                  </p>
                  <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
                    Opens in Thumbnail Studio — build the image there. It does
                    not change the live YouTube thumbnail.
                  </p>
                </>
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
                  <Link
                    href={
                      e.isOwn
                        ? `/optimize/${e.videoId}`
                        : `/analyze?videoId=${e.videoId}`
                    }
                    aria-label={e.title}
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
                  </Link>
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
                        <Link
                          href={
                            e.isOwn
                              ? `/optimize/${e.videoId}`
                              : `/analyze?videoId=${e.videoId}`
                          }
                          style={{ color: "var(--ink)", fontWeight: 600 }}
                        >
                          {e.title}
                        </Link>
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
