"use client";

// /learn — Nizafa Academy in a Masterclass-style layout.
// Original Nizafa lessons only (src/lib/academy.ts): no copied lesson
// titles, creators or thumbnails from anywhere else. Every lesson is FREE
// on every plan — there is no Unlock gate; progress just needs a Google
// sign-in so it can be saved to the account (/api/academy).
import { useEffect, useState } from "react";
import { LESSONS, lessonDuration } from "@/lib/academy";
import { SectionTitle, EmptyState } from "@/components/ui";

const GRADIENTS = [
  "linear-gradient(135deg, #0b4f46, #12a08a)",
  "linear-gradient(135deg, #1e3a8a, #2563eb)",
  "linear-gradient(135deg, #7c2d12, #ea580c)",
  "linear-gradient(135deg, #4c1d95, #7c3aed)",
  "linear-gradient(135deg, #831843, #db2777)",
  "linear-gradient(135deg, #14532d, #16a34a)",
  "linear-gradient(135deg, #78350f, #d97706)",
  "linear-gradient(135deg, #0f766e, #06b6d4)",
  "linear-gradient(135deg, #1e1b4b, #4338ca)",
  "linear-gradient(135deg, #3f3f46, #71717a)",
];

export default function LearnPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string>(LESSONS[0].id);

  useEffect(() => {
    fetch("/api/academy")
      .then((r) => r.json())
      .then((d: { progress?: Array<{ lesson_id: string; done: boolean }>; error?: string }) => {
        if (d.error) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setDone(new Set((d.progress ?? []).filter((p) => p.done).map((p) => p.lesson_id)));
      })
      .catch(() => setSignedIn(false));
  }, []);

  async function toggle(lessonId: string) {
    const nextDone = !done.has(lessonId);
    const prev = new Set(done);
    const next = new Set(done);
    if (nextDone) next.add(lessonId);
    else next.delete(lessonId);
    setDone(next);
    setError(null);
    try {
      const res = await fetch("/api/academy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, done: nextDone }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save progress.");
    } catch (e) {
      setDone(prev);
      setError(e instanceof Error ? e.message : "Could not save progress.");
    }
  }

  const doneCount = LESSONS.filter((l) => done.has(l.id)).length;
  const open = LESSONS.find((l) => l.id === openId) ?? LESSONS[0];

  return (
    <>
      <div className="opt-page-head">
        <h1>Learn</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Nizafa Academy — short, practical lessons on titles, thumbnails,
          retention and growth, written for Nizafa creators. Every lesson is
          free.
        </p>
      </div>

      <section className="section">
        <div className="learn-master-head">
          <span className="learn-master-pill">Masterclass</span>
          <span className="badge badge-teal">
            {doneCount} of {LESSONS.length} lessons complete
          </span>
        </div>
        <p className="muted">
          Ten lessons, from finding your niche to auditing your own channel.
          Tap a lesson to read it; tick it off when you finish it.
        </p>
        {signedIn === false ? (
          <div className="notice" style={{ marginTop: 12 }}>
            Sign in with Google to save your lesson progress. You can still
            read every lesson below.
          </div>
        ) : null}
        {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

        {/* Masterclass row — horizontal scroll, two cards visible on phones. */}
        <div className="learn-rail" role="list" aria-label="Academy lessons">
          {LESSONS.map((l, i) => {
            const isDone = done.has(l.id);
            const active = l.id === openId;
            return (
              <button
                key={l.id}
                type="button"
                role="listitem"
                className={`learn-card ${active ? "learn-card-active" : ""}`}
                style={{ background: GRADIENTS[i % GRADIENTS.length] }}
                onClick={() => setOpenId(l.id)}
                aria-pressed={active}
              >
                <span className="learn-card-top">
                  <span className="badge learn-free-badge">Free</span>
                  <span className="badge learn-dur-badge">{lessonDuration(l.minutes)}</span>
                </span>
                <span className="learn-card-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="learn-card-title">{l.title.replace(/^\d+\.\s*/, "")}</span>
                <span className="learn-card-summary">{l.summary}</span>
                {isDone ? <span className="learn-card-done">✓ Completed</span> : null}
              </button>
            );
          })}
        </div>

        {/* Open lesson. */}
        <article className="card learn-detail" aria-live="polite">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <h2 style={{ marginBottom: 4 }}>{open.title}</h2>
            <span className="badge">{lessonDuration(open.minutes)}</span>
          </div>
          <p className="muted">{open.summary}</p>
          <ul style={{ margin: "0 0 14px", paddingInlineStart: 18 }}>
            {open.points.map((p) => (
              <li key={p} style={{ marginBottom: 6 }}>{p}</li>
            ))}
          </ul>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 44 }}>
            <input
              type="checkbox"
              checked={done.has(open.id)}
              onChange={() => toggle(open.id)}
              disabled={signedIn === false}
              style={{ width: 20, height: 20, accentColor: "var(--teal-700)" }}
            />
            <span style={{ fontWeight: 700 }}>
              {done.has(open.id) ? "✓ Completed" : "Mark as complete"}
            </span>
          </label>
        </article>
      </section>

      <section className="section">
        <SectionTitle title="All lessons" sub="The full curriculum, in order." />
        <div className="learn-list">
          {LESSONS.map((l, i) => {
            const isDone = done.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={`learn-row ${l.id === openId ? "learn-row-active" : ""}`}
                onClick={() => {
                  setOpenId(l.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span className="learn-row-num">{i + 1}</span>
                <span className="learn-row-body">
                  <strong>{l.title}</strong>
                  <span className="small muted" style={{ display: "block" }}>{l.summary}</span>
                </span>
                <span className="badge">{lessonDuration(l.minutes)}</span>
                {isDone ? <span className="badge badge-teal">✓</span> : null}
              </button>
            );
          })}
        </div>
        {doneCount === LESSONS.length ? (
          <div style={{ marginTop: 16 }}>
            <EmptyState
              title="Curriculum complete — well done!"
              body="You have finished all ten lessons. Revisit the audit lesson each month and keep applying one fix at a time."
            />
          </div>
        ) : null}
      </section>
    </>
  );
}
