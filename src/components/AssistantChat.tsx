"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string; grounded?: boolean };

export type AssistantCard = {
  icon: "bulb" | "trend" | "eye" | "video" | "doc" | "chat";
  title: string;
  sub: string;
  prompt: string;
};

function CardIcon({ icon }: { icon: AssistantCard["icon"] }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (icon) {
    case "bulb":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="13" height="12" rx="2" />
          <path d="M15 10l7-3v10l-7-3" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      );
  }
}

export default function AssistantChat({
  greetingName,
  channelTitle,
  channelAvatar,
  cards,
}: {
  greetingName: string | null;
  channelTitle: string | null;
  channelAvatar: string | null;
  cards: AssistantCard[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });
      const data = (await res.json()) as {
        answer?: string;
        grounded?: boolean;
        conversationId?: number;
        error?: string;
      };
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? "The Assistant could not answer right now.");
      }
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.answer,
          grounded: data.grounded,
        },
      ]);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(next);
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setMessages([]);
    setInput("");
    setError(null);
    setConversationId(null);
  }

  const empty = messages.length === 0;

  return (
    <div className="asst-wrap">
      {channelTitle ? (
        <div className="asst-top">
          <Link href="/" className="asst-channel-pill" aria-label="Back to Home">
            {channelAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channelAvatar} alt="" width={28} height={28} className="asst-channel-avatar" />
            ) : (
              <span className="asst-channel-avatar asst-channel-avatar-fallback">
                {channelTitle.slice(0, 1)}
              </span>
            )}
            <span>{channelTitle}</span>
            <span aria-hidden="true">▾</span>
          </Link>
          {empty ? null : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={newChat}>
              New chat
            </button>
          )}
        </div>
      ) : null}

      {empty ? (
        <div className="asst-empty">
          <div className="asst-orb" aria-hidden="true" />
          <h1 className="asst-greeting">
            {greetingName ? `Let's create, ${greetingName}` : "Let's create"}
          </h1>
          <p className="muted asst-sub">
            Ask the Assistant — answers come from your real channel data and
            Nizafa's growth playbook, in English or اردو.
          </p>
          <div className="asst-rail" role="list" aria-label="Things to try">
            {cards.map((c) => (
              <button
                key={c.title}
                type="button"
                role="listitem"
                className="asst-card"
                onClick={() => send(c.prompt)}
                disabled={busy}
              >
                <span className="asst-card-icon">
                  <CardIcon icon={c.icon} />
                </span>
                <span className="asst-card-title">{c.title}</span>
                <span className="asst-card-sub">{c.sub}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="asst-chat">
          <div ref={listRef} className="asst-messages">
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  className={
                    m.role === "user" ? "asst-msg asst-msg-user" : "asst-msg asst-msg-ai"
                  }
                >
                  {m.content}
                  {m.grounded ? (
                    <div className="small asst-grounded">
                      ✓ Answered from your channel data
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? <p className="small muted">Thinking…</p> : null}
          </div>
        </div>
      )}

      <form
        className="asst-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="input asst-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="How can I help you grow?"
          aria-label="Your question"
          maxLength={1000}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
      <p className="small muted" style={{ marginTop: 12 }}>
        The Assistant answers from a curated YouTube-growth playbook and your
        connected channel data. It does not invent view counts or subscribers
        — if your channel is not connected, it says so.
      </p>
    </div>
  );
}
