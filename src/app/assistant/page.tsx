"use client";

import { useRef, useState } from "react";
import { SectionTitle } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; grounded?: boolean };

const SUGGESTIONS = [
  "How do I write better titles?",
  "How is my channel doing?",
  "What makes a good thumbnail?",
  "When should I post my videos?",
  "How do I grow my subscribers?",
  "بہتر ٹائٹل کیسے لکھوں؟",
];

export default function AssistantPage() {
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

  return (
    <>
      <section className="hero">
        <div className="kicker">Nizafa Assistant</div>
        <h1>Ask about growing your channel</h1>
        <p className="muted">
          Answers in your language — English or Urdu. When your question is
          about your own channel, the answer is built from your real channel
          data. Sign in to keep your chat history.
        </p>
      </section>

      <section className="section">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            ref={listRef}
            style={{ maxHeight: "52vh", overflowY: "auto", padding: 16, display: "grid", gap: 12, alignContent: "start" }}
          >
            {messages.length === 0 ? (
              <div>
                <p className="muted" style={{ marginBottom: 12 }}>
                  Try one of these, or ask anything about titles, tags,
                  thumbnails, posting times, Shorts and watch time.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: m.role === "user" ? "var(--teal-700)" : "var(--surface-2)",
                      color: m.role === "user" ? "#fff" : "var(--ink)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.content}
                    {m.grounded ? (
                      <div
                        className="small"
                        style={{ marginTop: 6, color: m.role === "user" ? "#ffe9a8" : "var(--teal-600)", fontWeight: 700 }}
                      >
                        ✓ Answered from your channel data
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {busy ? <p className="small muted">Thinking…</p> : null}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)" }}
          >
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask in English or اردو…"
              aria-label="Your question"
              maxLength={1000}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </div>
        {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
        <p className="small muted" style={{ marginTop: 12 }}>
          The Assistant answers from a curated YouTube-growth playbook and
          your connected channel data. It does not invent view counts or
          subscribers — if your channel is not connected, it says so.
        </p>
      </section>

      <section className="section">
        <SectionTitle title="What the Assistant knows" sub="Original guidance written for Nizafa creators." />
        <div className="grid grid-3">
          {[
            ["Titles & hooks", "Write titles people click, and openings that earn the click."],
            ["Tags & descriptions", "Help YouTube understand a video — without keyword stuffing."],
            ["Thumbnails & CTR", "One-second readability, and what a low click-through rate really means."],
            ["Posting times", "Your own upload history, not a generic “best time”."],
            ["Shorts & growth", "Discovery with Shorts, subscribers with long videos."],
            ["Your channel", "Subscribers, views and your best video — from your real data."],
          ].map(([t, b]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
