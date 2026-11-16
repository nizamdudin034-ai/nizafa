// Nizafa Assistant — multilingual support (no LLM).
//
// Everything language-related lives here: detection, the curated playbook
// in every supported language, the templated data answers, and the chat
// UI strings. Answers are still rule-based (playbook + live channel
// data); there is no LLM key wired in, so free-form questions outside
// the playbook get an honest fallback that names the unlock.
//
// Languages: 14 detected. Full playbook + data answers in 13 of them.
// Pashto (ps) is detected and gets the core replies (greeting, fallback,
// data-answer headers) in Pashto; detailed playbook guides fall back to
// English with a one-line Pashto note, because a full Pashto translation
// could not be written to the same quality bar. A Gemini/OpenAI key
// (see the fallback text) would unlock free-form answers in any language.

export type AssistantLang =
  | "en"
  | "ur"
  | "hi"
  | "ar"
  | "pa"
  | "ps"
  | "bn"
  | "tr"
  | "id"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ru";

export type LangInfo = {
  code: AssistantLang;
  name: string;
  native: string;
  rtl: boolean;
};

export const SUPPORTED_LANGS: LangInfo[] = [
  { code: "en", name: "English", native: "English", rtl: false },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "hi", name: "Hindi", native: "हिन्दी", rtl: false },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "pa", name: "Punjabi", native: "پنجابی", rtl: true },
  { code: "ps", name: "Pashto", native: "پښتو", rtl: true },
  { code: "bn", name: "Bengali", native: "বাংলা", rtl: false },
  { code: "tr", name: "Turkish", native: "Türkçe", rtl: false },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", rtl: false },
  { code: "es", name: "Spanish", native: "Español", rtl: false },
  { code: "fr", name: "French", native: "Français", rtl: false },
  { code: "de", name: "German", native: "Deutsch", rtl: false },
  { code: "pt", name: "Portuguese", native: "Português", rtl: false },
  { code: "ru", name: "Russian", native: "Русский", rtl: false },
];

export function isAssistantLang(code: string): code is AssistantLang {
  return SUPPORTED_LANGS.some((l) => l.code === code);
}

export function langInfo(code: AssistantLang): LangInfo {
  return SUPPORTED_LANGS.find((l) => l.code === code) ?? SUPPORTED_LANGS[0];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export type Detection = { lang: AssistantLang; confidence: "high" | "low" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does `word` appear as a whole word/phrase in `text` (Unicode-aware). */
function hasWord(text: string, word: string): boolean {
  const re = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?:$|[^\\p{L}\\p{N}])`,
    "iu"
  );
  return re.test(text);
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

const DEVANAGARI = /[\u0900-\u097F]/;
const BENGALI = /[\u0980-\u09FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Letters that exist only in Pashto (not in Urdu/Arabic).
const PASHTO_LETTERS = /[ځڅډړږښګڼ]/g;
// Letters that exist only in Punjabi written in Shahmukhi.
const PUNJABI_LETTERS = /[ݨݙڳݪ]/g;
// Letters that exist in Urdu but not in Arabic.
const URDU_LETTERS = /[ٹڈڑںھےہیکچپگ]/g;
// Ta marbuta — Arabic only.
const ARABIC_ONLY_LETTER = /[ة]/g;

const ARABIC_WORDS = [
  "قناة", "قناتي", "فيديو", "فيديوهات", "كيف", "مشترك", "مشاهدات",
  "عنوان", "عناوين", "صورة", "مصغرة", "اشتراك", "يوتيوب", "النمو",
  "مقطع", "تعليق", "نشر", "أفضل", "أفكار", "فكرة", "سكربت", "منشور",
  "مجتمع", "مراجعة", "تحليل", "لماذا", "ماذا", "متى", "أريد", "أعطني",
  "ساعدني", "جمهور", "محتوى", "قصير", "شورتس", "مشاهدة",
];

const URDU_WORDS = [
  "میرا", "میری", "میرے", "چینل", "ویڈیو", "ویڈیوز", "کیسے", "کیسا",
  "مجھے", "بتائیں", "بتاؤ", "سبسکرائبر", "ویوز", "ٹائٹل", "تھمبنیل",
  "آئیڈیا", "آئیڈیاز", "اسکرپٹ", "کمیونٹی", "پوسٹ", "آڈٹ", "ترقی",
  "بڑھائیں", "دیکھنے", "وقت", "کب", "کیوں", "کیا", "آپ", "ہے", "ہیں",
  "لکھیں", "بہتر", "نئی", "پرانی", "شکریہ", "مدد", "خیالات", "موضوع",
];

const PASHTO_WORDS = [
  "زما", "چینل", "ویډیو", "څنګه", "راته", "ووایه", "ماته", "غواړم",
  "لیدونکي", "سبسکرایبر", "ښه", "کوم", "څه", "ولې", "کله",
];

// Words that are Punjabi (Shahmukhi) but not Urdu — the two share the
// script and most vocabulary, so without these a Punjabi sentence is
// indistinguishable from Urdu and falls back to Urdu (which is mutually
// intelligible, but this list catches the common cases).
const PUNJABI_WORDS = [
  "ساڈا", "تہاڈا", "ساڈے", "تہاڈے", "مینوں", "تینوں", "کیویں",
  "کیدوں", "جیدوں", "کدوں", "کدھر", "کیتھے", "ویکھو", "دسو", "آکھو",
  "چاہندا", "کردا", "ہوندا", "جاندا", "لکھاں", "لئی", "نال", "توں",
  "ایہ", "اوہ", "ہووے", "جاوے", "آوے",
];

/** Distinctive Latin-script words. Weight 2 = almost unique to the
 *  language, 1 = shared with a neighbour (video, canal, …). */
const LATIN_WORDS: Array<{ lang: AssistantLang; words: Array<[string, number]> }> = [
  {
    lang: "es",
    words: [
      ["cómo", 2], ["qué", 2], ["suscriptores", 2], ["miniatura", 2],
      ["títulos", 2], ["vistas", 2], ["quiero", 2], ["dime", 2],
      ["por qué", 2], ["mi canal", 2], ["mis vídeos", 2], ["crecer", 1],
      ["necesito", 1], ["ayuda", 1], ["título", 1], ["descripción", 1],
      ["etiquetas", 1], ["publicar", 1], ["cuándo", 1], ["gracias", 2],
      ["vídeo", 1], ["canal", 1], ["para", 1], ["escribo", 2],
      ["mejores", 2], ["escribir", 1],
    ],
  },
  {
    lang: "fr",
    words: [
      ["comment", 2], ["chaîne", 2], ["abonnés", 2], ["pouvez-vous", 2],
      ["merci", 2], ["pourquoi", 2], ["ma chaîne", 2], ["mes vidéos", 2],
      ["plus de vues", 2], ["vidéo", 1], ["vues", 1], ["titre", 1],
      ["miniature", 1], ["description", 1], ["publier", 1], ["quand", 1],
      ["je veux", 1], ["aidez-moi", 2], ["écrire", 1], ["meilleurs", 2],
      ["meilleur", 1],
    ],
  },
  {
    lang: "de",
    words: [
      ["wie kann", 2], ["abonnenten", 2], ["aufrufe", 2], ["zuschauer", 2],
      ["mein kanal", 2], ["meine videos", 2], ["kannst du", 2],
      ["bitte", 1], ["danke", 2], ["titel", 1], ["beschreibung", 1],
      ["wachsen", 1], ["verbessern", 1], ["hochladen", 1],
      ["videoideen", 2], ["klickrate", 2], ["wie", 2], ["schreibe", 1],
      ["schreiben", 1], ["bessere", 1], ["besseren", 1], ["besser", 1],
      ["kann", 1], ["meinen", 1], ["meine", 1],
    ],
  },
  {
    lang: "pt",
    words: [
      ["inscritos", 2], ["visualizações", 2], ["obrigado", 2], ["obrigada", 2],
      ["meu canal", 2], ["como posso", 2], ["meus vídeos", 2],
      ["quero", 1], ["por favor", 1], ["ajuda", 1], ["título", 1],
      ["miniatura", 1], ["descrição", 1], ["publicar", 1], ["crescer", 1],
      ["vídeo", 1], ["canal", 1], ["escrevo", 2], ["melhores", 2],
      ["como", 1], ["escrever", 1], ["melhor", 1],
    ],
  },
  {
    lang: "tr",
    words: [
      ["nasıl", 2], ["nasil", 2], ["abone", 2], ["izlenme", 2],
      ["teşekkür", 2], ["kanalım", 2], ["benim kanalım", 2],
      ["daha fazla", 1], ["lütfen", 1], ["bana", 1], ["başlık", 1],
      ["açıklama", 1], ["yüklemek", 1], ["büyütmek", 1], ["için", 1],
    ],
  },
  {
    lang: "id",
    words: [
      ["bagaimana", 2], ["terima kasih", 2], ["penonton", 2], ["cara", 2],
      ["channel saya", 2], ["video saya", 2], ["tolong", 1], ["bisa", 1],
      ["buat", 1], ["judul", 1], ["deskripsi", 1], ["unggah", 1],
      ["tumbuh", 1], ["ide video", 2], ["jam tayang", 2],
    ],
  },
  {
    lang: "ur",
    words: [
      ["mera", 2], ["meri", 2], ["mere", 2], ["mujhe", 2], ["kaise", 2],
      ["kaisa", 2], ["kese", 2], ["batao", 2], ["bataein", 2],
      ["batayen", 2], ["shukriya", 2], ["chahiye", 2], ["mera channel", 2],
      ["mere channel", 2], ["aap", 1], ["aapka", 1], ["kya", 1],
      ["kyun", 1], ["kyon", 1], ["karna", 1], ["karo", 1], ["likho", 1],
      ["aur", 1], ["bhi", 1], ["hai", 1], ["hain", 1], ["janab", 2],
      // Roman Hindi uses the same words; it is answered in Urdu, the
      // owner's own language (documented limitation — an LLM key unlocks
      // telling Roman Hindi and Roman Urdu apart).
      ["kripya", 1],
    ],
  },
];

function detectArabicScript(text: string): Detection {
  const psLetters = countMatches(text, PASHTO_LETTERS);
  if (psLetters >= 1) return { lang: "ps", confidence: "high" };
  const paLetters = countMatches(text, PUNJABI_LETTERS);
  if (paLetters >= 1) return { lang: "pa", confidence: "high" };
  const psWords = PASHTO_WORDS.filter((w) => hasWord(text, w)).length;
  if (psWords >= 2) return { lang: "ps", confidence: "high" };
  const paWords = PUNJABI_WORDS.filter((w) => hasWord(text, w)).length;
  // Two or more words that exist in Punjabi but not in Urdu (e.g.
  // کیویں, لکھاں) decide the language even when the shared vocabulary
  // (ٹائٹل, بہتر) also matches Urdu.
  if (paWords >= 2) return { lang: "pa", confidence: "high" };
  const urLetters = countMatches(text, URDU_LETTERS);
  const arLetters = countMatches(text, ARABIC_ONLY_LETTER);
  const urWords = URDU_WORDS.filter((w) => hasWord(text, w)).length;
  const arWords = ARABIC_WORDS.filter((w) => hasWord(text, w)).length;
  const urScore = urLetters * 2 + urWords;
  const arScore = arLetters * 2 + arWords;
  if (urScore === 0 && arScore === 0) {
    // Arabic script but no marker at all — default to Urdu (the owner's
    // language) with low confidence so a saved preference can win.
    return { lang: "ur", confidence: "low" };
  }
  if (urScore > arScore) {
    return { lang: "ur", confidence: urScore >= 2 ? "high" : "low" };
  }
  if (arScore > urScore) {
    return { lang: "ar", confidence: arScore >= 2 ? "high" : "low" };
  }
  return { lang: urLetters > 0 ? "ur" : "ar", confidence: "low" };
}

function detectLatin(text: string): Detection {
  const lower = text.toLowerCase();
  let best: { lang: AssistantLang; score: number } | null = null;
  let second = 0;
  for (const entry of LATIN_WORDS) {
    let score = 0;
    for (const [word, weight] of entry.words) {
      if (hasWord(lower, word)) score += weight;
    }
    if (!best || score > best.score) {
      second = best ? best.score : 0;
      best = { lang: entry.lang, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best || best.score === 0) return { lang: "en", confidence: "low" };
  // A clear winner with real signal → high; a single shared word → low.
  if (best.score >= 3 || (best.score === 2 && second === 0)) {
    return { lang: best.lang, confidence: "high" };
  }
  return { lang: best.lang, confidence: "low" };
}

/**
 * Detect the language of a message. Script decides first (Devanagari →
 * Hindi, Bengali → Bengali, Cyrillic → Russian, Arabic script → Urdu /
 * Arabic / Punjabi / Pashto); Latin script is scored on distinctive
 * words, including Roman Urdu. Short or ambiguous messages return low
 * confidence so the caller's saved preference can win.
 */
export function detectLanguageDetailed(text: string): Detection {
  const t = (text ?? "").trim();
  if (!t) return { lang: "en", confidence: "low" };
  if (DEVANAGARI.test(t)) return { lang: "hi", confidence: "high" };
  if (BENGALI.test(t)) return { lang: "bn", confidence: "high" };
  if (CYRILLIC.test(t)) return { lang: "ru", confidence: "high" };
  if (ARABIC_SCRIPT.test(t)) return detectArabicScript(t);
  return detectLatin(t);
}

/** Simple wrapper kept for existing callers. */
export function detectLanguage(text: string): AssistantLang {
  return detectLanguageDetailed(text).lang;
}

// ---------------------------------------------------------------------------
// Data-intent keywords (multilingual). Matching is substring-based on the
// normalised message; keep keywords specific (never a bare "video").
// ---------------------------------------------------------------------------

export type DataIntentKey =
  | "ideas"
  | "views"
  | "audit"
  | "latest-review"
  | "script"
  | "community";

export const DATA_INTENT_KEYWORDS: Record<DataIntentKey, string[]> = {
  ideas: [
    "video ideas", "give me ideas", "ideas for", "new ideas", "5 video ideas",
    "آئیڈیا", "آئیڈیاز", "خیالات",
    "वीडियो आइडिया", "आइडिया", "विचार", "नए आइडिया",
    "أفكار", "فكرة", "أفكار فيديو", "أعطني أفكار",
    "আইডিয়া", "ভিডিও আইডিয়া",
    "video fikirleri", "fikir ver", "yeni fikirler", "bana fikir",
    "ide video", "beri saya ide", "ide baru",
    "ideas de video", "dame ideas", "ideas para", "nuevas ideas",
    "idées de vidéo", "donne-moi des idées", "nouvelles idées",
    "videoideen", "ideen für", "gib mir ideen", "neue ideen",
    "ideias de vídeo", "me dê ideias", "novas ideias",
    "идеи для видео", "дай идеи", "новые идеи", "идеи видео",
    "د ویډیو نظرونه",
  ],
  views: [
    "get more views", "more views", "increase my views", "grow my views",
    "زیادہ ویوز", "ویوز بڑھائیں",
    "ज्यादा व्यूज", "व्यूज बढ़ाएं",
    "المزيد من المشاهدات", "زيادة المشاهدات",
    "আরও ভিউ", "ভিউ বাড়ান",
    "daha fazla izlenme", "izlenmemi artır",
    "lebih banyak penonton", "tambah penonton",
    "más vistas", "conseguir más vistas",
    "plus de vues", "obtenir plus de vues",
    "mehr aufrufe", "mehr zuschauer",
    "mais visualizações", "conseguir mais visualizações",
    "больше просмотров", "как получить больше просмотров",
    "نور لیدونه",
    "ज़्यादा व्यूज़",
  ],
  audit: [
    "channel audit", "audit my channel", "full review", "review my channel",
    "آڈٹ", "چینل آڈٹ",
    "चैनल ऑडिट", "ऑडिट",
    "تدقيق القناة", "مراجعة القناة",
    "চ্যানেল অডিট",
    "kanal denetimi", "kanalımı denetle",
    "audit channel", "periksa channel saya",
    "auditoría del canal", "audita mi canal",
    "audit de la chaîne", "audite ma chaîne",
    "kanal-audit", "prüfe meinen kanal",
    "auditoria do canal", "audite meu canal",
    "аудит канала", "проверь мой канал",
    "پلټنه", "د چینل پلټنه",
  ],
  "latest-review": [
    "review my latest video", "review my newest video", "feedback on my video",
    "review my video",
    "میری تازہ ترین ویڈیو", "میری ویڈیو کا جائزہ",
    "मेरी नवीनतम वीडियो", "मेरी वीडियो की समीक्षा",
    "راجع أحدث فيديو", "مراجعة أحدث فيديو",
    "আমার সর্বশেষ ভিডিও",
    "son videomu incele", "en son videomu değerlendir",
    "ulasan video terbaru saya", "tinjau video terbaru saya",
    "revisa mi último vídeo", "revisión de mi último vídeo",
    "revois ma dernière vidéo", "avis sur ma dernière vidéo",
    "bewerte mein neuestes video", "mein neuestes video prüfen",
    "revise meu vídeo mais recente", "avalie meu último vídeo",
    "оцени мое последнее видео", "обзор моего последнего видео",
    "زما وروستۍ ویډیو",
  ],
  script: [
    "write a script", "draft a script", "script about", "script for",
    "اسکرپٹ لکھ", "اسکرپٹ لکھیں",
    "स्क्रिप्ट लिख", "स्क्रिप्ट लिखो",
    "اكتب سكربت", "اكتب نص",
    "স্ক্রিপ্ট লিখ",
    "senaryo yaz", "bir senaryo yaz",
    "tulis naskah", "buatkan naskah",
    "escribe un guion", "escribe el guion",
    "écris un script", "écrire un script",
    "schreib ein skript", "skript schreiben",
    "escreva um roteiro", "escrever um roteiro",
    "напиши сценарий", "написать сценарий",
    "سکریپټ ولیک",
  ],
  community: [
    "community post", "draft a post", "write a post",
    "کمیونٹی پوسٹ",
    "कम्युनिटी पोस्ट",
    "منشور مجتمع", "منشور للمجتمع",
    "কমিউনিটি পোস্ট",
    "topluluk gönderisi", "topluluk postu",
    "postingan komunitas", "post komunitas",
    "publicación para la comunidad", "post para la comunidad",
    "publication communautaire", "post pour la communauté",
    "community-post", "beitrag für die community",
    "post para a comunidade", "publicação da comunidade",
    "пост для сообщества", "напиши пост",
    "ټولنې پوسټ",
  ],
};

/** Multilingual "is this about my channel?" check (kept in sync with the
 *  route's old English-only regex — same words, more languages). */
const CHANNEL_WORDS = [
  "channel", "canal", "chaîne", "chaine", "kanal", "قناة", "قناتي",
  "चैनल", "چینل", "канал", "চ্যানেল", "subscrib", "suscript", "abonn",
  "inscrit", "abone", "views", "vistas", "vues", "aufrufe",
  "visualizações", "просмотр", "ویوز", "व्यूज", "مشاهدات", "ভিউ",
  "video", "vídeo", "vidéo", "фيديو", "वीडियो", "ویڈیو", "ভিডিও",
  "perform", "doing", "growth", "crecer", "croissance", "wachstum",
  "crescer", "рост", "بڑھ", "ترقی", "कैसा", "کیسا", "میرا چینل",
];

export function isChannelQuestion(message: string): boolean {
  const q = (message ?? "").toLowerCase();
  return CHANNEL_WORDS.some((w) => q.includes(w.toLowerCase()));
}

/** Prepositions used to pull a script topic out of a message, per language. */
export const SCRIPT_TOPIC_MARKERS: string[] = [
  "about", "for", "on",
  "پر", "کے بارے میں", "بارے میں",
  "के बारे में", "पर",
  "عن", "حول",
  "sobre", "de",
  "sur",
  "über",
  "hakkında",
  "tentang",
  "о", "про",
  "সম্পর্কে",
];

// ---------------------------------------------------------------------------
// Playbook — full text in 13 languages. Pashto (ps) is intentionally
// absent here: its detailed guides fall back to English with a note
// (see playbookText). English and Urdu are copied verbatim from the
// original playbook; the other languages are faithful, slightly tighter
// translations of the same advice.
// ---------------------------------------------------------------------------

export type PlaybookId =
  | "titles"
  | "tags"
  | "thumbnails"
  | "description"
  | "posting-time"
  | "subscribers"
  | "watch-time"
  | "shorts"
  | "ctr"
  | "audit"
  | "keywords"
  | "consistency"
  | "monetization"
  | "analytics"
  | "hook";

export const PLAYBOOK_TEXT: Partial<
  Record<PlaybookId, Partial<Record<AssistantLang, string>>>
> = {
  titles: {
    en: "Good titles promise one clear payoff in under 60 characters. Put the benefit or the surprise first, use a number or a name when it is real, and never promise what the video does not deliver. Write 5 options for every video, then pick the one a stranger would click without knowing you. Test a new title on an old video if its click-through rate is under 4%.",
    ur: "اچھا ٹائٹل 60 حروف سے کم میں ایک واضح فائدہ بتاتا ہے۔ فائدہ یا حیران کن بات پہلے لکھیں، اگر نمبر یا نام سچا ہو تو ضرور لکھیں، اور ویڈیو میں جو نہیں ہے اس کا وعدہ نہ کریں۔ ہر ویڈیو کے لیے 5 ٹائٹل لکھیں اور وہ چنیں جس پر اجنبی بھی کلک کرے۔ اگر کلک ریٹ 4 فیصد سے کم ہو تو پرانی ویڈیو کا ٹائٹل بدل کر دیکھیں۔",
    hi: "अच्छा टाइटल 60 अक्षरों से कम में एक साफ़ फ़ायदा बताता है। फ़ायदा या हैरान करने वाली बात पहले लिखें, नंबर या नाम सिर्फ़ तब लिखें जब वह सच हो, और वीडियो में जो नहीं है उसका वादा न करें। हर वीडियो के लिए 5 टाइटल लिखें और वह चुनें जिस पर कोई अजनबी भी क्लिक करे। अगर क्लिक दर 4% से कम हो तो पुराने वीडियो का टाइटल बदलकर देखें।",
    ar: "العنوان الجيد يعد بفائدة واضحة واحدة في أقل من 60 حرفًا. ضع الفائدة أو المفاجأة أولًا، وأضف رقمًا أو اسمًا إذا كان حقيقيًا، ولا تعد بما لا يقدمه الفيديو. اكتب 5 عناوين لكل فيديو، ثم اختر العنوان الذي ينقر عليه غريب لا يعرفك. وإذا كانت نسبة النقر أقل من 4٪، جرّب عنوانًا جديدًا لفيديو قديم.",
    es: "Un buen título promete un beneficio claro en menos de 60 caracteres. Pon el beneficio o la sorpresa primero, usa un número o un nombre solo si es real, y nunca prometas lo que el vídeo no cumple. Escribe 5 opciones por vídeo y elige la que haría clic un desconocido. Si tu CTR es menor al 4 %, prueba un título nuevo en un vídeo antiguo.",
    fr: "Un bon titre promet un bénéfice clair en moins de 60 caractères. Mettez le bénéfice ou la surprise en premier, utilisez un chiffre ou un nom seulement s'il est vrai, et ne promettez jamais ce que la vidéo ne donne pas. Écrivez 5 titres par vidéo et choisissez celui sur lequel un inconnu cliquerait. Si votre CTR est sous 4 %, testez un nouveau titre sur une ancienne vidéo.",
    de: "Ein guter Titel verspricht einen klaren Nutzen in unter 60 Zeichen. Stelle den Nutzen oder die Überraschung an den Anfang, nutze Zahlen oder Namen nur, wenn sie stimmen, und verspreche nie etwas, das das Video nicht hält. Schreibe 5 Titel pro Video und wähle den, auf den auch ein Fremder klicken würde. Liegt deine Klickrate unter 4 %, teste einen neuen Titel bei einem alten Video.",
    pt: "Um bom título promete um benefício claro em menos de 60 caracteres. Coloque o benefício ou a surpresa primeiro, use um número ou um nome só se for real, e nunca prometa o que o vídeo não entrega. Escreva 5 títulos por vídeo e escolha aquele em que um estranho clicaria. Se o CTR estiver abaixo de 4 %, teste um título novo num vídeo antigo.",
    tr: "İyi bir başlık 60 karakterden kısa olmalı ve net bir fayda vaat etmeli. Faydayı veya sürprizi öne koyun, sayı veya isim yalnızca gerçekse kullanın, videoda olmayan bir şeyi asla vaat etmeyin. Her video için 5 başlık yazın ve bir yabancının bile tıklayacağı başlığı seçin. Tıklama oranı %4'ün altındaysa eski bir videoda yeni bir başlık deneyin.",
    id: "Judul yang bagus menjanjikan satu manfaat jelas dalam kurang dari 60 karakter. Letakkan manfaat atau kejutan di depan, gunakan angka atau nama hanya jika benar, dan jangan pernah menjanjikan hal yang tidak ada di video. Tulis 5 judul untuk setiap video, lalu pilih yang akan diklik orang asing sekalipun. Jika CTR di bawah 4%, coba judul baru pada video lama.",
    ru: "Хороший заголовок обещает одну понятную выгоду и укладывается в 60 символов. Поставьте выгоду или сюрприз на первое место, используйте число или имя, только если они правдивы, и никогда не обещайте того, чего нет в видео. Пишите 5 вариантов на каждое видео и выбирайте тот, на который кликнул бы незнакомец. Если CTR ниже 4%, попробуйте новый заголовок для старого видео.",
    pa: "چنگا ٹائٹل 60 حرفاں توں گھٹ وچ اک صاف فائدہ دسدا اے۔ فائدہ یا حیران کن گل پہلاں لکھو، نمبر یا ناں صرف اودوں لکھو جدوں سچا ہووے، تے ویڈیو وچ جو نہیں اے اوہدا وعدہ نہ کرو۔ ہر ویڈیو لئی 5 ٹائٹل لکھو تے اوہ چنو جس تے کوئی اجنبی وی کلک کرے۔ جے کلک ریٹ 4 فیصد توں گھٹ ہووے تے پرانی ویڈیو دا ٹائٹل بدل کے ویکھو۔",
    bn: "ভালো টাইটেল ৬০ অক্ষরের কমে একটি স্পষ্ট সুবিধার প্রতিশ্রুতি দেয়। সুবিধা বা চমক প্রথমে লিখুন, সংখ্যা বা নাম কেবল সত্য হলে ব্যবহার করুন, আর ভিডিওতে যা নেই তার প্রতিশ্রুতি দেবেন না। প্রতিটি ভিডিওর জন্য ৫টি টাইটেল লিখুন এবং সেটি বেছে নিন যেটিতে একজন অপরিচিত ব্যক্তিও ক্লিক করবে। ক্লিক হার ৪%-এর কম হলে পুরনো ভিডিওতে নতুন টাইটেল চেষ্টা করুন।",
  },
  tags: {
    en: "Tags help YouTube understand a video, they do not rank it alone. Use 10–15 tags: the exact topic phrase first, then close variations, then the broader category. Put the same main phrase in the title and the first line of the description — that matters far more than stuffing tags. Skip single generic words like “video” or “funny”.",
    ur: "ٹیگز یوٹیوب کو ویڈیو سمجھنے میں مدد دیتے ہیں، اکیلے رینک نہیں دیتے۔ 10 سے 15 ٹیگز استعمال کریں: پہلے موضوع کا درست جملہ، پھر اس کی قریبی صورتیں، پھر وسیع زمرہ۔ وہی اہم جملہ ٹائٹل اور تفصیل کی پہلی سطر میں بھی لکھیں — یہ ٹیگز بھرنے سے کہیں زیادہ اہم ہے۔ “video” جیسے عام الفاظ نہ لکھیں۔",
    hi: "टैग YouTube को वीडियो समझने में मदद करते हैं, अकेले रैंक नहीं देते। 10 से 15 टैग इस्तेमाल करें: पहले विषय का सटीक वाक्य, फिर उसके करीबी रूप, फिर व्यापक श्रेणी। वही मुख्य वाक्य टाइटल और विवरण की पहली पंक्ति में भी लिखें — यह टैग भरने से कहीं ज़्यादा ज़रूरी है। “video” जैसे आम शब्द न लिखें।",
    ar: "الوسوم تساعد يوتيوب على فهم الفيديو، لكنها وحدها لا ترفع ترتيبه. استخدم 10 إلى 15 وسمًا: عبارة الموضوع الدقيقة أولًا، ثم الصيغ القريبة منها، ثم الفئة الأوسع. ضع العبارة نفسها في العنوان وفي السطر الأول من الوصف — هذا أهم بكثير من حشو الوسوم. وتجنّب الكلمات العامة المفردة مثل “فيديو” أو “مضحك”.",
    es: "Las etiquetas ayudan a YouTube a entender un vídeo, pero por sí solas no lo posicionan. Usa de 10 a 15: primero la frase exacta del tema, luego variantes cercanas y después la categoría general. Pon esa misma frase en el título y en la primera línea de la descripción — eso importa mucho más que rellenar etiquetas. Evita palabras genéricas sueltas como “vídeo” o “gracioso”.",
    fr: "Les tags aident YouTube à comprendre une vidéo, mais ne la classent pas à eux seuls. Utilisez 10 à 15 tags : d'abord l'expression exacte du sujet, puis des variantes proches, puis la catégorie plus large. Mettez la même expression dans le titre et dans la première ligne de la description — c'est bien plus important que de bourrer les tags. Évitez les mots génériques isolés comme « vidéo » ou « drôle ».",
    de: "Tags helfen YouTube, ein Video zu verstehen, ranken es aber nicht allein. Nutze 10–15 Tags: zuerst die genaue Themenphrase, dann nahe Varianten, dann die breitere Kategorie. Setze dieselbe Hauptphrase in den Titel und in die erste Zeile der Beschreibung — das zählt weit mehr als vollgestopfte Tags. Lass einzelne allgemeine Wörter wie „Video“ oder „lustig“ weg.",
    pt: "As tags ajudam o YouTube a entender um vídeo, mas sozinhas não o ranqueiam. Use de 10 a 15: primeiro a frase exata do tema, depois variações próximas e então a categoria mais ampla. Coloque a mesma frase no título e na primeira linha da descrição — isso importa muito mais do que encher de tags. Evite palavras genéricas soltas como “vídeo” ou “engraçado”.",
    tr: "Etiketler YouTube'un videoyu anlamasına yardım eder, tek başına sıralama sağlamaz. 10–15 etiket kullanın: önce konunun tam ifadesi, sonra yakın çeşitleri, sonra daha geniş kategori. Aynı ana ifadeyi başlığa ve açıklamanın ilk satırına da yazın — bu, etiket doldurmaktan çok daha önemlidir. “video” veya “komik” gibi tek başına genel kelimelerden kaçının.",
    id: "Tag membantu YouTube memahami sebuah video, tetapi tidak menaikkan peringkat sendirian. Gunakan 10–15 tag: frasa topik yang tepat dulu, lalu variasinya, lalu kategori yang lebih luas. Letakkan frasa utama yang sama di judul dan baris pertama deskripsi — itu jauh lebih penting daripada menumpuk tag. Lewati kata umum tunggal seperti “video” atau “lucu”.",
    ru: "Теги помогают YouTube понять видео, но сами по себе не поднимают его в поиске. Используйте 10–15 тегов: сначала точную фразу темы, затем близкие варианты, потом более широкую категорию. Ту же главную фразу поставьте в заголовок и в первую строку описания — это гораздо важнее, чем набивать теги. Избегайте одиночных общих слов вроде «видео» или «смешно».",
    pa: "ٹیگ یوٹیوب نوں ویڈیو سمجھن وچ مدد دیندے نیں، اکیلے رینک نہیں دیندے۔ 10 توں 15 ٹیگ ورتو: پہلاں موضوع دا ٹھیک جملہ، فیر اوہدیاں نیڑلیاں صورتاں، فیر وڈا زمرہ۔ اوہو اہم جملہ ٹائٹل تے تفصیل دی پہلی سطر وچ وی لکھو — ایہ ٹیگ بھرن توں کتے ودھ اہم اے۔ “video” ورگے عام لفظ نہ لکھو۔",
    bn: "ট্যাগ YouTube-কে ভিডিও বুঝতে সাহায্য করে, একা র‍্যাঙ্ক দেয় না। ১০–১৫টি ট্যাগ ব্যবহার করুন: প্রথমে বিষয়ের সঠিক বাক্যাংশ, তারপর তার কাছাকাছি রূপ, তারপর বৃহত্তর বিভাগ। একই মূল বাক্যাংশ টাইটেল ও বিবরণের প্রথম লাইনে লিখুন — এটি ট্যাগ ভরে ফেলার চেয়ে অনেক বেশি গুরুত্বপূর্ণ। “video” বা “মজার”-এর মতো একক সাধারণ শব্দ এড়িয়ে চলুন।",
  },
  thumbnails: {
    en: "A thumbnail must read in one second at phone size. One face with a clear emotion, one short phrase of 3–4 big words, and strong contrast — dark background, bright text. Never reuse the title word for word; the thumbnail should add a reason to click. Check it at small size before publishing: if you cannot read it, viewers cannot either.",
    ur: "تھمبنیل ایک سیکنڈ میں فون کی سکرین پر سمجھ آنا چاہیے۔ ایک چہرہ جس کے جذبات صاف ہوں، 3 سے 4 بڑے الفاظ، اور زبردست کنٹراسٹ — گہرا پس منظر، روشن لکھائی۔ ٹائٹل کو لفظ بہ لفظ نہ دہرائیں؛ تھمبنیل کلک کی نئی وجہ دے۔ شائع کرنے سے پہلے چھوٹے سائز میں دیکھیں: اگر آپ پڑھ نہیں سکتے تو ناظرین بھی نہیں پڑھ سکیں گے۔",
    hi: "थंबनेल एक सेकंड में फ़ोन के आकार पर समझ आना चाहिए। एक चेहरा जिसके भाव साफ़ हों, 3–4 बड़े शब्दों का एक छोटा वाक्य, और ज़बरदस्त कंट्रास्ट — गहरा बैकग्राउंड, चमकीला टेक्स्ट। टाइटल को शब्द-दर-शब्द न दोहराएँ; थंबनेल क्लिक की नई वजह दे। प्रकाशित करने से पहले छोटे आकार में देखें: अगर आप पढ़ नहीं सकते तो दर्शक भी नहीं पढ़ सकेंगे।",
    ar: "يجب أن تُقرأ الصورة المصغرة في ثانية واحدة على حجم الهاتف. وجه واحد بمشاعر واضحة، وعبارة قصيرة من 3–4 كلمات كبيرة، وتباين قوي — خلفية داكنة ونص ساطع. لا تعيد العنوان حرفيًا؛ يجب أن تضيف الصورة سببًا جديدًا للنقر. تحقق منها بحجم صغير قبل النشر: إن لم تستطع قراءتها، فلن يستطيع المشاهدون أيضًا.",
    es: "Una miniatura debe entenderse en un segundo en el tamaño del móvil. Una cara con una emoción clara, una frase corta de 3–4 palabras grandes y mucho contraste: fondo oscuro, texto brillante. No repitas el título palabra por palabra; la miniatura debe añadir una razón para hacer clic. Revísala en pequeño antes de publicar: si tú no puedes leerla, los espectadores tampoco.",
    fr: "Une miniature doit se lire en une seconde à la taille d'un téléphone. Un visage à l'émotion claire, une courte phrase de 3–4 gros mots, et un fort contraste — fond sombre, texte lumineux. Ne recopiez jamais le titre mot pour mot ; la miniature doit ajouter une raison de cliquer. Vérifiez-la en petit avant de publier : si vous ne pouvez pas la lire, les spectateurs non plus.",
    de: "Ein Thumbnail muss in einer Sekunde auf Handygröße lesbar sein. Ein Gesicht mit klarer Emotion, eine kurze Phrase aus 3–4 großen Wörtern und starker Kontrast — dunkler Hintergrund, heller Text. Übernimm den Titel nie Wort für Wort; das Thumbnail soll einen neuen Grund zum Klicken geben. Prüfe es vor dem Veröffentlichen in kleiner Größe: Wenn du es nicht lesen kannst, können es die Zuschauer auch nicht.",
    pt: "Uma miniatura precisa ser entendida em um segundo no tamanho do celular. Um rosto com emoção clara, uma frase curta de 3–4 palavras grandes e muito contraste — fundo escuro, texto claro. Nunca repita o título palavra por palavra; a miniatura deve dar um novo motivo para clicar. Confira em tamanho pequeno antes de publicar: se você não consegue ler, os espectadores também não.",
    tr: "Küçük resim, telefon boyutunda bir saniyede anlaşılmalı. Duygusu net bir yüz, 3–4 büyük kelimelik kısa bir ifade ve güçlü kontrast — koyu arka plan, parlak yazı. Başlığı kelimesi kelimesine tekrarlamayın; küçük resim tıklamak için yeni bir neden sunmalı. Yayınlamadan önce küçük boyutta kontrol edin: siz okuyamıyorsanız izleyiciler de okuyamaz.",
    id: "Thumbnail harus terbaca dalam satu detik pada ukuran ponsel. Satu wajah dengan emosi yang jelas, satu frasa pendek berisi 3–4 kata besar, dan kontras kuat — latar gelap, teks terang. Jangan pernah menyalin judul kata demi kata; thumbnail harus memberi alasan baru untuk mengklik. Periksa dalam ukuran kecil sebelum menerbitkan: jika Anda tidak bisa membacanya, penonton juga tidak bisa.",
    ru: "Превью должно читаться за секунду на экране телефона. Одно лицо с понятной эмоцией, короткая фраза из 3–4 крупных слов и сильный контраст — тёмный фон, яркий текст. Никогда не повторяйте заголовок слово в слово; превью должно давать новую причину кликнуть. Проверьте его в маленьком размере перед публикацией: если не можете прочитать вы, не смогут и зрители.",
    pa: "تھمبنیل اک سیکنڈ وچ فون دے سائز تے سمجھ آنا چاہیدا اے۔ اک چہرہ جس دے جذبات صاف ہوون، 3 توں 4 وڈے لفظاں دا اک چھوٹا جملہ، تے زبردست کنٹراسٹ — گوڑھا پس منظر، روشن لکھائی۔ ٹائٹل نوں لفظ بہ لفظ نہ دہراؤ؛ تھمبنیل کلک دی نویں وجہ دیوے۔ شائع کرن توں پہلاں چھوٹے سائز وچ ویکھو: جے تسیں پڑھ نہیں سکدے تے ناظرین وی نہیں پڑھ سکن گے۔",
    bn: "থাম্বনেইল এক সেকেন্ডে ফোনের আকারে বোঝা উচিত। একটি মুখ যার অনুভূতি স্পষ্ট, ৩–৪টি বড় শব্দের একটি ছোট বাক্য, এবং শক্তিশালী কনট্রাস্ট — গাঢ় পটভূমি, উজ্জ্বল লেখা। টাইটেল হুবহু পুনরাবৃত্তি করবেন না; থাম্বনেইল ক্লিকের নতুন কারণ দেবে। প্রকাশের আগে ছোট আকারে দেখে নিন: আপনি পড়তে না পারলে দর্শকরাও পারবে না।",
  },
  description: {
    en: "The first two lines of the description show in search, so put the video's promise and the main keyword there. Then add a short summary, chapter times, and links. Never paste a keyword list — it looks spammy and helps nobody. Keep it honest: describe what the viewer will actually learn or see.",
    ur: "تفصیل کی پہلی دو سطریں تلاش میں نظر آتی ہیں، اس لیے وہاں ویڈیو کا وعدہ اور اہم مطلوبہ لفظ لکھیں۔ پھر مختصر خلاصہ، ابواب کے اوقات اور لنکس دیں۔ مطلوبہ الفاظ کی فہرست ہرگز نہ چپکائیں — یہ سپیم لگتی ہے۔ ایمانداری سے لکھیں کہ ناظر کیا سیکھے گا یا دیکھے گا۔",
    hi: "विवरण की पहली दो पंक्तियाँ खोज में दिखती हैं, इसलिए वहाँ वीडियो का वादा और मुख्य कीवर्ड लिखें। फिर छोटा सारांश, अध्यायों के समय और लिंक जोड़ें। कीवर्ड की सूची कभी न चिपकाएँ — वह स्पैम लगती है और किसी की मदद नहीं करती। ईमानदारी से लिखें कि दर्शक वास्तव में क्या सीखेगा या देखेगा।",
    ar: "يظهر السطران الأولان من الوصف في البحث، لذا ضع فيهما وعد الفيديو والكلمة المفتاحية الرئيسية. ثم أضف ملخصًا قصيرًا وأوقات الفصول والروابط. ولا تلصق أبدًا قائمة كلمات مفتاحية — تبدو كرسائل مزعجة ولا تفيد أحدًا. كن صادقًا: صف ما سيتعلمه المشاهد أو يشاهده فعلًا.",
    es: "Las dos primeras líneas de la descripción se ven en la búsqueda, así que pon ahí la promesa del vídeo y la palabra clave principal. Luego añade un resumen corto, los tiempos de los capítulos y enlaces. Nunca pegues una lista de palabras clave: parece spam y no ayuda a nadie. Sé honesto: describe lo que el espectador aprenderá o verá de verdad.",
    fr: "Les deux premières lignes de la description apparaissent dans la recherche : mettez-y la promesse de la vidéo et le mot-clé principal. Ajoutez ensuite un bref résumé, les temps des chapitres et des liens. Ne collez jamais une liste de mots-clés : cela fait spam et n'aide personne. Restez honnête : décrivez ce que le spectateur va vraiment apprendre ou voir.",
    de: "Die ersten zwei Zeilen der Beschreibung erscheinen in der Suche — setze dort das Versprechen des Videos und das Haupt-Keyword. Dann füge eine kurze Zusammenfassung, Kapitelzeiten und Links hinzu. Klebe nie eine Keyword-Liste hinein — das wirkt wie Spam und hilft niemandem. Bleib ehrlich: Beschreibe, was der Zuschauer wirklich lernen oder sehen wird.",
    pt: "As duas primeiras linhas da descrição aparecem na busca, então coloque ali a promessa do vídeo e a palavra-chave principal. Depois adicione um resumo curto, os tempos dos capítulos e links. Nunca cole uma lista de palavras-chave — parece spam e não ajuda ninguém. Seja honesto: descreva o que o espectador vai realmente aprender ou ver.",
    tr: "Açıklamanın ilk iki satırı aramada görünür, bu yüzden videonun vaadini ve ana anahtar kelimeyi oraya yazın. Sonra kısa bir özet, bölüm süreleri ve bağlantılar ekleyin. Asla anahtar kelime listesi yapıştırmayın — spam gibi görünür ve kimseye faydası olmaz. Dürüst olun: izleyicinin gerçekte ne öğreneceğini veya göreceğini anlatın.",
    id: "Dua baris pertama deskripsi muncul di pencarian, jadi letakkan janji video dan kata kunci utama di sana. Lalu tambahkan ringkasan singkat, waktu bab, dan tautan. Jangan pernah menempel daftar kata kunci — itu terlihat seperti spam dan tidak membantu siapa pun. Jujurlah: jelaskan apa yang benar-benar akan dipelajari atau dilihat penonton.",
    ru: "Первые две строки описания видны в поиске, поэтому поместите туда обещание видео и главное ключевое слово. Затем добавьте краткое содержание, таймкоды глав и ссылки. Никогда не вставляйте список ключевых слов — это выглядит как спам и никому не помогает. Будьте честны: опишите, что зритель действительно узнает или увидит.",
    pa: "تفصیل دیاں پہلیاں دو سطراں تلاش وچ نظر آوندیاں نیں، ایس لئی اوتھے ویڈیو دا وعدہ تے اہم مطلوبہ لفظ لکھو۔ فیر مختصر خلاصہ، ابواب دے اوقات تے لنک دیو۔ مطلوبہ لفظاں دی لسٹ کدے نہ چپکاؤ — ایہ سپیم لگدی اے تے کسے دی مدد نہیں کردی۔ ایمانداری نال لکھو کہ ناظر واقعی کیہ سیکھے گا یا ویکھے گا۔",
    bn: "বিবরণের প্রথম দুটি লাইন অনুসন্ধানে দেখা যায়, তাই সেখানে ভিডিওর প্রতিশ্রুতি ও মূল কীওয়ার্ড লিখুন। তারপর সংক্ষিপ্ত সারাংশ, অধ্যায়ের সময় ও লিঙ্ক যোগ করুন। কখনো কীওয়ার্ডের তালিকা আটকাবেন না — এটি স্প্যাম মনে হয় এবং কারও উপকারে আসে না। সৎ থাকুন: দর্শক আসলে কী শিখবে বা দেখবে তা বর্ণনা করুন।",
  },
  "posting-time": {
    en: "There is no universal best time — it is when YOUR audience is online. In Nizafa, open your channel's best-time chart: it is built from your own upload history. As a starting point for a US audience, weekday afternoons (2–4pm Eastern) and Sunday mornings usually work well. Post consistently at the same times for a month, then keep what the data supports.",
    ur: "پوسٹ کا کوئی ایک بہترین وقت نہیں — وہ وقت ہے جب آپ کے ناظرین آن لائن ہوں۔ نیزافا میں اپنے چینل کا بہترین وقت کا چارٹ دیکھیں: یہ آپ کی اپنی اپ لوڈ تاریخ سے بنتا ہے۔ امریکی ناظرین کے لیے ہفتے کے دن دوپہر 2 تا 4 بجے (ایسٹرن) اور اتوار کی صبح عام طور پر اچھے ہوتے ہیں۔ ایک ماہ تک ایک ہی وقت پر پوسٹ کریں، پھر ڈیٹا کے مطابق فیصلہ کریں۔",
    hi: "पोस्ट करने का कोई एक सर्वश्रेष्ठ समय नहीं है — वह समय है जब आपके दर्शक ऑनलाइन हों। Nizafa में अपने चैनल का सर्वश्रेष्ठ समय वाला चार्ट खोलें: यह आपके अपने अपलोड इतिहास से बनता है। अमेरिकी दर्शकों के लिए शुरुआत में सप्ताह के दिनों में दोपहर 2–4 बजे (ईस्टर्न) और रविवार की सुबह आमतौर पर अच्छी रहती है। एक महीने तक एक ही समय पर पोस्ट करें, फिर डेटा के अनुसार फ़ैसला करें।",
    ar: "لا يوجد وقت مثالي واحد للجميع — بل هو الوقت الذي يكون فيه جمهورك متصلًا. في نيزافا، افتح مخطط أفضل وقت لقناتك: فهو مبني على سجل الرفع الخاص بك. كنقطة بداية لجمهور أمريكي، تعمل ظهيرة أيام الأسبوع (2–4 مساءً بتوقيت الشرق) وصباح الأحد عادةً بشكل جيد. انشر بانتظام في الأوقات نفسها لمدة شهر، ثم احتفظ بما يدعمه البيانات.",
    es: "No hay una hora universal perfecta: es cuando TU audiencia está en línea. En Nizafa, abre el gráfico de mejor hora de tu canal: se construye con tu propio historial de subidas. Como punto de partida para una audiencia de EE. UU., las tardes de entre semana (2–4 p. m., hora del Este) y las mañanas de domingo suelen funcionar bien. Publica siempre a las mismas horas durante un mes y quédate con lo que apoyen los datos.",
    fr: "Il n'y a pas d'heure universelle idéale : c'est celle où VOTRE audience est en ligne. Dans Nizafa, ouvrez le graphique des meilleures heures de votre chaîne : il est construit à partir de votre propre historique de publications. Pour commencer, avec une audience américaine, les après-midis en semaine (14 h–16 h, heure de l'Est) et les dimanches matin fonctionnent généralement bien. Publiez aux mêmes heures pendant un mois, puis gardez ce que les données confirment.",
    de: "Es gibt keine universell beste Zeit — es ist die, zu der DEIN Publikum online ist. Öffne in Nizafa das Beste-Zeit-Diagramm deines Kanals: Es basiert auf deiner eigenen Upload-Historie. Als Startpunkt für ein US-Publikum funktionieren Wochentagnachmittage (14–16 Uhr Eastern) und Sonntagvormittage meist gut. Poste einen Monat lang immer zur gleichen Zeit und behalte dann, was die Daten stützen.",
    pt: "Não existe um horário universal perfeito — é quando A SUA audiência está online. No Nizafa, abra o gráfico de melhor horário do seu canal: ele é feito com o seu próprio histórico de uploads. Como ponto de partida para uma audiência dos EUA, as tardes de dias úteis (14h–16h, horário do Leste) e as manhãs de domingo costumam funcionar bem. Publique sempre nos mesmos horários por um mês e fique com o que os dados confirmarem.",
    tr: "Herkes için tek bir en iyi saat yoktur — sizin kitlenizin çevrimiçi olduğu saattir. Nizafa'da kanalınızın en iyi saat grafiğini açın: kendi yükleme geçmişinizden oluşur. ABD kitlesi için başlangıç olarak hafta içi öğleden sonralar (Doğu saatiyle 14.00–16.00) ve pazar sabahları genelde iyi çalışır. Bir ay boyunca hep aynı saatlerde paylaşın, sonra verilerin desteklediğini koruyun.",
    id: "Tidak ada waktu terbaik yang universal — waktunya adalah saat audiens ANDA sedang online. Di Nizafa, buka grafik waktu terbaik channel Anda: grafik itu dibuat dari riwayat unggahan Anda sendiri. Sebagai titik awal untuk audiens AS, sore hari kerja (jam 2–4 sore waktu Timur) dan Minggu pagi biasanya bekerja dengan baik. Unggah secara konsisten pada jam yang sama selama sebulan, lalu pertahankan yang didukung data.",
    ru: "Универсального лучшего времени нет — это время, когда ВАША аудитория онлайн. В Nizafa откройте график лучшего времени вашего канала: он построен на вашей собственной истории загрузок. Для начала, для аудитории США обычно хорошо работают будни днём (14:00–16:00 по восточному времени) и воскресенье утром. Публикуйте в одно и то же время месяц, а затем оставьте то, что подтверждают данные.",
    pa: "پوسٹ دا کوئی اک بہترین وقت نہیں — اوہ وقت اے جدوں تہاڈے ناظرین آن لائن ہوون۔ نیزافا وچ اپنے چینل دا بہترین وقت والا چارٹ کھولو: ایہ تہاڈی اپنی اپ لوڈ تاریخ توں بندا اے۔ امریکی ناظرین لئی شروع وچ ہفتے دے دناں دی دوپہر 2 توں 4 وجے (ایسٹرن) تے اتوار دی سویر عام طور تے چنگی ہوندی اے۔ اک مہینہ اکو وقت تے پوسٹ کرو، فیر ڈیٹا مطابق فیصلہ کرو۔",
    bn: "পোস্টের কোনো একক সেরা সময় নেই — সেটি হলো যখন আপনার দর্শক অনলাইনে থাকে। Nizafa-তে আপনার চ্যানেলের সেরা সময়ের চার্ট খুলুন: এটি আপনার নিজের আপলোডের ইতিহাস থেকে তৈরি। মার্কিন দর্শকের জন্য শুরুতে সপ্তাহের দিনগুলোতে দুপুর ২–৪টা (ইস্টার্ন) ও রবিবার সকাল সাধারণত ভালো কাজ করে। এক মাস একই সময়ে পোস্ট করুন, তারপর ডেটা যা বলে তাই রাখুন।",
  },
};

// Playbook continued — subscribers, watch-time, shorts, CTR, audit.
export const PLAYBOOK_TEXT_2: Partial<
  Record<PlaybookId, Partial<Record<AssistantLang, string>>>
> = {
  subscribers: {
    en: "Subscribers follow channels that solve one problem again and again. Pick a clear niche, make every video for the same kind of viewer, and end each video with a reason to return — the next video in the series, not a generic “please subscribe”. One strong video a week beats five forgettable ones. Growth compounds: small channels grow slowly, then suddenly.",
    ur: "سبسکرائبر ان چینلز کو فالو کرتے ہیں جو ایک ہی مسئلہ بار بار حل کرتے ہیں۔ ایک واضح موضوع چنیں، ہر ویڈیو اسی طرح کے ناظر کے لیے بنائیں، اور ہر ویڈیو کے آخر میں واپسی کی وجہ دیں — سیریز کی اگلی ویڈیو، نہ کہ عام “سبسکرائب کریں”۔ ہفتے میں ایک مضبوط ویڈیو پانچ بھولی ہوئی ویڈیوز سے بہتر ہے۔ ترقی آہستہ شروع ہوتی ہے، پھر اچانک بڑھتی ہے۔",
    hi: "सब्सक्राइबर उन चैनलों को फ़ॉलो करते हैं जो एक ही समस्या बार-बार हल करते हैं। एक साफ़ विषय चुनें, हर वीडियो उसी तरह के दर्शक के लिए बनाएँ, और हर वीडियो के अंत में लौटने की वजह दें — सीरीज़ का अगला वीडियो, न कि आम “सब्सक्राइब करें”। हफ़्ते में एक मज़बूत वीडियो पाँच भूलने योग्य वीडियो से बेहतर है। बढ़त धीरे शुरू होती है, फिर अचानक तेज़ हो जाती है।",
    ar: "يتابع المشتركون القنوات التي تحل مشكلة واحدة مرارًا وتكرارًا. اختر مجالًا واضحًا، واصنع كل فيديو لنفس النوع من المشاهدين، واختم كل فيديو بسبب للعودة — الفيديو التالي في السلسلة، لا عبارة عامة مثل “اشترك من فضلك”. فيديو واحد قوي في الأسبوع أفضل من خمسة فيديوهات تُنسى. النمو يتراكم: القنوات الصغيرة تنمو ببطء، ثم فجأة.",
    es: "Los suscriptores siguen a canales que resuelven un mismo problema una y otra vez. Elige un nicho claro, haz cada vídeo para el mismo tipo de espectador y termina cada vídeo con una razón para volver: el siguiente vídeo de la serie, no un genérico “suscríbete, por favor”. Un vídeo fuerte por semana supera a cinco olvidables. El crecimiento se acumula: los canales pequeños crecen despacio y de repente despegan.",
    fr: "Les abonnés suivent les chaînes qui résolvent un même problème encore et encore. Choisissez une niche claire, faites chaque vidéo pour le même type de spectateur, et terminez chaque vidéo par une raison de revenir — la prochaine vidéo de la série, pas un générique « abonnez-vous ». Une bonne vidéo par semaine vaut mieux que cinq vidéos oubliables. La croissance se cumule : les petites chaînes grandissent lentement, puis soudainement.",
    de: "Abonnenten folgen Kanälen, die ein Problem immer wieder lösen. Wähle eine klare Nische, mache jedes Video für dieselbe Art Zuschauer und beende jedes Video mit einem Grund zurückzukommen — das nächste Video der Serie, nicht ein allgemeines „bitte abonnieren“. Ein starkes Video pro Woche schlägt fünf vergessbare. Wachstum summiert sich: Kleine Kanäle wachsen langsam — und dann plötzlich.",
    pt: "Os inscritos seguem canais que resolvem um mesmo problema várias vezes. Escolha um nicho claro, faça cada vídeo para o mesmo tipo de espectador e termine cada vídeo com um motivo para voltar — o próximo vídeo da série, não um genérico “inscreva-se, por favor”. Um vídeo forte por semana vale mais que cinco esquecíveis. O crescimento se acumula: canais pequenos crescem devagar e, de repente, disparam.",
    tr: "Aboneler, aynı sorunu tekrar tekrar çözen kanalları takip eder. Net bir konu seçin, her videoyu aynı tür izleyici için yapın ve her videoyu geri dönmek için bir nedenle bitirin — serinin sonraki videosu, genel bir “lütfen abone olun” değil. Haftada bir güçlü video, beş unutulur videodan iyidir. Büyüme birikir: küçük kanallar yavaş büyür, sonra aniden hızlanır.",
    id: "Subscriber mengikuti channel yang menyelesaikan satu masalah berulang kali. Pilih niche yang jelas, buat setiap video untuk jenis penonton yang sama, dan akhiri setiap video dengan alasan untuk kembali — video berikutnya dalam seri, bukan “tolong subscribe” yang umum. Satu video kuat seminggu mengalahkan lima video yang mudah dilupakan. Pertumbuhan berlipat: channel kecil tumbuh lambat, lalu tiba-tiba melesat.",
    ru: "Подписчики следят за каналами, которые снова и снова решают одну проблему. Выберите чёткую нишу, делайте каждое видео для одного и того же зрителя и заканчивайте каждое видео причиной вернуться — следующим видео из серии, а не общим «пожалуйста, подпишитесь». Одно сильное видео в неделю лучше пяти забываемых. Рост накапливается: маленькие каналы растут медленно, а потом — вдруг.",
    pa: "سبسکرائبر اوہناں چینلاں نوں فالو کردے نیں جو اکو مسئلہ بار بار حل کردے نیں۔ اک صاف موضوع چنو، ہر ویڈیو اوہو جہے ناظر لئی بناؤ، تے ہر ویڈیو دے انت تے واپسی دی وجہ دیو — سیریز دی اگلی ویڈیو، نہ کہ عام “سبسکرائب کرو”۔ ہفتے وچ اک مضبوط ویڈیو پنج بھلن یوگ ویڈیوز توں بہتر اے۔ ترقی ہولی شروع ہوندی اے، فیر اچانک ودھدی اے۔",
    bn: "সাবস্ক্রাইবাররা সেই চ্যানেলগুলো অনুসরণ করে যেগুলো একই সমস্যা বারবার সমাধান করে। একটি স্পষ্ট বিষয় বেছে নিন, প্রতিটি ভিডিও একই ধরনের দর্শকের জন্য বানান, আর প্রতিটি ভিডিওর শেষে ফেরার কারণ দিন — সিরিজের পরের ভিডিও, সাধারণ “সাবস্ক্রাইব করুন” নয়। সপ্তাহে একটি শক্তিশালী ভিডিও পাঁচটি ভুলে যাওয়ার মতো ভিডিওর চেয়ে ভালো। বৃদ্ধি জমে ওঠে: ছোট চ্যানেল ধীরে বাড়ে, তারপর হঠাৎ।",
  },
  "watch-time": {
    en: "Watch time grows when the first 30 seconds earn the click. State the payoff immediately, cut anything that does not serve it, and change the visual on every beat — a new shot, graphic or example. Long pauses and slow intros lose viewers fast. Aim for a video where the average viewer stays past halfway; that is the strongest signal YouTube reads.",
    ur: "دیکھنے کا وقت اس وقت بڑھتا ہے جب پہلے 30 سیکنڈ کلک کو درست ثابت کریں۔ فائدہ فوراً بتائیں، جو چیز کام نہ آئے اسے کاٹ دیں، اور ہر بات پر تصویر بدلیں — نیا شاٹ، گرافک یا مثال۔ لمبی خاموشی اور سست شروعات ناظرین کو بھگا دیتی ہے۔ مقصد یہ ہو کہ اوسط ناظر آدھی ویڈیو سے آگے رہے؛ یوٹیوب اسے سب سے مضبوط اشارہ مانتا ہے۔",
    hi: "देखने का समय तब बढ़ता है जब पहले 30 सेकंड क्लिक को सही साबित करें। फ़ायदा तुरंत बताएँ, जो काम न आए उसे काट दें, और हर बात पर दृश्य बदलें — नया शॉट, ग्राफ़िक या उदाहरण। लंबी ख़ामोशी और धीमी शुरुआत दर्शकों को भगा देती है। लक्ष्य यह हो कि औसत दर्शक आधी वीडियो से आगे रहे; YouTube इसे सबसे मज़बूत संकेत मानता है।",
    ar: "يزيد وقت المشاهدة عندما تثبت أول 30 ثانية أن النقرة كانت تستحق. اذكر الفائدة فورًا، واحذف كل ما لا يخدمها، وغيّر الصورة مع كل فكرة — لقطة جديدة أو رسم أو مثال. التوقفات الطويلة والمقدمات البطيئة تُفقد المشاهدين بسرعة. اهدف إلى فيديو يبقى فيه المشاهد العادي بعد المنتصف؛ فهذه أقوى إشارة يقرؤها يوتيوب.",
    es: "El tiempo de visualización crece cuando los primeros 30 segundos justifican el clic. Di el beneficio de inmediato, corta todo lo que no lo sirva y cambia lo visual en cada momento: una toma nueva, un gráfico o un ejemplo. Las pausas largas y las intros lentas pierden espectadores rápido. Apunta a un vídeo en el que el espectador medio pase de la mitad; esa es la señal más fuerte que lee YouTube.",
    fr: "Le temps de visionnage augmente quand les 30 premières secondes justifient le clic. Annoncez le bénéfice tout de suite, coupez tout ce qui ne le sert pas, et changez le visuel à chaque temps — un nouveau plan, un graphique ou un exemple. Les longues pauses et les intros lentes font fuir les spectateurs. Visez une vidéo où le spectateur moyen reste au-delà de la moitié ; c'est le signal le plus fort que YouTube lit.",
    de: "Die Wiedergabezeit wächst, wenn die ersten 30 Sekunden den Klick rechtfertigen. Nenne den Nutzen sofort, schneide alles, was ihm nicht dient, und wechsle bei jedem Takt das Bild — eine neue Einstellung, Grafik oder ein Beispiel. Lange Pausen und langsame Intros verlieren schnell Zuschauer. Ziel: ein Video, bei dem der durchschnittliche Zuschauer über die Hälfte hinaus bleibt; das ist das stärkste Signal, das YouTube liest.",
    pt: "O tempo de exibição cresce quando os primeiros 30 segundos justificam o clique. Diga o benefício na hora, corte tudo que não o sirva e mude o visual a cada momento — uma tomada nova, um gráfico ou um exemplo. Pausas longas e intros lentas perdem espectadores rápido. Mire num vídeo em que o espectador médio passe da metade; esse é o sinal mais forte que o YouTube lê.",
    tr: "İzlenme süresi, ilk 30 saniye tıklamayı haklı çıkardığında artar. Faydayı hemen söyleyin, ona hizmet etmeyen her şeyi kesin ve her adımda görseli değiştirin — yeni bir çekim, grafik veya örnek. Uzun duraklamalar ve yavaş girişler izleyiciyi hızla kaybettirir. Hedef: ortalama izleyicinin yarıyı geçtiği bir video; YouTube'un okuduğu en güçlü sinyal budur.",
    id: "Waktu tonton bertambah saat 30 detik pertama membenarkan klik. Sampaikan manfaatnya segera, potong apa pun yang tidak mendukungnya, dan ganti visual di setiap ketukan — shot baru, grafik, atau contoh. Jeda panjang dan intro lambat cepat kehilangan penonton. Bidik video yang membuat penonton rata-rata bertahan melewati setengah; itu sinyal terkuat yang dibaca YouTube.",
    ru: "Время просмотра растёт, когда первые 30 секунд оправдывают клик. Сразу назовите выгоду, вырежьте всё, что ей не служит, и меняйте картинку на каждом шаге — новый кадр, графику или пример. Длинные паузы и медленные вступления быстро теряют зрителей. Цель — видео, где средний зритель остаётся дольше половины; это самый сильный сигнал для YouTube.",
    pa: "دیکھن دا وقت اودوں ودھدا اے جدوں پہلے 30 سیکنڈ کلک نوں درست ثابت کرن۔ فائدہ فوراً دسو، جو چیز کم نہ آوے اوہنوں کٹ دیو، تے ہر گل تے تصویر بدلو — نواں شاٹ، گرافک یا مثال۔ لمبی خاموشی تے ہولی شروعات ناظرین نوں بھجا دیندی اے۔ مقصد ایہ ہووے کہ اوسط ناظر ادھی ویڈیو توں اگے رہوے؛ یوٹیوب ایہنوں سب توں مضبوط اشارہ مندا اے۔",
    bn: "দেখার সময় তখন বাড়ে যখন প্রথম ৩০ সেকেন্ড ক্লিককে সার্থক করে। সুবিধাটি সঙ্গে সঙ্গে বলুন, যা কাজে আসে না তা কেটে দিন, আর প্রতিটি কথায় দৃশ্য বদলান — নতুন শট, গ্রাফিক বা উদাহরণ। দীর্ঘ বিরতি ও ধীর শুরু দর্শকদের দ্রুত তাড়িয়ে দেয়। লক্ষ্য হোক এমন ভিডিও যেখানে গড় দর্শক অর্ধেকের বেশি থাকে; YouTube এটিকে সবচেয়ে শক্তিশালী সংকেত বলে মনে করে।",
  },
  shorts: {
    en: "Shorts are for discovery, not for depth. One idea, one payoff, under 60 seconds, with the hook in the first 2 seconds. Use them as trailers for your long videos: ask the question, build curiosity, and point to the full video. Post at most 1–2 a day. A Short that goes viral brings viewers; only a good long video turns them into subscribers.",
    ur: "شارٹس دریافت کے لیے ہیں، گہرائی کے لیے نہیں۔ ایک خیال، ایک فائدہ، 60 سیکنڈ سے کم، اور پہلے 2 سیکنڈ میں دلچسپی۔ انہیں اپنی لمبی ویڈیوز کے ٹریلر کی طرح استعمال کریں: سوال پوچھیں، تجسس پیدا کریں، اور مکمل ویڈیو کی طرف اشارہ کریں۔ دن میں زیادہ سے زیادہ 1 سے 2 پوسٹ کریں۔ وائرل شارٹ ناظرین لاتا ہے؛ صرف اچھی لمبی ویڈیو انہیں سبسکرائبر بناتی ہے۔",
    hi: "शॉर्ट्स खोज के लिए हैं, गहराई के लिए नहीं। एक विचार, एक फ़ायदा, 60 सेकंड से कम, और पहले 2 सेकंड में ही हुक। इन्हें अपने लंबे वीडियो के ट्रेलर की तरह इस्तेमाल करें: सवाल पूछें, जिज्ञासा बढ़ाएँ, और पूरे वीडियो की ओर इशारा करें। दिन में ज़्यादा से ज़्यादा 1–2 पोस्ट करें। वायरल शॉर्ट दर्शक लाता है; सिर्फ़ अच्छा लंबा वीडियो ही उन्हें सब्सक्राइबर बनाता है।",
    ar: "المقاطع القصيرة للاكتشاف، لا للعمق. فكرة واحدة، فائدة واحدة، أقل من 60 ثانية، مع الجذب في أول ثانيتين. استخدمها كمقاطع تشويقية لفيديوهاتك الطويلة: اطرح السؤال، وابنِ الفضول، وأشر إلى الفيديو الكامل. انشر 1–2 على الأكثر في اليوم. المقطع القصير المنتشر يجلب المشاهدين؛ لكن الفيديو الطويل الجيد وحده يحوّلهم إلى مشتركين.",
    es: "Los Shorts son para descubrir, no para profundizar. Una idea, un beneficio, menos de 60 segundos, con el gancho en los primeros 2 segundos. Úsalos como tráiler de tus vídeos largos: haz la pregunta, crea curiosidad y señala el vídeo completo. Publica como mucho 1–2 al día. Un Short viral trae espectadores; solo un buen vídeo largo los convierte en suscriptores.",
    fr: "Les Shorts servent à la découverte, pas à la profondeur. Une idée, un bénéfice, moins de 60 secondes, avec l'accroche dans les 2 premières secondes. Utilisez-les comme bandes-annonces de vos longues vidéos : posez la question, créez la curiosité et pointez vers la vidéo complète. Publiez 1 à 2 par jour au maximum. Un Short viral apporte des spectateurs ; seule une bonne longue vidéo les transforme en abonnés.",
    de: "Shorts sind für Entdeckung, nicht für Tiefe. Eine Idee, ein Nutzen, unter 60 Sekunden, mit dem Hook in den ersten 2 Sekunden. Nutze sie als Trailer für deine langen Videos: Stelle die Frage, wecke Neugier und verweise auf das volle Video. Poste höchstens 1–2 am Tag. Ein viraler Short bringt Zuschauer; nur ein gutes langes Video macht sie zu Abonnenten.",
    pt: "Os Shorts são para descoberta, não para profundidade. Uma ideia, um benefício, menos de 60 segundos, com o gancho nos primeiros 2 segundos. Use-os como trailer dos seus vídeos longos: faça a pergunta, crie curiosidade e aponte para o vídeo completo. Publique no máximo 1–2 por dia. Um Short viral traz espectadores; só um bom vídeo longo os transforma em inscritos.",
    tr: "Shorts keşif içindir, derinlik için değil. Bir fikir, bir fayda, 60 saniyeden kısa ve ilk 2 saniyede kanca. Bunları uzun videolarınızın fragmanı gibi kullanın: soruyu sorun, merakı artırın ve tam videoya yönlendirin. Günde en fazla 1–2 paylaşın. Viral olan Short izleyici getirir; onları aboneye yalnızca iyi bir uzun video dönüştürür.",
    id: "Shorts untuk penemuan, bukan untuk kedalaman. Satu ide, satu manfaat, di bawah 60 detik, dengan hook dalam 2 detik pertama. Gunakan sebagai trailer untuk video panjang Anda: ajukan pertanyaan, bangun rasa penasaran, dan arahkan ke video lengkapnya. Posting paling banyak 1–2 sehari. Short yang viral mendatangkan penonton; hanya video panjang yang bagus yang mengubah mereka menjadi subscriber.",
    ru: "Shorts — для открытий, а не для глубины. Одна идея, одна выгода, меньше 60 секунд, с хуком в первые 2 секунды. Используйте их как трейлеры к длинным видео: задайте вопрос, вызовите любопытство и укажите на полное видео. Публикуйте не больше 1–2 в день. Вирусный Short приводит зрителей; только хорошее длинное видео превращает их в подписчиков.",
    pa: "شارٹس دریافت لئی نیں، گہرائی لئی نہیں۔ اک خیال، اک فائدہ، 60 سیکنڈ توں گھٹ، تے پہلے 2 سیکنڈ وچ دلچسپی۔ ایہناں نوں اپنیاں لمبیاں ویڈیوز دے ٹریلر وانگ ورتو: سوال پچھو، تجسس پیدا کرو، تے مکمل ویڈیو ول اشارہ کرو۔ دن وچ ودھ توں ودھ 1 توں 2 پوسٹ کرو۔ وائرل شارٹ ناظرین لیاؤندا اے؛ صرف چنگی لمبی ویڈیو ایہناں نوں سبسکرائبر بناؤندی اے۔",
    bn: "শর্টস আবিষ্কারের জন্য, গভীরতার জন্য নয়। একটি ধারণা, একটি সুবিধা, ৬০ সেকেন্ডের কম, আর প্রথম ২ সেকেন্ডেই হুক। এগুলোকে আপনার লম্বা ভিডিওর ট্রেলার হিসেবে ব্যবহার করুন: প্রশ্ন করুন, কৌতূহল তৈরি করুন, আর সম্পূর্ণ ভিডিওর দিকে ইঙ্গিত করুন। দিনে সর্বোচ্চ ১–২টি পোস্ট করুন। ভাইরাল শর্ট দর্শক আনে; শুধু ভালো লম্বা ভিডিওই তাদের সাবস্ক্রাইবার বানায়।",
  },
  ctr: {
    en: "Click-through rate is title + thumbnail working together. Below 4% usually means the packaging is weak, not the video. Change one thing at a time — first the thumbnail, then the title — and wait at least a week before judging. Compare against your own channel average, not against big channels: a small channel's 5% can be excellent.",
    ur: "کلک تھرو ریٹ ٹائٹل اور تھمبنیل کی مشترکہ کارکردگی ہے۔ 4 فیصد سے کم کا مطلب عام طور پر پیکیجنگ کمزور ہے، ویڈیو نہیں۔ ایک وقت میں ایک چیز بدلیں — پہلے تھمبنیل، پھر ٹائٹل — اور فیصلے سے پہلے کم از کم ایک ہفتہ انتظار کریں۔ اپنا موازنہ اپنے چینل کی اوسط سے کریں، بڑے چینلز سے نہیں: چھوٹے چینل کے لیے 5 فیصد بھی بہترین ہو سکتا ہے۔",
    hi: "क्लिक-थ्रू दर टाइटल और थंबनेल का साझा काम है। 4% से कम का मतलब आमतौर पर पैकेजिंग कमज़ोर है, वीडियो नहीं। एक बार में एक चीज़ बदलें — पहले थंबनेल, फिर टाइटल — और फ़ैसले से पहले कम से कम एक हफ़्ते इंतज़ार करें। अपनी तुलना अपने चैनल की औसत से करें, बड़े चैनलों से नहीं: छोटे चैनल के लिए 5% भी बेहतरीन हो सकता है।",
    ar: "نسبة النقر هي العنوان والصورة المصغرة يعملان معًا. أقل من 4٪ تعني عادةً أن التغليف ضعيف، لا الفيديو. غيّر شيئًا واحدًا في كل مرة — الصورة المصغرة أولًا، ثم العنوان — وانتظر أسبوعًا على الأقل قبل الحكم. قارن بمتوسط قناتك أنت، لا بالقنوات الكبيرة: 5٪ لقناة صغيرة قد تكون ممتازة.",
    es: "El CTR es el título y la miniatura trabajando juntos. Por debajo del 4 % suele significar que el envoltorio es débil, no el vídeo. Cambia una cosa a la vez — primero la miniatura, luego el título — y espera al menos una semana antes de juzgar. Compárate con el promedio de tu propio canal, no con los canales grandes: un 5 % en un canal pequeño puede ser excelente.",
    fr: "Le taux de clics, c'est le titre et la miniature qui travaillent ensemble. Sous 4 %, cela signifie généralement que l'emballage est faible, pas la vidéo. Changez une chose à la fois — d'abord la miniature, puis le titre — et attendez au moins une semaine avant de juger. Comparez-vous à la moyenne de votre propre chaîne, pas aux grandes chaînes : 5 % pour une petite chaîne peut être excellent.",
    de: "Die Klickrate ist Titel plus Thumbnail im Zusammenspiel. Unter 4 % heißt meist: Die Verpackung ist schwach, nicht das Video. Ändere immer nur eine Sache — zuerst das Thumbnail, dann den Titel — und warte mindestens eine Woche, bevor du urteilst. Vergleiche dich mit dem Durchschnitt deines eigenen Kanals, nicht mit großen Kanälen: 5 % können für einen kleinen Kanal ausgezeichnet sein.",
    pt: "A taxa de cliques é título + miniatura trabalhando juntos. Abaixo de 4 % geralmente significa que a embalagem é fraca, não o vídeo. Mude uma coisa de cada vez — primeiro a miniatura, depois o título — e espere pelo menos uma semana antes de julgar. Compare com a média do seu próprio canal, não com canais grandes: 5 % num canal pequeno pode ser excelente.",
    tr: "Tıklama oranı, başlık ve küçük resmin birlikte çalışmasıdır. %4'ün altı genelde videonun değil, ambalajın zayıf olduğu anlamına gelir. Her seferinde bir şeyi değiştirin — önce küçük resmi, sonra başlığı — ve karar vermeden önce en az bir hafta bekleyin. Kendinizi büyük kanallarla değil, kendi kanal ortalamanızla kıyaslayın: küçük bir kanal için %5 mükemmel olabilir.",
    id: "Rasio klik adalah judul + thumbnail yang bekerja bersama. Di bawah 4% biasanya berarti kemasannya lemah, bukan videonya. Ubah satu hal dalam satu waktu — thumbnail dulu, lalu judul — dan tunggu setidaknya seminggu sebelum menilai. Bandingkan dengan rata-rata channel Anda sendiri, bukan dengan channel besar: 5% untuk channel kecil bisa jadi sangat bagus.",
    ru: "CTR — это заголовок и превью, работающие вместе. Ниже 4% обычно означает слабое оформление, а не видео. Меняйте по одному элементу за раз — сначала превью, потом заголовок — и ждите минимум неделю, прежде чем судить. Сравнивайте со средним показателем своего канала, а не больших каналов: 5% для маленького канала может быть отличным результатом.",
    pa: "کلک تھرو ریٹ ٹائٹل تے تھمبنیل دی سانجھی کارکردگی اے۔ 4 فیصد توں گھٹ دا مطلب عام طور تے پیکیجنگ کمزور اے، ویڈیو نہیں۔ اک واری وچ اک چیز بدلو — پہلاں تھمبنیل، فیر ٹائٹل — تے فیصلے توں پہلاں گھٹ توں گھٹ اک ہفتہ انتظار کرو۔ اپنا موازنہ اپنے چینل دی اوسط نال کرو، وڈے چینلاں نال نہیں: چھوٹے چینل لئی 5 فیصد وی بہترین ہو سکدا اے۔",
    bn: "ক্লিক-থ্রু হার হলো টাইটেল ও থাম্বনেইলের যৌথ কাজ। ৪%-এর কম সাধারণত মানে প্যাকেজিং দুর্বল, ভিডিও নয়। একবারে একটি জিনিস বদলান — প্রথমে থাম্বনেইল, তারপর টাইটেল — আর বিচার করার আগে অন্তত এক সপ্তাহ অপেক্ষা করুন। নিজের চ্যানেলের গড়ের সঙ্গে তুলনা করুন, বড় চ্যানেলের সঙ্গে নয়: ছোট চ্যানেলের জন্য ৫% চমৎকার হতে পারে।",
  },
  audit: {
    en: "A quick self-audit: (1) Do your last 10 titles each promise one clear thing? (2) Does every video have a full description and 10–15 tags? (3) Are thumbnails readable at phone size? (4) Have you posted at least once a week for the last month? Fix the weakest of the four first. Nizafa's Optimize page scores your videos from your real data if your channel is connected.",
    ur: "فوری خود جانچ: (1) کیا آپ کی آخری 10 ویڈیوز کے ٹائٹل ہر ایک واضح وعدہ کرتے ہیں؟ (2) کیا ہر ویڈیو کی مکمل تفصیل اور 10 سے 15 ٹیگز ہیں؟ (3) کیا تھمبنیل فون پر پڑھے جا سکتے ہیں؟ (4) کیا آپ نے پچھلے مہینے ہفتے میں کم از کم ایک بار پوسٹ کیا؟ سب سے کمزور چیز پہلے ٹھیک کریں۔ اگر چینل منسلک ہے تو نیزافا کا Optimize صفحہ آپ کی ویڈیوز کو اصل ڈیٹا سے اسکور کرتا ہے۔",
    hi: "त्वरित स्व-जाँच: (1) क्या आपके पिछले 10 टाइटल में से हर एक एक साफ़ वादा करता है? (2) क्या हर वीडियो का पूरा विवरण और 10–15 टैग हैं? (3) क्या थंबनेल फ़ोन पर पढ़े जा सकते हैं? (4) क्या आपने पिछले महीने हफ़्ते में कम से कम एक बार पोस्ट किया? चारों में सबसे कमज़ोर चीज़ पहले ठीक करें। अगर चैनल जुड़ा है तो Nizafa का Optimize पेज आपके वीडियो को असली डेटा से स्कोर करता है।",
    ar: "تدقيق ذاتي سريع: (1) هل يعد كل عنوان من آخر 10 عناوين بشيء واحد واضح؟ (2) هل لكل فيديو وصف كامل و10–15 وسمًا؟ (3) هل الصور المصغرة مقروءة بحجم الهاتف؟ (4) هل نشرت مرة واحدة على الأقل أسبوعيًا خلال الشهر الماضي؟ أصلح أضعف النقاط الأربع أولًا. صفحة Optimize في نيزافا تقيّم فيديوهاتك من بياناتك الحقيقية إذا كانت قناتك متصلة.",
    es: "Una autoauditoría rápida: (1) ¿Cada uno de tus últimos 10 títulos promete una cosa clara? (2) ¿Cada vídeo tiene descripción completa y 10–15 etiquetas? (3) ¿Las miniaturas se leen en el móvil? (4) ¿Publicaste al menos una vez por semana el último mes? Arregla primero lo más débil de los cuatro. La página Optimize de Nizafa puntúa tus vídeos con tus datos reales si tu canal está conectado.",
    fr: "Un auto-audit rapide : (1) Vos 10 derniers titres promettent-ils chacun une chose claire ? (2) Chaque vidéo a-t-elle une description complète et 10–15 tags ? (3) Les miniatures sont-elles lisibles sur téléphone ? (4) Avez-vous publié au moins une fois par semaine le mois dernier ? Corrigez d'abord le plus faible des quatre. La page Optimize de Nizafa note vos vidéos à partir de vos vraies données si votre chaîne est connectée.",
    de: "Ein schneller Selbst-Check: (1) Verspricht jeder deiner letzten 10 Titel eine klare Sache? (2) Hat jedes Video eine vollständige Beschreibung und 10–15 Tags? (3) Sind Thumbnails auf Handygröße lesbar? (4) Hast du im letzten Monat mindestens einmal pro Woche gepostet? Repariere zuerst den schwächsten der vier Punkte. Nizafas Optimize-Seite bewertet deine Videos anhand deiner echten Daten, wenn dein Kanal verbunden ist.",
    pt: "Uma autoavaliação rápida: (1) Cada um dos seus últimos 10 títulos promete uma coisa clara? (2) Cada vídeo tem descrição completa e 10–15 tags? (3) As miniaturas são legíveis no celular? (4) Você publicou pelo menos uma vez por semana no último mês? Corrija primeiro o mais fraco dos quatro. A página Optimize do Nizafa pontua seus vídeos com seus dados reais se o seu canal estiver conectado.",
    tr: "Hızlı bir öz denetim: (1) Son 10 başlığınızın her biri net bir şey vaat ediyor mu? (2) Her videonun tam açıklaması ve 10–15 etiketi var mı? (3) Küçük resimler telefon boyutunda okunabiliyor mu? (4) Geçen ay haftada en az bir kez paylaştınız mı? Önce dördünün en zayıfını düzeltin. Kanalınız bağlıysa Nizafa'nın Optimize sayfası videolarınızı gerçek verilerinizle puanlar.",
    id: "Audit diri cepat: (1) Apakah 10 judul terakhir Anda masing-masing menjanjikan satu hal yang jelas? (2) Apakah setiap video punya deskripsi lengkap dan 10–15 tag? (3) Apakah thumbnail terbaca dalam ukuran ponsel? (4) Apakah Anda mengunggah setidaknya sekali seminggu dalam sebulan terakhir? Perbaiki yang paling lemah dari keempatnya dulu. Halaman Optimize Nizafa menilai video Anda dari data asli jika channel Anda terhubung.",
    ru: "Быстрый самоаудит: (1) Обещает ли каждый из 10 последних заголовков что-то одно и понятное? (2) Есть ли у каждого видео полное описание и 10–15 тегов? (3) Читаются ли превью на телефоне? (4) Публиковали ли вы хотя бы раз в неделю за последний месяц? Исправьте сначала самое слабое из четырёх. Страница Optimize в Nizafa оценивает ваши видео по реальным данным, если канал подключён.",
    pa: "فوری خود جانچ: (1) کیہ تہاڈے آخری 10 ٹائٹلاں وچوں ہر اک اک صاف وعدہ کردا اے؟ (2) کیہ ہر ویڈیو دی مکمل تفصیل تے 10 توں 15 ٹیگ نیں؟ (3) کیہ تھمبنیل فون تے پڑھے جا سکدے نیں؟ (4) کیہ تسیں پچھلے مہینے ہفتے وچ گھٹ توں گھٹ اک واری پوسٹ کیتا؟ چوہاں وچوں سب توں کمزور چیز پہلاں ٹھیک کرو۔ جے چینل منسلک اے تے نیزافا دا Optimize صفحہ تہاڈیاں ویڈیوز نوں اصل ڈیٹا توں اسکور کردا اے۔",
    bn: "দ্রুত নিজে যাচাই: (১) আপনার শেষ ১০টি টাইটেলের প্রতিটি কি একটি স্পষ্ট বিষয়ের প্রতিশ্রুতি দেয়? (২) প্রতিটি ভিডিওর কি সম্পূর্ণ বিবরণ ও ১০–১৫টি ট্যাগ আছে? (৩) থাম্বনেইল কি ফোনের আকারে পড়া যায়? (৪) গত মাসে সপ্তাহে অন্তত একবার কি পোস্ট করেছেন? চারটির মধ্যে সবচেয়ে দুর্বলটি আগে ঠিক করুন। চ্যানেল সংযুক্ত থাকলে Nizafa-র Optimize পৃষ্ঠা আপনার আসল ডেটা থেকে ভিডিওগুলো স্কোর করে।",
  },
};

// Playbook continued — keywords, consistency, monetization, analytics, hook.
export const PLAYBOOK_TEXT_3: Partial<
  Record<PlaybookId, Partial<Record<AssistantLang, string>>>
> = {
  keywords: {
    en: "Start with what your audience already searches: your top videos' titles are your best keyword source. Then check Nizafa's Research page for rising keywords and outlier videos in your niche. Pick topics where interest is rising but the top videos are old or weak — that gap is your opening. One researched topic beats ten guesses.",
    ur: "اس سے شروع کریں جو آپ کے ناظرین پہلے سے تلاش کرتے ہیں: آپ کی بہترین ویڈیوز کے ٹائٹل بہترین مطلوبہ الفاظ ہیں۔ پھر نیزافا کے Research صفحے پر اپنے موضوع میں بڑھتے الفاظ اور نمایاں ویڈیوز دیکھیں۔ وہ موضوع چنیں جہاں دلچسپی بڑھ رہی ہو لیکن بہترین ویڈیوز پرانی یا کمزور ہوں — یہی آپ کا موقع ہے۔ ایک تحقیق شدہ موضوع دس اندازوں سے بہتر ہے۔",
    hi: "उससे शुरू करें जो आपके दर्शक पहले से खोजते हैं: आपके सबसे अच्छे वीडियो के टाइटल आपके सबसे अच्छे कीवर्ड हैं। फिर Nizafa के Research पेज पर अपने विषय में बढ़ते कीवर्ड और अलग दिखने वाले वीडियो देखें। वह विषय चुनें जहाँ दिलचस्पी बढ़ रही हो लेकिन सबसे अच्छे वीडियो पुराने या कमज़ोर हों — वही अंतर आपका मौक़ा है। एक शोध किया हुआ विषय दस अंदाज़ों से बेहतर है।",
    ar: "ابدأ بما يبحث عنه جمهورك أصلًا: عناوين أفضل فيديوهاتك هي أفضل مصدر للكلمات المفتاحية. ثم تحقق من صفحة Research في نيزافا للكلمات الصاعدة والفيديوهات المميزة في مجالك. اختر المواضيع التي يزداد فيها الاهتمام بينما أفضل الفيديوهات قديمة أو ضعيفة — تلك الفجوة هي فرصتك. موضوع واحد مدروس أفضل من عشر تخمينات.",
    es: "Empieza por lo que tu audiencia ya busca: los títulos de tus mejores vídeos son tu mejor fuente de palabras clave. Luego revisa la página Research de Nizafa para ver palabras en auge y vídeos destacados en tu nicho. Elige temas donde el interés sube pero los mejores vídeos son viejos o débiles: esa brecha es tu oportunidad. Un tema investigado vale más que diez suposiciones.",
    fr: "Commencez par ce que votre audience cherche déjà : les titres de vos meilleures vidéos sont votre meilleure source de mots-clés. Consultez ensuite la page Research de Nizafa pour les mots-clés en hausse et les vidéos atypiques de votre niche. Choisissez des sujets où l'intérêt monte mais où les meilleures vidéos sont anciennes ou faibles : cet écart est votre ouverture. Un sujet recherché vaut mieux que dix suppositions.",
    de: "Starte mit dem, wonach dein Publikum bereits sucht: Die Titel deiner besten Videos sind deine beste Keyword-Quelle. Prüfe dann Nizafas Research-Seite auf steigende Keywords und Ausreißer-Videos in deiner Nische. Wähle Themen, bei denen das Interesse steigt, die Top-Videos aber alt oder schwach sind — diese Lücke ist deine Chance. Ein recherchiertes Thema schlägt zehn Vermutungen.",
    pt: "Comece pelo que sua audiência já busca: os títulos dos seus melhores vídeos são sua melhor fonte de palavras-chave. Depois confira a página Research do Nizafa para palavras em alta e vídeos fora da curva no seu nicho. Escolha temas em que o interesse está subindo, mas os melhores vídeos são antigos ou fracos — essa lacuna é a sua chance. Um tema pesquisado vale mais que dez palpites.",
    tr: "Önce kitlenizin zaten aradığı şeyden başlayın: en iyi videolarınızın başlıkları en iyi anahtar kelime kaynağınızdır. Sonra Nizafa'nın Research sayfasında konunuzda yükselen kelimelere ve öne çıkan videolara bakın. İlginin arttığı ama en iyi videoların eski veya zayıf olduğu konuları seçin — o boşluk sizin fırsatınızdır. Araştırılmış bir konu, on tahminden iyidir.",
    id: "Mulailah dari apa yang sudah dicari audiens Anda: judul video terbaik Anda adalah sumber kata kunci terbaik. Lalu periksa halaman Research Nizafa untuk kata kunci yang sedang naik dan video outlier di niche Anda. Pilih topik yang minatnya naik tetapi video teratasnya sudah lama atau lemah — celah itu adalah peluang Anda. Satu topik yang diteliti mengalahkan sepuluh tebakan.",
    ru: "Начните с того, что ваша аудитория уже ищет: заголовки ваших лучших видео — лучший источник ключевых слов. Затем проверьте страницу Research в Nizafa: растущие ключевые слова и выделяющиеся видео в вашей нише. Выбирайте темы, где интерес растёт, а лучшие видео старые или слабые — этот разрыв и есть ваша возможность. Одна исследованная тема лучше десяти догадок.",
    pa: "اوس توں شروع کرو جو تہاڈے ناظرین پہلاں توں تلاش کردے نیں: تہاڈیاں بہترین ویڈیوز دے ٹائٹل بہترین مطلوبہ لفظ نیں۔ فیر نیزافا دے Research صفحے تے اپنے موضوع وچ ودھدے لفظ تے نمایاں ویڈیوز ویکھو۔ اوہ موضوع چنو جتھے دلچسپی ودھ رہی ہووے پر بہترین ویڈیوز پرانیاں یا کمزور ہوون — ایہو فرق تہاڈا موقع اے۔ اک تحقیق شدہ موضوع دس اندازیاں توں بہتر اے۔",
    bn: "আপনার দর্শক যা ইতিমধ্যে খোঁজে তা দিয়ে শুরু করুন: আপনার সেরা ভিডিওগুলোর টাইটেলই সেরা কীওয়ার্ডের উৎস। তারপর Nizafa-র Research পৃষ্ঠায় আপনার বিষয়ে বাড়তে থাকা কীওয়ার্ড ও আলাদা ভিডিওগুলো দেখুন। সেই বিষয় বেছে নিন যেখানে আগ্রহ বাড়ছে কিন্তু সেরা ভিডিওগুলো পুরনো বা দুর্বল — সেই ফাঁকই আপনার সুযোগ। একটি গবেষণা করা বিষয় দশটি অনুমানের চেয়ে ভালো।",
  },
  consistency: {
    en: "Consistency means a rhythm viewers can trust, not daily uploads. One long video a week on the same day is a strong rhythm for most channels; add Shorts only if they do not steal time from the long video. Miss a week and say so plainly in the next video — audiences forgive honesty, not silence. Keep the same topic lane so each video feeds the next.",
    ur: "تسلسل کا مطلب روزانہ اپ لوڈ نہیں، بلکہ ایک ایسا معمول ہے جس پر ناظرین بھروسہ کر سکیں۔ زیادہ تر چینلز کے لیے ہفتے میں ایک لمبی ویڈیو، ایک ہی دن، مضبوط معمول ہے؛ شارٹس صرف تب شامل کریں جب وہ لمبی ویڈیو کا وقت نہ لیں۔ ایک ہفتہ چھوٹ جائے تو اگلی ویڈیو میں صاف بتا دیں — ناظرین ایمانداری کو معاف کرتے ہیں، خاموشی کو نہیں۔ ایک ہی موضوع پر رہیں تاکہ ہر ویڈیو اگلی کی مدد کرے۔",
    hi: "निरंतरता का मतलब रोज़ अपलोड नहीं, बल्कि एक ऐसी लय है जिस पर दर्शक भरोसा कर सकें। ज़्यादातर चैनलों के लिए हफ़्ते में एक लंबा वीडियो, एक ही दिन, एक मज़बूत लय है; शॉर्ट्स तभी जोड़ें जब वे लंबे वीडियो का समय न लें। एक हफ़्ता छूट जाए तो अगले वीडियो में साफ़ बता दें — दर्शक ईमानदारी को माफ़ करते हैं, ख़ामोशी को नहीं। एक ही विषय पर रहें ताकि हर वीडियो अगले की मदद करे।",
    ar: "الاستمرارية تعني إيقاعًا يثق به المشاهدون، لا رفعًا يوميًا. فيديو طويل واحد أسبوعيًا في اليوم نفسه إيقاع قوي لمعظم القنوات؛ وأضف المقاطع القصيرة فقط إذا لم تسرق وقت الفيديو الطويل. إذا فاتك أسبوع، قل ذلك بصراحة في الفيديو التالي — الجمهور يسامح الصدق لا الصمت. التزم بنفس الموضوع حتى يغذّي كل فيديو التالي.",
    es: "La constancia es un ritmo en el que los espectadores confían, no subir a diario. Un vídeo largo por semana, el mismo día, es un ritmo fuerte para la mayoría de los canales; añade Shorts solo si no roban tiempo al vídeo largo. Si te saltas una semana, dilo claramente en el siguiente vídeo: la audiencia perdona la honestidad, no el silencio. Mantén el mismo tema para que cada vídeo alimente al siguiente.",
    fr: "La régularité, c'est un rythme auquel les spectateurs peuvent faire confiance, pas des publications quotidiennes. Une longue vidéo par semaine, le même jour, est un rythme fort pour la plupart des chaînes ; ajoutez des Shorts seulement s'ils ne volent pas le temps de la longue vidéo. Si vous manquez une semaine, dites-le clairement dans la vidéo suivante — le public pardonne l'honnêteté, pas le silence. Restez sur le même sujet pour que chaque vidéo nourrisse la suivante.",
    de: "Konsequenz heißt: ein Rhythmus, dem Zuschauer vertrauen — nicht tägliche Uploads. Ein langes Video pro Woche am selben Tag ist für die meisten Kanäle ein starker Rhythmus; füge Shorts nur hinzu, wenn sie dem langen Video keine Zeit stehlen. Verpasst du eine Woche, sag es im nächsten Video offen — das Publikum verzeiht Ehrlichkeit, nicht Schweigen. Bleib bei einem Thema, damit jedes Video das nächste füttert.",
    pt: "Consistência é um ritmo em que os espectadores confiam, não uploads diários. Um vídeo longo por semana, no mesmo dia, é um ritmo forte para a maioria dos canais; adicione Shorts só se não roubarem tempo do vídeo longo. Se perder uma semana, diga isso claramente no próximo vídeo — a audiência perdoa a honestidade, não o silêncio. Fique no mesmo tema para que cada vídeo alimente o próximo.",
    tr: "Tutarlılık, her gün yüklemek değil, izleyicilerin güvenebileceği bir ritim demektir. Çoğu kanal için haftada bir uzun video, aynı gün, güçlü bir ritimdir; Shorts'u yalnızca uzun videonun zamanını çalmıyorsa ekleyin. Bir haftayı kaçırırsanız sonraki videoda bunu açıkça söyleyin — izleyici dürüstlüğü affeder, sessizliği değil. Aynı konuda kalın ki her video sonrakini beslesin.",
    id: "Konsistensi berarti ritme yang bisa dipercaya penonton, bukan unggahan harian. Satu video panjang seminggu pada hari yang sama adalah ritme yang kuat untuk kebanyakan channel; tambahkan Shorts hanya jika tidak mencuri waktu video panjang. Jika melewatkan seminggu, katakan dengan jelas di video berikutnya — audiens memaafkan kejujuran, bukan keheningan. Tetap pada satu topik agar setiap video memberi makan video berikutnya.",
    ru: "Регулярность — это ритм, которому доверяют зрители, а не ежедневные загрузки. Одно длинное видео в неделю в один и тот же день — сильный ритм для большинства каналов; добавляйте Shorts, только если они не отнимают время у длинного видео. Пропустили неделю — скажите об этом прямо в следующем видео: аудитория прощает честность, а не молчание. Держитесь одной темы, чтобы каждое видео подпитывало следующее.",
    pa: "تسلسل دا مطلب روزانہ اپ لوڈ نہیں، بلکہ اک ایہو جہا معمول اے جس تے ناظرین بھروسہ کر سکن۔ ودھ تر چینلاں لئی ہفتے وچ اک لمبی ویڈیو، اکو دن، مضبوط معمول اے؛ شارٹس صرف اودوں شامل کرو جدوں اوہ لمبی ویڈیو دا وقت نہ لین۔ اک ہفتہ چھٹ جاوے تے اگلی ویڈیو وچ صاف دس دیو — ناظرین ایمانداری نوں معاف کردے نیں، خاموشی نوں نہیں۔ اکو موضوع تے رہو تاکہ ہر ویڈیو اگلی دی مدد کرے۔",
    bn: "ধারাবাহিকতা মানে প্রতিদিন আপলোড নয়, বরং এমন একটি ছন্দ যা দর্শকরা বিশ্বাস করতে পারে। বেশিরভাগ চ্যানেলের জন্য সপ্তাহে একটি লম্বা ভিডিও, একই দিনে, একটি শক্তিশালী ছন্দ; শর্টস তখনই যোগ করুন যখন তা লম্বা ভিডিওর সময় না নেয়। এক সপ্তাহ বাদ পড়লে পরের ভিডিওতে স্পষ্ট করে বলুন — দর্শক সততাকে ক্ষমা করে, নীরবতাকে নয়। একই বিষয়ে থাকুন যাতে প্রতিটি ভিডিও পরেরটিকে সাহায্য করে।",
  },
  monetization: {
    en: "YouTube pays after you join the Partner Program: 1,000 subscribers and 4,000 public watch hours in 12 months (or 10M Shorts views in 90 days). Until then, grow watch time with longer, useful videos — Shorts views alone rarely qualify a channel. Never reuse other creators' clips: reused content is the most common reason applications are rejected.",
    ur: "یوٹیوب پارٹنر پروگرام میں شامل ہونے کے بعد ادائیگی کرتا ہے: 1,000 سبسکرائبر اور 12 مہینوں میں 4,000 گھنٹے دیکھنے کا وقت (یا 90 دن میں 10 ملین شارٹس ویوز)۔ اس سے پہلے لمبی اور مفید ویڈیوز سے دیکھنے کا وقت بڑھائیں — صرف شارٹس ویوز سے چینل شاذ و نادر ہی اہل ہوتا ہے۔ دوسروں کی کلپس ہرگز دوبارہ استعمال نہ کریں: دوبارہ استعمال شدہ مواد درخواست مسترد ہونے کی سب سے عام وجہ ہے۔",
    hi: "YouTube पार्टनर प्रोग्राम में शामिल होने के बाद भुगतान करता है: 1,000 सब्सक्राइबर और 12 महीनों में 4,000 घंटे सार्वजनिक देखने का समय (या 90 दिनों में 10M शॉर्ट्स व्यूज़)। तब तक लंबे और उपयोगी वीडियो से देखने का समय बढ़ाएँ — सिर्फ़ शॉर्ट्स व्यूज़ से चैनल शायद ही कभी योग्य होता है। दूसरों की क्लिप कभी दोबारा इस्तेमाल न करें: दोबारा इस्तेमाल की गई सामग्री आवेदन ख़ारिज होने का सबसे आम कारण है।",
    ar: "يدفع يوتيوب بعد انضمامك إلى برنامج الشركاء: 1,000 مشترك و4,000 ساعة مشاهدة عامة خلال 12 شهرًا (أو 10 ملايين مشاهدة للمقاطع القصيرة خلال 90 يومًا). حتى ذلك الحين، زد وقت المشاهدة بفيديوهات أطول ومفيدة — فمشاهدات المقاطع القصيرة وحدها نادرًا ما تؤهل القناة. ولا تعيد استخدام مقاطع منشئين آخرين أبدًا: المحتوى المعاد استخدامه هو السبب الأكثر شيوعًا لرفض الطلبات.",
    es: "YouTube paga cuando entras en el Programa de Partners: 1.000 suscriptores y 4.000 horas de visualización pública en 12 meses (o 10 M de vistas de Shorts en 90 días). Hasta entonces, aumenta el tiempo de visualización con vídeos largos y útiles: las vistas de Shorts por sí solas rara vez califican un canal. Nunca reutilices clips de otros creadores: el contenido reutilizado es la razón más común de rechazo de solicitudes.",
    fr: "YouTube paie après votre adhésion au Programme Partenaire : 1 000 abonnés et 4 000 heures de visionnage public en 12 mois (ou 10 M de vues de Shorts en 90 jours). D'ici là, augmentez le temps de visionnage avec des vidéos longues et utiles — les vues de Shorts seules qualifient rarement une chaîne. Ne réutilisez jamais les clips d'autres créateurs : le contenu réutilisé est la raison la plus fréquente de rejet des candidatures.",
    de: "YouTube zahlt, nachdem du dem Partnerprogramm beigetreten bist: 1.000 Abonnenten und 4.000 öffentliche Wiedergabestunden in 12 Monaten (oder 10 Mio. Shorts-Aufrufe in 90 Tagen). Bis dahin: Steigere die Wiedergabezeit mit längeren, nützlichen Videos — Shorts-Aufrufe allein qualifizieren einen Kanal selten. Nutze niemals Clips anderer Creator: Wiederverwendete Inhalte sind der häufigste Grund für abgelehnte Bewerbungen.",
    pt: "O YouTube paga depois que você entra no Programa de Parceiros: 1.000 inscritos e 4.000 horas públicas de exibição em 12 meses (ou 10 mi de visualizações de Shorts em 90 dias). Até lá, aumente o tempo de exibição com vídeos longos e úteis — só as visualizações de Shorts raramente qualificam um canal. Nunca reutilize clipes de outros criadores: conteúdo reutilizado é o motivo mais comum de rejeição de inscrições.",
    tr: "YouTube, İş Ortaklığı Programı'na katıldıktan sonra öder: 12 ayda 1.000 abone ve 4.000 saat herkese açık izlenme süresi (veya 90 günde 10 milyon Shorts görüntülenmesi). O zamana kadar daha uzun ve faydalı videolarla izlenme süresini artırın — yalnızca Shorts görüntülenmesi bir kanalı nadiren yeterli kılar. Başka içerik üreticilerin kliplerini asla yeniden kullanmayın: yeniden kullanılan içerik, başvuruların reddedilmesinin en yaygın nedenidir.",
    id: "YouTube membayar setelah Anda bergabung dengan Program Partner: 1.000 subscriber dan 4.000 jam tonton publik dalam 12 bulan (atau 10 jt penayangan Shorts dalam 90 hari). Sampai saat itu, tingkatkan waktu tonton dengan video yang lebih panjang dan bermanfaat — penayangan Shorts saja jarang membuat channel memenuhi syarat. Jangan pernah memakai ulang klip kreator lain: konten yang dipakai ulang adalah alasan paling umum penolakan aplikasi.",
    ru: "YouTube платит после вступления в Партнёрскую программу: 1 000 подписчиков и 4 000 часов публичного времени просмотра за 12 месяцев (или 10 млн просмотров Shorts за 90 дней). До этого наращивайте время просмотра длинными полезными видео — одни просмотры Shorts редко дают каналу право на участие. Никогда не используйте чужие клипы повторно: reused content — самая частая причина отклонения заявок.",
    pa: "یوٹیوب پارٹنر پروگرام وچ شامل ہون توں بعد ادائیگی کردا اے: 1,000 سبسکرائبر تے 12 مہینیاں وچ 4,000 گھنٹے دیکھن دا وقت (یا 90 دناں وچ 10 ملین شارٹس ویوز)۔ اوس توں پہلاں لمبیاں تے مفید ویڈیوز نال دیکھن دا وقت ودھاؤ — صرف شارٹس ویوز نال چینل شاذ و نادر ہی اہل ہوندا اے۔ دوجیاں دیاں کلپس کدے دوبارہ استعمال نہ کرو: دوبارہ استعمال شدہ مواد درخواست مسترد ہون دی سب توں عام وجہ اے۔",
    bn: "YouTube পার্টনার প্রোগ্রামে যোগ দেওয়ার পর অর্থ দেয়: ১,০০০ সাবস্ক্রাইবার এবং ১২ মাসে ৪,০০০ ঘণ্টা পাবলিক দেখার সময় (বা ৯০ দিনে ১ কোটি শর্টস ভিউ)। ততক্ষণ পর্যন্ত লম্বা ও উপকারী ভিডিও দিয়ে দেখার সময় বাড়ান — শুধু শর্টস ভিউ দিয়ে চ্যানেল খুব কমই যোগ্য হয়। অন্য নির্মাতাদের ক্লিপ কখনো পুনরায় ব্যবহার করবেন না: পুনরায় ব্যবহৃত কনটেন্ট আবেদন বাতিলের সবচেয়ে সাধারণ কারণ।",
  },
  analytics: {
    en: "Read three numbers first: click-through rate (packaging), average view duration (content), and views per hour in the first 48 hours (momentum). If CTR is low, fix the title and thumbnail. If viewers leave early, fix the opening. If a video is flat after two days, move on — one video rarely recovers, the next one can. Judge a video after 48–72 hours, never in the first hour.",
    ur: "پہلے تین اعداد دیکھیں: کلک تھرو ریٹ (پیکیجنگ)، اوسط دیکھنے کا دورانیہ (مواد)، اور پہلے 48 گھنٹوں میں فی گھنٹہ ویوز (رفتار)۔ اگر کلک ریٹ کم ہو تو ٹائٹل اور تھمبنیل ٹھیک کریں۔ اگر ناظرین جلد چلے جائیں تو شروعات ٹھیک کریں۔ اگر دو دن بعد ویڈیو سست ہو تو آگے بڑھیں — ایک ویڈیو شاذ و نادر ہی واپس آتی ہے، اگلی آ سکتی ہے۔ ویڈیو کا فیصلہ 48 سے 72 گھنٹوں بعد کریں، پہلے گھنٹے میں کبھی نہیں۔",
    hi: "पहले तीन संख्याएँ देखें: क्लिक-थ्रू दर (पैकेजिंग), औसत देखने की अवधि (सामग्री), और पहले 48 घंटों में प्रति घंटा व्यूज़ (रफ़्तार)। अगर क्लिक दर कम हो तो टाइटल और थंबनेल ठीक करें। अगर दर्शक जल्दी चले जाएँ तो शुरुआत ठीक करें। अगर दो दिन बाद वीडियो सुस्त हो तो आगे बढ़ें — एक वीडियो शायद ही कभी वापस आता है, अगला आ सकता है। वीडियो का फ़ैसला 48–72 घंटों बाद करें, पहले घंटे में कभी नहीं।",
    ar: "اقرأ ثلاثة أرقام أولًا: نسبة النقر (التغليف)، ومتوسط مدة المشاهدة (المحتوى)، والمشاهدات في الساعة خلال أول 48 ساعة (الزخم). إذا كانت نسبة النقر منخفضة، أصلح العنوان والصورة المصغرة. وإذا غادر المشاهدون مبكرًا، أصلح البداية. وإذا كان الفيديو راكدًا بعد يومين، فتابع — نادرًا ما يتعافى فيديو واحد، لكن التالي قد ينجح. احكم على الفيديو بعد 48–72 ساعة، وليس في الساعة الأولى أبدًا.",
    es: "Lee primero tres números: el CTR (el envoltorio), la duración media de visualización (el contenido) y las vistas por hora en las primeras 48 horas (el impulso). Si el CTR es bajo, arregla el título y la miniatura. Si los espectadores se van pronto, arregla el inicio. Si un vídeo está plano tras dos días, sigue adelante: un vídeo rara vez se recupera, el siguiente sí puede. Juzga un vídeo a las 48–72 horas, nunca en la primera hora.",
    fr: "Lisez d'abord trois chiffres : le taux de clics (l'emballage), la durée moyenne de visionnage (le contenu) et les vues par heure pendant les 48 premières heures (la dynamique). Si le CTR est bas, corrigez le titre et la miniature. Si les spectateurs partent tôt, corrigez l'ouverture. Si une vidéo est plate après deux jours, passez à autre chose — une vidéo se rattrape rarement, la suivante peut le faire. Jugez une vidéo après 48 à 72 heures, jamais dans la première heure.",
    de: "Lies zuerst drei Zahlen: Klickrate (Verpackung), durchschnittliche Wiedergabedauer (Inhalt) und Aufrufe pro Stunde in den ersten 48 Stunden (Schwung). Ist die Klickrate niedrig, repariere Titel und Thumbnail. Gehen Zuschauer früh, repariere den Anfang. Ist ein Video nach zwei Tagen flach, geh weiter — ein Video erholt sich selten, das nächste kann es. Beurteile ein Video nach 48–72 Stunden, nie in der ersten Stunde.",
    pt: "Leia primeiro três números: a taxa de cliques (a embalagem), a duração média de exibição (o conteúdo) e as visualizações por hora nas primeiras 48 horas (o impulso). Se o CTR estiver baixo, corrija o título e a miniatura. Se os espectadores saírem cedo, corrija a abertura. Se um vídeo estiver parado depois de dois dias, siga em frente — um vídeo raramente se recupera, o próximo pode. Julgue um vídeo depois de 48–72 horas, nunca na primeira hora.",
    tr: "Önce üç sayıyı okuyun: tıklama oranı (ambalaj), ortalama izlenme süresi (içerik) ve ilk 48 saatte saat başına görüntülenme (ivme). Tıklama oranı düşükse başlığı ve küçük resmi düzeltin. İzleyiciler erken ayrılıyorsa açılışı düzeltin. Bir video iki gün sonra durgunsa devam edin — bir video nadiren toparlanır, sonraki toparlanabilir. Videoyu 48–72 saat sonra değerlendirin, asla ilk saatte değil.",
    id: "Baca tiga angka dulu: rasio klik (kemasan), durasi tonton rata-rata (konten), dan penayangan per jam dalam 48 jam pertama (momentum). Jika CTR rendah, perbaiki judul dan thumbnail. Jika penonton pergi lebih awal, perbaiki pembukaan. Jika video datar setelah dua hari, lanjutkan — satu video jarang pulih, video berikutnya bisa. Nilailah video setelah 48–72 jam, jangan pernah di jam pertama.",
    ru: "Сначала смотрите три числа: CTR (оформление), среднюю длительность просмотра (контент) и просмотры в час за первые 48 часов (динамика). Если CTR низкий — исправьте заголовок и превью. Если зрители уходят рано — исправьте начало. Если видео не идёт после двух дней — двигайтесь дальше: одно видео редко восстанавливается, а следующее может. Оценивайте видео через 48–72 часа, никогда в первый час.",
    pa: "پہلاں تن اعداد ویکھو: کلک تھرو ریٹ (پیکیجنگ)، اوسط دیکھن دا دورانیہ (مواد)، تے پہلے 48 گھنٹیاں وچ فی گھنٹہ ویوز (رفتار)۔ جے کلک ریٹ گھٹ ہووے تے ٹائٹل تے تھمبنیل ٹھیک کرو۔ جے ناظرین جلدی چلے جان تے شروعات ٹھیک کرو۔ جے دو دناں بعد ویڈیو سست ہووے تے اگے ودھو — اک ویڈیو شاذ و نادر ہی واپس آوندی اے، اگلی آ سکدی اے۔ ویڈیو دا فیصلہ 48 توں 72 گھنٹیاں بعد کرو، پہلے گھنٹے وچ کدے نہیں۔",
    bn: "প্রথমে তিনটি সংখ্যা দেখুন: ক্লিক-থ্রু হার (প্যাকেজিং), গড় দেখার সময়কাল (কনটেন্ট), এবং প্রথম ৪৮ ঘণ্টায় প্রতি ঘণ্টায় ভিউ (গতি)। CTR কম হলে টাইটেল ও থাম্বনেইল ঠিক করুন। দর্শক তাড়াতাড়ি চলে গেলে শুরুটা ঠিক করুন। দুই দিন পর ভিডিও থেমে থাকলে এগিয়ে যান — একটি ভিডিও খুব কমই ফিরে আসে, পরেরটি পারে। ভিডিওর বিচার করুন ৪৮–৭২ ঘণ্টা পর, প্রথম ঘণ্টায় কখনো নয়।",
  },
  hook: {
    en: "The hook is the first sentence, not the first minute. Say the most surprising or useful thing first — the result, the number, or the question the video answers — then explain. Never start with “welcome back” or a long channel intro; viewers decide in seconds. A good test: if you remove the first 30 seconds, does the video get better? If yes, cut them.",
    ur: "ہک پہلا جملہ ہے، پہلا منٹ نہیں۔ سب سے حیران کن یا مفید بات پہلے کہیں — نتیجہ، نمبر، یا وہ سوال جس کا ویڈیو جواب دیتی ہے — پھر وضاحت کریں۔ “خوش آمدید” یا لمبے چینل انٹرو سے کبھی شروع نہ کریں؛ ناظرین سیکنڈوں میں فیصلہ کرتے ہیں۔ اچھا ٹیسٹ: اگر پہلے 30 سیکنڈ ہٹا دیں تو کیا ویڈیو بہتر ہو جاتی ہے؟ اگر ہاں تو انہیں کاٹ دیں۔",
    hi: "हुक पहला वाक्य है, पहला मिनट नहीं। सबसे हैरान करने वाली या उपयोगी बात पहले कहें — नतीजा, नंबर, या वह सवाल जिसका वीडियो जवाब देता है — फिर समझाएँ। “स्वागत है” या लंबे चैनल इंट्रो से कभी शुरू न करें; दर्शक सेकंडों में फ़ैसला करते हैं। एक अच्छा टेस्ट: अगर पहले 30 सेकंड हटा दें तो क्या वीडियो बेहतर हो जाता है? अगर हाँ तो उन्हें काट दें।",
    ar: "الجذب هو الجملة الأولى، وليس الدقيقة الأولى. قل أكثر شيء مفاجئ أو مفيد أولًا — النتيجة أو الرقم أو السؤال الذي يجيب عنه الفيديو — ثم اشرح. ولا تبدأ أبدًا بـ“مرحبًا بعودتكم” أو بمقدمة طويلة للقناة؛ فالمشاهدون يقررون في ثوانٍ. اختبار جيد: إذا حذفت أول 30 ثانية، هل يتحسن الفيديو؟ إن كان الجواب نعم، فاحذفها.",
    es: "El gancho es la primera frase, no el primer minuto. Di primero lo más sorprendente o útil — el resultado, el número o la pregunta que responde el vídeo — y luego explica. Nunca empieces con “bienvenidos de nuevo” ni con una intro larga del canal; los espectadores deciden en segundos. Una buena prueba: si quitas los primeros 30 segundos, ¿el vídeo mejora? Si sí, córtalos.",
    fr: "L'accroche, c'est la première phrase, pas la première minute. Dites d'abord la chose la plus surprenante ou la plus utile — le résultat, le chiffre, ou la question à laquelle la vidéo répond — puis expliquez. Ne commencez jamais par « bon retour » ou une longue intro de chaîne ; les spectateurs décident en quelques secondes. Un bon test : si vous retirez les 30 premières secondes, la vidéo s'améliore-t-elle ? Si oui, coupez-les.",
    de: "Der Hook ist der erste Satz, nicht die erste Minute. Sag zuerst das Überraschendste oder Nützlichste — das Ergebnis, die Zahl oder die Frage, die das Video beantwortet — dann erkläre. Fang nie mit „Willkommen zurück“ oder einem langen Kanal-Intro an; Zuschauer entscheiden in Sekunden. Ein guter Test: Wenn du die ersten 30 Sekunden entfernst, wird das Video besser? Wenn ja, schneide sie.",
    pt: "O gancho é a primeira frase, não o primeiro minuto. Diga primeiro o mais surpreendente ou útil — o resultado, o número ou a pergunta que o vídeo responde — e depois explique. Nunca comece com “bem-vindos de volta” nem com uma intro longa do canal; os espectadores decidem em segundos. Um bom teste: se você remover os primeiros 30 segundos, o vídeo melhora? Se sim, corte-os.",
    tr: "Kanca ilk cümledir, ilk dakika değil. Önce en şaşırtıcı veya en faydalı şeyi söyleyin — sonucu, sayıyı ya da videonun yanıtladığı soruyu — sonra açıklayın. Asla “tekrar hoş geldiniz” veya uzun bir kanal introsuyla başlamayın; izleyiciler saniyeler içinde karar verir. İyi bir test: ilk 30 saniyeyi çıkarırsanız video daha iyi oluyor mu? Oluyorsa kesin.",
    id: "Hook adalah kalimat pertama, bukan menit pertama. Katakan dulu hal yang paling mengejutkan atau berguna — hasil, angka, atau pertanyaan yang dijawab video — lalu jelaskan. Jangan pernah mulai dengan “selamat datang kembali” atau intro channel yang panjang; penonton memutuskan dalam hitungan detik. Tes yang bagus: jika 30 detik pertama dihapus, apakah videonya jadi lebih baik? Jika ya, potong saja.",
    ru: "Хук — это первое предложение, а не первая минута. Сначала скажите самое удивительное или полезное — результат, число или вопрос, на который отвечает видео, — а затем объясняйте. Никогда не начинайте с «с возвращением» или длинного интро канала: зрители решают за секунды. Хороший тест: если убрать первые 30 секунд, видео станет лучше? Если да — вырежьте их.",
    pa: "ہک پہلا جملہ اے، پہلا منٹ نہیں۔ سب توں حیران کن یا مفید گل پہلاں کہو — نتیجہ، نمبر، یا اوہ سوال جس دا ویڈیو جواب دیندی اے — فیر وضاحت کرو۔ “خوش آمدید” یا لمبے چینل انٹرو توں کدے شروع نہ کرو؛ ناظرین سیکنڈاں وچ فیصلہ کردے نیں۔ چنگا ٹیسٹ: جے پہلے 30 سیکنڈ ہٹا دیو تے کیہ ویڈیو بہتر ہو جاندی اے؟ جے ہاں تے ایہناں نوں کٹ دیو۔",
    bn: "হুক হলো প্রথম বাক্য, প্রথম মিনিট নয়। সবচেয়ে চমকপ্রদ বা উপকারী কথাটি প্রথমে বলুন — ফলাফল, সংখ্যা, বা ভিডিও যে প্রশ্নের উত্তর দেয় — তারপর ব্যাখ্যা করুন। “আবার স্বাগতম” বা লম্বা চ্যানেল ইন্ট্রো দিয়ে কখনো শুরু করবেন না; দর্শকরা সেকেন্ডেই সিদ্ধান্ত নেয়। একটি ভালো পরীক্ষা: প্রথম ৩০ সেকেন্ড সরিয়ে দিলে কি ভিডিও ভালো হয়? হ্যাঁ হলে কেটে দিন।",
  },
};

// Merge the chunked tables into the single exported table.
Object.assign(PLAYBOOK_TEXT, PLAYBOOK_TEXT_2, PLAYBOOK_TEXT_3);

/** Playbook text for a language. Pashto has no full translation: it gets
 *  the English text plus a one-line Pashto note (see playbookNote). */
export function playbookText(
  id: PlaybookId,
  lang: AssistantLang
): { text: string; translated: boolean } {
  const t = PLAYBOOK_TEXT[id]?.[lang];
  if (t) return { text: t, translated: true };
  return { text: PLAYBOOK_TEXT[id]?.en ?? "", translated: false };
}

// ---------------------------------------------------------------------------
// Data answers — templated sentences with {placeholders} for the real
// numbers and names. Audit fix lines and generated titles stay in English
// (they come from lib/audit.ts / lib/generator.ts); the framing around
// them is translated. Partial records fall back to English per key.
// ---------------------------------------------------------------------------

export type DataKey =
  | "noChannel"
  | "ideasHeader"
  | "ideasEmpty"
  | "ideasHook"
  | "ideasWhy"
  | "viewPrediction"
  | "viewsHeader"
  | "viewsTopTip"
  | "viewsBestTime"
  | "auditHeader"
  | "auditWeakest"
  | "auditFixFirst"
  | "auditFullDetail"
  | "reviewHeader"
  | "reviewTitleScore"
  | "reviewThumbScore"
  | "reviewConsistency"
  | "reviewFixFirst"
  | "reviewAllPass"
  | "reviewFullDetail"
  | "reviewNoVideo"
  | "scriptAskTopic"
  | "scriptHeader"
  | "scriptHook"
  | "communityGeneral"
  | "communityLatest"
  | "channelSummary"
  | "channelTop"
  | "channelNext"
  | "fallback"
  | "playbookNote";

export const DATA_TEXT: Record<
  AssistantLang,
  Partial<Record<DataKey, string>>
> = {
  en: {
    noChannel: "Connect your channel first — this answer is built from your own channel data. Go to Home and press “Connect a channel”.",
    ideasHeader: "Here are 4 ideas for your channel “{ch}” today:",
    ideasEmpty: "Today's ideas could not be generated — open the Ideas page and try again.",
    ideasHook: "Hook:",
    ideasWhy: "Why it fits:",
    viewPrediction: "View prediction: {p}",
    viewsHeader: "Your channel “{ch}”: {subs} subscribers, {views} total views, {videos} videos. To get more views:",
    viewsTopTip: "Your most-viewed video is “{title}” ({views} views) — make another one like it.",
    viewsBestTime: "Your own upload history says your best window is: {time}.",
    auditHeader: "Channel audit for “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Weakest checks:",
    auditFixFirst: "Fix first:",
    auditFullDetail: "Full detail is on the Optimize page.",
    reviewHeader: "Your latest video: “{title}” ({views} views).",
    reviewTitleScore: "Title score: {n}/100",
    reviewThumbScore: "Thumbnail concept score: {n}/100",
    reviewConsistency: "Title ↔ description ↔ script ↔ thumbnail match: {n}/100",
    reviewFixFirst: "Fix first:",
    reviewAllPass: "All basic checks pass — focus on the next video's title and thumbnail.",
    reviewFullDetail: "Full analysis: Optimize → tap the video.",
    reviewNoVideo: "No video found in your cache yet — connect your channel and let the videos load first.",
    scriptAskTopic: "Which topic should the script be about? For example: “Write a script about gold prices”.",
    scriptHeader: "Draft script for “{title}” (about {time}) — adapt it to your own voice before recording:",
    scriptHook: "Hook:",
    communityGeneral: "Draft community post:\n\n“Hello everyone — what topic should my next video cover? Tell me in the comments, and the next video will be on your pick.”\n\n(No video in the cache yet, so this is a general post.)",
    communityLatest: "Draft community post:\n\n“New video out now: “{title}” — watch it and tell me, what was the most important part of this story for you? Let me know in the comments!”\n\nLink to the video is in the comments below.",
    channelSummary: "Your channel “{ch}”: {subs} subscribers, {views} total views, {videos} videos.",
    channelTop: "Your most-viewed video is “{title}” ({views} views).",
    channelNext: "Next step: make another video like it, and repeat what worked in its title and thumbnail.",
    fallback: "I can help with YouTube growth — titles, tags, thumbnails, posting times, Shorts, watch time, or a check of your own channel. Ask me, for example: “How do I write better titles?” or “How is my channel doing?” For open-ended questions in any language, the Assistant needs an AI key — the owner can add a Gemini API key (free tier at Google AI Studio) to unlock free-form answers in any language.",
    playbookNote: "",
  },
  ur: {
    noChannel: "اس کے لیے پہلے اپنا چینل منسلک کریں — یہ جواب آپ کے اپنے چینل کے ڈیٹا سے بنتا ہے۔ ہوم پیج پر جا کر “Connect a channel” دبائیں۔",
    ideasHeader: "آپ کے چینل “{ch}” کے لیے آج کے 4 آئیڈیاز:",
    ideasEmpty: "آج کے آئیڈیاز ابھی تیار نہیں ہو سکے — Ideas صفحہ کھول کر دوبارہ کوشش کریں۔",
    ideasHook: "ہک:",
    ideasWhy: "یہ کیوں موزوں ہے:",
    viewPrediction: "ویوز کی پیش گوئی: {p}",
    viewsHeader: "آپ کا چینل “{ch}”: {subs} سبسکرائبر، {views} کل ویوز، {videos} ویڈیوز۔ ویوز بڑھانے کے لیے:",
    viewsTopTip: "آپ کی سب سے زیادہ دیکھی گئی ویڈیو “{title}” ہے ({views} ویوز) — اسی طرح کی ایک اور ویڈیو بنائیں۔",
    viewsBestTime: "آپ کی اپنی تاریخ کے مطابق بہترین وقت: {time}۔",
    auditHeader: "آپ کے چینل “{ch}” کا آڈٹ: {score}/100 ({grade})۔",
    auditWeakest: "سب سے کمزور نکات:",
    auditFixFirst: "پہلے یہ ٹھیک کریں:",
    auditFullDetail: "مکمل تفصیل Optimize صفحے پر ہے۔",
    reviewHeader: "آپ کی تازہ ترین ویڈیو: “{title}” ({views} ویوز)۔",
    reviewTitleScore: "ٹائٹل اسکور: {n}/100",
    reviewThumbScore: "تھمبنیل کانسیپٹ اسکور: {n}/100",
    reviewConsistency: "ٹائٹل، تفصیل، اسکرپٹ اور تھمبنیل کا میچ: {n}/100",
    reviewFixFirst: "پہلے یہ ٹھیک کریں:",
    reviewAllPass: "تمام بنیادی جانچ پاس — اب اگلی ویڈیو کے ٹائٹل اور تھمبنیل پر توجہ دیں۔",
    reviewFullDetail: "مکمل تجزیہ Optimize → ویڈیو پر کلک کریں۔",
    reviewNoVideo: "آپ کی کوئی ویڈیو محفوظ نہیں ہے — پہلے چینل منسلک کریں اور ویڈیوز لوڈ ہونے دیں۔",
    scriptAskTopic: "کس موضوع پر اسکرپٹ چاہیے؟ مثلاً: “Write a script about gold prices”۔",
    scriptHeader: "“{title}” کے لیے اسکرپٹ کا مسودہ (تقریباً {time}) — ریکارڈ کرنے سے پہلے اپنی آواز میں ڈھال لیں:",
    scriptHook: "ہک:",
    communityGeneral: "کمیونٹی پوسٹ کا مسودہ:\n\n“السلام علیکم! آپ کس موضوع پر اگلی ویڈیو دیکھنا چاہیں گے؟ کمنٹس میں بتائیں — اگلی ویڈیو آپ کی پسند پر ہوگی۔”\n\n(ابھی کوئی ویڈیو محفوظ نہیں، اس لیے یہ عمومی پوسٹ ہے۔)",
    communityLatest: "کمیونٹی پوسٹ کا مسودہ:\n\n“نئی ویڈیو آ گئی ہے: “{title}” — دیکھیے اور بتائیے، آپ کے خیال میں اس کہانی کا سب سے اہم حصہ کون سا تھا؟ کمنٹس میں لکھیں!”\n\nویڈیو کا لنک نیچے کمنٹس میں ہے۔",
    channelSummary: "آپ کا چینل “{ch}”: {subs} سبسکرائبر، {views} کل ویوز، {videos} ویڈیوز۔",
    channelTop: "سب سے زیادہ دیکھی گئی ویڈیو: “{title}” ({views} ویوز)۔",
    channelNext: "اگلا قدم: اسی طرح کی ایک اور ویڈیو بنائیں، اور اس کی کامیابی کو اگلے ٹائٹل اور تھمبنیل میں دہرائیں۔",
    fallback: "میں یوٹیوب کی ترقی میں مدد کر سکتا ہوں — ٹائٹل، ٹیگز، تھمبنیل، پوسٹ کا وقت، شارٹس، دیکھنے کا وقت، یا آپ کے اپنے چینل کی جانچ۔ مثلاً پوچھیں: “بہتر ٹائٹل کیسے لکھوں؟” یا “میرا چینل کیسا چل رہا ہے؟” کسی بھی زبان میں کھلے سوالات کے لیے اسسٹنٹ کو AI کلید چاہیے — مالک Gemini کی مفت API کلید (Google AI Studio) شامل کر کے کسی بھی زبان میں آزادانہ جواب کھول سکتا ہے۔",
    playbookNote: "",
  },
  hi: {
    noChannel: "पहले अपना चैनल जोड़ें — यह जवाब आपके अपने चैनल के डेटा से बनता है। होम पेज पर जाकर “Connect a channel” दबाएँ।",
    ideasHeader: "आपके चैनल “{ch}” के लिए आज के 4 आइडिया:",
    ideasEmpty: "आज के आइडिया अभी तैयार नहीं हो सके — Ideas पेज खोलकर फिर से कोशिश करें।",
    ideasHook: "हुक:",
    ideasWhy: "यह क्यों उपयुक्त है:",
    viewPrediction: "व्यू पूर्वानुमान: {p}",
    viewsHeader: "आपका चैनल “{ch}”: {subs} सब्सक्राइबर, {views} कुल व्यूज़, {videos} वीडियो। ज़्यादा व्यूज़ के लिए:",
    viewsTopTip: "आपका सबसे ज़्यादा देखा गया वीडियो “{title}” है ({views} व्यूज़) — वैसा ही एक और वीडियो बनाएँ।",
    viewsBestTime: "आपके अपने अपलोड इतिहास के अनुसार सबसे अच्छा समय है: {time}।",
    auditHeader: "आपके चैनल “{ch}” का ऑडिट: {score}/100 ({grade})।",
    auditWeakest: "सबसे कमज़ोर बिंदु:",
    auditFixFirst: "पहले यह ठीक करें:",
    auditFullDetail: "पूरी जानकारी Optimize पेज पर है।",
    reviewHeader: "आपका नवीनतम वीडियो: “{title}” ({views} व्यूज़)।",
    reviewTitleScore: "टाइटल स्कोर: {n}/100",
    reviewThumbScore: "थंबनेल कॉन्सेप्ट स्कोर: {n}/100",
    reviewConsistency: "टाइटल ↔ विवरण ↔ स्क्रिप्ट ↔ थंबनेल मेल: {n}/100",
    reviewFixFirst: "पहले यह ठीक करें:",
    reviewAllPass: "सभी बुनियादी जाँच पास — अब अगले वीडियो के टाइटल और थंबनेल पर ध्यान दें।",
    reviewFullDetail: "पूरा विश्लेषण: Optimize → वीडियो पर क्लिक करें।",
    reviewNoVideo: "आपका कोई वीडियो अभी सहेजा नहीं गया है — पहले चैनल जोड़ें और वीडियो लोड होने दें।",
    scriptAskTopic: "स्क्रिप्ट किस विषय पर होनी चाहिए? उदाहरण: “Write a script about gold prices”।",
    scriptHeader: "“{title}” के लिए स्क्रिप्ट का मसौदा (लगभग {time}) — रिकॉर्ड करने से पहले इसे अपनी आवाज़ में ढाल लें:",
    scriptHook: "हुक:",
    communityGeneral: "कम्युनिटी पोस्ट का मसौदा:\n\n“नमस्ते सभी को — अगला वीडियो किस विषय पर देखना चाहेंगे? कमेंट्स में बताएँ, और अगला वीडियो आपकी पसंद पर होगा।”\n\n(अभी कोई वीडियो सहेजा नहीं है, इसलिए यह सामान्य पोस्ट है।)",
    communityLatest: "कम्युनिटी पोस्ट का मसौदा:\n\n“नया वीडियो आ गया है: “{title}” — देखें और बताइए, आपके हिसाब से इस कहानी का सबसे अहम हिस्सा कौन सा था? कमेंट्स में लिखें!”\n\nवीडियो का लिंक नीचे कमेंट्स में है।",
    channelSummary: "आपका चैनल “{ch}”: {subs} सब्सक्राइबर, {views} कुल व्यूज़, {videos} वीडियो।",
    channelTop: "सबसे ज़्यादा देखा गया वीडियो: “{title}” ({views} व्यूज़)।",
    channelNext: "अगला कदम: वैसा ही एक और वीडियो बनाएँ, और जो काम आया उसे अगले टाइटल और थंबनेल में दोहराएँ।",
    fallback: "मैं YouTube की बढ़त में मदद कर सकता हूँ — टाइटल, टैग, थंबनेल, पोस्ट का समय, शॉर्ट्स, देखने का समय, या आपके अपने चैनल की जाँच। उदाहरण के लिए पूछें: “बेहतर टाइटल कैसे लिखूँ?” या “मेरा चैनल कैसा चल रहा है?” किसी भी भाषा में खुले सवालों के लिए असिस्टेंट को AI कुंजी चाहिए — मालिक Gemini की मुफ़्त API कुंजी (Google AI Studio) जोड़कर किसी भी भाषा में मुक्त उत्तर खोल सकता है।",
    playbookNote: "",
  },
  ar: {
    noChannel: "اربط قناتك أولًا — هذه الإجابة مبنية على بيانات قناتك الخاصة. انتقل إلى الصفحة الرئيسية واضغط “Connect a channel”.",
    ideasHeader: "إليك 4 أفكار لقناتك “{ch}” اليوم:",
    ideasEmpty: "تعذّر إنشاء أفكار اليوم — افتح صفحة Ideas وحاول مجددًا.",
    ideasHook: "الجذب:",
    ideasWhy: "لماذا تناسبك:",
    viewPrediction: "توقع المشاهدات: {p}",
    viewsHeader: "قناتك “{ch}”: {subs} مشترك، {views} مشاهدة إجمالًا، {videos} فيديو. لزيادة المشاهدات:",
    viewsTopTip: "أكثر فيديوهاتك مشاهدة هو “{title}” ({views} مشاهدة) — اصنع فيديو آخر مثله.",
    viewsBestTime: "سجل الرفع الخاص بك يقول إن أفضل وقت لك هو: {time}.",
    auditHeader: "تدقيق قناتك “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "أضعف النقاط:",
    auditFixFirst: "أصلح أولًا:",
    auditFullDetail: "التفاصيل الكاملة في صفحة Optimize.",
    reviewHeader: "أحدث فيديو لك: “{title}” ({views} مشاهدة).",
    reviewTitleScore: "نتيجة العنوان: {n}/100",
    reviewThumbScore: "نتيجة مفهوم الصورة المصغرة: {n}/100",
    reviewConsistency: "تطابق العنوان ↔ الوصف ↔ النص ↔ الصورة المصغرة: {n}/100",
    reviewFixFirst: "أصلح أولًا:",
    reviewAllPass: "جميع الفحوصات الأساسية ناجحة — ركّز على عنوان وصورة الفيديو التالي.",
    reviewFullDetail: "التحليل الكامل: Optimize ← اضغط على الفيديو.",
    reviewNoVideo: "لم يتم العثور على أي فيديو في ذاكرتك بعد — اربط قناتك واترك الفيديوهات تُحمَّل أولًا.",
    scriptAskTopic: "عن أي موضوع تريد النص؟ مثال: “Write a script about gold prices”.",
    scriptHeader: "مسودة نص لـ“{title}” (نحو {time}) — عدّلها بصوتك قبل التسجيل:",
    scriptHook: "الجذب:",
    communityGeneral: "مسودة منشور مجتمع:\n\n“مرحبًا بالجميع — ما الموضوع الذي تريدون أن يكون عنه الفيديو التالي؟ أخبروني في التعليقات، وسيكون الفيديو التالي على اختياركم.”\n\n(لا يوجد فيديو محفوظ بعد، لذا هذا منشور عام.)",
    communityLatest: "مسودة منشور مجتمع:\n\n“فيديو جديد الآن: “{title}” — شاهدوه وأخبروني، ما أهم جزء في هذه القصة برأيكم؟ اكتبوا في التعليقات!”\n\nرابط الفيديو في التعليقات أدناه.",
    channelSummary: "قناتك “{ch}”: {subs} مشترك، {views} مشاهدة إجمالًا، {videos} فيديو.",
    channelTop: "أكثر فيديوهاتك مشاهدة هو “{title}” ({views} مشاهدة).",
    channelNext: "الخطوة التالية: اصنع فيديو آخر مثله، وكرر ما نجح في عنوانه وصورته المصغرة.",
    fallback: "يمكنني المساعدة في نمو يوتيوب — العناوين، الوسوم، الصور المصغرة، أوقات النشر، المقاطع القصيرة، وقت المشاهدة، أو فحص قناتك. اسألني مثلًا: “كيف أكتب عناوين أفضل؟” أو “كيف تسير قناتي؟” للأسئلة المفتوحة بأي لغة، يحتاج المساعد إلى مفتاح ذكاء اصطناعي — يمكن للمالك إضافة مفتاح Gemini المجاني (Google AI Studio) لفتح إجابات حرة بأي لغة.",
    playbookNote: "",
  },
  pa: {
    noChannel: "پہلاں اپنا چینل منسلک کرو — ایہ جواب تہاڈے اپنے چینل دے ڈیٹا توں بندا اے۔ ہوم پیج تے جا کے “Connect a channel” دباؤ۔",
    ideasHeader: "تہاڈے چینل “{ch}” لئی اج دے 4 آئیڈیاز:",
    ideasEmpty: "اج دے آئیڈیاز ہلے تیار نہیں ہو سکے — Ideas صفحہ کھول کے دوبارہ کوشش کرو۔",
    ideasHook: "ہک:",
    ideasWhy: "ایہ کیوں موزوں اے:",
    viewPrediction: "ویوز دی پیش گوئی: {p}",
    viewsHeader: "تہاڈا چینل “{ch}”: {subs} سبسکرائبر، {views} کل ویوز، {videos} ویڈیوز۔ ویوز ودھاون لئی:",
    viewsTopTip: "تہاڈی سب توں ودھ دیکھی گئی ویڈیو “{title}” اے ({views} ویوز) — اوہو جہی اک ہور ویڈیو بناؤ۔",
    viewsBestTime: "تہاڈی اپنی تاریخ مطابق بہترین وقت: {time}۔",
    auditHeader: "تہاڈے چینل “{ch}” دا آڈٹ: {score}/100 ({grade})۔",
    auditWeakest: "سب توں کمزور نکتے:",
    auditFixFirst: "پہلاں ایہ ٹھیک کرو:",
    auditFullDetail: "مکمل تفصیل Optimize صفحے تے اے۔",
    reviewHeader: "تہاڈی تازہ ترین ویڈیو: “{title}” ({views} ویوز)۔",
    reviewTitleScore: "ٹائٹل اسکور: {n}/100",
    reviewThumbScore: "تھمبنیل کانسیپٹ اسکور: {n}/100",
    reviewConsistency: "ٹائٹل، تفصیل، اسکرپٹ تے تھمبنیل دا میچ: {n}/100",
    reviewFixFirst: "پہلاں ایہ ٹھیک کرو:",
    reviewAllPass: "ساریاں بنیادی جانچاں پاس — ہن اگلی ویڈیو دے ٹائٹل تے تھمبنیل تے توجہ دیو۔",
    reviewFullDetail: "مکمل تجزیہ Optimize → ویڈیو تے کلک کرو۔",
    reviewNoVideo: "تہاڈی کوئی ویڈیو ہلے محفوظ نہیں — پہلاں چینل منسلک کرو تے ویڈیوز لوڈ ہون دیو۔",
    scriptAskTopic: "کس موضوع تے اسکرپٹ چاہیدا اے؟ مثلاً: “Write a script about gold prices”۔",
    scriptHeader: "“{title}” لئی اسکرپٹ دا مسودہ (تقریباً {time}) — ریکارڈ کرن توں پہلاں اپنی آواز وچ ڈھال لو:",
    scriptHook: "ہک:",
    communityGeneral: "کمیونٹی پوسٹ دا مسودہ:\n\n“السلام علیکم! اگلی ویڈیو کس موضوع تے ویکھنا چاہو گے؟ کمنٹس وچ دسو — اگلی ویڈیو تہاڈی پسند تے ہووے گی۔”\n\n(ہلے کوئی ویڈیو محفوظ نہیں، ایس لئی ایہ عام پوسٹ اے۔)",
    communityLatest: "کمیونٹی پوسٹ دا مسودہ:\n\n“نویں ویڈیو آ گئی اے: “{title}” — ویکھو تے دسو، تہاڈے خیال وچ ایس کہانی دا سب توں اہم حصہ کیہڑا سی؟ کمنٹس وچ لکھو!”\n\nویڈیو دا لنک تھلے کمنٹس وچ اے۔",
    channelSummary: "تہاڈا چینل “{ch}”: {subs} سبسکرائبر، {views} کل ویوز، {videos} ویڈیوز۔",
    channelTop: "سب توں ودھ دیکھی گئی ویڈیو: “{title}” ({views} ویوز)۔",
    channelNext: "اگلا قدم: اوہو جہی اک ہور ویڈیو بناؤ، تے جو کامیاب ہویا اوہنوں اگلے ٹائٹل تے تھمبنیل وچ دہراؤ۔",
    fallback: "میں یوٹیوب دی ترقی وچ مدد کر سکدا آں — ٹائٹل، ٹیگ، تھمبنیل، پوسٹ دا وقت، شارٹس، دیکھن دا وقت، یا تہاڈے اپنے چینل دی جانچ۔ مثلاً پچھو: “بہتر ٹائٹل کیویں لکھاں؟” یا “میرا چینل کیویں چل رہیا اے؟” کسے وی زبان وچ کھلے سوالاں لئی اسسٹنٹ نوں AI کلید چاہیدی اے — مالک Gemini دی مفت API کلید (Google AI Studio) شامل کر کے کسے وی زبان وچ آزادانہ جواب کھول سکدا اے۔",
    playbookNote: "",
  },
  ps: {
    noChannel: "لومړی خپل چینل ونښلوئ — دا ځواب ستاسو د خپل چینل له ډېټا څخه جوړېږي۔ کور پاڼې ته لاړ شئ او “Connect a channel” کېکاږئ.",
    ideasHeader: "ستاسو د چینل “{ch}” لپاره نن ۴ نظرونه:",
    ideasEmpty: "ننني نظرونه لا نه دي جوړ شوي — د Ideas پاڼه پرانیزئ او بیا هڅه وکړئ.",
    ideasHook: "هک:",
    ideasWhy: "ولې مناسب دی:",
    viewPrediction: "د لیدو وړاندوینه: {p}",
    viewsHeader: "ستاسو چینل “{ch}”: {subs} ګډونوال، {views} ټول لیدونه، {videos} ویډیوګانې. د نورو لیدونو لپاره:",
    viewsTopTip: "ستاسو تر ټولو زیاته لیدل شوې ویډیو “{title}” ده ({views} لیدونه) — بله ورته ویډیو جوړه کړئ.",
    viewsBestTime: "ستاسو د خپل پورته کولو تاریخ وايي چې غوره وخت دا دی: {time}.",
    auditHeader: "ستاسو د چینل “{ch}” پلټنه: {score}/100 ({grade}).",
    auditWeakest: "تر ټولو کمزوري ټکي:",
    auditFixFirst: "لومړی دا سم کړئ:",
    auditFullDetail: "بشپړ جزیات د Optimize په پاڼه کې دي.",
    reviewHeader: "ستاسو وروستۍ ویډیو: “{title}” ({views} لیدونه).",
    reviewTitleScore: "د سرلیک نمره: {n}/100",
    reviewThumbScore: "د تمبنیل مفهوم نمره: {n}/100",
    reviewConsistency: "سرلیک ↔ تشریح ↔ سکریپټ ↔ تمبنیل سمون: {n}/100",
    reviewFixFirst: "لومړی دا سم کړئ:",
    reviewAllPass: "ټولې بنسټیزې کتنې تېرې شوې — اوس د بلې ویډیو سرلیک او تمبنیل ته پام وکړئ.",
    reviewFullDetail: "بشپړ تحلیل: Optimize ← ویډیو باندې کېکاږئ.",
    reviewNoVideo: "ستاسو هېڅ ویډیو لا نه ده ساتل شوې — لومړی چینل ونښلوئ او پرېږدئ چې ویډیوګانې پورته شي.",
    scriptAskTopic: "سکریپټ دې د کومې موضوع په اړه وي؟ د بېلګې په توګه: “Write a script about gold prices”.",
    scriptHeader: "د “{title}” لپاره د سکریپټ مسوده (نږدې {time}) — له ثبتولو مخکې یې په خپل غږ کې جوړ کړئ:",
    scriptHook: "هک:",
    communityGeneral: "د ټولنې پوسټ مسوده:\n\n“سلام ټولو ته — بله ویډیو دې د کومې موضوع په اړه وي؟ په تبصرو کې ووایئ، او بله ویډیو به ستاسو په خوښه وي.”\n\n(لا هېڅ ویډیو نه ده ساتل شوې، نو دا یو عمومي پوسټ دی.)",
    communityLatest: "د ټولنې پوسټ مسوده:\n\n“نوې ویډیو راغله: “{title}” — یې وګورئ او ووایئ، ستاسو په نظر د دې کیسې تر ټولو مهمه برخه کومه وه؟ په تبصرو کې ولیکئ!”\n\nد ویډیو لینک لاندې په تبصرو کې دی.",
    channelSummary: "ستاسو چینل “{ch}”: {subs} ګډونوال، {views} ټول لیدونه، {videos} ویډیوګانې.",
    channelTop: "تر ټولو زیاته لیدل شوې ویډیو: “{title}” ({views} لیدونه).",
    channelNext: "بل ګام: بله ورته ویډیو جوړه کړئ، او هغه څه چې بریالي شول په بل سرلیک او تمبنیل کې تکرار کړئ.",
    fallback: "زه د یوټیوب په وده کې مرسته کولی شم — سرلیکونه، ټېګونه، تمبنیلونه، د پوسټ وخت، شارټس، د لیدو وخت، یا ستاسو د خپل چینل کتنه. د بېلګې په توګه وپوښتئ: “ښه سرلیک څنګه ولیکم؟” یا “زما چینل څنګه روان دی؟” په هره ژبه کې د ازادو پوښتنو لپاره اسسټنټ AI کیلي ته اړتیا لري — مالک کولی شي د Gemini وړیا API کیلي (Google AI Studio) اضافه کړي تر څو په هره ژبه کې ازاد ځوابونه خلاص شي.",
    playbookNote: "یادونه: په پښتو کې تفصیلي لارښود لا نه دی چمتو — لاندې ځواب په انګلیسي کې دی. د هرې ژبې لپاره ازاد ځوابونه د Gemini وړیا API کیلي سره خلاصېږي.",
  },
  bn: {
    noChannel: "প্রথমে আপনার চ্যানেল সংযুক্ত করুন — এই উত্তর আপনার নিজের চ্যানেলের ডেটা থেকে তৈরি। হোম পৃষ্ঠায় গিয়ে “Connect a channel” চাপুন।",
    ideasHeader: "আপনার চ্যানেল “{ch}”-এর জন্য আজকের ৪টি আইডিয়া:",
    ideasEmpty: "আজকের আইডিয়াগুলো তৈরি করা যায়নি — Ideas পৃষ্ঠা খুলে আবার চেষ্টা করুন।",
    ideasHook: "হুক:",
    ideasWhy: "কেন মানানসই:",
    viewPrediction: "ভিউয়ের পূর্বাভাস: {p}",
    viewsHeader: "আপনার চ্যানেল “{ch}”: {subs} সাবস্ক্রাইবার, {views} মোট ভিউ, {videos} ভিডিও। আরও ভিউ পেতে:",
    viewsTopTip: "আপনার সবচেয়ে বেশি দেখা ভিডিও “{title}” ({views} ভিউ) — এর মতো আরেকটি ভিডিও বানান।",
    viewsBestTime: "আপনার নিজের আপলোডের ইতিহাস বলছে সেরা সময়: {time}।",
    auditHeader: "আপনার চ্যানেল “{ch}”-এর অডিট: {score}/100 ({grade})।",
    auditWeakest: "সবচেয়ে দুর্বল দিকগুলো:",
    auditFixFirst: "আগে এগুলো ঠিক করুন:",
    auditFullDetail: "সম্পূর্ণ বিবরণ Optimize পৃষ্ঠায় আছে।",
    reviewHeader: "আপনার সর্বশেষ ভিডিও: “{title}” ({views} ভিউ)।",
    reviewTitleScore: "টাইটেল স্কোর: {n}/100",
    reviewThumbScore: "থাম্বনেইল ধারণা স্কোর: {n}/100",
    reviewConsistency: "টাইটেল ↔ বিবরণ ↔ স্ক্রিপ্ট ↔ থাম্বনেইল মিল: {n}/100",
    reviewFixFirst: "আগে এগুলো ঠিক করুন:",
    reviewAllPass: "সব মৌলিক যাচাই পাস — এবার পরের ভিডিওর টাইটেল ও থাম্বনেইলে মন দিন।",
    reviewFullDetail: "সম্পূর্ণ বিশ্লেষণ: Optimize → ভিডিওতে চাপুন।",
    reviewNoVideo: "আপনার কোনো ভিডিও এখনো সংরক্ষিত হয়নি — প্রথমে চ্যানেল সংযুক্ত করুন এবং ভিডিও লোড হতে দিন।",
    scriptAskTopic: "স্ক্রিপ্ট কোন বিষয়ে হবে? উদাহরণ: “Write a script about gold prices”।",
    scriptHeader: "“{title}”-এর জন্য স্ক্রিপ্টের খসড়া (প্রায় {time}) — রেকর্ড করার আগে নিজের কণ্ঠে মানিয়ে নিন:",
    scriptHook: "হুক:",
    communityGeneral: "কমিউনিটি পোস্টের খসড়া:\n\n“সবাইকে শুভেচ্ছা — পরের ভিডিও কোন বিষয়ে দেখতে চান? কমেন্টে জানান, পরের ভিডিও হবে আপনার পছন্দে।”\n\n(এখনো কোনো ভিডিও সংরক্ষিত হয়নি, তাই এটি একটি সাধারণ পোস্ট।)",
    communityLatest: "কমিউনিটি পোস্টের খসড়া:\n\n“নতুন ভিডিও এসে গেছে: “{title}” — দেখুন আর জানান, আপনার মতে এই গল্পের সবচেয়ে গুরুত্বপূর্ণ অংশ কোনটি? কমেন্টে লিখুন!”\n\nভিডিওর লিঙ্ক নিচে কমেন্টে আছে।",
    channelSummary: "আপনার চ্যানেল “{ch}”: {subs} সাবস্ক্রাইবার, {views} মোট ভিউ, {videos} ভিডিও।",
    channelTop: "সবচেয়ে বেশি দেখা ভিডিও: “{title}” ({views} ভিউ)।",
    channelNext: "পরের ধাপ: এর মতো আরেকটি ভিডিও বানান, আর যা কাজ করেছে তা পরের টাইটেল ও থাম্বনেইলে পুনরাবৃত্তি করুন।",
    fallback: "আমি YouTube-এর বৃদ্ধিতে সাহায্য করতে পারি — টাইটেল, ট্যাগ, থাম্বনেইল, পোস্টের সময়, শর্টস, দেখার সময়, বা আপনার নিজের চ্যানেলের যাচাই। যেমন জিজ্ঞেস করুন: “ভালো টাইটেল কীভাবে লিখব?” বা “আমার চ্যানেল কেমন চলছে?” যেকোনো ভাষায় খোলা প্রশ্নের জন্য অ্যাসিস্ট্যান্টের একটি AI কী দরকার — মালিক Gemini-র বিনামূল্যের API কী (Google AI Studio) যোগ করে যেকোনো ভাষায় মুক্ত উত্তর খুলতে পারেন।",
    playbookNote: "",
  },
  tr: {
    noChannel: "Önce kanalınızı bağlayın — bu yanıt kendi kanal verilerinizden oluşur. Ana sayfaya gidip “Connect a channel” düğmesine basın.",
    ideasHeader: "“{ch}” kanalınız için bugünün 4 fikri:",
    ideasEmpty: "Bugünün fikirleri oluşturulamadı — Ideas sayfasını açıp tekrar deneyin.",
    ideasHook: "Kanca:",
    ideasWhy: "Neden uygun:",
    viewPrediction: "Görüntülenme tahmini: {p}",
    viewsHeader: "Kanalınız “{ch}”: {subs} abone, {views} toplam görüntülenme, {videos} video. Daha fazla görüntülenme için:",
    viewsTopTip: "En çok izlenen videonuz “{title}” ({views} görüntülenme) — bir tane daha benzerini yapın.",
    viewsBestTime: "Kendi yükleme geçmişinize göre en iyi zaman diliminiz: {time}.",
    auditHeader: "“{ch}” kanalı denetimi: {score}/100 ({grade}).",
    auditWeakest: "En zayıf noktalar:",
    auditFixFirst: "Önce şunları düzeltin:",
    auditFullDetail: "Tam ayrıntı Optimize sayfasında.",
    reviewHeader: "En son videonuz: “{title}” ({views} görüntülenme).",
    reviewTitleScore: "Başlık puanı: {n}/100",
    reviewThumbScore: "Küçük resim kavram puanı: {n}/100",
    reviewConsistency: "Başlık ↔ açıklama ↔ senaryo ↔ küçük resim uyumu: {n}/100",
    reviewFixFirst: "Önce şunları düzeltin:",
    reviewAllPass: "Tüm temel kontroller geçti — şimdi sonraki videonun başlığına ve küçük resmine odaklanın.",
    reviewFullDetail: "Tam analiz: Optimize → videoya dokunun.",
    reviewNoVideo: "Önbelleğinizde henüz video bulunamadı — önce kanalınızı bağlayın ve videoların yüklenmesine izin verin.",
    scriptAskTopic: "Senaryo hangi konu hakkında olmalı? Örneğin: “Write a script about gold prices”.",
    scriptHeader: "“{title}” için senaryo taslağı (yaklaşık {time}) — kaydetmeden önce kendi sesinize uyarlayın:",
    scriptHook: "Kanca:",
    communityGeneral: "Topluluk gönderisi taslağı:\n\n“Merhaba herkese — bir sonraki videom hangi konu hakkında olsun? Yorumlarda söyleyin, bir sonraki video sizin seçiminiz olacak.”\n\n(Henüz önbellekte video yok, bu yüzden bu genel bir gönderi.)",
    communityLatest: "Topluluk gönderisi taslağı:\n\n“Yeni video yayında: “{title}” — izleyin ve söyleyin, sizce bu hikâyenin en önemli kısmı hangisiydi? Yorumlarda yazın!”\n\nVideonun bağlantısı aşağıdaki yorumlarda.",
    channelSummary: "Kanalınız “{ch}”: {subs} abone, {views} toplam görüntülenme, {videos} video.",
    channelTop: "En çok izlenen videonuz “{title}” ({views} görüntülenme).",
    channelNext: "Sonraki adım: bir tane daha benzerini yapın ve işe yarayanı sonraki başlık ve küçük resimde tekrarlayın.",
    fallback: "YouTube büyümesinde yardımcı olabilirim — başlıklar, etiketler, küçük resimler, paylaşım saatleri, Shorts, izlenme süresi veya kendi kanalınızın denetimi. Örneğin sorun: “Daha iyi başlıkları nasıl yazarım?” veya “Kanalım nasıl gidiyor?” Herhangi bir dilde açık uçlu sorular için Asistanın bir yapay zekâ anahtarına ihtiyacı var — sahip, Gemini'nin ücretsiz API anahtarını (Google AI Studio) ekleyerek herhangi bir dilde serbest yanıtların kilidini açabilir.",
    playbookNote: "",
  },
  id: {
    noChannel: "Hubungkan channel Anda dulu — jawaban ini dibuat dari data channel Anda sendiri. Buka Beranda lalu tekan “Connect a channel”.",
    ideasHeader: "Berikut 4 ide untuk channel Anda “{ch}” hari ini:",
    ideasEmpty: "Ide hari ini belum bisa dibuat — buka halaman Ideas lalu coba lagi.",
    ideasHook: "Hook:",
    ideasWhy: "Mengapa cocok:",
    viewPrediction: "Prediksi penayangan: {p}",
    viewsHeader: "Channel Anda “{ch}”: {subs} subscriber, {views} total penayangan, {videos} video. Untuk mendapat lebih banyak penayangan:",
    viewsTopTip: "Video Anda yang paling banyak ditonton adalah “{title}” ({views} penayangan) — buat satu lagi seperti itu.",
    viewsBestTime: "Riwayat unggahan Anda sendiri mengatakan waktu terbaik Anda adalah: {time}.",
    auditHeader: "Audit channel untuk “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Pemeriksaan terlemah:",
    auditFixFirst: "Perbaiki dulu:",
    auditFullDetail: "Detail lengkap ada di halaman Optimize.",
    reviewHeader: "Video terbaru Anda: “{title}” ({views} penayangan).",
    reviewTitleScore: "Skor judul: {n}/100",
    reviewThumbScore: "Skor konsep thumbnail: {n}/100",
    reviewConsistency: "Kecocokan judul ↔ deskripsi ↔ naskah ↔ thumbnail: {n}/100",
    reviewFixFirst: "Perbaiki dulu:",
    reviewAllPass: "Semua pemeriksaan dasar lolos — fokus pada judul dan thumbnail video berikutnya.",
    reviewFullDetail: "Analisis lengkap: Optimize → ketuk videonya.",
    reviewNoVideo: "Belum ada video di cache Anda — hubungkan channel Anda dan biarkan videonya dimuat dulu.",
    scriptAskTopic: "Naskah ini tentang topik apa? Contoh: “Write a script about gold prices”.",
    scriptHeader: "Draf naskah untuk “{title}” (sekitar {time}) — sesuaikan dengan suara Anda sendiri sebelum merekam:",
    scriptHook: "Hook:",
    communityGeneral: "Draf postingan komunitas:\n\n“Halo semuanya — topik apa yang sebaiknya dibahas video saya berikutnya? Beri tahu di komentar, dan video berikutnya akan sesuai pilihan Anda.”\n\n(Belum ada video di cache, jadi ini postingan umum.)",
    communityLatest: "Draf postingan komunitas:\n\n“Video baru sudah tayang: “{title}” — tonton dan beri tahu saya, bagian apa dari cerita ini yang paling penting menurut Anda? Tulis di komentar!”\n\nTautan videonya ada di komentar di bawah.",
    channelSummary: "Channel Anda “{ch}”: {subs} subscriber, {views} total penayangan, {videos} video.",
    channelTop: "Video Anda yang paling banyak ditonton adalah “{title}” ({views} penayangan).",
    channelNext: "Langkah berikutnya: buat satu video lagi seperti itu, dan ulangi hal yang berhasil pada judul dan thumbnail berikutnya.",
    fallback: "Saya bisa membantu pertumbuhan YouTube — judul, tag, thumbnail, waktu posting, Shorts, waktu tonton, atau pemeriksaan channel Anda sendiri. Coba tanyakan: “Bagaimana cara menulis judul yang lebih baik?” atau “Bagaimana kabar channel saya?” Untuk pertanyaan terbuka dalam bahasa apa pun, Asisten membutuhkan kunci AI — pemilik dapat menambahkan kunci API Gemini gratis (Google AI Studio) untuk membuka jawaban bebas dalam bahasa apa pun.",
    playbookNote: "",
  },
  es: {
    noChannel: "Conecta primero tu canal: esta respuesta se construye con los datos de tu propio canal. Ve a Inicio y pulsa “Connect a channel”.",
    ideasHeader: "Aquí tienes 4 ideas para tu canal “{ch}” hoy:",
    ideasEmpty: "No se pudieron generar las ideas de hoy — abre la página Ideas e inténtalo de nuevo.",
    ideasHook: "Gancho:",
    ideasWhy: "Por qué encaja:",
    viewPrediction: "Predicción de vistas: {p}",
    viewsHeader: "Tu canal “{ch}”: {subs} suscriptores, {views} vistas totales, {videos} vídeos. Para conseguir más vistas:",
    viewsTopTip: "Tu vídeo más visto es “{title}” ({views} vistas): haz otro parecido.",
    viewsBestTime: "Tu propio historial de subidas dice que tu mejor horario es: {time}.",
    auditHeader: "Auditoría del canal “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Puntos más débiles:",
    auditFixFirst: "Arregla primero:",
    auditFullDetail: "El detalle completo está en la página Optimize.",
    reviewHeader: "Tu último vídeo: “{title}” ({views} vistas).",
    reviewTitleScore: "Puntuación del título: {n}/100",
    reviewThumbScore: "Puntuación del concepto de miniatura: {n}/100",
    reviewConsistency: "Coincidencia título ↔ descripción ↔ guion ↔ miniatura: {n}/100",
    reviewFixFirst: "Arregla primero:",
    reviewAllPass: "Todas las comprobaciones básicas pasan: céntrate en el título y la miniatura del próximo vídeo.",
    reviewFullDetail: "Análisis completo: Optimize → toca el vídeo.",
    reviewNoVideo: "Aún no hay ningún vídeo en tu caché: conecta tu canal y deja que los vídeos se carguen primero.",
    scriptAskTopic: "¿Sobre qué tema debe ser el guion? Por ejemplo: “Write a script about gold prices”.",
    scriptHeader: "Borrador de guion para “{title}” (unos {time}): adáptalo a tu propia voz antes de grabar:",
    scriptHook: "Gancho:",
    communityGeneral: "Borrador de publicación para la comunidad:\n\n“¡Hola a todos! ¿Sobre qué tema debería ser mi próximo vídeo? Decídmelo en los comentarios, y el próximo vídeo será sobre vuestra elección.”\n\n(Todavía no hay ningún vídeo en la caché, así que es una publicación general.)",
    communityLatest: "Borrador de publicación para la comunidad:\n\n“¡Nuevo vídeo ya disponible: “{title}”! Míralo y dime: ¿cuál fue la parte más importante de esta historia para ti? ¡Cuéntamelo en los comentarios!”\n\nEl enlace al vídeo está en los comentarios.",
    channelSummary: "Tu canal “{ch}”: {subs} suscriptores, {views} vistas totales, {videos} vídeos.",
    channelTop: "Tu vídeo más visto es “{title}” ({views} vistas).",
    channelNext: "Siguiente paso: haz otro vídeo parecido y repite lo que funcionó en su título y miniatura.",
    fallback: "Puedo ayudarte con el crecimiento en YouTube: títulos, etiquetas, miniaturas, horarios de publicación, Shorts, tiempo de visualización o una revisión de tu propio canal. Pregúntame, por ejemplo: “¿Cómo escribo mejores títulos?” o “¿Cómo va mi canal?” Para preguntas abiertas en cualquier idioma, el Asistente necesita una clave de IA: el propietario puede añadir una clave API gratuita de Gemini (Google AI Studio) para desbloquear respuestas libres en cualquier idioma.",
    playbookNote: "",
  },
  fr: {
    noChannel: "Connectez d'abord votre chaîne — cette réponse est construite à partir des données de votre propre chaîne. Allez sur Accueil et appuyez sur “Connect a channel”.",
    ideasHeader: "Voici 4 idées pour votre chaîne “{ch}” aujourd'hui :",
    ideasEmpty: "Impossible de générer les idées du jour — ouvrez la page Ideas et réessayez.",
    ideasHook: "Accroche :",
    ideasWhy: "Pourquoi ça convient :",
    viewPrediction: "Prévision de vues : {p}",
    viewsHeader: "Votre chaîne “{ch}” : {subs} abonnés, {views} vues au total, {videos} vidéos. Pour obtenir plus de vues :",
    viewsTopTip: "Votre vidéo la plus vue est “{title}” ({views} vues) — faites-en une autre du même genre.",
    viewsBestTime: "Votre propre historique de publications dit que votre meilleure fenêtre est : {time}.",
    auditHeader: "Audit de la chaîne “{ch}” : {score}/100 ({grade}).",
    auditWeakest: "Points les plus faibles :",
    auditFixFirst: "Corrigez d'abord :",
    auditFullDetail: "Le détail complet est sur la page Optimize.",
    reviewHeader: "Votre dernière vidéo : “{title}” ({views} vues).",
    reviewTitleScore: "Score du titre : {n}/100",
    reviewThumbScore: "Score du concept de miniature : {n}/100",
    reviewConsistency: "Cohérence titre ↔ description ↔ script ↔ miniature : {n}/100",
    reviewFixFirst: "Corrigez d'abord :",
    reviewAllPass: "Tous les contrôles de base passent — concentrez-vous sur le titre et la miniature de la prochaine vidéo.",
    reviewFullDetail: "Analyse complète : Optimize → touchez la vidéo.",
    reviewNoVideo: "Aucune vidéo trouvée dans votre cache pour l'instant — connectez votre chaîne et laissez les vidéos se charger d'abord.",
    scriptAskTopic: "Sur quel sujet le script doit-il porter ? Par exemple : “Write a script about gold prices”.",
    scriptHeader: "Brouillon de script pour “{title}” (environ {time}) — adaptez-le à votre propre voix avant d'enregistrer :",
    scriptHook: "Accroche :",
    communityGeneral: "Brouillon de publication communautaire :\n\n“Bonjour à tous — sur quel sujet devrait porter ma prochaine vidéo ? Dites-le-moi en commentaires, et la prochaine vidéo sera sur votre choix.”\n\n(Aucune vidéo dans le cache pour l'instant, c'est donc une publication générale.)",
    communityLatest: "Brouillon de publication communautaire :\n\n“Nouvelle vidéo disponible : “{title}” — regardez-la et dites-moi, quelle a été la partie la plus importante de cette histoire pour vous ? Dites-le en commentaires !”\n\nLe lien de la vidéo est dans les commentaires ci-dessous.",
    channelSummary: "Votre chaîne “{ch}” : {subs} abonnés, {views} vues au total, {videos} vidéos.",
    channelTop: "Votre vidéo la plus vue est “{title}” ({views} vues).",
    channelNext: "Prochaine étape : faites une autre vidéo du même genre, et répétez ce qui a marché dans son titre et sa miniature.",
    fallback: "Je peux vous aider à grandir sur YouTube — titres, tags, miniatures, heures de publication, Shorts, temps de visionnage ou un bilan de votre propre chaîne. Demandez-moi par exemple : “Comment écrire de meilleurs titres ?” ou “Comment va ma chaîne ?” Pour les questions ouvertes dans n'importe quelle langue, l'Assistant a besoin d'une clé d'IA — le propriétaire peut ajouter une clé API Gemini gratuite (Google AI Studio) pour débloquer des réponses libres dans toutes les langues.",
    playbookNote: "",
  },
  de: {
    noChannel: "Verbinde zuerst deinen Kanal — diese Antwort basiert auf deinen eigenen Kanaldaten. Geh zur Startseite und tippe auf “Connect a channel”.",
    ideasHeader: "Hier sind 4 Ideen für deinen Kanal “{ch}” heute:",
    ideasEmpty: "Die heutigen Ideen konnten nicht erstellt werden — öffne die Ideas-Seite und versuche es erneut.",
    ideasHook: "Hook:",
    ideasWhy: "Warum es passt:",
    viewPrediction: "Prognose der Aufrufe: {p}",
    viewsHeader: "Dein Kanal “{ch}”: {subs} Abonnenten, {views} Aufrufe insgesamt, {videos} Videos. Für mehr Aufrufe:",
    viewsTopTip: "Dein meistgesehenes Video ist “{title}” ({views} Aufrufe) — mach ein weiteres wie dieses.",
    viewsBestTime: "Deine eigene Upload-Historie sagt: Dein bestes Zeitfenster ist {time}.",
    auditHeader: "Kanal-Audit für “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Schwächste Punkte:",
    auditFixFirst: "Repariere zuerst:",
    auditFullDetail: "Alle Details findest du auf der Optimize-Seite.",
    reviewHeader: "Dein neuestes Video: “{title}” ({views} Aufrufe).",
    reviewTitleScore: "Titel-Score: {n}/100",
    reviewThumbScore: "Thumbnail-Konzept-Score: {n}/100",
    reviewConsistency: "Titel ↔ Beschreibung ↔ Skript ↔ Thumbnail-Abgleich: {n}/100",
    reviewFixFirst: "Repariere zuerst:",
    reviewAllPass: "Alle Basis-Checks bestehen — konzentriere dich auf Titel und Thumbnail des nächsten Videos.",
    reviewFullDetail: "Vollständige Analyse: Optimize → tippe auf das Video.",
    reviewNoVideo: "Noch kein Video in deinem Cache gefunden — verbinde zuerst deinen Kanal und lass die Videos laden.",
    scriptAskTopic: "Worum soll es im Skript gehen? Zum Beispiel: “Write a script about gold prices”.",
    scriptHeader: "Skript-Entwurf für “{title}” (ca. {time}) — passe ihn vor der Aufnahme an deine eigene Stimme an:",
    scriptHook: "Hook:",
    communityGeneral: "Entwurf für einen Community-Beitrag:\n\n“Hallo zusammen — worüber soll mein nächstes Video gehen? Schreibt es in die Kommentare, und das nächste Video wird über eure Wahl sein.”\n\n(Noch kein Video im Cache, also ist dies ein allgemeiner Beitrag.)",
    communityLatest: "Entwurf für einen Community-Beitrag:\n\n“Neues Video ist da: “{title}” — schaut es euch an und sagt mir: Was war für euch der wichtigste Teil dieser Geschichte? Schreibt es in die Kommentare!”\n\nDer Link zum Video steht unten in den Kommentaren.",
    channelSummary: "Dein Kanal “{ch}”: {subs} Abonnenten, {views} Aufrufe insgesamt, {videos} Videos.",
    channelTop: "Dein meistgesehenes Video ist “{title}” ({views} Aufrufe).",
    channelNext: "Nächster Schritt: Mach ein weiteres Video wie dieses und wiederhole, was in Titel und Thumbnail funktioniert hat.",
    fallback: "Ich kann dir beim Wachstum auf YouTube helfen — Titel, Tags, Thumbnails, Posting-Zeiten, Shorts, Wiedergabezeit oder ein Check deines eigenen Kanals. Frag mich zum Beispiel: “Wie schreibe ich bessere Titel?” oder “Wie läuft mein Kanal?” Für offene Fragen in jeder Sprache braucht der Assistent einen KI-Schlüssel — der Inhaber kann einen kostenlosen Gemini-API-Schlüssel (Google AI Studio) hinzufügen, um freie Antworten in jeder Sprache freizuschalten.",
    playbookNote: "",
  },
  pt: {
    noChannel: "Conecte primeiro o seu canal — esta resposta é feita com os dados do seu próprio canal. Vá para a Página inicial e toque em “Connect a channel”.",
    ideasHeader: "Aqui estão 4 ideias para o seu canal “{ch}” hoje:",
    ideasEmpty: "Não foi possível gerar as ideias de hoje — abra a página Ideas e tente de novo.",
    ideasHook: "Gancho:",
    ideasWhy: "Por que combina:",
    viewPrediction: "Previsão de visualizações: {p}",
    viewsHeader: "O seu canal “{ch}”: {subs} inscritos, {views} visualizações no total, {videos} vídeos. Para conseguir mais visualizações:",
    viewsTopTip: "O seu vídeo mais visto é “{title}” ({views} visualizações) — faça outro parecido.",
    viewsBestTime: "O seu próprio histórico de uploads diz que a sua melhor janela é: {time}.",
    auditHeader: "Auditoria do canal “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Pontos mais fracos:",
    auditFixFirst: "Corrija primeiro:",
    auditFullDetail: "O detalhe completo está na página Optimize.",
    reviewHeader: "O seu vídeo mais recente: “{title}” ({views} visualizações).",
    reviewTitleScore: "Pontuação do título: {n}/100",
    reviewThumbScore: "Pontuação do conceito de miniatura: {n}/100",
    reviewConsistency: "Coerência título ↔ descrição ↔ roteiro ↔ miniatura: {n}/100",
    reviewFixFirst: "Corrija primeiro:",
    reviewAllPass: "Todas as verificações básicas passaram — foque no título e na miniatura do próximo vídeo.",
    reviewFullDetail: "Análise completa: Optimize → toque no vídeo.",
    reviewNoVideo: "Nenhum vídeo encontrado no seu cache ainda — conecte o seu canal e deixe os vídeos carregarem primeiro.",
    scriptAskTopic: "Sobre qual tema deve ser o roteiro? Por exemplo: “Write a script about gold prices”.",
    scriptHeader: "Rascunho de roteiro para “{title}” (cerca de {time}) — adapte à sua própria voz antes de gravar:",
    scriptHook: "Gancho:",
    communityGeneral: "Rascunho de post para a comunidade:\n\n“Olá a todos — sobre qual tema deve ser o meu próximo vídeo? Digam nos comentários, e o próximo vídeo será sobre a vossa escolha.”\n\n(Ainda não há vídeo no cache, por isso é um post geral.)",
    communityLatest: "Rascunho de post para a comunidade:\n\n“Vídeo novo no ar: “{title}” — assistam e me digam: qual foi a parte mais importante desta história para vocês? Escrevam nos comentários!”\n\nO link do vídeo está nos comentários abaixo.",
    channelSummary: "O seu canal “{ch}”: {subs} inscritos, {views} visualizações no total, {videos} vídeos.",
    channelTop: "O seu vídeo mais visto é “{title}” ({views} visualizações).",
    channelNext: "Próximo passo: faça outro vídeo parecido e repita o que funcionou no título e na miniatura.",
    fallback: "Posso ajudar com o crescimento no YouTube — títulos, tags, miniaturas, horários de publicação, Shorts, tempo de exibição ou uma revisão do seu próprio canal. Pergunte, por exemplo: “Como escrevo títulos melhores?” ou “Como está o meu canal?” Para perguntas abertas em qualquer idioma, o Assistente precisa de uma chave de IA — o proprietário pode adicionar uma chave API gratuita do Gemini (Google AI Studio) para desbloquear respostas livres em qualquer idioma.",
    playbookNote: "",
  },
  ru: {
    noChannel: "Сначала подключите канал — этот ответ строится на данных вашего собственного канала. Перейдите на главную и нажмите “Connect a channel”.",
    ideasHeader: "Вот 4 идеи для вашего канала “{ch}” на сегодня:",
    ideasEmpty: "Сегодняшние идеи создать не удалось — откройте страницу Ideas и попробуйте ещё раз.",
    ideasHook: "Хук:",
    ideasWhy: "Почему подходит:",
    viewPrediction: "Прогноз просмотров: {p}",
    viewsHeader: "Ваш канал “{ch}”: {subs} подписчиков, {views} просмотров всего, {videos} видео. Чтобы получить больше просмотров:",
    viewsTopTip: "Ваше самое просматриваемое видео — “{title}” ({views} просмотров). Сделайте ещё одно похожее.",
    viewsBestTime: "Ваша собственная история загрузок говорит, что лучшее окно: {time}.",
    auditHeader: "Аудит канала “{ch}”: {score}/100 ({grade}).",
    auditWeakest: "Самые слабые проверки:",
    auditFixFirst: "Исправьте сначала:",
    auditFullDetail: "Полные детали — на странице Optimize.",
    reviewHeader: "Ваше последнее видео: “{title}” ({views} просмотров).",
    reviewTitleScore: "Оценка заголовка: {n}/100",
    reviewThumbScore: "Оценка концепции превью: {n}/100",
    reviewConsistency: "Соответствие заголовка ↔ описания ↔ сценария ↔ превью: {n}/100",
    reviewFixFirst: "Исправьте сначала:",
    reviewAllPass: "Все базовые проверки пройдены — сосредоточьтесь на заголовке и превью следующего видео.",
    reviewFullDetail: "Полный анализ: Optimize → нажмите на видео.",
    reviewNoVideo: "В кэше пока нет видео — сначала подключите канал и дайте видео загрузиться.",
    scriptAskTopic: "О какой теме должен быть сценарий? Например: “Write a script about gold prices”.",
    scriptHeader: "Черновик сценария для “{title}” (около {time}) — адаптируйте под свой голос перед записью:",
    scriptHook: "Хук:",
    communityGeneral: "Черновик поста для сообщества:\n\n“Всем привет — о какой теме должно быть моё следующее видео? Напишите в комментариях, и следующее видео будет на вашу тему.”\n\n(В кэше пока нет видео, поэтому это общий пост.)",
    communityLatest: "Черновик поста для сообщества:\n\n“Новое видео уже вышло: “{title}” — посмотрите и напишите, какая часть этой истории была для вас самой важной? Пишите в комментариях!”\n\nСсылка на видео — в комментариях ниже.",
    channelSummary: "Ваш канал “{ch}”: {subs} подписчиков, {views} просмотров всего, {videos} видео.",
    channelTop: "Ваше самое просматриваемое видео — “{title}” ({views} просмотров).",
    channelNext: "Следующий шаг: сделайте ещё одно похожее видео и повторите то, что сработало в его заголовке и превью.",
    fallback: "Я могу помочь с ростом на YouTube — заголовки, теги, превью, время публикаций, Shorts, время просмотра или проверка вашего канала. Спросите, например: «Как писать заголовки лучше?» или «Как дела у моего канала?» Для открытых вопросов на любом языке Ассистенту нужен ключ ИИ — владелец может добавить бесплатный API-ключ Gemini (Google AI Studio), чтобы разблокировать свободные ответы на любом языке.",
    playbookNote: "",
  },
};

export function dataText(lang: AssistantLang, key: DataKey): string {
  return DATA_TEXT[lang]?.[key] ?? DATA_TEXT.en[key] ?? "";
}

/** Fill {placeholders} in a template string. */
export function fill(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

// ---------------------------------------------------------------------------
// Chat UI strings and suggestion cards. Card prompts are written so they
// always match DATA_INTENT_KEYWORDS above (verified per language).
// ---------------------------------------------------------------------------

export type UiKey =
  | "greeting"
  | "greetingPlain"
  | "greetingSub"
  | "placeholder"
  | "send"
  | "newChat"
  | "thinking"
  | "groundedNote"
  | "disclaimer"
  | "langLabel"
  | "errorGeneric";

export const UI_TEXT: Record<AssistantLang, Record<UiKey, string>> = {
  en: {
    greeting: "Let's create, {name}",
    greetingPlain: "Let's create",
    greetingSub: "Ask the Assistant — answers come from your real channel data and Nizafa's growth playbook, in your language.",
    placeholder: "How can I help you grow?",
    send: "Send",
    newChat: "New chat",
    thinking: "Thinking…",
    groundedNote: "✓ Answered from your channel data",
    disclaimer: "The Assistant answers from a curated YouTube-growth playbook and your connected channel data. It does not invent view counts or subscribers — if your channel is not connected, it says so.",
    langLabel: "Language",
    errorGeneric: "The Assistant could not answer right now.",
  },
  ur: {
    greeting: "آئیے بنائیں، {name}",
    greetingPlain: "آئیے بنائیں",
    greetingSub: "اسسٹنٹ سے پوچھیں — جواب آپ کے اصل چینل ڈیٹا اور نیزافا کی گروتھ گائیڈ سے آتے ہیں، آپ کی زبان میں۔",
    placeholder: "میں آپ کی ترقی میں کیسے مدد کروں؟",
    send: "بھیجیں",
    newChat: "نئی چیٹ",
    thinking: "سوچ رہا ہے…",
    groundedNote: "✓ آپ کے چینل ڈیٹا سے جواب",
    disclaimer: "اسسٹنٹ نیزافا کی منتخب یوٹیوب گروتھ گائیڈ اور آپ کے منسلک چینل ڈیٹا سے جواب دیتا ہے۔ یہ ویوز یا سبسکرائبر نہیں گھڑتا — اگر چینل منسلک نہیں تو وہ بتا دیتا ہے۔",
    langLabel: "زبان",
    errorGeneric: "اسسٹنٹ ابھی جواب نہیں دے سکا۔",
  },
  hi: {
    greeting: "आइए बनाएँ, {name}",
    greetingPlain: "आइए बनाएँ",
    greetingSub: "असिस्टेंट से पूछें — जवाब आपके असली चैनल डेटा और Nizafa की ग्रोथ गाइड से आते हैं, आपकी भाषा में।",
    placeholder: "मैं आपकी बढ़त में कैसे मदद करूँ?",
    send: "भेजें",
    newChat: "नई चैट",
    thinking: "सोच रहा है…",
    groundedNote: "✓ आपके चैनल डेटा से जवाब",
    disclaimer: "असिस्टेंट Nizafa की चुनी हुई YouTube-ग्रोथ गाइड और आपके जुड़े चैनल डेटा से जवाब देता है। यह व्यूज़ या सब्सक्राइबर नहीं गढ़ता — अगर चैनल जुड़ा नहीं है तो वह बता देता है।",
    langLabel: "भाषा",
    errorGeneric: "असिस्टेंट अभी जवाब नहीं दे सका।",
  },
  ar: {
    greeting: "لنبدع، {name}",
    greetingPlain: "لنبدع",
    greetingSub: "اسأل المساعد — الإجابات تأتي من بيانات قناتك الحقيقية ودليل النمو في نيزافا، بلغتك.",
    placeholder: "كيف أساعدك على النمو؟",
    send: "إرسال",
    newChat: "محادثة جديدة",
    thinking: "يفكر…",
    groundedNote: "✓ إجابة من بيانات قناتك",
    disclaimer: "يجيب المساعد من دليل نمو يوتيوب المنسّق في نيزافا ومن بيانات قناتك المتصلة. وهو لا يخترع أعداد المشاهدات أو المشتركين — وإذا لم تكن قناتك متصلة فسيقول ذلك.",
    langLabel: "اللغة",
    errorGeneric: "تعذّر على المساعد الإجابة الآن.",
  },
  pa: {
    greeting: "آؤ بنائیے، {name}",
    greetingPlain: "آؤ بنائیے",
    greetingSub: "اسسٹنٹ توں پچھو — جواب تہاڈے اصل چینل ڈیٹا تے نیزافا دی گروتھ گائیڈ توں آوندے نیں، تہاڈی زبان وچ۔",
    placeholder: "میں تہاڈی ترقی وچ کیویں مدد کراں؟",
    send: "بھیجو",
    newChat: "نویں چیٹ",
    thinking: "سوچ رہیا اے…",
    groundedNote: "✓ تہاڈے چینل ڈیٹا توں جواب",
    disclaimer: "اسسٹنٹ نیزافا دی چنی ہوئی یوٹیوب گروتھ گائیڈ تے تہاڈے منسلک چینل ڈیٹا توں جواب دیندا اے۔ ایہ ویوز یا سبسکرائبر نہیں گھڑدا — جے چینل منسلک نہیں تے اوہ دس دیندا اے۔",
    langLabel: "زبان",
    errorGeneric: "اسسٹنٹ ہلے جواب نہیں دے سکیا۔",
  },
  ps: {
    greeting: "راځئ جوړ کړو، {name}",
    greetingPlain: "راځئ جوړ کړو",
    greetingSub: "له اسسټنټ څخه وپوښتئ — ځوابونه ستاسو د ریښتیني چینل ډېټا او د Nizafa د ودې لارښود څخه راځي، ستاسو په ژبه.",
    placeholder: "زه ستاسو په وده کې څنګه مرسته کولی شم؟",
    send: "واستوئ",
    newChat: "نوې خبرې",
    thinking: "فکر کوي…",
    groundedNote: "✓ ستاسو د چینل ډېټا څخه ځواب",
    disclaimer: "اسسټنټ د Nizafa د یوټیوب ودې له غوره شوي لارښود او ستاسو د تړلي چینل ډېټا څخه ځواب ورکوي. دا لیدونه یا ګډونوال نه جوړوي — که ستاسو چینل نه وي تړلی، نو هغه وايي.",
    langLabel: "ژبه",
    errorGeneric: "اسسټنټ اوس ځواب نشي ورکولی.",
  },
  bn: {
    greeting: "চলুন বানাই, {name}",
    greetingPlain: "চলুন বানাই",
    greetingSub: "অ্যাসিস্ট্যান্টকে জিজ্ঞেস করুন — উত্তর আসে আপনার আসল চ্যানেল ডেটা ও Nizafa-র গ্রোথ গাইড থেকে, আপনার ভাষায়।",
    placeholder: "আপনার বৃদ্ধিতে আমি কীভাবে সাহায্য করব?",
    send: "পাঠান",
    newChat: "নতুন চ্যাট",
    thinking: "ভাবছে…",
    groundedNote: "✓ আপনার চ্যানেল ডেটা থেকে উত্তর",
    disclaimer: "অ্যাসিস্ট্যান্ট Nizafa-র নির্বাচিত YouTube-গ্রোথ গাইড ও আপনার সংযুক্ত চ্যানেল ডেটা থেকে উত্তর দেয়। এটি ভিউ বা সাবস্ক্রাইবার বানায় না — চ্যানেল সংযুক্ত না থাকলে তা জানিয়ে দেয়।",
    langLabel: "ভাষা",
    errorGeneric: "অ্যাসিস্ট্যান্ট এখন উত্তর দিতে পারেনি।",
  },
  tr: {
    greeting: "Hadi oluşturalım, {name}",
    greetingPlain: "Hadi oluşturalım",
    greetingSub: "Asistana sorun — yanıtlar gerçek kanal verilerinizden ve Nizafa'nın büyüme rehberinden gelir, sizin dilinizde.",
    placeholder: "Büyümenize nasıl yardımcı olabilirim?",
    send: "Gönder",
    newChat: "Yeni sohbet",
    thinking: "Düşünüyor…",
    groundedNote: "✓ Kanal verilerinizden yanıtlandı",
    disclaimer: "Asistan, Nizafa'nın özenle hazırlanmış YouTube büyüme rehberinden ve bağlı kanal verilerinizden yanıt verir. Görüntülenme veya abone uydurmaz — kanalınız bağlı değilse bunu söyler.",
    langLabel: "Dil",
    errorGeneric: "Asistan şu anda yanıt veremedi.",
  },
  id: {
    greeting: "Ayo berkarya, {name}",
    greetingPlain: "Ayo berkarya",
    greetingSub: "Tanyakan pada Asisten — jawaban berasal dari data channel asli Anda dan panduan pertumbuhan Nizafa, dalam bahasa Anda.",
    placeholder: "Bagaimana saya bisa membantu Anda berkembang?",
    send: "Kirim",
    newChat: "Chat baru",
    thinking: "Berpikir…",
    groundedNote: "✓ Dijawab dari data channel Anda",
    disclaimer: "Asisten menjawab dari panduan pertumbuhan YouTube pilihan Nizafa dan data channel Anda yang terhubung. Ia tidak mengarang jumlah penayangan atau subscriber — jika channel Anda belum terhubung, ia akan mengatakannya.",
    langLabel: "Bahasa",
    errorGeneric: "Asisten tidak dapat menjawab sekarang.",
  },
  es: {
    greeting: "Vamos a crear, {name}",
    greetingPlain: "Vamos a crear",
    greetingSub: "Pregunta al Asistente: las respuestas vienen de los datos reales de tu canal y de la guía de crecimiento de Nizafa, en tu idioma.",
    placeholder: "¿Cómo puedo ayudarte a crecer?",
    send: "Enviar",
    newChat: "Nuevo chat",
    thinking: "Pensando…",
    groundedNote: "✓ Respondido con los datos de tu canal",
    disclaimer: "El Asistente responde con la guía de crecimiento de YouTube de Nizafa y los datos de tu canal conectado. No inventa vistas ni suscriptores: si tu canal no está conectado, lo dice.",
    langLabel: "Idioma",
    errorGeneric: "El Asistente no pudo responder ahora mismo.",
  },
  fr: {
    greeting: "Créons, {name}",
    greetingPlain: "Créons",
    greetingSub: "Demandez à l'Assistant — les réponses viennent des données réelles de votre chaîne et du guide de croissance de Nizafa, dans votre langue.",
    placeholder: "Comment puis-je vous aider à grandir ?",
    send: "Envoyer",
    newChat: "Nouvelle discussion",
    thinking: "Réflexion…",
    groundedNote: "✓ Réponse basée sur les données de votre chaîne",
    disclaimer: "L'Assistant répond à partir du guide de croissance YouTube de Nizafa et des données de votre chaîne connectée. Il n'invente ni vues ni abonnés — si votre chaîne n'est pas connectée, il le dit.",
    langLabel: "Langue",
    errorGeneric: "L'Assistant n'a pas pu répondre pour l'instant.",
  },
  de: {
    greeting: "Lass uns erstellen, {name}",
    greetingPlain: "Lass uns erstellen",
    greetingSub: "Frag den Assistenten — Antworten kommen aus deinen echten Kanaldaten und Nizafas Wachstumsleitfaden, in deiner Sprache.",
    placeholder: "Wie kann ich dir beim Wachsen helfen?",
    send: "Senden",
    newChat: "Neuer Chat",
    thinking: "Denkt nach…",
    groundedNote: "✓ Beantwortet aus deinen Kanaldaten",
    disclaimer: "Der Assistent antwortet aus Nizafas kuratiertem YouTube-Wachstumsleitfaden und deinen verbundenen Kanaldaten. Er erfindet keine Aufrufe oder Abonnenten — wenn dein Kanal nicht verbunden ist, sagt er das.",
    langLabel: "Sprache",
    errorGeneric: "Der Assistent konnte gerade nicht antworten.",
  },
  pt: {
    greeting: "Vamos criar, {name}",
    greetingPlain: "Vamos criar",
    greetingSub: "Pergunte ao Assistente — as respostas vêm dos dados reais do seu canal e do guia de crescimento do Nizafa, no seu idioma.",
    placeholder: "Como posso ajudar você a crescer?",
    send: "Enviar",
    newChat: "Novo chat",
    thinking: "Pensando…",
    groundedNote: "✓ Respondido com os dados do seu canal",
    disclaimer: "O Assistente responde com o guia de crescimento do YouTube do Nizafa e os dados do seu canal conectado. Ele não inventa visualizações nem inscritos — se o seu canal não estiver conectado, ele diz isso.",
    langLabel: "Idioma",
    errorGeneric: "O Assistente não conseguiu responder agora.",
  },
  ru: {
    greeting: "Давай творить, {name}",
    greetingPlain: "Давай творить",
    greetingSub: "Спросите Ассистента — ответы берутся из реальных данных вашего канала и руководства по росту Nizafa, на вашем языке.",
    placeholder: "Как я могу помочь вам расти?",
    send: "Отправить",
    newChat: "Новый чат",
    thinking: "Думаю…",
    groundedNote: "✓ Ответ основан на данных вашего канала",
    disclaimer: "Ассистент отвечает по подборке руководства по росту YouTube от Nizafa и данным вашего подключённого канала. Он не выдумывает просмотры и подписчиков — если канал не подключён, он так и скажет.",
    langLabel: "Язык",
    errorGeneric: "Ассистент сейчас не смог ответить.",
  },
};

export function uiText(lang: AssistantLang, key: UiKey): string {
  return UI_TEXT[lang]?.[key] ?? UI_TEXT.en[key];
}

// ---------------------------------------------------------------------------
// Suggestion cards
// ---------------------------------------------------------------------------

export type CardId = "ideas" | "views" | "audit" | "review" | "script" | "community";

export type CardStrings = {
  title: string;
  sub: string;
  prompt: string;
  subTopic: string;
  promptTopic: string;
};

export const CARD_TEXT: Record<AssistantLang, Record<CardId, CardStrings>> = {
  en: {
    ideas: { title: "Give me video ideas", sub: "Personalized ideas based on your niche", prompt: "Give me video ideas for my channel", subTopic: "", promptTopic: "" },
    views: { title: "Get more views", sub: "Tips tailored to your channel", prompt: "How can I get more views on my channel?", subTopic: "", promptTopic: "" },
    audit: { title: "Channel audit", sub: "A full review of what to improve", prompt: "Run a channel audit for my channel", subTopic: "", promptTopic: "" },
    review: { title: "Review my latest video", sub: "Get actionable feedback on your content", prompt: "Review my latest video", subTopic: "", promptTopic: "" },
    script: { title: "Write a script", sub: "Try a script about your niche", prompt: "Write a script", subTopic: "Try a script about {topic}", promptTopic: "Write a script about {topic}" },
    community: { title: "Community post", sub: "Draft a post to engage your audience", prompt: "Draft a community post to engage my audience", subTopic: "", promptTopic: "" },
  },
  ur: {
    ideas: { title: "ویڈیو آئیڈیاز دیں", sub: "آپ کے موضوع کے مطابق ذاتی آئیڈیاز", prompt: "میرے چینل کے لیے ویڈیو آئیڈیاز دیں", subTopic: "", promptTopic: "" },
    views: { title: "زیادہ ویوز حاصل کریں", sub: "آپ کے چینل کے مطابق مشورے", prompt: "میرے چینل پر زیادہ ویوز کیسے حاصل کروں؟", subTopic: "", promptTopic: "" },
    audit: { title: "چینل آڈٹ", sub: "بہتری کے لیے مکمل جائزہ", prompt: "میرے چینل کا آڈٹ کریں", subTopic: "", promptTopic: "" },
    review: { title: "میری تازہ ترین ویڈیو کا جائزہ", sub: "اپنے مواد پر قابل عمل رائے لیں", prompt: "میری تازہ ترین ویڈیو کا جائزہ لیں", subTopic: "", promptTopic: "" },
    script: { title: "اسکرپٹ لکھیں", sub: "اپنے موضوع پر اسکرپٹ آزمائیں", prompt: "ویڈیو اسکرپٹ لکھیں", subTopic: "{topic} کے بارے میں اسکرپٹ آزمائیں", promptTopic: "{topic} کے بارے میں اسکرپٹ لکھیں" },
    community: { title: "کمیونٹی پوسٹ", sub: "ناظرین سے رابطے کے لیے پوسٹ کا مسودہ", prompt: "ناظرین سے رابطے کے لیے کمیونٹی پوسٹ کا مسودہ لکھیں", subTopic: "", promptTopic: "" },
  },
  hi: {
    ideas: { title: "वीडियो आइडिया दें", sub: "आपके विषय के अनुसार व्यक्तिगत आइडिया", prompt: "मेरे चैनल के लिए वीडियो आइडिया दें", subTopic: "", promptTopic: "" },
    views: { title: "ज़्यादा व्यूज़ पाएँ", sub: "आपके चैनल के अनुसार सुझाव", prompt: "मेरे चैनल पर ज़्यादा व्यूज़ कैसे पाऊँ?", subTopic: "", promptTopic: "" },
    audit: { title: "चैनल ऑडिट", sub: "सुधार के लिए पूरी समीक्षा", prompt: "चैनल ऑडिट करें", subTopic: "", promptTopic: "" },
    review: { title: "मेरी नवीनतम वीडियो की समीक्षा", sub: "अपनी सामग्री पर उपयोगी प्रतिक्रिया पाएँ", prompt: "मेरी नवीनतम वीडियो की समीक्षा करें", subTopic: "", promptTopic: "" },
    script: { title: "स्क्रिप्ट लिखें", sub: "अपने विषय पर स्क्रिप्ट आज़माएँ", prompt: "वीडियो स्क्रिप्ट लिखें", subTopic: "{topic} पर स्क्रिप्ट आज़माएँ", promptTopic: "{topic} पर स्क्रिप्ट लिखें" },
    community: { title: "कम्युनिटी पोस्ट", sub: "दर्शकों से जुड़ने के लिए पोस्ट का मसौदा", prompt: "दर्शकों से जुड़ने के लिए कम्युनिटी पोस्ट का मसौदा लिखें", subTopic: "", promptTopic: "" },
  },
  ar: {
    ideas: { title: "أعطني أفكار فيديو", sub: "أفكار مخصصة حسب مجالك", prompt: "أعطني أفكار فيديو لقناتي", subTopic: "", promptTopic: "" },
    views: { title: "احصل على مشاهدات أكثر", sub: "نصائح مصممة لقناتك", prompt: "كيف أحصل على المزيد من المشاهدات لقناتي؟", subTopic: "", promptTopic: "" },
    audit: { title: "تدقيق القناة", sub: "مراجعة كاملة لما يجب تحسينه", prompt: "أجرِ تدقيق القناة", subTopic: "", promptTopic: "" },
    review: { title: "راجع أحدث فيديو لي", sub: "احصل على ملاحظات قابلة للتنفيذ عن محتواك", prompt: "راجع أحدث فيديو لي", subTopic: "", promptTopic: "" },
    script: { title: "اكتب سكربت", sub: "جرّب سكربتًا عن مجالك", prompt: "اكتب سكربت فيديو", subTopic: "جرّب سكربتًا عن {topic}", promptTopic: "اكتب سكربتًا عن {topic}" },
    community: { title: "منشور مجتمع", sub: "صياغة منشور لإشراك جمهورك", prompt: "اكتب منشور مجتمع لإشراك جمهوري", subTopic: "", promptTopic: "" },
  },
  pa: {
    ideas: { title: "ویڈیو آئیڈیاز دیو", sub: "تہاڈے موضوع مطابق ذاتی آئیڈیاز", prompt: "میرے چینل لئی ویڈیو آئیڈیاز دیو", subTopic: "", promptTopic: "" },
    views: { title: "زیادہ ویوز لوو", sub: "تہاڈے چینل مطابق مشورے", prompt: "میرے چینل تے زیادہ ویوز کیویں لواں؟", subTopic: "", promptTopic: "" },
    audit: { title: "چینل آڈٹ", sub: "بہتری لئی مکمل جائزہ", prompt: "میرے چینل دا آڈٹ کرو", subTopic: "", promptTopic: "" },
    review: { title: "میری تازہ ترین ویڈیو دا جائزہ", sub: "اپنے مواد تے قابل عمل رائے لوو", prompt: "میری تازہ ترین ویڈیو دا جائزہ لوو", subTopic: "", promptTopic: "" },
    script: { title: "اسکرپٹ لکھو", sub: "اپنے موضوع تے اسکرپٹ آزماؤ", prompt: "ویڈیو اسکرپٹ لکھو", subTopic: "{topic} بارے اسکرپٹ آزماؤ", promptTopic: "{topic} بارے اسکرپٹ لکھو" },
    community: { title: "کمیونٹی پوسٹ", sub: "ناظرین نال رابطے لئی پوسٹ دا مسودہ", prompt: "ناظرین نال رابطے لئی کمیونٹی پوسٹ دا مسودہ لکھو", subTopic: "", promptTopic: "" },
  },
  ps: {
    ideas: { title: "ما ته د ویډیو نظرونه راکړئ", sub: "ستاسو د موضوع سره سم شخصي نظرونه", prompt: "ما ته د ویډیو نظرونه راکړئ", subTopic: "", promptTopic: "" },
    views: { title: "نور لیدونه ترلاسه کړئ", sub: "ستاسو چینل ته ځانګړي لارښوونې", prompt: "زما په چینل کې نور لیدونه څنګه ترلاسه کړم؟", subTopic: "", promptTopic: "" },
    audit: { title: "د چینل پلټنه", sub: "د ښه والي لپاره بشپړه کتنه", prompt: "زما د چینل پلټنه وکړئ", subTopic: "", promptTopic: "" },
    review: { title: "زما وروستۍ ویډیو وګورئ", sub: "خپل منځپانګې په اړه د عمل وړ فیډبیک ترلاسه کړئ", prompt: "زما وروستۍ ویډیو وګورئ", subTopic: "", promptTopic: "" },
    script: { title: "سکریپټ ولیکئ", sub: "خپلې موضوع په اړه سکریپټ وازمایئ", prompt: "د ویډیو سکریپټ ولیکئ", subTopic: "د {topic} په اړه سکریپټ وازمایئ", promptTopic: "د {topic} په اړه سکریپټ ولیکئ" },
    community: { title: "د ټولنې پوسټ", sub: "د لیدونکو سره د اړیکې لپاره پوسټ مسوده", prompt: "د لیدونکو سره د اړیکې لپاره د ټولنې پوسټ مسوده ولیکئ", subTopic: "", promptTopic: "" },
  },
  bn: {
    ideas: { title: "ভিডিও আইডিয়া দিন", sub: "আপনার বিষয় অনুযায়ী ব্যক্তিগত আইডিয়া", prompt: "আমার চ্যানেলের জন্য ভিডিও আইডিয়া দিন", subTopic: "", promptTopic: "" },
    views: { title: "আরও ভিউ পান", sub: "আপনার চ্যানেলের জন্য তৈরি পরামর্শ", prompt: "আমার চ্যানেলে আরও ভিউ কীভাবে পাব?", subTopic: "", promptTopic: "" },
    audit: { title: "চ্যানেল অডিট", sub: "উন্নতির জন্য সম্পূর্ণ পর্যালোচনা", prompt: "চ্যানেল অডিট করুন", subTopic: "", promptTopic: "" },
    review: { title: "আমার সর্বশেষ ভিডিও পর্যালোচনা করুন", sub: "আপনার কনটেন্টের ওপর কার্যকর মতামত নিন", prompt: "আমার সর্বশেষ ভিডিও পর্যালোচনা করুন", subTopic: "", promptTopic: "" },
    script: { title: "স্ক্রিপ্ট লিখুন", sub: "আপনার বিষয়ে স্ক্রিপ্ট চেষ্টা করুন", prompt: "ভিডিও স্ক্রিপ্ট লিখুন", subTopic: "{topic} নিয়ে স্ক্রিপ্ট চেষ্টা করুন", promptTopic: "{topic} নিয়ে স্ক্রিপ্ট লিখুন" },
    community: { title: "কমিউনিটি পোস্ট", sub: "দর্শকদের সঙ্গে যুক্ত হতে পোস্টের খসড়া", prompt: "দর্শকদের সঙ্গে যুক্ত হতে কমিউনিটি পোস্টের খসড়া লিখুন", subTopic: "", promptTopic: "" },
  },
  tr: {
    ideas: { title: "Bana video fikirleri ver", sub: "Konunuza özel kişiselleştirilmiş fikirler", prompt: "Kanalım için video fikirleri ver", subTopic: "", promptTopic: "" },
    views: { title: "Daha fazla izlenme al", sub: "Kanalınıza özel ipuçları", prompt: "Kanalımda nasıl daha fazla izlenme alırım?", subTopic: "", promptTopic: "" },
    audit: { title: "Kanal denetimi", sub: "Neyi iyileştireceğinize dair tam inceleme", prompt: "Kanalımı denetle", subTopic: "", promptTopic: "" },
    review: { title: "Son videomu incele", sub: "İçeriğiniz hakkında uygulanabilir geri bildirim alın", prompt: "Son videomu incele", subTopic: "", promptTopic: "" },
    script: { title: "Senaryo yaz", sub: "Konunuz hakkında bir senaryo dene", prompt: "Bir video senaryosu yaz", subTopic: "{topic} hakkında bir senaryo dene", promptTopic: "{topic} hakkında bir senaryo yaz" },
    community: { title: "Topluluk gönderisi", sub: "Kitlenizle etkileşim için gönderi taslağı", prompt: "Kitlemle etkileşim için bir topluluk gönderisi taslağı yaz", subTopic: "", promptTopic: "" },
  },
  id: {
    ideas: { title: "Beri saya ide video", sub: "Ide personal berdasarkan niche Anda", prompt: "Beri saya ide video untuk channel saya", subTopic: "", promptTopic: "" },
    views: { title: "Dapatkan lebih banyak penonton", sub: "Tips yang disesuaikan dengan channel Anda", prompt: "Bagaimana cara mendapat lebih banyak penonton di channel saya?", subTopic: "", promptTopic: "" },
    audit: { title: "Audit channel", sub: "Tinjauan lengkap tentang apa yang perlu ditingkatkan", prompt: "Jalankan audit channel saya", subTopic: "", promptTopic: "" },
    review: { title: "Tinjau video terbaru saya", sub: "Dapatkan umpan balik yang bisa ditindaklanjuti untuk konten Anda", prompt: "Tinjau video terbaru saya", subTopic: "", promptTopic: "" },
    script: { title: "Tulis naskah", sub: "Coba naskah tentang niche Anda", prompt: "Tulis naskah video", subTopic: "Coba naskah tentang {topic}", promptTopic: "Tulis naskah tentang {topic}" },
    community: { title: "Postingan komunitas", sub: "Draf postingan untuk melibatkan audiens Anda", prompt: "Tulis draf postingan komunitas untuk melibatkan audiens saya", subTopic: "", promptTopic: "" },
  },
  es: {
    ideas: { title: "Dame ideas de vídeo", sub: "Ideas personalizadas según tu nicho", prompt: "Dame ideas de vídeo para mi canal", subTopic: "", promptTopic: "" },
    views: { title: "Consigue más vistas", sub: "Consejos adaptados a tu canal", prompt: "¿Cómo puedo conseguir más vistas en mi canal?", subTopic: "", promptTopic: "" },
    audit: { title: "Auditoría del canal", sub: "Una revisión completa de qué mejorar", prompt: "Haz una auditoría del canal", subTopic: "", promptTopic: "" },
    review: { title: "Revisa mi último vídeo", sub: "Obtén comentarios útiles sobre tu contenido", prompt: "Revisa mi último vídeo", subTopic: "", promptTopic: "" },
    script: { title: "Escribe un guion", sub: "Prueba un guion sobre tu nicho", prompt: "Escribe un guion de vídeo", subTopic: "Prueba un guion sobre {topic}", promptTopic: "Escribe un guion sobre {topic}" },
    community: { title: "Publicación para la comunidad", sub: "Borrador de post para conectar con tu audiencia", prompt: "Escribe un borrador de post para la comunidad para conectar con mi audiencia", subTopic: "", promptTopic: "" },
  },
  fr: {
    ideas: { title: "Donne-moi des idées de vidéo", sub: "Idées personnalisées selon votre niche", prompt: "Donne-moi des idées de vidéo pour ma chaîne", subTopic: "", promptTopic: "" },
    views: { title: "Obtenir plus de vues", sub: "Conseils adaptés à votre chaîne", prompt: "Comment obtenir plus de vues sur ma chaîne ?", subTopic: "", promptTopic: "" },
    audit: { title: "Audit de la chaîne", sub: "Un bilan complet de ce qu'il faut améliorer", prompt: "Fais un audit de la chaîne", subTopic: "", promptTopic: "" },
    review: { title: "Revois ma dernière vidéo", sub: "Obtenez des retours concrets sur votre contenu", prompt: "Revois ma dernière vidéo", subTopic: "", promptTopic: "" },
    script: { title: "Écris un script", sub: "Essaie un script sur votre niche", prompt: "Écris un script vidéo", subTopic: "Essaie un script sur {topic}", promptTopic: "Écris un script sur {topic}" },
    community: { title: "Publication communautaire", sub: "Brouillon de post pour engager votre audience", prompt: "Écris un brouillon de post pour la communauté pour engager mon audience", subTopic: "", promptTopic: "" },
  },
  de: {
    ideas: { title: "Gib mir Videoideen", sub: "Personalisierte Ideen passend zu deiner Nische", prompt: "Gib mir Videoideen für meinen Kanal", subTopic: "", promptTopic: "" },
    views: { title: "Mehr Aufrufe bekommen", sub: "Tipps, zugeschnitten auf deinen Kanal", prompt: "Wie bekomme ich mehr Aufrufe auf meinem Kanal?", subTopic: "", promptTopic: "" },
    audit: { title: "Kanal-Audit", sub: "Eine vollständige Prüfung, was zu verbessern ist", prompt: "Mach ein Kanal-Audit für meinen Kanal", subTopic: "", promptTopic: "" },
    review: { title: "Bewerte mein neuestes Video", sub: "Erhalte umsetzbares Feedback zu deinen Inhalten", prompt: "Bewerte mein neuestes Video", subTopic: "", promptTopic: "" },
    script: { title: "Schreib ein Skript", sub: "Probier ein Skript über deine Nische", prompt: "Schreib ein Skript", subTopic: "Probier ein Skript über {topic}", promptTopic: "Schreib ein Skript über {topic}" },
    community: { title: "Community-Beitrag", sub: "Entwurf für einen Beitrag, um dein Publikum einzubinden", prompt: "Schreib einen Community-Post, um mein Publikum einzubinden", subTopic: "", promptTopic: "" },
  },
  pt: {
    ideas: { title: "Me dê ideias de vídeo", sub: "Ideias personalizadas com base no seu nicho", prompt: "Me dê ideias de vídeo para o meu canal", subTopic: "", promptTopic: "" },
    views: { title: "Consiga mais visualizações", sub: "Dicas adaptadas ao seu canal", prompt: "Como posso conseguir mais visualizações no meu canal?", subTopic: "", promptTopic: "" },
    audit: { title: "Auditoria do canal", sub: "Uma revisão completa do que melhorar", prompt: "Faça uma auditoria do canal", subTopic: "", promptTopic: "" },
    review: { title: "Revise meu vídeo mais recente", sub: "Obtenha feedback útil sobre o seu conteúdo", prompt: "Revise meu vídeo mais recente", subTopic: "", promptTopic: "" },
    script: { title: "Escreva um roteiro", sub: "Experimente um roteiro sobre o seu nicho", prompt: "Escreva um roteiro de vídeo", subTopic: "Experimente um roteiro sobre {topic}", promptTopic: "Escreva um roteiro sobre {topic}" },
    community: { title: "Post para a comunidade", sub: "Rascunho de post para engajar a sua audiência", prompt: "Escreva um rascunho de post para a comunidade para engajar a minha audiência", subTopic: "", promptTopic: "" },
  },
  ru: {
    ideas: { title: "Дай идеи для видео", sub: "Персональные идеи по вашей нише", prompt: "Дай идеи для видео для моего канала", subTopic: "", promptTopic: "" },
    views: { title: "Получить больше просмотров", sub: "Советы под ваш канал", prompt: "Как получить больше просмотров на моём канале?", subTopic: "", promptTopic: "" },
    audit: { title: "Аудит канала", sub: "Полный обзор того, что улучшить", prompt: "Проведи аудит канала", subTopic: "", promptTopic: "" },
    review: { title: "Оцени моё последнее видео", sub: "Получите практичную обратную связь о своём контенте", prompt: "Оцени мое последнее видео", subTopic: "", promptTopic: "" },
    script: { title: "Напиши сценарий", sub: "Попробуй сценарий о вашей нише", prompt: "Напиши сценарий видео", subTopic: "Попробуй сценарий о {topic}", promptTopic: "Напиши сценарий о {topic}" },
    community: { title: "Пост для сообщества", sub: "Черновик поста для вовлечения аудитории", prompt: "Напиши пост для сообщества, чтобы вовлечь мою аудиторию", subTopic: "", promptTopic: "" },
  },
};

export function cardText(
  lang: AssistantLang,
  id: CardId
): CardStrings {
  return CARD_TEXT[lang]?.[id] ?? CARD_TEXT.en[id];
}
