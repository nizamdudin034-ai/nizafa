// Nizafa Assistant — language detection, curated growth playbook and
// answer logic.
//
// NOTE (v1): there is no LLM key wired in. Answers come from (a) the
// user's own connected channel data, (b) a curated playbook written for
// this app, and (c) a cache of earlier answers. That keeps answers fast
// and free of invented numbers.

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
