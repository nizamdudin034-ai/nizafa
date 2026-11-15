"use client";

// First-run onboarding tour: 4 short cards, dismissible, shown once per
// browser (localStorage). Shown only to signed-in users on the home page.
import { useEffect, useState } from "react";

const STEPS = [
  {
    title: "Welcome to Nizafa 👋",
    body: "Your YouTube growth workspace. Connect your channel and everything on this page becomes about YOUR channel — its stats, videos, and ideas.",
  },
  {
    title: "1. Connect your channel",
    body: "Paste your channel link or @handle. Nizafa pulls your real stats, videos and views from the official YouTube Data API — no password, no scraping.",
  },
  {
    title: "2. Generate an SEO pack",
    body: "Open Generate, type a video topic, and get scored titles, tags, hashtags, a description, a script outline and thumbnail concepts — one click to copy.",
  },
  {
    title: "3. Make the thumbnail",
    body: "Thumbnail Studio composes a real downloadable thumbnail in the Nizafa style — or upload a reference you like and it writes a prompt in that style.",
  },
];

export default function OnboardingTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem("nizafa-tour-done")) setStep(0);
    } catch {
      setStep(null);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem("nizafa-tour-done", "1");
    } catch {
      // ignore
    }
    setStep(null);
  }

  if (step === null) return null;
  const s = STEPS[step];
  return (
    <div className="tour-backdrop" role="dialog" aria-label="Onboarding tour">
      <div className="card tour-card">
        <span className="badge badge-teal">
          Step {step + 1} of {STEPS.length}
        </span>
        <h2 style={{ marginTop: 10 }}>{s.title}</h2>
        <p className="muted">{s.body}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
            Skip tour
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
            >
              Next →
            </button>
          ) : (
            <button type="button" className="btn btn-gold" onClick={dismiss}>
              Start using Nizafa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
