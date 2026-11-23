"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getSavedLang, setSavedLang, t, type Lang } from "@/lib/i18n";

const LINKS = [
  { href: "/", key: "home" },
  { href: "https://nizafa-ai.netlify.app/ai", key: "ai" },
  { href: "/generate", key: "generate" },
  { href: "/create", key: "create" },
  { href: "/research", key: "research" },
  { href: "/optimize", key: "optimize" },
  { href: "/competitors", key: "competitors" },
  { href: "/subscribers", key: "subscribers" },
  { href: "/learn", key: "learn" },
  { href: "/thumbnails", key: "thumbnails" },
  { href: "/plans", key: "plans" },
];

const BOTTOM_LINKS = [
  { href: "/", key: "home", icon: "⌂" },
  { href: "https://nizafa-ai.netlify.app/ai", key: "ai", icon: "✦" },
  { href: "/optimize", key: "optimize", icon: "↗" },
  { href: "/research", key: "research", icon: "⌕" },
  { href: "/thumbnails", key: "thumbnails", icon: "▣" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [lang, setLang] = useState<Lang>("en");
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light"
    );
    setLang(getSavedLang());
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled) setEmail(user?.email ?? null);
      } catch {
        // Supabase not configured yet — nav still works.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("nizafa-theme", next);
  }

  function toggleLang() {
    const next: Lang = lang === "en" ? "ur" : "en";
    setLang(next);
    setSavedLang(next);
  }

  async function signIn() {
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // Sign-in only: basic profile scopes. No YouTube scope here —
          // channel connect is a separate, owner-only step (see /settings).
          scopes: "openid email profile",
        },
      });
      if (error) alert(`Sign-in failed: ${error.message}`);
    } catch (e) {
      alert("Sign-in is not configured yet. Ask the owner to enable Google sign-in in Supabase.");
    }
  }

  async function signOut() {
    try {
      const supabase = createSupabaseBrowser();
      await supabase.auth.signOut();
    } finally {
      setEmail(null);
      router.refresh();
    }
  }

  return (
    <>
      <header className="topnav">
        <div className="topnav-inner">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden />
            <span>
              Nizafa
              <small>{t("tagline", lang)}</small>
            </span>
          </Link>
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href ? "active" : ""}
              >
                {t(l.key, lang)}
              </Link>
            ))}
          </nav>
          <div className="nav-right">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleLang}
              title="English / اردو"
            >
              {lang === "en" ? "اردو" : "EN"}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {ready && email ? (
              <>
                <span className="small muted" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
                  {t("signOut", lang)}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={signIn}>
                {t("signIn", lang)}
              </button>
            )}
          </div>
        </div>
      </header>
      <nav className="bottomnav" aria-label="Main mobile">
        {BOTTOM_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "active" : ""}
          >
            <span style={{ display: "block", fontSize: 17, lineHeight: 1.2 }}>{l.icon}</span>
            {t(l.key, lang)}
          </Link>
        ))}
      </nav>
    </>
  );
}
