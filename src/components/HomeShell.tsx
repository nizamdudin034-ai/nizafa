// Home shell — mobile-app style header for the Home dashboard only.
// Hamburger drawer + channel picker, in the style the user asked for
// (dark cards, big numbers, pill buttons). All labels and links are
// Nizafa's own. Daily Ideas shipped 16 Nov 2026 (user-approved, 4/day)
// and its drawer entry links to /ideas.
"use client";

import Link from "next/link";
import { useState } from "react";

export type ShellChannel = {
  id: number;
  title: string;
  avatarUrl: string | null;
};

const MAIN_LINKS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/optimize", label: "Optimize", icon: "↗" },
  { href: "/assistant", label: "New Chat", icon: "✎" },
  { href: "/research", label: "Research", icon: "⌕" },
  { href: "/plans", label: "Upgrade", icon: "🚀", accent: true },
];

const MORE_LINKS: Array<{ href: string; label: string; icon: string; soon?: boolean }> = [
  { href: "/ideas", label: "Daily Ideas", icon: "💡" },
  { href: "/competitors", label: "Competitors", icon: "◉" },
  { href: "/subscribers", label: "Subscribers", icon: "👥" },
  { href: "/learn", label: "Learn", icon: "🎓" },
  { href: "/create", label: "Create", icon: "✒" },
  { href: "/thumbnails", label: "Thumbnails", icon: "▣" },
  { href: "/generate", label: "Generate", icon: "✦" },
];

export default function HomeShell({
  channels,
  selectedId,
  email,
}: {
  channels: ShellChannel[];
  selectedId: number | null;
  email: string | null;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = channels.find((c) => c.id === selectedId) ?? channels[0] ?? null;

  return (
    <>
      <div className="home-topbar">
        <button
          type="button"
          className="icon-btn home-menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="channel-picker">
          <button
            type="button"
            className="channel-picker-btn"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
          >
            {selected?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.avatarUrl} alt="" width={28} height={28} />
            ) : (
              <span className="channel-picker-fallback">
                {selected ? selected.title.charAt(0) : "N"}
              </span>
            )}
            <span className="channel-picker-name">
              {selected ? selected.title : "Connect a channel"}
            </span>
            <span aria-hidden>⌄</span>
          </button>
          {pickerOpen && channels.length > 1 ? (
            <div className="channel-picker-menu">
              {channels.map((c) => (
                <Link
                  key={c.id}
                  href={`/?channel=${c.id}`}
                  onClick={() => setPickerOpen(false)}
                  className={c.id === selected?.id ? "active" : ""}
                >
                  {c.title}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {drawerOpen ? (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu"
          >
            <div className="drawer-head">
              <span className="brand">
                <span className="brand-mark" aria-hidden />
                <span>
                  Nizafa
                  <small>YouTube SEO &amp; Growth Tool</small>
                </span>
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="drawer-nav">
              {MAIN_LINKS.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  onClick={() => setDrawerOpen(false)}
                  className={l.accent ? "drawer-link accent" : "drawer-link"}
                >
                  <span className="drawer-icon" aria-hidden>{l.icon}</span>
                  {l.label}
                </Link>
              ))}
              <div className="drawer-section">More tools</div>
              {MORE_LINKS.map((l) =>
                l.soon ? (
                  <span key={l.label} className="drawer-link disabled" title="Coming soon">
                    <span className="drawer-icon" aria-hidden>{l.icon}</span>
                    {l.label}
                    <span className="badge" style={{ marginInlineStart: "auto" }}>Soon</span>
                  </span>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setDrawerOpen(false)}
                    className="drawer-link"
                  >
                    <span className="drawer-icon" aria-hidden>{l.icon}</span>
                    {l.label}
                  </Link>
                )
              )}
            </nav>
            <div className="drawer-foot">
              {email ? (
                <>
                  <span className="drawer-email">{email}</span>
                  <span className="badge badge-teal">Free plan</span>
                </>
              ) : (
                <span className="muted small">Sign in to save your packs and channels.</span>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <Link href="/assistant" className="coach-pill">
        <span className="coach-dot" aria-hidden />
        Ask AI Coach
      </Link>
    </>
  );
}
