// Minimal EN/UR dictionary for the interface chrome (nav, buttons, headings).
// Page content stays in English in v1; the switch translates the chrome and
// flips direction to RTL for Urdu. Full content translation is v1.1.
export type Lang = "en" | "ur";

export const STRINGS: Record<string, { en: string; ur: string }> = {
  home: { en: "Home", ur: "ہوم" },
  generate: { en: "Generate", ur: "بنائیں" },
  research: { en: "Research", ur: "ریسرچ" },
  optimize: { en: "Optimize", ur: "بہتر بنائیں" },
  thumbnails: { en: "Thumbnails", ur: "تھمبنیل" },
  plans: { en: "Plans", ur: "پلانز" },
  academy: { en: "Academy", ur: "اکیڈمی" },
  settings: { en: "Settings", ur: "سیٹنگز" },
  signIn: { en: "Sign in with Google", ur: "گوگل سے سائن ان کریں" },
  signOut: { en: "Sign out", ur: "سائن آؤٹ" },
  dashboard: { en: "Dashboard", ur: "ڈیش بورڈ" },
  tagline: { en: "YouTube SEO & Growth Tool", ur: "یوٹیوب ایس ای او اور گروتھ ٹول" },
};

export function t(key: string, lang: Lang): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[lang] ?? entry.en;
}

export function getSavedLang(): Lang {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem("nizafa-lang") as Lang) || "en";
}

export function setSavedLang(lang: Lang) {
  localStorage.setItem("nizafa-lang", lang);
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
}
