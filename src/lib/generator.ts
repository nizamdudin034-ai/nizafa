// Growth engine — rule-based SEO pack generator (NO AI, NO external calls).
// Every score is a transparent, labelled editorial estimate built from
// visible signals (length, numbers, questions, power words). Nothing here
// invents view counts, subscribers, or performance predictions.

export type SeoTitle = {
  title: string;
  /** 0–100, rule-based editorial estimate — NOT a prediction of views. */
  score: number;
  style: string;
  why: string;
};

export type ScriptSection = {
  section: string;
  seconds: number;
  points: string[];
};

export type ThumbnailConcept = {
  bigText: string;
  layout: string;
  imageIdea: string;
};

export type SeoPack = {
  topic: string;
  channelTitle: string | null;
  bestTitle: string;
  titles: SeoTitle[];
  tags: string[];
  hashtags: string[];
  descriptionStarter: string;
  hook: string;
  scriptOutline: ScriptSection[];
  thumbnailConcepts: ThumbnailConcept[];
  consistency: { pass: boolean; notes: string[] };
  /** Labelling required by the contract: scores are editorial estimates. */
  disclaimer: string;
  generatedAt: string;
};

export type KeywordIdea = {
  keyword: string;
  angle: string;
};

const POWER_WORDS = [
  "secret",
  "truth",
  "shocking",
  "exposed",
  "banned",
  "hidden",
  "untold",
  "revealed",
  "real story",
  "nobody tells you",
  "mistake",
  "breakthrough",
  "massive",
  "insane",
  "why",
  "how",
  "what happened",
  "the full story",
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "it", "its", "this", "that", "by", "at",
  "from", "as", "be", "has", "have", "had", "will", "would", "can",
  "about", "into", "over", "after", "before", "between", "how", "why",
  "what", "when", "who", "which", "you", "your", "we", "our", "they",
  "their", "he", "she", "his", "her", "not", "no", "but", "if", "so",
]);

export function cleanTopic(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 200);
}

/** Title-case a topic for use inside generated titles. */
export function titleCase(text: string): string {
  return text
    .split(" ")
    .map((w) =>
      STOPWORDS.has(w.toLowerCase()) && w.length > 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Content words of the topic (length > 2, not stopwords). */
export function topicKeywords(topic: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of topic.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length > 2 && !STOPWORDS.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

function hasNumber(text: string): boolean {
  return /\d/.test(text);
}

function hasPowerWord(text: string): string | null {
  const lower = text.toLowerCase();
  return POWER_WORDS.find((p) => lower.includes(p)) ?? null;
}

/**
 * Transparent rule-based title score (0–100). Every point comes from a
 * visible signal; the returned `signals` list explains the score.
 */
export function scoreTitle(title: string, topic: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;
  const len = title.length;
  if (len >= 45 && len <= 65) {
    score += 30;
    signals.push("Ideal length (45–65 characters)");
  } else if ((len >= 30 && len < 45) || (len > 65 && len <= 80)) {
    score += 18;
    signals.push("Good length (30–44 or 66–80 characters)");
  } else {
    score += 5;
    signals.push(len < 30 ? "Very short — may lack detail" : "Long — may be cut off in search");
  }
  if (hasNumber(title)) {
    score += 15;
    signals.push("Contains a number (draws the eye)");
  }
  if (title.includes("?")) {
    score += 10;
    signals.push("Asks a question (curiosity)");
  }
  const power = hasPowerWord(title);
  if (power) {
    score += 15;
    signals.push(`Power word/phrase: “${power}”`);
  }
  const keywords = topicKeywords(topic);
  const matched = keywords.filter((k) => title.toLowerCase().includes(k));
  if (matched.length > 0) {
    score += 20;
    signals.push(`Contains topic keyword${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}`);
  } else {
    signals.push("Does not repeat a topic keyword");
  }
  if (len <= 100) {
    score += 10;
    signals.push("Fits within YouTube's display limit");
  }
  return { score: Math.min(100, score), signals };
}

function suffix(channelTitle: string | null): string {
  return channelTitle ? ` | ${channelTitle}` : "";
}

function buildTitles(topic: string, channelTitle: string | null): SeoTitle[] {
  const t = titleCase(topic);
  const suf = suffix(channelTitle);
  const drafts: Array<{ title: string; style: string }> = [
    {
      title: `${t}: The Story Nobody Tells You${suf}`,
      style: "Curiosity gap",
    },
    {
      title: `5 Things About ${t} That Change Everything${suf}`,
      style: "Numbered list",
    },
    {
      title: `Why Is Everyone Suddenly Talking About ${t}?${suf}`,
      style: "Question",
    },
    {
      title: `How ${t} Actually Works — Explained Simply${suf}`,
      style: "How-to / explainer",
    },
    {
      title: `${t}: The Truth Behind the Headlines${suf}`,
      style: "Bold claim",
    },
  ];
  return drafts.map((d) => {
    const { score, signals } = scoreTitle(d.title, topic);
    return { ...d, score, why: signals.join(" · ") };
  });
}

function dedupeKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function buildTags(topic: string): string[] {
  const lower = topic.toLowerCase();
  const keywords = topicKeywords(topic);
  const candidates = [
    lower,
    `${lower} explained`,
    `${lower} documentary`,
    `${lower} 2026`,
    `how ${lower} works`,
    `why ${lower} matters`,
    `the truth about ${lower}`,
    `${lower} full story`,
    `${lower} history`,
    `${lower} news`,
    ...keywords,
    ...keywords.slice(0, 2).map((k) => `${k} explained`),
    "documentary",
    "explained",
    "deep dive",
  ];
  return dedupeKeepOrder(candidates).slice(0, 15);
}

function buildHashtags(topic: string): string[] {
  const keywords = topicKeywords(topic);
  const compact = (s: string) =>
    "#" +
    s
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  const candidates = [
    compact(topic),
    compact(`${topic} explained`),
    "#Documentary",
    "#DeepDive",
    "#Explained",
    ...keywords.slice(0, 3).map((k) => compact(k)),
  ];
  return dedupeKeepOrder(candidates).slice(0, 8);
}

function buildScriptOutline(topic: string): ScriptSection[] {
  const t = topic.toLowerCase();
  return [
    {
      section: "Hook (0:00–0:15)",
      seconds: 15,
      points: [
        `Open with the most surprising fact about ${t} — no preamble.`,
        "State the question this video answers in one sentence.",
      ],
    },
    {
      section: "The setup (0:15–1:30)",
      seconds: 75,
      points: [
        `What ${t} is, in plain language a new viewer can follow.`,
        "Why it matters right now — the stakes for the viewer.",
      ],
    },
    {
      section: "The turning point (1:30–3:00)",
      seconds: 90,
      points: [
        "The moment everything changed — the event or decision at the centre.",
        "Show the key people involved, with name and role on screen.",
      ],
    },
    {
      section: "The evidence (3:00–5:00)",
      seconds: 120,
      points: [
        "The numbers and documents, attributed to their source on screen.",
        "The counter-argument, stated fairly before answering it.",
      ],
    },
    {
      section: "What it means (5:00–7:00)",
      seconds: 120,
      points: [
        `Who wins and who loses from ${t} — and why.`,
        "What happens next: the realistic scenarios, not guesses.",
      ],
    },
    {
      section: "The takeaway + CTA (7:00–8:30)",
      seconds: 90,
      points: [
        "One clear takeaway the viewer can repeat to a friend.",
        "Ask one question in the comments; subscribe call-to-action.",
      ],
    },
  ];
}

function punchWords(topic: string): string {
  const keywords = topicKeywords(topic);
  return keywords.slice(0, 3).join(" ").toUpperCase() || topic.toUpperCase();
}

function buildThumbnailConcepts(topic: string): ThumbnailConcept[] {
  const punch = punchWords(topic);
  return [
    {
      bigText: punch,
      layout: "Face cutout on the right third, evidence image left/centre, dark navy background, solid red banner across the bottom with the big text.",
      imageIdea: `A single striking image that proves the story about ${topic.toLowerCase()} — a document, a place, or a moment, not a generic stock photo.`,
    },
    {
      bigText: "THE TRUTH",
      layout: "Split screen: before on the left, after on the right; big text on the red banner at the bottom, punch word in yellow.",
      imageIdea: `Two contrasting images from the ${topic.toLowerCase()} story — what people believed vs what actually happened.`,
    },
    {
      bigText: "WHAT HAPPENED?",
      layout: "One shocked face or key figure right third, question text huge on the red banner, dark background, minimal clutter.",
      imageIdea: `The key person or place at the centre of ${topic.toLowerCase()}, shot tight so the emotion reads at thumbnail size.`,
    },
  ];
}

/** Full SEO pack for a topic. Pure function — no network, no secrets. */
export function generateSeoPack(rawTopic: string, channelTitle?: string): SeoPack {
  const topic = cleanTopic(rawTopic);
  const channel = channelTitle?.trim() ? channelTitle.trim() : null;
  const titles = buildTitles(topic, channel).sort((a, b) => b.score - a.score);
  const bestTitle = titles[0].title;
  const tags = buildTags(topic);
  const hashtags = buildHashtags(topic);
  const t = topic.toLowerCase();
  const descriptionStarter =
    `${titleCase(topic)} — the full story, explained simply.\n\n` +
    `In this video: what ${t} really is, the moment it changed, and what it means next. ` +
    `Every claim is sourced on screen.\n\n` +
    `Chapters:\n00:00 The hook\n00:15 The setup\n01:30 The turning point\n03:00 The evidence\n05:00 What it means\n07:00 The takeaway\n\n` +
    (channel
      ? `Subscribe to ${channel} for one deep dive every week.`
      : `Subscribe for one deep dive every week.`);
  const hook = `Most people get ${t} completely wrong — and in the next eight minutes, you'll see exactly why.`;
  const scriptOutline = buildScriptOutline(topic);
  const thumbnailConcepts = buildThumbnailConcepts(topic);

  const notes: string[] = [];
  const keywords = topicKeywords(topic);
  const titleHasKeyword = keywords.some((k) => bestTitle.toLowerCase().includes(k));
  notes.push(
    titleHasKeyword
      ? "Best title contains a topic keyword."
      : "Best title does not repeat a topic keyword — consider adding one."
  );
  notes.push(
    tags.length >= 10
      ? `Tag set complete: ${tags.length} topic-derived tags.`
      : `Only ${tags.length} tags generated — add more topic variants before publishing.`
  );
  notes.push(
    descriptionStarter.toLowerCase().includes(t)
      ? "Description opens with the topic."
      : "Description does not mention the topic — fix before publishing."
  );
  const thumbSharesWord = thumbnailConcepts.some((c) =>
    c.bigText.toLowerCase().split(/\s+/).some((w) => keywords.includes(w.toLowerCase()))
  );
  notes.push(
    thumbSharesWord
      ? "Thumbnail text shares a word with the title."
      : "Thumbnail text is generic — tie one word to the title."
  );
  const pass = titleHasKeyword && descriptionStarter.toLowerCase().includes(t);

  return {
    topic,
    channelTitle: channel,
    bestTitle,
    titles,
    tags,
    hashtags,
    descriptionStarter,
    hook,
    scriptOutline,
    thumbnailConcepts,
    consistency: { pass, notes },
    disclaimer:
      "Editorial estimate: title scores are rule-based signals (length, numbers, questions, power words), not predictions of views or rankings.",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Keyword ideas for a topic — token expansions plus question/how/why
 * variants. Pure string work; no YouTube API call happens here.
 */
export function buildKeywordIdeas(rawTopic: string): KeywordIdea[] {
  const topic = cleanTopic(rawTopic);
  const lower = topic.toLowerCase();
  const keywords = topicKeywords(topic);
  const variants: Array<[string, string]> = [
    [lower, "Core topic phrase"],
    [`${lower} explained`, "Explainer angle"],
    [`${lower} documentary`, "Long-form angle"],
    [`how ${lower} works`, "How-it-works search"],
    [`why ${lower} matters`, "Why-it-matters search"],
    [`what is ${lower}`, "Definition search"],
    [`${lower} full story`, "Deep-dive search"],
    [`the truth about ${lower}`, "Curiosity search"],
    [`${lower} history`, "Background search"],
    [`${lower} 2026`, "Current-year search"],
    [`${lower} vs`, "Comparison search (finish the phrase)"],
    [`${lower} for beginners`, "Beginner search"],
  ];
  for (const k of keywords.slice(0, 3)) {
    variants.push([`${k} explained`, `Single-keyword angle: ${k}`]);
  }
  const seen = new Set<string>();
  const out: KeywordIdea[] = [];
  for (const [keyword, angle] of variants) {
    if (!seen.has(keyword)) {
      seen.add(keyword);
      out.push({ keyword, angle });
    }
  }
  return out;
}
