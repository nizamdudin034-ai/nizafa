// Nizafa Assistant — language detection, curated growth playbook and
// answer logic.
//
// NOTE (v1): there is no LLM key wired in. Answers come from (a) the
// user's own connected channel data, (b) a curated playbook written for
// this app, and (c) a cache of earlier answers. That keeps answers fast
// and free of invented numbers.
//
// Data intents (ideas / views / audit / latest-video review / script /
// community post) are answered from live data loaded by /api/assistant —
// see answerFromData below. They are checked BEFORE the playbook, so a
// request for real data never gets a generic playbook answer.

import { generateSeoPack } from "./generator";
import type { AuditReport, VideoSeoCheck } from "./audit";
import type { DailyIdea } from "./daily-ideas";

export type DataIntent =
  | "ideas"
  | "views"
  | "audit"
  | "latest-review"
  | "script"
  | "community";

/** Everything a data intent needs, loaded live by /api/assistant. */
export type AssistantDataBundle = {
  channel: ChannelContext | null;
  latestVideo: {
    videoId: string;
    title: string;
    views: number | null;
    publishedAt: string | null;
  } | null;
  audit: AuditReport | null;
  ideas: DailyIdea[];
  trendingTitles: string[];
  bestPosting: string[];
  latestReview: {
    title: string;
    titleScore: number | null;
    thumbScore: number | null;
    consistency: number | null;
    checks: VideoSeoCheck[];
    fixes: string[];
  } | null;
};

export function emptyDataBundle(): AssistantDataBundle {
  return {
    channel: null,
    latestVideo: null,
    audit: null,
    ideas: [],
    trendingTitles: [],
    bestPosting: [],
    latestReview: null,
  };
}

const INTENT_PATTERNS: Array<{ intent: DataIntent; re: RegExp }> = [
  { intent: "ideas", re: /video ideas?|give me ideas|ideas for|new ideas|5 video ideas|آئیڈیا|آئیڈیاز|خیالات/i },
  { intent: "views", re: /get more views|more views|increase (my )?views|grow (my )?views|زیادہ ویوز/i },
  { intent: "audit", re: /channel audit|audit (my|the) channel|full review|review my channel|audit my|آڈٹ/i },
  { intent: "latest-review", re: /review my latest video|review (my )?(latest|newest) video|feedback on my (latest )?video|review my video/i },
  { intent: "script", re: /write a script|draft a script|script (about|for|on)|اسکرپٹ لکھ/i },
  { intent: "community", re: /community post|draft a post|write a post|کمیونٹی پوسٹ/i },
];

/** Which data intent (if any) a message asks for — checked before the playbook. */
export function detectDataIntent(message: string): DataIntent | null {
  for (const { intent, re } of INTENT_PATTERNS) {
    if (re.test(message)) return intent;
  }
  return null;
}

function noChannel(lang: AssistantLang): string {
  return lang === "ur"
    ? "اس کے لیے پہلے اپنا چینل منسلک کریں — یہ جواب آپ کے اپنے چینل کے ڈیٹا سے بنتا ہے۔ ہوم پیج پر جا کر “Connect a channel” دبائیں۔"
    : "Connect your channel first — this answer is built from your own channel data. Go to Home and press “Connect a channel”.";
}

function scriptTopic(message: string, data: AssistantDataBundle): string | null {
  const m = message.match(/(?:about|for|on)\s+(.+?)(?:\.|\?|$)/i);
  const fromMessage = (m?.[1] ?? "").trim();
  if (fromMessage.length >= 3) return fromMessage.slice(0, 120);
  if (data.trendingTitles[0]) return data.trendingTitles[0];
  if (data.latestVideo) {
    return data.latestVideo.title.replace(/\s*\|\s*[^|]+$/, "").trim();
  }
  return null;
}

/**
 * Answer a data intent from live data. Returns null only when the
 * message has no data intent. Every branch is honest about missing data
 * instead of inventing numbers.
 */
export function answerFromData(
  message: string,
  lang: AssistantLang,
  data: AssistantDataBundle
): string | null {
  const intent = detectDataIntent(message);
  if (!intent) return null;
  const ur = lang === "ur";

  if (intent === "ideas") {
    if (!data.channel) return noChannel(lang);
    if (data.ideas.length === 0) {
      return ur
        ? "آج کے آئیڈیاز ابھی تیار نہیں ہو سکے — Ideas صفحہ کھول کر دوبارہ کوشش کریں۔"
        : "Today's ideas could not be generated — open the Ideas page and try again.";
    }
    const lines = data.ideas.map(
      (idea, i) =>
        `${i + 1}. ${idea.title} (View prediction: ${idea.prediction})\n   Hook: ${idea.hook}\n   Why it fits: ${idea.whyFits}`
    );
    return (
      (ur
        ? `آپ کے چینل “${data.channel.title}” کے لیے آج کے 4 آئیڈیاز:\n\n`
        : `Here are 4 ideas for your channel “${data.channel.title}” today:\n\n`) +
      lines.join("\n\n")
    );
  }

  if (intent === "views") {
    if (!data.channel) return noChannel(lang);
    const ch = data.channel;
    const top = ch.topVideos[0];
    const tips: string[] = [];
    if (top) {
      tips.push(
        ur
          ? `آپ کی سب سے زیادہ دیکھی گئی ویڈیو “${top.title}” ہے (${fmt(top.views)} ویوز) — اسی طرح کی ایک اور ویڈیو بنائیں۔`
          : `Your most-viewed video is “${top.title}” (${fmt(top.views)} views) — make another one like it.`
      );
    }
    if (data.bestPosting[0]) {
      tips.push(
        ur
          ? `آپ کی اپنی تاریخ کے مطابق بہترین وقت: ${data.bestPosting[0]}۔`
          : `Your own upload history says your best window is: ${data.bestPosting[0]}.`
      );
    }
    if (data.audit) {
      for (const fix of data.audit.fixes.slice(0, 2)) tips.push(fix);
    }
    const head = ur
      ? `آپ کا چینل “${ch.title}”: ${fmt(ch.subscribers)} سبسکرائبر، ${fmt(ch.views)} کل ویوز، ${fmt(ch.videos)} ویڈیوز۔ ویوز بڑھانے کے لیے:\n\n`
      : `Your channel “${ch.title}”: ${fmt(ch.subscribers)} subscribers, ${fmt(ch.views)} total views, ${fmt(ch.videos)} videos. To get more views:\n\n`;
    return (
      head +
      tips.map((t, i) => `${i + 1}. ${t}`).join("\n")
    );
  }

  if (intent === "audit") {
    if (!data.audit || !data.channel) return noChannel(lang);
    const a = data.audit;
    const weakest = [...a.checks].sort((x, y) => x.points - y.points).slice(0, 3);
    const head = ur
      ? `آپ کے چینل “${data.channel.title}” کا آڈٹ: ${a.score}/100 (${a.grade})۔\n\n`
      : `Channel audit for “${data.channel.title}”: ${a.score}/100 (${a.grade}).\n\n`;
    const weakLines = weakest.map(
      (c) => `• ${c.label}: ${c.points}/${c.maxPoints} — ${c.detail}`
    );
    const fixLines = a.fixes.slice(0, 3).map((f, i) => `${i + 1}. ${f}`);
    return (
      head +
      (ur ? "سب سے کمزور نکات:\n" : "Weakest checks:\n") +
      weakLines.join("\n") +
      (fixLines.length > 0
        ? `\n\n${ur ? "پہلے یہ ٹھیک کریں:" : "Fix first:"}\n${fixLines.join("\n")}`
        : "") +
      (ur
        ? "\n\nمکمل تفصیل Optimize صفحے پر ہے۔"
        : "\n\nFull detail is on the Optimize page.")
    );
  }

  if (intent === "latest-review") {
    if (!data.latestVideo || !data.latestReview) {
      return ur
        ? "آپ کی کوئی ویڈیو محفوظ نہیں ہے — پہلے چینل منسلک کریں اور ویڈیوز لوڈ ہونے دیں۔"
        : "No video found in your cache yet — connect your channel and let the videos load first.";
    }
    const r = data.latestReview;
    const v = data.latestVideo;
    const head = ur
      ? `آپ کی تازہ ترین ویڈیو: “${v.title}” (${fmt(v.views)} ویوز)۔\n\n`
      : `Your latest video: “${v.title}” (${fmt(v.views)} views).\n\n`;
    const scoreLines: string[] = [];
    if (r.titleScore !== null) {
      scoreLines.push(
        ur
          ? `• ٹائٹل اسکور: ${r.titleScore}/100`
          : `• Title score: ${r.titleScore}/100`
      );
    }
    if (r.thumbScore !== null) {
      scoreLines.push(
        ur
          ? `• تھمبنیل کانسیپٹ اسکور: ${r.thumbScore}/100`
          : `• Thumbnail concept score: ${r.thumbScore}/100`
      );
    }
    if (r.consistency !== null) {
      scoreLines.push(
        ur
          ? `• ٹائٹل، تفصیل، اسکرپٹ اور تھمبنیل کا میچ: ${r.consistency}/100`
          : `• Title ↔ description ↔ script ↔ thumbnail match: ${r.consistency}/100`
      );
    }
    const failed = r.checks.filter((c) => !c.pass);
    const fixLines = (r.fixes.length > 0 ? r.fixes : failed.map((c) => c.detail)).slice(0, 3);
    return (
      head +
      (scoreLines.length > 0 ? scoreLines.join("\n") + "\n\n" : "") +
      (fixLines.length > 0
        ? `${ur ? "پہلے یہ ٹھیک کریں:" : "Fix first:"}\n${fixLines.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
        : ur
          ? "تمام بنیادی جانچ پاس — اب اگلی ویڈیو کے ٹائٹل اور تھمبنیل پر توجہ دیں۔"
          : "All basic checks pass — focus on the next video's title and thumbnail.") +
      (ur
        ? "\n\nمکمل تجزیہ Optimize → ویڈیو پر کلک کریں۔"
        : "\n\nFull analysis: Optimize → tap the video.")
    );
  }

  if (intent === "script") {
    const topic = scriptTopic(message, data);
    if (!topic) {
      return ur
        ? "کس موضوع پر اسکرپٹ چاہیے؟ مثلاً: “Write a script about gold prices”۔"
        : "Which topic should the script be about? For example: “Write a script about gold prices”.";
    }
    const pack = generateSeoPack(topic, data.channel?.title ?? undefined);
    const total = pack.scriptOutline.reduce((s, sec) => s + sec.seconds, 0);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const sections = pack.scriptOutline
      .map((sec, i) => {
        const start = pack.scriptOutline
          .slice(0, i)
          .reduce((s, p) => s + p.seconds, 0);
        const mm = Math.floor(start / 60);
        const ss = String(start % 60).padStart(2, "0");
        return `${i + 1}. [${mm}:${ss}] ${sec.section}\n   ${sec.points.join(" ")}`;
      })
      .join("\n\n");
    return (
      (ur
        ? `“${pack.bestTitle}” کے لیے اسکرپٹ کا مسودہ (تقریباً ${mins}:${String(secs).padStart(2, "0")} منٹ) — ریکارڈ کرنے سے پہلے اپنی آواز میں ڈھال لیں:\n\nہک: ${pack.hook}\n\n`
        : `Draft script for “${pack.bestTitle}” (about ${mins}:${String(secs).padStart(2, "0")}) — adapt it to your own voice before recording:\n\nHook: ${pack.hook}\n\n`) +
      sections
    );
  }

  // intent === "community"
  if (!data.channel) return noChannel(lang);
  const latest = data.latestVideo;
  if (!latest) {
    return ur
      ? `کمیونٹی پوسٹ کا مسودہ:\n\n“السلام علیکم! آپ کس موضوع پر اگلی ویڈیو دیکھنا چاہیں گے؟ کمنٹس میں بتائیں — اگلی ویڈیو آپ کی پسند پر ہوگی۔”\n\n(ابھی کوئی ویڈیو محفوظ نہیں، اس لیے یہ عمومی پوسٹ ہے۔)`
      : `Draft community post:\n\n“Hello everyone — what topic should my next video cover? Tell me in the comments, and the next video will be on your pick.”\n\n(No video in the cache yet, so this is a general post.)`;
  }
  return ur
    ? `کمیونٹی پوسٹ کا مسودہ:\n\n“نئی ویڈیو آ گئی ہے: “${latest.title}” — دیکھیے اور بتائیے، آپ کے خیال میں اس کہانی کا سب سے اہم حصہ کون سا تھا؟ کمنٹس میں لکھیں!”\n\nویڈیو کا لنک نیچے کمنٹس میں ہے۔`
    : `Draft community post:\n\n“New video out now: “${latest.title}” — watch it and tell me, what was the most important part of this story for you? Let me know in the comments!”\n\nLink to the video is in the comments below.`;
}

export type AssistantLang = "en" | "ur";

/** Urdu/Arabic script (U+0600–U+06FF) → 'ur', otherwise 'en'. */
export function detectLanguage(text: string): AssistantLang {
  return /[\u0600-\u06FF]/.test(text) ? "ur" : "en";
}

/** Normalise a question for cache lookup: lower-case, collapse space,
 *  strip punctuation. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export type ChannelContext = {
  title: string;
  subscribers: number | null;
  views: number | null;
  videos: number | null;
  topVideos: Array<{ title: string; views: number | null }>;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type PlaybookEntry = {
  id: string;
  /** Lower-case match words (English + Urdu). */
  keywords: string[];
  en: string;
  ur: string;
};

// Curated YouTube-growth playbook — original wording written for Nizafa.
// Answers stay short (well under 120 words) so the chat feels instant.
export const PLAYBOOK: PlaybookEntry[] = [
  {
    id: "titles",
    keywords: ["title", "titles", "headline", "ٹائٹل", "عنوان", "سرخی"],
    en: "Good titles promise one clear payoff in under 60 characters. Put the benefit or the surprise first, use a number or a name when it is real, and never promise what the video does not deliver. Write 5 options for every video, then pick the one a stranger would click without knowing you. Test a new title on an old video if its click-through rate is under 4%.",
    ur: "اچھا ٹائٹل 60 حروف سے کم میں ایک واضح فائدہ بتاتا ہے۔ فائدہ یا حیران کن بات پہلے لکھیں، اگر نمبر یا نام سچا ہو تو ضرور لکھیں، اور ویڈیو میں جو نہیں ہے اس کا وعدہ نہ کریں۔ ہر ویڈیو کے لیے 5 ٹائٹل لکھیں اور وہ چنیں جس پر اجنبی بھی کلک کرے۔ اگر کلک ریٹ 4 فیصد سے کم ہو تو پرانی ویڈیو کا ٹائٹل بدل کر دیکھیں۔",
  },
  {
    id: "tags",
    keywords: ["tag", "tags", "keyword", "keywords", "ٹیگ", "مطلوبہ الفاظ"],
    en: "Tags help YouTube understand a video, they do not rank it alone. Use 10–15 tags: the exact topic phrase first, then close variations, then the broader category. Put the same main phrase in the title and the first line of the description — that matters far more than stuffing tags. Skip single generic words like “video” or “funny”.",
    ur: "ٹیگز یوٹیوب کو ویڈیو سمجھنے میں مدد دیتے ہیں، اکیلے رینک نہیں دیتے۔ 10 سے 15 ٹیگز استعمال کریں: پہلے موضوع کا درست جملہ، پھر اس کی قریبی صورتیں، پھر وسیع زمرہ۔ وہی اہم جملہ ٹائٹل اور تفصیل کی پہلی سطر میں بھی لکھیں — یہ ٹیگز بھرنے سے کہیں زیادہ اہم ہے۔ “video” جیسے عام الفاظ نہ لکھیں۔",
  },
  {
    id: "thumbnails",
    keywords: ["thumbnail", "thumbnails", "thumb", "تھمبنیل"],
    en: "A thumbnail must read in one second at phone size. One face with a clear emotion, one short phrase of 3–4 big words, and strong contrast — dark background, bright text. Never reuse the title word for word; the thumbnail should add a reason to click. Check it at small size before publishing: if you cannot read it, viewers cannot either.",
    ur: "تھمبنیل ایک سیکنڈ میں فون کی سکرین پر سمجھ آنا چاہیے۔ ایک چہرہ جس کے جذبات صاف ہوں، 3 سے 4 بڑے الفاظ، اور زبردست کنٹراسٹ — گہرا پس منظر، روشن لکھائی۔ ٹائٹل کو لفظ بہ لفظ نہ دہرائیں؛ تھمبنیل کلک کی نئی وجہ دے۔ شائع کرنے سے پہلے چھوٹے سائز میں دیکھیں: اگر آپ پڑھ نہیں سکتے تو ناظرین بھی نہیں پڑھ سکیں گے۔",
  },
  {
    id: "description",
    keywords: ["description", "desc", "تفصیل"],
    en: "The first two lines of the description show in search, so put the video's promise and the main keyword there. Then add a short summary, chapter times, and links. Never paste a keyword list — it looks spammy and helps nobody. Keep it honest: describe what the viewer will actually learn or see.",
    ur: "تفصیل کی پہلی دو سطریں تلاش میں نظر آتی ہیں، اس لیے وہاں ویڈیو کا وعدہ اور اہم مطلوبہ لفظ لکھیں۔ پھر مختصر خلاصہ، ابواب کے اوقات اور لنکس دیں۔ مطلوبہ الفاظ کی فہرست ہرگز نہ چپکائیں — یہ سپیم لگتی ہے۔ ایمانداری سے لکھیں کہ ناظر کیا سیکھے گا یا دیکھے گا۔",
  },
  {
    id: "posting-time",
    keywords: ["when to post", "best time", "posting time", "schedule", "upload time", "وقت", "کب", "شیڈول"],
    en: "There is no universal best time — it is when YOUR audience is online. In Nizafa, open your channel's best-time chart: it is built from your own upload history. As a starting point for a US audience, weekday afternoons (2–4pm Eastern) and Sunday mornings usually work well. Post consistently at the same times for a month, then keep what the data supports.",
    ur: "پوسٹ کا کوئی ایک بہترین وقت نہیں — وہ وقت ہے جب آپ کے ناظرین آن لائن ہوں۔ نیزافا میں اپنے چینل کا بہترین وقت کا چارٹ دیکھیں: یہ آپ کی اپنی اپ لوڈ تاریخ سے بنتا ہے۔ امریکی ناظرین کے لیے ہفتے کے دن دوپہر 2 تا 4 بجے (ایسٹرن) اور اتوار کی صبح عام طور پر اچھے ہوتے ہیں۔ ایک ماہ تک ایک ہی وقت پر پوسٹ کریں، پھر ڈیٹا کے مطابق فیصلہ کریں۔",
  },
  {
    id: "subscribers",
    keywords: ["subscriber", "subscribers", "subs", "grow", "growth", "sub", "سبسکرائبر", "بڑھائیں", "ترقی"],
    en: "Subscribers follow channels that solve one problem again and again. Pick a clear niche, make every video for the same kind of viewer, and end each video with a reason to return — the next video in the series, not a generic “please subscribe”. One strong video a week beats five forgettable ones. Growth compounds: small channels grow slowly, then suddenly.",
    ur: "سبسکرائبر ان چینلز کو فالو کرتے ہیں جو ایک ہی مسئلہ بار بار حل کرتے ہیں۔ ایک واضح موضوع چنیں، ہر ویڈیو اسی طرح کے ناظر کے لیے بنائیں، اور ہر ویڈیو کے آخر میں واپسی کی وجہ دیں — سیریز کی اگلی ویڈیو، نہ کہ عام “سبسکرائب کریں”۔ ہفتے میں ایک مضبوط ویڈیو پانچ بھولی ہوئی ویڈیوز سے بہتر ہے۔ ترقی آہستہ شروع ہوتی ہے، پھر اچانک بڑھتی ہے۔",
  },
  {
    id: "watch-time",
    keywords: ["watch time", "watchtime", "retention", "audience retention", "ریٹینشن", "دیکھنے کا وقت"],
    en: "Watch time grows when the first 30 seconds earn the click. State the payoff immediately, cut anything that does not serve it, and change the visual on every beat — a new shot, graphic or example. Long pauses and slow intros lose viewers fast. Aim for a video where the average viewer stays past halfway; that is the strongest signal YouTube reads.",
    ur: "دیکھنے کا وقت اس وقت بڑھتا ہے جب پہلے 30 سیکنڈ کلک کو درست ثابت کریں۔ فائدہ فوراً بتائیں، جو چیز کام نہ آئے اسے کاٹ دیں، اور ہر بات پر تصویر بدلیں — نیا شاٹ، گرافک یا مثال۔ لمبی خاموشی اور سست شروعات ناظرین کو بھگا دیتی ہے۔ مقصد یہ ہو کہ اوسط ناظر آدھی ویڈیو سے آگے رہے؛ یوٹیوب اسے سب سے مضبوط اشارہ مانتا ہے۔",
  },
  {
    id: "shorts",
    keywords: ["short", "shorts", "reel", "شارٹس", "شارٹ"],
    en: "Shorts are for discovery, not for depth. One idea, one payoff, under 60 seconds, with the hook in the first 2 seconds. Use them as trailers for your long videos: ask the question, build curiosity, and point to the full video. Post at most 1–2 a day. A Short that goes viral brings viewers; only a good long video turns them into subscribers.",
    ur: "شارٹس دریافت کے لیے ہیں، گہرائی کے لیے نہیں۔ ایک خیال، ایک فائدہ، 60 سیکنڈ سے کم، اور پہلے 2 سیکنڈ میں دلچسپی۔ انہیں اپنی لمبی ویڈیوز کے ٹریلر کی طرح استعمال کریں: سوال پوچھیں، تجسس پیدا کریں، اور مکمل ویڈیو کی طرف اشارہ کریں۔ دن میں زیادہ سے زیادہ 1 سے 2 پوسٹ کریں۔ وائرل شارٹ ناظرین لاتا ہے؛ صرف اچھی لمبی ویڈیو انہیں سبسکرائبر بناتی ہے۔",
  },
  {
    id: "ctr",
    keywords: ["ctr", "click", "click-through", "click through", "کلک"],
    en: "Click-through rate is title + thumbnail working together. Below 4% usually means the packaging is weak, not the video. Change one thing at a time — first the thumbnail, then the title — and wait at least a week before judging. Compare against your own channel average, not against big channels: a small channel's 5% can be excellent.",
    ur: "کلک تھرو ریٹ ٹائٹل اور تھمبنیل کی مشترکہ کارکردگی ہے۔ 4 فیصد سے کم کا مطلب عام طور پر پیکیجنگ کمزور ہے، ویڈیو نہیں۔ ایک وقت میں ایک چیز بدلیں — پہلے تھمبنیل، پھر ٹائٹل — اور فیصلے سے پہلے کم از کم ایک ہفتہ انتظار کریں۔ اپنا موازنہ اپنے چینل کی اوسط سے کریں، بڑے چینلز سے نہیں: چھوٹے چینل کے لیے 5 فیصد بھی بہترین ہو سکتا ہے۔",
  },
  {
    id: "audit",
    keywords: ["audit", "health", "check my channel", "review my channel", "آڈٹ", "چیک"],
    en: "A quick self-audit: (1) Do your last 10 titles each promise one clear thing? (2) Does every video have a full description and 10–15 tags? (3) Are thumbnails readable at phone size? (4) Have you posted at least once a week for the last month? Fix the weakest of the four first. Nizafa's Optimize page scores your videos from your real data if your channel is connected.",
    ur: "فوری خود جانچ: (1) کیا آپ کی آخری 10 ویڈیوز کے ٹائٹل ہر ایک واضح وعدہ کرتے ہیں؟ (2) کیا ہر ویڈیو کی مکمل تفصیل اور 10 سے 15 ٹیگز ہیں؟ (3) کیا تھمبنیل فون پر پڑھے جا سکتے ہیں؟ (4) کیا آپ نے پچھلے مہینے ہفتے میں کم از کم ایک بار پوسٹ کیا؟ سب سے کمزور چیز پہلے ٹھیک کریں۔ اگر چینل منسلک ہے تو نیزافا کا Optimize صفحہ آپ کی ویڈیوز کو اصل ڈیٹا سے اسکور کرتا ہے۔",
  },
  {
    id: "keywords",
    keywords: ["keyword research", "research", "trending", "topic", "idea", "ideas", "ریسرچ", "ٹرینڈ", "موضوع", "خیال"],
    en: "Start with what your audience already searches: your top videos' titles are your best keyword source. Then check Nizafa's Research page for rising keywords and outlier videos in your niche. Pick topics where interest is rising but the top videos are old or weak — that gap is your opening. One researched topic beats ten guesses.",
    ur: "اس سے شروع کریں جو آپ کے ناظرین پہلے سے تلاش کرتے ہیں: آپ کی بہترین ویڈیوز کے ٹائٹل بہترین مطلوبہ الفاظ ہیں۔ پھر نیزافا کے Research صفحے پر اپنے موضوع میں بڑھتے الفاظ اور نمایاں ویڈیوز دیکھیں۔ وہ موضوع چنیں جہاں دلچسپی بڑھ رہی ہو لیکن بہترین ویڈیوز پرانی یا کمزور ہوں — یہی آپ کا موقع ہے۔ ایک تحقیق شدہ موضوع دس اندازوں سے بہتر ہے۔",
  },
  {
    id: "consistency",
    keywords: ["consistent", "consistency", "how often", "upload schedule", "frequency", "تسلسل", "کتنی بار"],
    en: "Consistency means a rhythm viewers can trust, not daily uploads. One long video a week on the same day is a strong rhythm for most channels; add Shorts only if they do not steal time from the long video. Miss a week and say so plainly in the next video — audiences forgive honesty, not silence. Keep the same topic lane so each video feeds the next.",
    ur: "تسلسل کا مطلب روزانہ اپ لوڈ نہیں، بلکہ ایک ایسا معمول ہے جس پر ناظرین بھروسہ کر سکیں۔ زیادہ تر چینلز کے لیے ہفتے میں ایک لمبی ویڈیو، ایک ہی دن، مضبوط معمول ہے؛ شارٹس صرف تب شامل کریں جب وہ لمبی ویڈیو کا وقت نہ لیں۔ ایک ہفتہ چھوٹ جائے تو اگلی ویڈیو میں صاف بتا دیں — ناظرین ایمانداری کو معاف کرتے ہیں، خاموشی کو نہیں۔ ایک ہی موضوع پر رہیں تاکہ ہر ویڈیو اگلی کی مدد کرے۔",
  },
  {
    id: "monetization",
    keywords: ["monetization", "monetize", "money", "earn", "revenue", "rpm", "adsense", "پیسے", "کمانا", "منیٹائز"],
    en: "YouTube pays after you join the Partner Program: 1,000 subscribers and 4,000 public watch hours in 12 months (or 10M Shorts views in 90 days). Until then, grow watch time with longer, useful videos — Shorts views alone rarely qualify a channel. Never reuse other creators' clips: reused content is the most common reason applications are rejected.",
    ur: "یوٹیوب پارٹنر پروگرام میں شامل ہونے کے بعد ادائیگی کرتا ہے: 1,000 سبسکرائبر اور 12 مہینوں میں 4,000 گھنٹے دیکھنے کا وقت (یا 90 دن میں 10 ملین شارٹس ویوز)۔ اس سے پہلے لمبی اور مفید ویڈیوز سے دیکھنے کا وقت بڑھائیں — صرف شارٹس ویوز سے چینل شاذ و نادر ہی اہل ہوتا ہے۔ دوسروں کی کلپس ہرگز دوبارہ استعمال نہ کریں: دوبارہ استعمال شدہ مواد درخواست مسترد ہونے کی سب سے عام وجہ ہے۔",
  },
  {
    id: "analytics",
    keywords: ["analytics", "stats", "views", "performance", "data", "اینالیٹکس", "اعداد"],
    en: "Read three numbers first: click-through rate (packaging), average view duration (content), and views per hour in the first 48 hours (momentum). If CTR is low, fix the title and thumbnail. If viewers leave early, fix the opening. If a video is flat after two days, move on — one video rarely recovers, the next one can. Judge a video after 48–72 hours, never in the first hour.",
    ur: "پہلے تین اعداد دیکھیں: کلک تھرو ریٹ (پیکیجنگ)، اوسط دیکھنے کا دورانیہ (مواد)، اور پہلے 48 گھنٹوں میں فی گھنٹہ ویوز (رفتار)۔ اگر کلک ریٹ کم ہو تو ٹائٹل اور تھمبنیل ٹھیک کریں۔ اگر ناظرین جلد چلے جائیں تو شروعات ٹھیک کریں۔ اگر دو دن بعد ویڈیو سست ہو تو آگے بڑھیں — ایک ویڈیو شاذ و نادر ہی واپس آتی ہے، اگلی آ سکتی ہے۔ ویڈیو کا فیصلہ 48 سے 72 گھنٹوں بعد کریں، پہلے گھنٹے میں کبھی نہیں۔",
  },
  {
    id: "hook",
    keywords: ["hook", "intro", "opening", "start", "شروعات", "آغاز"],
    en: "The hook is the first sentence, not the first minute. Say the most surprising or useful thing first — the result, the number, or the question the video answers — then explain. Never start with “welcome back” or a long channel intro; viewers decide in seconds. A good test: if you remove the first 30 seconds, does the video get better? If yes, cut them.",
    ur: "ہک پہلا جملہ ہے، پہلا منٹ نہیں۔ سب سے حیران کن یا مفید بات پہلے کہیں — نتیجہ، نمبر، یا وہ سوال جس کا ویڈیو جواب دیتی ہے — پھر وضاحت کریں۔ “خوش آمدید” یا لمبے چینل انٹرو سے کبھی شروع نہ کریں؛ ناظرین سیکنڈوں میں فیصلہ کرتے ہیں۔ اچھا ٹیسٹ: اگر پہلے 30 سیکنڈ ہٹا دیں تو کیا ویڈیو بہتر ہو جاتی ہے؟ اگر ہاں تو انہیں کاٹ دیں۔",
  },
];

export const FALLBACK: Record<AssistantLang, string> = {
  en: "I can help with YouTube growth — titles, tags, thumbnails, posting times, Shorts, watch time, or a check of your own channel. Ask me, for example: “How do I write better titles?” or “How is my channel doing?”",
  ur: "میں یوٹیوب کی ترقی میں مدد کر سکتا ہوں — ٹائٹل، ٹیگز، تھمبنیل، پوسٹ کا وقت، شارٹس، دیکھنے کا وقت، یا آپ کے اپنے چینل کی جانچ۔ مثلاً پوچھیں: “بہتر ٹائٹل کیسے لکھوں؟” یا “میرا چینل کیسا چل رہا ہے؟”",
};

/** Answer from the user's own channel data when the question is about it. */
export function answerFromChannel(
  message: string,
  lang: AssistantLang,
  ch: ChannelContext
): string | null {
  const q = message.toLowerCase();
  const aboutChannel =
    /channel|my channel|subscrib|views|video|perform|how (am|is)|doing|growth|میرا چینل|سبسکرائبر|ویوز|ویڈیو|کیسا/.test(
      q
    );
  if (!aboutChannel) return null;
  const top = ch.topVideos[0];
  if (lang === "ur") {
    return (
      `آپ کا چینل “${ch.title}”: ${fmt(ch.subscribers)} سبسکرائبر، ${fmt(ch.views)} کل ویوز، ${fmt(ch.videos)} ویڈیوز۔ ` +
      (top
        ? `سب سے زیادہ دیکھی گئی ویڈیو: “${top.title}” (${fmt(top.views)} ویوز)۔ `
        : "") +
      `اگلا قدم: اسی طرح کی ایک اور ویڈیو بنائیں، اور اس کی کامیابی کو اگلے ٹائٹل اور تھمبنیل میں دہرائیں۔`
    );
  }
  return (
    `Your channel “${ch.title}”: ${fmt(ch.subscribers)} subscribers, ${fmt(ch.views)} total views, ${fmt(ch.videos)} videos. ` +
    (top
      ? `Your most-viewed video is “${top.title}” (${fmt(top.views)} views). `
      : "") +
    `Next step: make another video like it, and repeat what worked in its title and thumbnail.`
  );
}

export type BuiltAnswer = {
  answer: string;
  lang: AssistantLang;
  grounded: boolean;
  topicId: string | null;
};

/** Pure answer logic: channel data first, then the playbook, then fallback. */
export function buildAnswer(
  message: string,
  channel?: ChannelContext | null
): BuiltAnswer {
  const lang = detectLanguage(message);
  if (channel) {
    const grounded = answerFromChannel(message, lang, channel);
    if (grounded) {
      return { answer: grounded, lang, grounded: true, topicId: "channel" };
    }
  }
  const norm = normalizeQuestion(message);
  for (const entry of PLAYBOOK) {
    if (entry.keywords.some((k) => norm.includes(k.toLowerCase()))) {
      return {
        answer: lang === "ur" ? entry.ur : entry.en,
        lang,
        grounded: false,
        topicId: entry.id,
      };
    }
  }
  return { answer: FALLBACK[lang], lang, grounded: false, topicId: null };
}
