"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  SUPPORTED_LANGS,
  cardText,
  fill,
  isAssistantLang,
  langInfo,
  uiText,
  type AssistantLang,
  type CardId,
} from "@/lib/assistant-i18n";

type Msg = { role: "user" | "assistant"; content: string; grounded?: boolean };

const CARD_IDS: CardId[] = ["ideas", "views", "audit", "review", "script", "community"];
const LANG_STORAGE_KEY = "nizafa-assistant-lang";

function CardIcon({ icon }: { icon: CardId }) {
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
    case "ideas":
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
        </svg>
      );
    case "views":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "review":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="13" height="12" rx="2" />
          <path d="M15 10l7-3v10l-7-3" />
        </svg>
      );
    case "script":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      );
    case "community":
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
  scriptTopic,
}: {
  greetingName: string | null;
  channelTitle: string | null;
  channelAvatar: string | null;
  scriptTopic: string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [lang, setLangState] = useState<AssistantLang>("en");
  const listRef = useRef<HTMLDivElement>(null);

  // Restore the language the user last used in this chat (the server
  // also remembers it from chat history for signed-in users).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && isAssistantLang(saved)) setLangState(saved);
    } catch {
      // Private mode etc. — English default is fine.
    }
  }, []);

  function setLang(next: AssistantLang) {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Non-fatal.
    }
  }

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
        body: JSON.stringify({ message, conversationId, lang }),
      });
      const data = (await res.json()) as {
        answer?: string;
        lang?: string;
        grounded?: boolean;
        conversationId?: number;
        error?: string;
      };
      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? uiText(lang, "errorGeneric"));
      }
      if (data.conversationId) setConversationId(data.conversationId);
      // The server answers in the language the message was asked in —
      // reflect a mid-chat switch in the selector immediately.
      if (data.lang && isAssistantLang(data.lang)) setLang(data.lang);
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
      setError(e instanceof Error ? e.message : uiText(lang, "errorGeneric"));
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
  const rtl = langInfo(lang).rtl;
  const greeting = greetingName
    ? fill(uiText(lang, "greeting"), { name: greetingName })
    : uiText(lang, "greetingPlain");

  return (
    <div className="asst-wrap" dir={rtl ? "rtl" : "ltr"}>
      <div className="asst-top">
        {channelTitle ? (
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
        ) : (
          <span />
        )}
        <span className="asst-top-right">
          <label className="asst-lang-label" htmlFor="asst-lang">
            {uiText(lang, "langLabel")}
          </label>
          <select
            id="asst-lang"
            className="input asst-lang-select"
            value={lang}
            onChange={(e) => {
              if (isAssistantLang(e.target.value)) setLang(e.target.value);
            }}
            aria-label={uiText(lang, "langLabel")}
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
          {empty ? null : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={newChat}>
              {uiText(lang, "newChat")}
            </button>
          )}
        </span>
      </div>

      {empty ? (
        <div className="asst-empty">
          <div className="asst-orb" aria-hidden="true" />
          <h1 className="asst-greeting">{greeting}</h1>
          <p className="muted asst-sub">{uiText(lang, "greetingSub")}</p>
          <div className="asst-rail" role="list" aria-label="Things to try">
            {CARD_IDS.map((id) => {
              const c = cardText(lang, id);
              const sub =
                id === "script" && scriptTopic
                  ? fill(c.subTopic, { topic: scriptTopic })
                  : c.sub;
              const prompt =
                id === "script" && scriptTopic
                  ? fill(c.promptTopic, { topic: scriptTopic })
                  : c.prompt;
              return (
                <button
                  key={id}
                  type="button"
                  role="listitem"
                  className="asst-card"
                  onClick={() => send(prompt)}
                  disabled={busy}
                >
                  <span className="asst-card-icon">
                    <CardIcon icon={id} />
                  </span>
                  <span className="asst-card-title">{c.title}</span>
                  <span className="asst-card-sub">{sub}</span>
                </button>
              );
            })}
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
                      {uiText(lang, "groundedNote")}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? <p className="small muted">{uiText(lang, "thinking")}</p> : null}
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
          placeholder={uiText(lang, "placeholder")}
          aria-label={uiText(lang, "placeholder")}
          maxLength={1000}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          {uiText(lang, "send")}
        </button>
      </form>
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
      <p className="small muted" style={{ marginTop: 12 }}>
        {uiText(lang, "disclaimer")}
      </p>
    </div>
  );
}
