"use client";

import { useEffect, useState } from "react";
import { SectionTitle, EmptyState } from "@/components/ui";

type Lesson = {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  points: string[];
};

// Original Nizafa Academy curriculum — short, practical lessons.
const LESSONS: Lesson[] = [
  {
    id: "find-your-niche",
    title: "1. Find your niche",
    minutes: 8,
    summary: "Pick one audience and one promise, and let every video serve them.",
    points: [
      "A niche is an audience, not a topic — name the viewer first.",
      "List 20 video ideas inside that niche before you publish one.",
      "If an idea does not fit the niche, save it for later — do not dilute the channel.",
    ],
  },
  {
    id: "titles-that-get-clicks",
    title: "2. Titles that get clicks",
    minutes: 10,
    summary: "Promise one clear payoff in under 60 characters.",
    points: [
      "Benefit or surprise first; never promise what the video does not deliver.",
      "Write 5 titles per video and pick the one a stranger would click.",
      "Retitle an old video when its click-through rate is under 4%.",
    ],
  },
  {
    id: "tags-descriptions",
    title: "3. Tags and descriptions that help search",
    minutes: 8,
    summary: "Help YouTube understand the video — the title and first lines matter most.",
    points: [
      "Use 10–15 tags: the exact phrase, close variations, then the category.",
      "Put the main keyword in the title and the first two lines of the description.",
      "Never paste a keyword list — it reads as spam and helps nobody.",
    ],
  },
  {
    id: "thumbnails",
    title: "4. Thumbnails people can read in one second",
    minutes: 10,
    summary: "One face, one short phrase, strong contrast — readable at phone size.",
    points: [
      "One face with a clear emotion, 3–4 big words, dark background with bright text.",
      "Do not repeat the title word for word — add a new reason to click.",
      "Check every thumbnail at small size before publishing.",
    ],
  },
  {
    id: "hooks-retention",
    title: "5. Hooks and retention",
    minutes: 10,
    summary: "Earn the click in the first 30 seconds, then keep the picture moving.",
    points: [
      "Say the most surprising or useful thing in the first sentence.",
      "Change the visual on every beat: a new shot, graphic or example.",
      "Cut slow intros — if removing the first 30 seconds improves the video, cut them.",
    ],
  },
  {
    id: "shorts-strategy",
    title: "6. Shorts as a discovery engine",
    minutes: 8,
    summary: "One idea per Short, used as a trailer for your long videos.",
    points: [
      "Hook in the first 2 seconds; one payoff in under 60 seconds.",
      "Ask the question in the Short, answer it in the long video.",
      "At most 1–2 Shorts a day — never at the cost of the weekly long video.",
    ],
  },
  {
    id: "analytics",
    title: "7. Reading your analytics",
    minutes: 10,
    summary: "Three numbers tell you what to fix: CTR, average view duration, views per hour.",
    points: [
      "Low CTR → fix the title and thumbnail. Early drop-off → fix the opening.",
      "Judge a video after 48–72 hours, never in the first hour.",
      "Compare against your own channel average, not against big channels.",
    ],
  },
  {
    id: "consistency-schedule",
    title: "8. Consistency and a schedule you can keep",
    minutes: 6,
    summary: "A rhythm viewers can trust beats daily uploads you cannot sustain.",
    points: [
      "One long video a week on the same day is a strong rhythm.",
      "Batch titles and outlines so a busy week never means a missed week.",
      "If you miss a week, say so plainly in the next video.",
    ],
  },
  {
    id: "growth-monetization",
    title: "9. Growing to monetization",
    minutes: 8,
    summary: "What the Partner Program actually requires, and what usually blocks it.",
    points: [
      "1,000 subscribers and 4,000 public watch hours in 12 months (or 10M Shorts views in 90 days).",
      "Grow watch time with longer, useful videos — Shorts views alone rarely qualify a channel.",
      "Never reuse other creators' clips: reused content is the most common rejection reason.",
    ],
  },
  {
    id: "channel-audit",
    title: "10. Auditing your own channel",
    minutes: 8,
    summary: "A four-question audit you can run on any channel in ten minutes.",
    points: [
      "Do your last 10 titles each promise one clear thing?",
      "Does every video have a full description, tags and a readable thumbnail?",
      "Have you posted at least once a week for the last month?",
      "Fix the weakest of the four first — then re-audit next month.",
    ],
  },
];

export default function AcademyPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      <section className="hero">
        <div className="kicker">Nizafa Academy</div>
        <h1>Learn YouTube growth, lesson by lesson</h1>
        <p className="muted">
          Ten short, practical lessons — from finding your niche to auditing
          your own channel. Tick a lesson off when you finish it; your
          progress is saved to your account.
        </p>
        <p>
          <span className="badge badge-teal">
            {doneCount} of {LESSONS.length} lessons complete
          </span>
        </p>
      </section>

      {signedIn === false ? (
        <div className="notice" style={{ marginTop: 16 }}>
          Sign in with Google to save your Academy progress. You can still
          read every lesson below.
        </div>
      ) : null}
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

      <section className="section">
        <SectionTitle title="Curriculum" sub="Original lessons written for Nizafa creators." />
        <div className="grid grid-2">
          {LESSONS.map((l) => {
            const isDone = done.has(l.id);
            return (
              <article className="card" key={l.id} style={isDone ? { borderColor: "var(--teal-500)" } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <h3 style={{ marginBottom: 4 }}>{l.title}</h3>
                  <span className="badge">{l.minutes} min</span>
                </div>
                <p className="muted">{l.summary}</p>
                <ul style={{ margin: "0 0 14px", paddingInlineStart: 18 }}>
                  {l.points.map((p) => (
                    <li key={p} className="small" style={{ marginBottom: 4 }}>{p}</li>
                  ))}
                </ul>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", minHeight: 44 }}>
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggle(l.id)}
                    disabled={signedIn === false}
                    style={{ width: 20, height: 20, accentColor: "var(--teal-700)" }}
                  />
                  <span style={{ fontWeight: 700 }}>{isDone ? "✓ Completed" : "Mark as complete"}</span>
                </label>
              </article>
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
