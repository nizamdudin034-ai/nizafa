"use client";

// /ideas — Daily Ideas in vidIQ's mobile-app style, wired to Nizafa's
// real ideas backend: 4 fresh ideas per day per connected channel,
// each with a view prediction computed from real channel + trend data.
// Save / Dismiss / Restore persist in Supabase (packages
// kind='daily-idea-states'). "Show related videos" loads the Top 10
// ranked videos in YouTube search for that idea title (cached 24h).
// No Boost-style upsell: the 4 daily ideas are free on every plan.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { DailyIdea, ViewPrediction } from "@/lib/daily-ideas";
import { fmtViews, thumbUrl, timeAgo } from "@/lib/seo-checklist";

type IdeasResult = {
  date: string;
  channelId: number | null;
  channelTitle: string | null;
  channel: { id: number; title: string } | null;
  channels: Array<{ id: number; title: string }>;
  ideas: DailyIdea[];
  created: boolean;
  nicheThemes: string[];
  note?: string;
  error?: string;
};

type IdeaState = DailyIdea & { date: string };

type RelatedVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string | null;
  viewCount: number | null;
};

function predictionClass(p: ViewPrediction): string {
  if (p === "Very high") return "idea-pred idea-pred-very-high";
  if (p === "High") return "idea-pred idea-pred-high";
  return "idea-pred idea-pred-medium";
}

export default function IdeasPage() {
  const [data, setData] = useState<IdeasResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [tab, setTab] = useState<"daily" | "saved" | "dismissed">("daily");
  const [saved, setSaved] = useState<IdeaState[]>([]);
  const [dismissed, setDismissed] = useState<IdeaState[]>([]);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [relatedTitle, setRelatedTitle] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedVideo[] | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedNote, setRelatedNote] = useState<string | null>(null);

  const loadIdeas = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = cid ? `?channelId=${cid}` : "";
      const res = await fetch(`/api/daily-ideas${params}`);
      const d = (await res.json()) as IdeasResult;
      if (!res.ok) throw new Error(d.error ?? "Could not load today's ideas.");
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load today's ideas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStates = useCallback(async (cid: string) => {
    try {
      const params = cid ? `?channelId=${cid}` : "";
      const res = await fetch(`/api/daily-ideas/state${params}`);
      const d = (await res.json()) as { saved?: IdeaState[]; dismissed?: IdeaState[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not load saved ideas.");
      setSaved(d.saved ?? []);
      setDismissed(d.dismissed ?? []);
      setStatesError(null);
    } catch (err) {
      setStatesError(err instanceof Error ? err.message : "Could not load saved ideas.");
    }
  }, []);

  useEffect(() => {
    loadIdeas(channelId);
    loadStates(channelId);
  }, [loadIdeas, loadStates, channelId]);

  const keyOf = (title: string) => title.trim().toLowerCase();
  const savedKeys = useMemo(() => new Set(saved.map((s) => keyOf(s.title))), [saved]);
  const dismissedKeys = useMemo(() => new Set(dismissed.map((s) => keyOf(s.title))), [dismissed]);

  const remaining = useMemo(
    () =>
      (data?.ideas ?? []).filter(
        (i) => !savedKeys.has(keyOf(i.title)) && !dismissedKeys.has(keyOf(i.title))
      ),
    [data, savedKeys, dismissedKeys]
  );
  const current = remaining[0] ?? null;

  async function act(
    action: "save" | "dismiss" | "restore" | "delete" | "restore-all",
    idea?: DailyIdea
  ) {
    if (acting) return;
    setActing(true);
    setStatesError(null);
    try {
      const res = await fetch("/api/daily-ideas/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: data?.channelId ?? (channelId ? Number(channelId) : undefined),
          action,
          idea: idea ? { ...idea, date: data?.date ?? "" } : undefined,
        }),
      });
      const d = (await res.json()) as { saved?: IdeaState[]; dismissed?: IdeaState[]; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not save that change.");
      setSaved(d.saved ?? []);
      setDismissed(d.dismissed ?? []);
      if (action === "save" || action === "dismiss") setRelatedTitle(null);
    } catch (err) {
      setStatesError(err instanceof Error ? err.message : "Could not save that change.");
    } finally {
      setActing(false);
    }
  }

  async function toggleRelated(idea: DailyIdea) {
    if (relatedTitle === idea.title) {
      setRelatedTitle(null);
      return;
    }
    setRelatedTitle(idea.title);
    setRelated(null);
    setRelatedNote(null);
    setRelatedLoading(true);
    try {
      const res = await fetch(
        `/api/daily-ideas/related?title=${encodeURIComponent(idea.title)}`
      );
      const d = (await res.json()) as {
        videos?: RelatedVideo[];
        cached?: boolean;
        available?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Could not load related videos.");
      setRelated(d.videos ?? []);
      if (!d.available) {
        setRelatedNote(
          "YouTube search is not configured on the server, so related videos cannot be loaded right now."
        );
      } else if (d.cached) {
        setRelatedNote("From cache (24h) — no quota spent.");
      }
    } catch (err) {
      setRelatedNote(err instanceof Error ? err.message : "Could not load related videos.");
      setRelated([]);
    } finally {
      setRelatedLoading(false);
    }
  }

  return (
    <div className="ideas-wrap">
      <h1 className="res-title">Daily Ideas</h1>

      {data && data.channels.length > 1 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="label" htmlFor="channel">Channel</label>
          <select
            id="channel"
            className="select input"
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              setRelatedTitle(null);
            }}
          >
            <option value="">First connected channel</option>
            {data.channels.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.title}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="res-pills" role="tablist" aria-label="Idea lists">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "daily"}
          className={`res-pill${tab === "daily" ? " res-pill-active" : ""}`}
          onClick={() => setTab("daily")}
        >
          💡 Daily ideas{remaining.length > 0 ? ` (${remaining.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "saved"}
          className={`res-pill${tab === "saved" ? " res-pill-active" : ""}`}
          onClick={() => setTab("saved")}
        >
          ♥ Saved{saved.length > 0 ? ` (${saved.length})` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "dismissed"}
          className={`res-pill${tab === "dismissed" ? " res-pill-active" : ""}`}
          onClick={() => setTab("dismissed")}
        >
          ✕ Dismissed{dismissed.length > 0 ? ` (${dismissed.length})` : ""}
        </button>
      </div>

      {loading ? <p className="muted">Building today&apos;s ideas…</p> : null}
      {error ? <div className="error">{error}</div> : null}
      {statesError ? <div className="error" style={{ marginTop: 12 }}>{statesError}</div> : null}

      {data && !loading && !error ? (
        <>
          <SectionTitle
            title={data.channelTitle ? `For ${data.channelTitle}` : "No channel yet"}
            sub={
              data.date
                ? `${data.date} · ${data.created ? "Freshly generated today" : "Saved from today's run"}${data.nicheThemes.length > 0 ? ` · Niche: ${data.nicheThemes.join(", ")}` : ""}`
                : undefined
            }
          />
          {data.note ? <div className="notice" style={{ marginBottom: 16 }}>{data.note}</div> : null}

          {tab === "daily" ? (
            <div>
              {data.ideas.length === 0 ? (
                <EmptyState
                  title="No ideas yet"
                  body="Connect your channel from the home page and today's ideas will be built from your own videos."
                  action={<Link href="/" className="btn btn-primary">Go to home →</Link>}
                />
              ) : current ? (
                <>
                  <div className="idea-stack">
                    <div className="idea-card" aria-live="polite">
                      <span className="idea-count" aria-label={`${remaining.length} ideas left`}>
                        {remaining.length}
                      </span>
                      <span className={predictionClass(current.prediction)}>
                        View prediction: {current.prediction}
                      </span>
                      <h2 className="idea-title">{current.title}</h2>
                      <p className="idea-hook"><strong>Hook:</strong> {current.hook}</p>
                      <p className="muted idea-why">
                        <strong>Why it fits:</strong> {current.whyFits}
                      </p>
                      <p className="small muted" style={{ marginBottom: 0 }}>
                        Prediction: {current.predictionWhy}
                      </p>
                      <div className="idea-actions">
                        <button
                          type="button"
                          className="idea-btn idea-btn-dismiss"
                          onClick={() => act("dismiss", current)}
                          disabled={acting}
                        >
                          Dismiss ✕
                        </button>
                        <button
                          type="button"
                          className="idea-btn idea-btn-save"
                          onClick={() => act("save", current)}
                          disabled={acting}
                        >
                          Save ♥
                        </button>
                      </div>
                      <div className="idea-card-foot">
                        <CopyButton text={current.title} label="Copy title" />
                        <Link
                          href={`/generate?topic=${encodeURIComponent(current.title)}`}
                          className="btn btn-primary btn-sm"
                        >
                          Turn into a pack →
                        </Link>
                      </div>
                    </div>
                  </div>
                  <p className="idea-tomorrow">New Daily Ideas Tomorrow</p>
                  <p className="small muted idea-free-note">
                    4 fresh ideas every day, free on every Nizafa plan.
                  </p>
                  <button
                    type="button"
                    className="idea-related-btn"
                    onClick={() => toggleRelated(current)}
                    aria-expanded={relatedTitle === current.title}
                  >
                    {relatedTitle === current.title ? "Hide related videos" : "Show related videos"}
                    <span aria-hidden="true">{relatedTitle === current.title ? "▲" : "▼"}</span>
                  </button>
                  {relatedTitle === current.title ? (
                    <div style={{ marginTop: 18 }}>
                      <p style={{ fontWeight: 700 }}>
                        Top 10 ranked videos in YouTube search for “{current.title}”
                      </p>
                      {relatedLoading ? <p className="muted">Searching YouTube…</p> : null}
                      {relatedNote ? <p className="small muted">{relatedNote}</p> : null}
                      {related && related.length === 0 && !relatedLoading ? (
                        <EmptyState
                          title="No related videos found"
                          body="Try the idea in Research to see top videos for the phrase."
                        />
                      ) : null}
                      {related?.map((v) => (
                        <a
                          key={v.videoId}
                          href={`https://www.youtube.com/watch?v=${v.videoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="idea-related-row"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbUrl(v.videoId, "mq")} alt="" loading="lazy" className="idea-related-thumb" />
                          <span className="idea-related-body">
                            <span className="idea-related-title">{v.title}</span>
                            <span className="small muted">
                              {v.channelTitle}
                              {v.publishedAt ? ` • ${timeAgo(v.publishedAt)}` : ""}
                              {v.viewCount != null ? ` • ${fmtViews(v.viewCount)} views` : ""}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <h2>All 4 ideas reviewed</h2>
                  <p className="muted">
                    Saved ideas are in the Saved tab. New Daily Ideas Tomorrow.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => setTab("saved")}>
                    See saved ideas →
                  </button>
                </div>
              )}
            </div>
          ) : tab === "saved" ? (
            <div>
              {saved.length === 0 ? (
                <EmptyState
                  title="No saved ideas yet"
                  body="Tap Save on a daily idea to keep it here — saved ideas stay even after the day's set rotates away."
                />
              ) : (
                saved.map((s) => (
                  <div key={s.title} className="card idea-list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.35 }}>{s.title}</div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        View prediction: <strong>{s.prediction}</strong>
                        {s.date ? ` · saved from ${s.date}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => act("delete", s)}
                      disabled={acting}
                      aria-label={`Remove “${s.title}” from saved`}
                      title="Remove from saved"
                    >
                      🗑
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div>
              {dismissed.length === 0 ? (
                <EmptyState
                  title="Nothing dismissed"
                  body="Ideas you dismiss land here — and you can restore any of them."
                />
              ) : (
                <>
                  {dismissed.map((s) => (
                    <div key={s.title} className="card idea-list-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.35 }}>{s.title}</div>
                        <div className="small muted" style={{ marginTop: 4 }}>
                          View prediction: <strong>{s.prediction}</strong>
                          {s.date ? ` · dismissed from ${s.date}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => act("restore", s)}
                        disabled={acting}
                      >
                        Restore idea
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="idea-related-btn"
                    style={{ marginTop: 16 }}
                    onClick={() => act("restore-all")}
                    disabled={acting}
                  >
                    Restore all ideas
                  </button>
                </>
              )}
            </div>
          )}

          <p className="small muted" style={{ marginTop: 24 }}>
            Ideas come from your channel&apos;s own videos and today&apos;s Google
            Trends snapshot. No search quota is spent building them, and no
            numbers are invented — view counts quoted above come from your
            saved videos.
          </p>
        </>
      ) : null}
    </div>
  );
}
