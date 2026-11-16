// Nizafa Academy curriculum — original lessons written for Nizafa.
// Shared by /learn (the Masterclass-style page) and the progress API.
// Every lesson is FREE on every plan: the Academy has no Pro gate —
// progress only needs a Google sign-in so it can be saved to the account.

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  points: string[];
};

export const LESSONS: Lesson[] = [
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

/** "8 min" / "1h 5m" style duration label. */
export function lessonDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
