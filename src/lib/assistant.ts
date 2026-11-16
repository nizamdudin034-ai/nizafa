// Nizafa Assistant — language detection, curated growth playbook and
// answer logic.
//
// Answers come from (a) the user's own connected channel data, (b) a
// curated playbook written for this app, and (c) a cache of earlier
// answers. That keeps answers fast and free of invented numbers.
// There is still no LLM key wired in (see the fallback text for the
// unlock: a Gemini API key).
//
// Multilingual: detection + playbook + data answers live in
// ./assistant-i18n.ts (14 languages detected; full playbook in 13,
// Pashto gets core replies + an honest note). Data intents (ideas /
// views / audit / latest-video review / script / community post) are
// answered from live data loaded by /api/assistant — see answerFromData
// below. They are checked BEFORE the playbook, so a request for real
// data never gets a generic playbook answer.

import { generateSeoPack } from "./generator";
import type { AuditReport, VideoSeoCheck } from "./audit";
import type { DailyIdea } from "./daily-ideas";
import {
  DATA_INTENT_KEYWORDS,
  SUPPORTED_LANGS,
  dataText,
  detectLanguageDetailed,
  fill,
  isChannelQuestion,
  playbookText,
  SCRIPT_TOPIC_MARKERS,
  type AssistantLang,
  type DataIntentKey,
  type PlaybookId,
} from "./assistant-i18n";

export type { AssistantLang } from "./assistant-i18n";

/** Detailed detection (language + confidence) — re-exported for the route. */
export { detectLanguageDetailed } from "./assistant-i18n";

/** Simple wrapper kept for existing callers. */
export function detectLanguage(text: string): AssistantLang {
  return detectLanguageDetailed(text).lang;
}

export type DataIntent = DataIntentKey;

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

/** Which data intent (if any) a message asks for — checked before the playbook. */
export function detectDataIntent(message: string): DataIntent | null {
  const norm = normalizeQuestion(message);
  for (const intent of Object.keys(DATA_INTENT_KEYWORDS) as DataIntentKey[]) {
    if (DATA_INTENT_KEYWORDS[intent].some((k) => norm.includes(k))) {
      return intent;
    }
  }
  return null;
}

function noChannel(lang: AssistantLang): string {
  return dataText(lang, "noChannel");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scriptTopic(message: string, data: AssistantDataBundle): string | null {
  const markers = SCRIPT_TOPIC_MARKERS.map(escapeRegExp).join("|");
  const re = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])(?:${markers})\\s+(.+?)(?:\\.|\\?|$)`,
    "iu"
  );
  const m = message.match(re);
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

  if (intent === "ideas") {
    if (!data.channel) return noChannel(lang);
    if (data.ideas.length === 0) {
      return dataText(lang, "ideasEmpty");
    }
    const lines = data.ideas.map(
      (idea, i) =>
        `${i + 1}. ${idea.title} (${fill(dataText(lang, "viewPrediction"), { p: idea.prediction })})\n   ${dataText(lang, "ideasHook")} ${idea.hook}\n   ${dataText(lang, "ideasWhy")} ${idea.whyFits}`
    );
    return (
      fill(dataText(lang, "ideasHeader"), { ch: data.channel.title }) +
      "\n\n" +
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
        fill(dataText(lang, "viewsTopTip"), {
          title: top.title,
          views: fmt(top.views),
        })
      );
    }
    if (data.bestPosting[0]) {
      tips.push(fill(dataText(lang, "viewsBestTime"), { time: data.bestPosting[0] }));
    }
    if (data.audit) {
      for (const fix of data.audit.fixes.slice(0, 2)) tips.push(fix);
    }
    return (
      fill(dataText(lang, "viewsHeader"), {
        ch: ch.title,
        subs: fmt(ch.subscribers),
        views: fmt(ch.views),
        videos: fmt(ch.videos),
      }) +
      "\n\n" +
      tips.map((t, i) => `${i + 1}. ${t}`).join("\n")
    );
  }

  if (intent === "audit") {
    if (!data.audit || !data.channel) return noChannel(lang);
    const a = data.audit;
    const weakest = [...a.checks].sort((x, y) => x.points - y.points).slice(0, 3);
    const weakLines = weakest.map(
      (c) => `• ${c.label}: ${c.points}/${c.maxPoints} — ${c.detail}`
    );
    const fixLines = a.fixes.slice(0, 3).map((f, i) => `${i + 1}. ${f}`);
    return (
      fill(dataText(lang, "auditHeader"), {
        ch: data.channel.title,
        score: a.score,
        grade: a.grade,
      }) +
      "\n\n" +
      dataText(lang, "auditWeakest") +
      "\n" +
      weakLines.join("\n") +
      (fixLines.length > 0
        ? `\n\n${dataText(lang, "auditFixFirst")}\n${fixLines.join("\n")}`
        : "") +
      `\n\n${dataText(lang, "auditFullDetail")}`
    );
  }

  if (intent === "latest-review") {
    if (!data.latestVideo || !data.latestReview) {
      return dataText(lang, "reviewNoVideo");
    }
    const r = data.latestReview;
    const v = data.latestVideo;
    const scoreLines: string[] = [];
    if (r.titleScore !== null) {
      scoreLines.push(
        `• ${fill(dataText(lang, "reviewTitleScore"), { n: r.titleScore })}`
      );
    }
    if (r.thumbScore !== null) {
      scoreLines.push(
        `• ${fill(dataText(lang, "reviewThumbScore"), { n: r.thumbScore })}`
      );
    }
    if (r.consistency !== null) {
      scoreLines.push(
        `• ${fill(dataText(lang, "reviewConsistency"), { n: r.consistency })}`
      );
    }
    const failed = r.checks.filter((c) => !c.pass);
    const fixLines = (r.fixes.length > 0 ? r.fixes : failed.map((c) => c.detail)).slice(0, 3);
    return (
      fill(dataText(lang, "reviewHeader"), {
        title: v.title,
        views: fmt(v.views),
      }) +
      "\n\n" +
      (scoreLines.length > 0 ? scoreLines.join("\n") + "\n\n" : "") +
      (fixLines.length > 0
        ? `${dataText(lang, "reviewFixFirst")}\n${fixLines.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
        : dataText(lang, "reviewAllPass")) +
      `\n\n${dataText(lang, "reviewFullDetail")}`
    );
  }

  if (intent === "script") {
    const topic = scriptTopic(message, data);
    if (!topic) {
      return dataText(lang, "scriptAskTopic");
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
      fill(dataText(lang, "scriptHeader"), {
        title: pack.bestTitle,
        time: `${mins}:${String(secs).padStart(2, "0")}`,
      }) +
      `\n\n${dataText(lang, "scriptHook")} ${pack.hook}\n\n` +
      sections
    );
  }

  // intent === "community"
  if (!data.channel) return noChannel(lang);
  const latest = data.latestVideo;
  if (!latest) {
    return dataText(lang, "communityGeneral");
  }
  return fill(dataText(lang, "communityLatest"), { title: latest.title });
}

/** Normalise a question for cache lookup: lower-case, collapse space,
 *  strip punctuation. \p{M} (combining marks) must stay: Devanagari
 *  and Bengali vowel signs are marks, and dropping them turns e.g.
 *  "टाइटल" into "ट इटल", which no keyword can ever match. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
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
  id: PlaybookId;
  /** Lower-case match words (all supported languages). */
  keywords: string[];
};

// Curated YouTube-growth playbook — original wording written for Nizafa.
// The full text lives in ./assistant-i18n.ts (13 languages); the
// keywords here decide which entry a question matches. Answers stay
// short so the chat feels instant.
export const PLAYBOOK: PlaybookEntry[] = [
  {
    id: "titles",
    keywords: ["title", "titles", "headline", "ٹائٹل", "عنوان", "عناوين", "سرخی", "टाइटल", "शीर्षक", "سرلیک", "টাইটেল", "শিরোনাম", "başlık", "judul", "título", "titre", "titel", "заголов"],
  },
  {
    id: "tags",
    keywords: ["tag", "tags", "keyword", "keywords", "ٹیگ", "مطلوبہ الفاظ", "टैग", "कीवर्ड", "وسوم", "كلمات مفتاحية", "ট্যাগ", "কীওয়ার্ড", "etiket", "etiqueta", "тег"],
  },
  {
    id: "thumbnails",
    keywords: ["thumbnail", "thumbnails", "thumb", "تھمبنیل", "थंबनेल", "صورة مصغرة", "مصغرة", "থাম্বনেইল", "küçük resim", "miniatura", "miniature", "превью", "تمبنیل"],
  },
  {
    id: "description",
    keywords: ["description", "desc", "تفصیل", "विवरण", "وصف", "تشریح", "বিবরণ", "açıklama", "deskripsi", "descripción", "beschreibung", "descrição", "описан"],
  },
  {
    id: "posting-time",
    keywords: ["when to post", "best time", "posting time", "schedule", "upload time", "وقت", "کب", "شیڈول", "समय", "कब", "وقت النشر", "متى", "সময়", "কখন", "ne zaman", "kapan", "cuándo", "quand", "wann", "quando", "когда", "وخت"],
  },
  {
    id: "subscribers",
    keywords: ["subscriber", "subscribers", "subs", "grow", "growth", "sub", "سبسکرائبر", "بڑھائیں", "ترقی", "सब्सक्राइबर", "बढ़ाएँ", "مشترك", "النمو", "সাবস্ক্রাইবার", "abone", "suscriptor", "abonné", "abonnent", "inscrito", "подписчик", "ګډونوال"],
  },
  {
    id: "watch-time",
    keywords: ["watch time", "watchtime", "retention", "audience retention", "ریٹینشن", "دیکھنے کا وقت", "देखने का समय", "रिटेंशन", "وقت المشاهدة", "দেখার সময়", "izlenme süresi", "waktu tonton", "tiempo de visualización", "temps de visionnage", "wiedergabezeit", "tempo de exibição", "время просмотра", "просмотр", "د لیدو وخت"],
  },
  {
    id: "shorts",
    keywords: ["short", "shorts", "reel", "شارٹس", "شارٹ", "शॉर्ट्स", "مقاطع قصيرة", "شورتس", "শর্টস", "шортс", "شارټس"],
  },
  {
    id: "ctr",
    keywords: ["ctr", "click", "click-through", "click through", "کلک", "क्लिक", "نقر", "ক্লিক", "tıklama", "klik", "clic", "klick", "clique", "клик", "کلیک"],
  },
  {
    id: "audit",
    keywords: ["audit", "health", "check my channel", "review my channel", "آڈٹ", "چیک", "ऑडिट", "تدقيق", "অডিট", "denetim", "auditoría", "auditoria", "аудит", "پلټنه"],
  },
  {
    id: "keywords",
    keywords: ["keyword research", "research", "trending", "topic", "idea", "ideas", "ریسرچ", "ٹرینڈ", "موضوع", "خیال", "रिसर्च", "ट्रेंड", "विषय", "بحث", "رائج", "গবেষণা", "ট্রেন্ড", "araştırma", "riset", "investigación", "recherche", "pesquisa", "исследован", "څېړنه"],
  },
  {
    id: "consistency",
    keywords: ["consistent", "consistency", "how often", "upload schedule", "frequency", "تسلسل", "کتنی بار", "निरंतरता", "استمرارية", "ধারাবাহিকতা", "tutarlılık", "konsistensi", "constancia", "régularité", "konsequenz", "consistência", "регулярн", "دوام"],
  },
  {
    id: "monetization",
    keywords: ["monetization", "monetize", "money", "earn", "revenue", "rpm", "adsense", "پیسے", "کمانا", "منیٹائز", "मुद्रीकरण", "पैसे", "कमाना", "تحقيق الدخل", "المال", "টাকা", "উপার্জন", "para kazanma", "monetisasi", "monetización", "monétisation", "monetarisierung", "monetização", "монетиз", "پیسې"],
  },
  {
    id: "analytics",
    keywords: ["analytics", "stats", "views", "performance", "data", "اینالیٹکس", "اعداد", "एनालिटिक्स", "आँकड़े", "تحليلات", "অ্যানালিটিক্স", "analiz", "analitik", "análisis", "analytique", "analyse", "análise", "аналитик", "تحلیل"],
  },
  {
    id: "hook",
    keywords: ["hook", "intro", "opening", "start", "شروعات", "آغاز", "शुरुआत", "بداية", "افتتاحية", "শুরু", "kanca", "gancho", "accroche", "хук", "پیل"],
  },
];

export const FALLBACK: Record<AssistantLang, string> = Object.fromEntries(
  SUPPORTED_LANGS.map((l) => [l.code, dataText(l.code, "fallback")])
) as Record<AssistantLang, string>;

/** Answer from the user's own channel data when the question is about it. */
export function answerFromChannel(
  message: string,
  lang: AssistantLang,
  ch: ChannelContext
): string | null {
  if (!isChannelQuestion(message)) return null;
  const top = ch.topVideos[0];
  return (
    fill(dataText(lang, "channelSummary"), {
      ch: ch.title,
      subs: fmt(ch.subscribers),
      views: fmt(ch.views),
      videos: fmt(ch.videos),
    }) +
    " " +
    (top
      ? fill(dataText(lang, "channelTop"), {
          title: top.title,
          views: fmt(top.views),
        }) + " "
      : "") +
    dataText(lang, "channelNext")
  );
}

export type BuiltAnswer = {
  answer: string;
  lang: AssistantLang;
  grounded: boolean;
  topicId: string | null;
};

/**
 * Pure answer logic: channel data first, then the playbook, then fallback.
 * `langOverride` (from the route's resolution: per-message detection,
 * the UI selection, or the user's last chat language) wins over fresh
 * detection.
 */
export function buildAnswer(
  message: string,
  channel?: ChannelContext | null,
  langOverride?: AssistantLang
): BuiltAnswer {
  const lang = langOverride ?? detectLanguage(message);
  if (channel) {
    const grounded = answerFromChannel(message, lang, channel);
    if (grounded) {
      return { answer: grounded, lang, grounded: true, topicId: "channel" };
    }
  }
  const norm = normalizeQuestion(message);
  for (const entry of PLAYBOOK) {
    if (entry.keywords.some((k) => norm.includes(k.toLowerCase()))) {
      const { text, translated } = playbookText(entry.id, lang);
      const note = translated ? "" : dataText(lang, "playbookNote");
      return {
        answer: note ? `${text}\n\n${note}` : text,
        lang,
        grounded: false,
        topicId: entry.id,
      };
    }
  }
  return { answer: FALLBACK[lang], lang, grounded: false, topicId: null };
}
