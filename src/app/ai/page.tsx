import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nizafa.ai — AI Assistant for Pakistan",
  description:
    "Nizafa.ai is a ChatGPT-style AI assistant made in Pakistan. Chat in Urdu, English, Roman Urdu or Pashto, research the live web, make pictures, and keep your chats saved. Free — 50 messages a day.",
};

const FEATURES: Array<{ icon: string; title: string; text: string }> = [
  {
    icon: "💬",
    title: "Chat in your language",
    text: "Urdu, English, Roman Urdu or Pashto — ask in any language and the answer comes back in the same one. No language setting to change.",
  },
  {
    icon: "🌐",
    title: "Live web research",
    text: "Ask about today and get fresh answers from the live web, with sources — not just what the model remembers.",
  },
  {
    icon: "🔬",
    title: "Deep research",
    text: "For bigger questions: several sources checked at once and a thorough, sourced answer.",
  },
  {
    icon: "🎨",
    title: "Draw a picture",
    text: "Say it in plain words and get a picture made right in the chat — no separate tool needed.",
  },
  {
    icon: "🎙️",
    title: "Voice & Call",
    text: "Speak instead of typing, hear replies read aloud, or talk hands-free like a phone call.",
  },
  {
    icon: "🖼️",
    title: "Photo & file questions",
    text: "Send a photo or a text file and ask about it — the answer uses what is actually in it.",
  },
  {
    icon: "💾",
    title: "Chats saved, yours to delete",
    text: "Every chat is saved to your account. Open any old chat, or delete one whenever you want.",
  },
  {
    icon: "⚡",
    title: "Fast replies",
    text: "Answers stream in as they are written — no long waiting staring at a blank screen.",
  },
];

export default function AiLandingPage() {
  return (
    <div>
      <section
        style={{
          textAlign: "center",
          padding: "56px 8px 32px",
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1 }} aria-hidden>
          🤖
        </div>
        <h1 style={{ fontSize: "2.4rem", margin: "12px 0 8px" }}>Nizafa.ai</h1>
        <p style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>
          A ChatGPT-style AI assistant, made in Pakistan.
        </p>
        <p
          style={{
            fontSize: "1.05rem",
            color: "var(--muted)",
            maxWidth: 560,
            margin: "0 auto 24px",
          }}
        >
          کسی بھی زبان میں پوچھیں — جواب اسی زبان میں ملے گا۔ Ask in Urdu,
          English, Roman Urdu or Pashto. Free — 50 messages a day, no card
          needed.
        </p>
        <div
          style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}
        >
          <Link
            href="/ai/chat"
            className="btn btn-primary"
            style={{ fontSize: "1.1rem", padding: "12px 28px" }}
          >
            Start chatting →
          </Link>
          <Link href="/plans" className="btn" style={{ padding: "12px 20px" }}>
            See plans
          </Link>
        </div>
        <p style={{ marginTop: 16, color: "var(--muted)", fontSize: "0.95rem" }}>
          Sign in with Google to start. Your chats stay yours — saved to your
          account, deletable any time.
        </p>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card"
            style={{ padding: 20, borderRadius: "var(--radius)" }}
          >
            <div style={{ fontSize: 28 }} aria-hidden>
              {f.icon}
            </div>
            <h3 style={{ margin: "8px 0 4px" }}>{f.title}</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>{f.text}</p>
          </div>
        ))}
      </section>

      <section
        className="card"
        style={{ padding: 24, borderRadius: "var(--radius)", marginBottom: 32 }}
      >
        <h2 style={{ marginTop: 0 }}>How it works</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            <strong>Sign in with Google</strong> — one tap, no password to
            remember.
          </li>
          <li>
            <strong>Ask anything</strong> — write, speak, or send a photo or
            file.
          </li>
          <li>
            <strong>Your chats are saved</strong> — reopen any chat later, or
            delete it whenever you want.
          </li>
        </ol>
        <p style={{ marginBottom: 0, color: "var(--muted)" }}>
          Free plan: 50 messages a day, and the remaining count is always
          visible in the chat. Nizafa.ai can make mistakes — check important
          answers.
        </p>
      </section>
    </div>
  );
}
