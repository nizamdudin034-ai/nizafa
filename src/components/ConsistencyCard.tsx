// Consistency card — one match score for title + description + script +
// thumbnail, with per-part bars and 3 alternative titles, each with its
// own score. Clicking a title applies it to the saved pack (via
// /api/consistency). Scores are rule-based estimates computed from the
// pack's own text — never invented.
"use client";

import { useState } from "react";
import type { ConsistencyResult } from "@/lib/consistency";

export type AlternativeTitle = {
  title: string;
  score: number;
  titleScore: number;
  why: string;
};

export type ConsistencyInitial = {
  packageId: number;
  topic: string;
  currentTitle: string;
  consistency: ConsistencyResult;
  alternatives: AlternativeTitle[];
};

function badgeClass(score: number): string {
  if (score >= 80) return "score-badge sb-good";
  if (score >= 60) return "score-badge sb-warn";
  return "score-badge sb-bad";
}

export default function ConsistencyCard({
  initial,
}: {
  initial: ConsistencyInitial;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/consistency", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: data.packageId, ...body }),
      });
      const d = (await res.json()) as ConsistencyInitial & {
        applied?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Could not score titles.");
      setData({
        packageId: d.packageId,
        topic: d.topic,
        currentTitle: d.currentTitle,
        consistency: d.consistency,
        alternatives: d.alternatives,
      });
      if (d.applied) setMessage("Title applied to your saved pack.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not score titles.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    const next = (variant + 1) % 3;
    setVariant(next);
    await call({ variant: next });
  }

  async function apply(title: string) {
    setVariant(0);
    await call({ action: "apply", title });
  }

  const c = data.consistency;

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Title match &amp; consistency</h2>
          <div className="small muted">
            One score for title + description + script + thumbnail — from your
            latest pack: “{data.topic}”.
          </div>
        </div>
        <span className={badgeClass(c.score)}>{c.score}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="small" style={{ fontWeight: 700 }}>Current title</div>
        <div>{data.currentTitle}</div>
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        {c.parts.map((p) => (
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

      {c.notes.map((n) => (
        <p key={n} className="small muted" style={{ marginBottom: 6 }}>
          {n}
        </p>
      ))}

      <div className="drawer-section" style={{ margin: "16px 0 8px" }}>
        Suggested titles
      </div>
      {data.alternatives.length === 0 ? (
        <p className="muted small">
          No better-matching title in this pack. Press Regenerate for fresh
          alternatives.
        </p>
      ) : (
        data.alternatives.map((a) => (
          <button
            key={a.title}
            type="button"
            className="suggest-row"
            onClick={() => apply(a.title)}
            disabled={busy}
            title="Click to apply this title to your pack"
          >
            <span className={badgeClass(a.score)}>{a.score}</span>
            <span style={{ minWidth: 0, textAlign: "start" }}>
              <span style={{ display: "block", fontWeight: 600 }}>{a.title}</span>
              <span className="small muted" style={{ display: "block" }}>
                Match {a.score}/100 · Title score {a.titleScore}/100 — click to apply
              </span>
            </span>
          </button>
        ))
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={regenerate}
          disabled={busy}
        >
          ⟳ Regenerate
        </button>
        <span className="small muted" style={{ alignSelf: "center" }}>
          Scores are rule-based estimates from your own pack text — not
          predictions of views.
        </span>
      </div>
      {message ? <p className="small" style={{ color: "var(--teal-600)", marginTop: 10, marginBottom: 0 }}>{message}</p> : null}
      {error ? <p className="error small" style={{ marginTop: 10, marginBottom: 0 }}>{error}</p> : null}
    </div>
  );
}
