"use client";

// /create — Nizafa's ideas feed in vidIQ's Create layout, wired to real
// Nizafa data. No Boost paywalls: Fill content gaps, Double down and
// Remix are real features here, free on every plan.
// - Topic of the Day: the first of today's 4 daily ideas for the channel.
// - Saved Ideas: the user's saved daily ideas (Supabase).
// - Start From Your Idea: title + thumbnail recommendations from Nizafa's
//   own generator (/api/create/idea).
// - Answer Your Audience: ideas from the channel's REAL comments
//   (/api/create/comments) — never invented.
// - More Topics for You: niche-matched rising keywords, with thumbs
//   up/down feedback that persists (/api/create/feedback) and tunes the
//   feed; Fine Tune Feed edits the niche keywords.
// - Try Out Top Search Terms: real rising-keyword chips → /research.
// - Videos Sending You Traffic: honest empty state — Nizafa has no
//   YouTube Analytics traffic-source data (no such scope connected yet).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DailyIdea } from "@/lib/daily-ideas";
import type { CommentIdea } from "@/app/api/create/comments/route";

export type CreateTopic = {
  title: string;
  traffic: string;
  isNew: boolean;
  growthPct: number | null;
};

export type ContentGap = { title: string; traffic: string };

export type DoubleDownItem = {
  videoId: string;
  title: string;
  url: string;
  views: number;
  ratio: number;
  sequel: string;
  why: string;
};

export type RemixItem = {
  videoId: string;
  title: string;
  url: string;
  vph: number;
  shortIdea: string;
  hook: string;
};

type IdeaRec = {
  topic: string;
  titles: Array<{ title: string; score: number; style: string; why: string }>;
  bestTitle: string;
  hook: string;
  thumbnailConcepts: Array<{ bigText: string; layout: string; imageIdea: string }>;
  disclaimer: string;
};

const GRADIENTS = [
  "linear-gradient(135deg, #0b4f46, #12a08a)",
  "linear-gradient(135deg, #1e3a8a, #2563eb)",
  "linear-gradient(135deg, #7c2d12, #ea580c)",
  "linear-gradient(135deg, #4c1d95, #7c3aed)",
  "linear-gradient(135deg, #831843, #db2777)",
  "linear-gradient(135deg, #14532d, #16a34a)",
];

function keyOf(title: string): string {
  return title.trim().toLowerCase();
}

export default function CreatePage({
  own,
  topicOfDay,
  savedIdeas,
  moreTopics,
  searchTerms,
  contentGaps,
  doubleDown,
  remix,
  nicheThemes,
}: {
  own: { id: number; title: string } | null;
  topicOfDay: DailyIdea | null;
  savedIdeas: Array<{ title: string; hook: string; prediction: string; date: string }>;
  moreTopics: CreateTopic[];
  searchTerms: string[];
  contentGaps: ContentGap[];
  doubleDown: DoubleDownItem[];
  remix: RemixItem[];
  nicheThemes: string[];
}) {
  // Start From Your Idea.
  const [ideaInput, setIdeaInput] = useState("");
  const [ideaRec, setIdeaRec] = useState<IdeaRec | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);

  // Answer Your Audience (real comments).
  const [commentIdeas, setCommentIdeas] = useState<CommentIdea[] | null>(null);
  const [commentNote, setCommentNote] = useState<string | null>(null);
  const [commentLoading, setCommentLoading] = useState(true);

  // Topic feedback + Fine Tune Feed.
  const [liked, setLiked] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [niche, setNiche] = useState<string[] | null>(null);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [nicheDraft, setNicheDraft] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    fetch("/api/create/comments")
      .then(async (r) => {
        const d = (await r.json()) as { ideas?: CommentIdea[]; note?: string; error?: string };
        if (!r.ok) throw new Error(d.error ?? "Could not load comment ideas.");
        setCommentIdeas(d.ideas ?? []);
        setCommentNote(d.note ?? null);
      })
      .catch(() => {
        setCommentIdeas([]);
        setCommentNote("Comment ideas could not be loaded right now — try again later.");
      })
      .finally(() => setCommentLoading(false));
  }, []);

  useEffect(() => {
    if (!own) {
      setFeedbackLoaded(true);
      return;
    }
    fetch(`/api/create/feedback?channelId=${own.id}`)
      .then(async (r) => {
        const d = (await r.json()) as { liked?: string[]; disliked?: string[]; niche?: string[] | null; error?: string };
        if (!r.ok) throw new Error(d.error ?? "Could not load feedback.");
        setLiked(d.liked ?? []);
        setDisliked(d.disliked ?? []);
        setNiche(d.niche ?? null);
      })
      .catch(() => {
        // Signed out / unavailable: feedback works for this session only.
      })
      .finally(() => setFeedbackLoaded(true));
  }, [own]);

  async function postFeedback(body: Record<string, unknown>) {
    if (!own) {
      setFeedbackMsg("Sign in to save your feedback across devices.");
      return;
    }
    try {
      const r = await fetch("/api/create/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: own.id, ...body }),
      });
      const d = (await r.json()) as { liked?: string[]; disliked?: string[]; niche?: string[] | null; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Could not save feedback.");
      setLiked(d.liked ?? []);
      setDisliked(d.disliked ?? []);
      setNiche(d.niche ?? null);
      setFeedbackMsg(null);
    } catch (e) {
      setFeedbackMsg(e instanceof Error ? e.message : "Could not save feedback.");
    }
  }

  function thumb(topic: string, like: boolean) {
    const k = keyOf(topic);
    const likedSet = new Set(liked.map(keyOf));
    const dislikedSet = new Set(disliked.map(keyOf));
    if (like) {
      if (likedSet.has(k)) {
        setLiked(liked.filter((t) => keyOf(t) !== k));
        void postFeedback({ undo: topic });
      } else {
        setLiked([...liked.filter((t) => keyOf(t) !== k), topic]);
        setDisliked(disliked.filter((t) => keyOf(t) !== k));
        void postFeedback({ like: topic });
      }
    } else {
      if (dislikedSet.has(k)) {
        setDisliked(disliked.filter((t) => keyOf(t) !== k));
        void postFeedback({ undo: topic });
      } else {
        setDisliked([...disliked.filter((t) => keyOf(t) !== k), topic]);
        setLiked(liked.filter((t) => keyOf(t) !== k));
        void postFeedback({ dislike: topic });
      }
    }
  }

  const visibleTopics = useMemo(() => {
    const dislikedSet = new Set(disliked.map(keyOf));
    const likedSet = new Set(liked.map(keyOf));
    const hidden = moreTopics.filter((t) => dislikedSet.has(keyOf(t.title)));
    const shown = moreTopics.filter((t) => !dislikedSet.has(keyOf(t.title)) || showHidden);
    shown.sort((a, b) => {
      const la = likedSet.has(keyOf(a.title)) ? 0 : 1;
      const lb = likedSet.has(keyOf(b.title)) ? 0 : 1;
      return la - lb;
    });
    return { shown, hiddenCount: hidden.length };
  }, [moreTopics, liked, disliked, showHidden]);

  const effectiveNiche = niche ?? nicheThemes;

  async function runIdea(e: React.FormEvent) {
    e.preventDefault();
    const topic = ideaInput.trim();
    if (topic.length < 3) {
      setIdeaError("Give a topic of at least 3 characters.");
      return;
    }
    setIdeaLoading(true);
    setIdeaError(null);
    setIdeaRec(null);
    try {
      const r = await fetch("/api/create/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, channelTitle: own?.title }),
      });
      const d = (await r.json()) as IdeaRec & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Could not build recommendations.");
      setIdeaRec(d);
    } catch (err) {
      setIdeaError(err instanceof Error ? err.message : "Could not build recommendations.");
    } finally {
      setIdeaLoading(false);
    }
  }

  function saveNiche() {
    const list = nicheDraft
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setNiche(list);
    void postFeedback({ niche: list });
    setFineTuneOpen(false);
  }

  return (
    <div className="create-wrap">
      {/* Topic of the Day */}
      <section className="section">
        <h2>Topic of the Day</h2>
        {topicOfDay ? (
          <div className="card create-totd">
            <span className="badge idea-pred idea-pred-high" style={{ alignSelf: "flex-start" }}>
              View prediction: {topicOfDay.prediction}
            </span>
            <h3 style={{ margin: "12px 0 6px", fontSize: 22 }}>{topicOfDay.title}</h3>
            <p className="muted" style={{ marginBottom: 14 }}>{topicOfDay.hook}</p>
            <p className="small muted" style={{ marginBottom: 16 }}>{topicOfDay.whyFits}</p>
            <Link
              href={`/generate?topic=${encodeURIComponent(topicOfDay.title)}`}
              className="btn btn-primary"
            >
              ✦ Preview this topic →
            </Link>
          </div>
        ) : (
          <div className="card">
            <p className="muted" style={{ marginBottom: 0 }}>
              {own
                ? "Today's ideas could not be built yet — open Daily Ideas to generate them."
                : "Connect your channel to get a Topic of the Day built from your own videos."}
            </p>
            {own ? (
              <Link href="/ideas" className="btn btn-primary" style={{ marginTop: 12 }}>
                Open Daily Ideas
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* Saved Ideas */}
      <section className="section">
        <h2>Saved Ideas</h2>
        {savedIdeas.length === 0 ? (
          <p className="muted">
            No saved ideas yet — save one from Daily Ideas and it shows up here.
          </p>
        ) : (
          <div className="create-rail" role="list" aria-label="Saved ideas">
            {savedIdeas.map((s, i) => (
              <Link
                key={s.title}
                href={`/generate?topic=${encodeURIComponent(s.title)}`}
                className="create-saved-card"
                role="listitem"
                style={{ background: GRADIENTS[i % GRADIENTS.length] }}
              >
                <span className="create-saved-title">{s.title}</span>
                <span className="create-saved-pred">View prediction: {s.prediction}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Start From Your Idea */}
      <section className="section">
        <h2>Start From Your Idea</h2>
        <p className="muted">
          Get title and thumbnail recommendations for your ideas — from
          Nizafa&apos;s own generator.
        </p>
        <form onSubmit={runIdea} className="create-idea-form">
          <input
            className="input create-idea-input"
            value={ideaInput}
            onChange={(e) => setIdeaInput(e.target.value)}
            placeholder="Enter a topic or title"
            aria-label="Enter a topic or title"
          />
          <button type="submit" className="btn btn-primary" disabled={ideaLoading}>
            {ideaLoading ? "Building…" : "✦ Get recommendations"}
          </button>
        </form>
        {ideaError ? <p className="error" style={{ marginTop: 12 }}>{ideaError}</p> : null}
        {ideaRec ? (
          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginBottom: 4 }}>Titles for “{ideaRec.topic}”</h3>
            <p className="small muted">{ideaRec.disclaimer}</p>
            <div className="opt-rec-list">
              {ideaRec.titles.map((t) => (
                <div key={t.title} className="opt-rec-row">
                  <span className="opt-rec-score">{t.score}</span>
                  <span className="opt-rec-tag">{t.title}</span>
                </div>
              ))}
            </div>
            <p className="small" style={{ marginTop: 12 }}>
              <strong>Hook:</strong> {ideaRec.hook}
            </p>
            <h3 style={{ marginTop: 16 }}>Thumbnail concepts</h3>
            {ideaRec.thumbnailConcepts.map((c) => (
              <div key={c.bigText} style={{ marginBottom: 12 }}>
                <p style={{ marginBottom: 4 }}>
                  <strong>“{c.bigText}”</strong>
                </p>
                <p className="small muted" style={{ marginBottom: 2 }}>{c.layout}</p>
                <p className="small muted" style={{ marginBottom: 0 }}>{c.imageIdea}</p>
              </div>
            ))}
            <Link
              href={`/generate?topic=${encodeURIComponent(ideaRec.topic)}`}
              className="btn btn-primary"
              style={{ marginTop: 8 }}
            >
              Open full SEO pack in Generate →
            </Link>
          </div>
        ) : null}
      </section>

      {/* Answer Your Audience */}
      <section className="section">
        <h2>Answer Your Audience</h2>
        <p className="muted">Ideas from your comments section — real questions from real viewers.</p>
        {commentLoading ? (
          <p className="muted">Reading your recent comments…</p>
        ) : commentIdeas && commentIdeas.length > 0 ? (
          <div className="create-rail" role="list" aria-label="Comment ideas">
            {commentIdeas.map((c, i) => (
              <div
                key={`${c.videoId}-${c.comment.slice(0, 40)}`}
                className="create-comment-card"
                role="listitem"
                style={{ background: GRADIENTS[(i + 2) % GRADIENTS.length] }}
              >
                <span className="create-comment-quote" aria-hidden="true">“</span>
                <span className="create-comment-text">{c.comment}</span>
                <span className="create-comment-meta">
                  — {c.author} · on “{c.videoTitle}”
                </span>
                <Link
                  href={`/generate?topic=${encodeURIComponent(c.idea.replace(/^Answering: “|”$/g, ""))}`}
                  className="btn btn-sm create-comment-cta"
                >
                  ✦ Preview this answer →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <p className="muted" style={{ marginBottom: 0 }}>
              {commentNote ??
                "No questions in your recent comments yet — check back after your next video."}
            </p>
          </div>
        )}
      </section>

      {/* More Topics for You */}
      <section className="section">
        <div className="section-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>More Topics for You</h2>
            <div className="small muted">Ideas tailored to your niche — rising searches your channel can cover.</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFineTuneOpen((v) => !v)}
          >
            ⚙ Fine Tune Feed
          </button>
        </div>

        {fineTuneOpen ? (
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 6 }}>Fine Tune Feed</h3>
            <p className="small muted">
              Your niche keywords — topics are matched against these words.
              {own ? " Saved to your account." : " Sign in to save them."}
            </p>
            <label className="label" htmlFor="niche-draft">Niche keywords (comma separated)</label>
            <input
              id="niche-draft"
              className="input"
              value={nicheDraft}
              onChange={(e) => setNicheDraft(e.target.value)}
              placeholder={effectiveNiche.join(", ") || "e.g. history, economics, space"}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={saveNiche}>
                Save niche
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNicheDraft(effectiveNiche.join(", "));
                }}
              >
                Use current niche
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNiche(null);
                  setLiked([]);
                  setDisliked([]);
                  void postFeedback({ action: "reset" });
                }}
              >
                Reset all feedback
              </button>
            </div>
            {feedbackMsg ? <p className="small" style={{ marginTop: 10 }}>{feedbackMsg}</p> : null}
          </div>
        ) : null}

        {visibleTopics.shown.length === 0 ? (
          <p className="muted">
            No topics right now — connect a channel so topics can be matched
            to your niche, or check Research for rising keywords.
          </p>
        ) : (
          <div className="create-rail" role="list" aria-label="More topics for you">
            {visibleTopics.shown.map((t, i) => {
              const k = keyOf(t.title);
              const isLiked = liked.some((x) => keyOf(x) === k);
              const isDisliked = disliked.some((x) => keyOf(x) === k);
              return (
                <div
                  key={t.title}
                  className="create-topic-card"
                  role="listitem"
                  style={{ background: GRADIENTS[(i + 1) % GRADIENTS.length] }}
                >
                  <span className="create-topic-title">{t.title}</span>
                  <span className="create-topic-meta">
                    {t.traffic ? `${t.traffic} searches` : ""}
                    {t.isNew ? " · New" : t.growthPct !== null ? ` · ↗ ${t.growthPct}%` : ""}
                  </span>
                  <span className="create-topic-actions">
                    <Link
                      href={`/generate?topic=${encodeURIComponent(t.title)}`}
                      className="create-wand-btn"
                      aria-label={`Preview topic ${t.title}`}
                      title="Preview this topic"
                    >
                      ✦
                    </Link>
                    <button
                      type="button"
                      className={`create-thumb-btn ${isLiked ? "create-thumb-active" : ""}`}
                      onClick={() => thumb(t.title, true)}
                      aria-label={`Like topic ${t.title}`}
                      aria-pressed={isLiked}
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      className={`create-thumb-btn ${isDisliked ? "create-thumb-active" : ""}`}
                      onClick={() => thumb(t.title, false)}
                      aria-label={`Dislike topic ${t.title}`}
                      aria-pressed={isDisliked}
                    >
                      👎
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {visibleTopics.hiddenCount > 0 && !showHidden ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            {visibleTopics.hiddenCount} topic{visibleTopics.hiddenCount === 1 ? "" : "s"} hidden by
            your feedback.{" "}
            <button type="button" className="link-btn" onClick={() => setShowHidden(true)}>
              Show hidden
            </button>
          </p>
        ) : null}
        {feedbackLoaded && (liked.length > 0 || disliked.length > 0) ? (
          <p className="small muted" style={{ marginTop: 10 }}>
            Your feedback tunes this feed — liked topics stay first, disliked
            ones stay hidden{own ? " (saved to your account)" : " (this session only — sign in to save it)"}.
          </p>
        ) : null}
      </section>

      {/* Try Out Top Search Terms */}
      <section className="section">
        <h2>Try Out Top Search Terms</h2>
        {searchTerms.length === 0 ? (
          <p className="muted">No rising search terms in the latest snapshot yet.</p>
        ) : (
          <div className="create-chips">
            {searchTerms.map((term) => (
              <Link key={term} href="/research" className="create-chip">
                ⌕ {term}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Videos Sending You Traffic — honest empty state. */}
      <section className="section">
        <h2>Videos Sending You Traffic</h2>
        <div className="card">
          <p style={{ marginBottom: 6 }}>
            <strong>Not available yet.</strong>
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Which videos send you traffic lives in YouTube Analytics, and
            Nizafa doesn&apos;t request Analytics access yet — so there is
            nothing real to show here. The trending videos in Research and
            Subscribers show what&apos;s working in your niche instead.
          </p>
        </div>
      </section>

      {/* Grow from what you have — real, free (no Boost upsell). */}
      <section className="section">
        <h2>Grow from what you have</h2>
        <p className="muted">
          Three free tools built from your real videos and real trends — no
          upgrade needed.
        </p>

        <h3 style={{ marginTop: 18 }}>🔥 Fill content gaps</h3>
        <p className="small muted">
          High-demand topics in your niche you haven&apos;t covered yet.
        </p>
        {contentGaps.length === 0 ? (
          <p className="muted">
            No clear gaps right now — your videos already cover the top rising
            topics, or no trend snapshot is loaded yet.
          </p>
        ) : (
          <div className="create-rail" role="list" aria-label="Content gaps">
            {contentGaps.map((g, i) => (
              <Link
                key={g.title}
                href={`/generate?topic=${encodeURIComponent(g.title)}`}
                className="create-gap-card"
                role="listitem"
                style={{ background: GRADIENTS[(i + 3) % GRADIENTS.length] }}
              >
                <span className="create-topic-title">{g.title}</span>
                <span className="create-topic-meta">
                  {g.traffic ? `${g.traffic} searches` : "Rising now"}
                </span>
                <span className="create-topic-meta">✦ Preview →</span>
              </Link>
            ))}
          </div>
        )}

        <h3 style={{ marginTop: 22 }}>🔍 Double Down on Your Top Videos</h3>
        <p className="small muted">Your videos that deserve a sequel.</p>
        {doubleDown.length === 0 ? (
          <p className="muted">No videos loaded yet — connect a channel to see your top videos here.</p>
        ) : (
          <div className="create-rail" role="list" aria-label="Double down">
            {doubleDown.map((d) => (
              <div key={d.videoId} className="card create-dd-card" role="listitem">
                <Link href={`/optimize/${d.videoId}`} style={{ color: "var(--ink)", fontWeight: 700 }}>
                  {d.title}
                </Link>
                <p className="small muted" style={{ margin: "6px 0" }}>{d.why}</p>
                <p style={{ marginBottom: 10 }}>
                  <strong>Sequel idea:</strong> {d.sequel}
                </p>
                <Link
                  href={`/generate?topic=${encodeURIComponent(d.sequel)}`}
                  className="btn btn-primary btn-sm"
                >
                  ✦ Preview sequel →
                </Link>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ marginTop: 22 }}>🚀 Remix Your Hottest Videos</h3>
        <p className="small muted">
          Your fastest-rising videos, repackaged as 60-second Shorts.
        </p>
        {remix.length === 0 ? (
          <p className="muted">No videos loaded yet — connect a channel to see remix ideas here.</p>
        ) : (
          <div className="create-rail" role="list" aria-label="Remix ideas">
            {remix.map((r) => (
              <div key={r.videoId} className="card create-dd-card" role="listitem">
                <Link href={`/optimize/${r.videoId}`} style={{ color: "var(--ink)", fontWeight: 700 }}>
                  {r.title}
                </Link>
                <p className="small muted" style={{ margin: "6px 0" }}>
                  {r.vph.toLocaleString("en-US")} views per hour right now.
                </p>
                <p style={{ marginBottom: 6 }}>
                  <strong>Short idea:</strong> {r.shortIdea}
                </p>
                <p className="small muted" style={{ marginBottom: 10 }}>{r.hook}</p>
                <Link
                  href={`/generate?topic=${encodeURIComponent(r.shortIdea)}`}
                  className="btn btn-primary btn-sm"
                >
                  ✦ Preview Short →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
