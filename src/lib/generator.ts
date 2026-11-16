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

/** Video length the pack is built for. "long" = 8–9 min documentary. */
export type VideoLength = "long" | "short";

/** One timed beat of the video outline (the vidIQ-style beat map). */
export type OutlineBeat = {
  name: string;
  /** Beat length in seconds. */
  seconds: number;
  /** Direction for what this beat must do — written from the topic. */
  guidance: string;
};

export type SeoPack = {
  topic: string;
  channelTitle: string | null;
  /** "long" = 8–9 min, "short" = ~60 s. */
  length: VideoLength;
  bestTitle: string;
  titles: SeoTitle[];
  tags: string[];
  hashtags: string[];
  descriptionStarter: string;
  hook: string;
  /** All hook variants (the first is the one in `hook`). */
  hookVariants: string[];
  scriptOutline: ScriptSection[];
  /** Timed beat map: Hook 15s, Introduction 15s, Problem 1m, Exploration 1m, Climax 1m, Conclusion 15s, CTA 15s (long) — or the 60s map (short). */
  videoOutline: OutlineBeat[];
  /** Full draft narration script, written from the topic + outline. A draft: check every claim against your sources before recording. */
  scriptDraft: string;
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

/** Three hook variants for one topic (the first is the pack's hook). */
export function buildHookVariants(topic: string): string[] {
  const t = topic.toLowerCase();
  const tc = titleCase(topic);
  return [
    `Most people get ${t} completely wrong — and in the next few minutes, you'll see exactly why.`,
    `What if everything you believed about ${t} was backwards? Here's the part nobody shows you.`,
    `${tc} — the story they don't tell you. It starts with one question.`,
  ];
}

type BeatDef = { name: string; seconds: number };

const LONG_BEATS: BeatDef[] = [
  { name: "Hook", seconds: 15 },
  { name: "Introduction", seconds: 15 },
  { name: "Presentation of Problem/Challenge", seconds: 60 },
  { name: "Exploration/Development", seconds: 60 },
  { name: "Climax/Key Moment", seconds: 60 },
  { name: "Conclusion/Summary", seconds: 15 },
  { name: "Call to Action (CTA)", seconds: 15 },
];

const SHORT_BEATS: BeatDef[] = [
  { name: "Hook", seconds: 5 },
  { name: "The Problem", seconds: 15 },
  { name: "The Payoff", seconds: 25 },
  { name: "Call to Action (CTA)", seconds: 15 },
];

/**
 * Direction text for one beat. Variant 0 and 1 are two honest ways to
 * shoot the same beat — "Regenerate" on the Outline switches between
 * them. Nothing here invents facts about the topic: it says what the
 * beat must show, so the creator fills it with their own research.
 */
function beatGuidance(name: string, topic: string, hook: string, variant: number): string {
  const t = topic.toLowerCase();
  const v = variant === 1;
  switch (name) {
    case "Hook":
      return v
        ? `Say the most surprising true thing about ${t} in the first sentence — the result, the number, or the contradiction. No welcome, no channel intro; the viewer decides in seconds.`
        : `Open with a provocative question or the most striking fact about ${t} — no preamble. State the question this video answers in one sentence, so the viewer knows the payoff before the first 15 seconds are over.`;
    case "Introduction":
      return v
        ? `Name the mystery in plain words: what about ${t} does not add up, and what this video will prove. Keep it to two sentences — the setup is a door, not a room.`
        : `Briefly introduce the video's central mystery: the incredible transformation or contradiction at the heart of ${t}. State the video's goal — to unravel this story step by step.`;
    case "Presentation of Problem/Challenge":
      return v
        ? `Lay out the problem in the open: what people believed about ${t}, and why that belief is now being challenged. Show the stakes — who is affected, and what it costs them.`
        : `Explain the public perception and the initial disbelief surrounding ${t}. Highlight the apparent contradiction that makes this story so compelling and hard to understand.`;
    case "Exploration/Development":
      return v
        ? `Trace the journey: the background of ${t}, the key events in order, and the turning points. Every claim gets its source on screen — show the document, the clip, or the number, don't just say it.`
        : `Delve into the background of ${t}, detailing the circumstances that led here. Then, meticulously trace the journey of transformation, highlighting key events, changes, and the steps that led to where things stand now.`;
    case "Climax/Key Moment":
      return v
        ? `Land on the pivotal moment — the speech, the vote, the decision, the reveal — that truly shifted opinion about ${t}. Slow down here: let the evidence speak before you comment on it.`
        : `Focus on the pivotal moment or series of events that truly shifted public opinion or changed what was possible around ${t}. This could be a powerful speech, a significant victory, or a key endorsement that marked a turning point.`;
    case "Conclusion/Summary":
      return v
        ? `Say the takeaway in one sentence a viewer could repeat to a friend. Then name the bigger implication of ${t} — what it says about redemption, power, or change.`
        : `Summarize the journey and the key factors that made it possible. Reflect on the broader implications of this story regarding redemption, political opportunity, or societal change.`;
    case "Call to Action (CTA)":
      return v
        ? `Ask one real question in the comments about ${t} — not "what do you think", but the specific question this video leaves open. Then the subscribe call-to-action, once.`
        : `Ask viewers to share their thoughts on this transformation in the comments below. Encourage them to subscribe for more stories of intrigue and change.`;
    case "The Problem":
      return `In one breath: what is wrong or surprising about ${t}, and why should anyone care? One fact, one question, no throat-clearing.`;
    case "The Payoff":
      return v
        ? `Deliver the answer: the single most surprising true thing about ${t}, shown with one clear piece of evidence on screen. Then stop — a Short ends on the payoff, not after it.`
        : `Show the answer fast: the twist, the number, or the reveal about ${t} that makes the video worth sharing. One piece of evidence on screen, then the takeaway in one line.`;
    default:
      return `Cover ${t} clearly and keep the viewer oriented: one idea per beat, one visual change per sentence.`;
  }
}

/** Timed beat map for a topic. Pure function — no network, no secrets. */
export function buildVideoOutline(
  topic: string,
  hook: string,
  length: VideoLength = "long",
  variant = 0
): OutlineBeat[] {
  const beats = length === "short" ? SHORT_BEATS : LONG_BEATS;
  return beats.map((b) => ({
    name: b.name,
    seconds: b.seconds,
    guidance: beatGuidance(b.name, topic, hook, variant),
  }));
}

/**
 * Full draft narration script, written from the topic, the title and the
 * outline beats. It is a DRAFT: the wording is real and topic-specific,
 * but it contains no invented facts, numbers, names or dates — the
 * creator must fill each beat with their own sourced research before
 * recording. Word count and read time are computed from the text itself.
 */
export function buildScriptDraft(
  topic: string,
  title: string,
  hook: string,
  outline: OutlineBeat[],
  length: VideoLength = "long",
  variant = 0
): string {
  const t = topic.toLowerCase();
  const tc = titleCase(topic);
  const has = (name: string) => outline.some((b) => b.name === name);
  const paras: string[] = [];
  // Opening — the hook, spoken first.
  paras.push(hook);
  if (variant === 1) {
    paras.push(
      `This is the story of ${t} — and it does not go the way you'd expect. A story that starts with a label, a rumour, or a headline, and ends somewhere nobody predicted. By the end of this video, you'll see the twists, the choices, and the moments that turned the whole thing around.`
    );
  } else {
    paras.push(
      `The story sounds like something ripped from a thriller, but it's real. ${tc} is one of those stories where the first thing you hear is almost never the full picture — and today, we're going to untangle that wild ride. By the end, you'll see the twists, the choices, and the moments that turned controversy into something nobody saw coming.`
    );
  }
  if (has("Introduction")) {
    paras.push(
      `Most people first hear about ${t} and instantly assume they know how it ends. That assumption sticks like a brand — and the idea of this story going any other way feels almost unthinkable. That tension is exactly what makes it so gripping: two worlds that seem incompatible, colliding in one story.`
    );
  }
  if (has("Presentation of Problem/Challenge")) {
    paras.push(
      `So let's lay out the problem honestly. On one side, there is the public perception — the version of ${t} that everyone repeats. On the other side, there is what actually happened. The gap between those two versions is where this whole story lives, and it's wider than most people realise.`
    );
  }
  if (has("Exploration/Development")) {
    paras.push(
      `To understand how we got here, you have to go back to the beginning. The background of ${t} is not a straight line — it's a series of choices, accidents, and turning points, each one pushing the story in a direction nobody planned. Follow them in order, and the ending starts to make sense.`
    );
  }
  if (has("Climax/Key Moment")) {
    paras.push(
      `And then comes the moment that changed everything. One event — one decision, one speech, one result — that shifted what people believed was possible. This is the part of the story where the old version falls apart, and the real version takes its place.`
    );
  }
  if (has("The Problem")) {
    paras.push(
      `Here's the problem with ${t}: the version most people know is the short version — and the short version leaves out the part that matters. Once you see what's missing, the whole story reads differently.`
    );
  }
  if (has("The Payoff")) {
    paras.push(
      `And here's the payoff: the truth about ${t} is stranger than the rumour — and it is backed by the record, not by opinion. One fact, shown clearly, is worth more than a hundred headlines.`
    );
  }
  if (has("Conclusion/Summary")) {
    paras.push(
      `So what does it all mean? The story of ${t} is really a story about how fast a reputation can be built — and how much harder it is to see past one. The facts were there all along; it just took someone willing to look at them in order.`
    );
  }
  if (has("Call to Action (CTA)")) {
    if (variant === 1) {
      paras.push(
        `Now I want to hear from you: after everything you've just seen, what part of ${t} surprised you the most? Tell me in the comments — and if you want more stories like this one, told properly, subscribe.`
      );
    } else {
      paras.push(
        `Tell me in the comments: what did you believe about ${t} before this video — and what do you believe now? If you want more stories like this, where the evidence comes first, subscribe, and I'll see you in the next one.`
      );
    }
  }
  return paras.join("\n\n");
}

/** Word count of a text (words separated by whitespace). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Estimated read time at ~150 words per minute, in whole minutes. */
export function readMinutes(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 150));
}

function buildDescription(
  topic: string,
  channelTitle: string | null,
  variant = 0
): string {
  const t = topic.toLowerCase();
  const opener =
    variant === 1
      ? `${titleCase(topic)} — what really happened, and why it matters more than the headlines suggest.\n\n`
      : `${titleCase(topic)} — the full story, explained simply.\n\n`;
  return (
    opener +
    `In this video: what ${t} really is, the moment it changed, and what it means next. ` +
    `Every claim is sourced on screen.\n\n` +
    `Chapters:\n00:00 The hook\n00:15 The setup\n01:30 The turning point\n03:00 The evidence\n05:00 What it means\n07:00 The takeaway\n\n` +
    (channelTitle
      ? `Subscribe to ${channelTitle} for one deep dive every week.`
      : `Subscribe for one deep dive every week.`)
  );
}

/** Full SEO pack for a topic. Pure function — no network, no secrets. */
export function generateSeoPack(
  rawTopic: string,
  channelTitle?: string,
  opts?: { length?: VideoLength; variant?: number }
): SeoPack {
  const topic = cleanTopic(rawTopic);
  const channel = channelTitle?.trim() ? channelTitle.trim() : null;
  const length: VideoLength = opts?.length === "short" ? "short" : "long";
  const variant = opts?.variant === 1 ? 1 : 0;
  const titles = buildTitles(topic, channel).sort((a, b) => b.score - a.score);
  const bestTitle = titles[0].title;
  const tags = buildTags(topic);
  const hashtags = buildHashtags(topic);
  const descriptionStarter = buildDescription(topic, channel, variant);
  const hookVariants = buildHookVariants(topic);
  const hook = hookVariants[0];
  const scriptOutline = buildScriptOutline(topic);
  const videoOutline = buildVideoOutline(topic, hook, length, variant);
  const scriptDraft = buildScriptDraft(topic, bestTitle, hook, videoOutline, length, variant);
  const thumbnailConcepts = buildThumbnailConcepts(topic);
  const t = topic.toLowerCase();

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
    length,
    bestTitle,
    titles,
    tags,
    hashtags,
    descriptionStarter,
    hook,
    hookVariants,
    scriptOutline,
    videoOutline,
    scriptDraft,
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
