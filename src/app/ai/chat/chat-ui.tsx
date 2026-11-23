"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createSupabaseBrowser } from "@/lib/supabase";
import styles from "./chat-ui.module.css";

type Conv = { id: number; title: string; updated_at: string };
type Msg = { id?: number; role: "user" | "assistant"; content: string };
type Mode = "chat" | "image" | "research" | "deep";
type Attach =
  | { kind: "image"; dataUrl: string; name: string }
  | { kind: "file"; text: string; name: string };

const MODE_LABEL: Record<Exclude<Mode, "chat">, string> = {
  image: "Draw a picture",
  research: "Live web research",
  deep: "Deep research",
};

// ── Sign-in screen (shown when logged out) ──────────────────────────────────

export function AiSignIn() {
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowser();
      // Remember where to return after sign-in (read by /auth/callback).
      document.cookie =
        "nizafa-next=/ai/chat; path=/; max-age=600; SameSite=Lax";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // NOTE: redirectTo must EXACTLY match an allowed URL in Supabase
          // Auth settings (https://nizafa-ai.netlify.app/auth/callback).
          // An extra ?next= query param makes Supabase reject it and fall
          // back to the Site URL (the SEO site) with ?code= — the user
          // lands on the wrong site, signed out. The return destination
          // travels in the nizafa-next cookie instead.
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "openid email profile",
        },
      });
      if (error) alert(`Sign-in failed: ${error.message}`);
    } catch {
      alert("Sign-in is not configured yet.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.signin}>
      <div style={{ fontSize: 48 }} aria-hidden>
        🤖
      </div>
      <h1>Nizafa.ai</h1>
      <p>Sign in with Google to start chatting. Free — 50 messages a day.</p>
      <p style={{ color: "var(--muted)" }}>
        کسی بھی زبان میں پوچھیں — جواب اسی زبان میں ملے گا۔
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={signIn}
        disabled={busy}
        style={{ fontSize: "1.05rem", padding: "12px 24px" }}
      >
        {busy ? "Please wait…" : "Continue with Google"}
      </button>
    </div>
  );
}

// ── Tiny safe markdown renderer (images, links, bold) ──────────────────────

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Split on **bold** first, then links inside each part.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>;
    }
    const linkParts = part.split(/(\[[^\]]+\]\([^)\s]+\))/g);
    return (
      <span key={`${keyPrefix}-s${i}`}>
        {linkParts.map((lp, j) => {
          const m = lp.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
          if (m) {
            return (
              <a key={j} href={m[2]} target="_blank" rel="noreferrer">
                {m[1]}
              </a>
            );
          }
          return <span key={j}>{lp}</span>;
        })}
      </span>
    );
  });
}

function renderContent(content: string): ReactNode {
  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (img) {
          return (
            <span key={i} className={styles.msgImage}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img[2]} alt={img[1] || "Generated image"} />
            </span>
          );
        }
        if (!line.trim()) return <span key={i} className={styles.msgBreak} />;
        return (
          <span key={i} className={styles.msgLine}>
            {renderInline(line, `l${i}`)}
          </span>
        );
      })}
    </>
  );
}

// ── Speech helpers ──────────────────────────────────────────────────────────

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function detectInputLang(text: string): string {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/.test(text) ? "ur-PK" : "en-US";
}

// Downscale a photo client-side so the upload stays small and fast.
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the photo."));
      img.onload = () => {
        const max = 1024;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Main chat UI ────────────────────────────────────────────────────────────

export default function ChatUI({ email }: { email: string | undefined }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [attach, setAttach] = useState<Attach | null>(null);
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [callOn, setCallOn] = useState(false);
  const [search, setSearch] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const callOnRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations: Conv[];
        remaining: number;
      };
      setConvs(data.conversations ?? []);
      setRemaining(data.remaining);
    } catch {
      // offline — chats stay local-only until reconnect
    }
  }, []);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    callOnRef.current = callOn;
    if (!callOn && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      try {
        recRef.current?.stop();
      } catch {
        // already stopped
      }
      setListening(false);
    }
  }, [callOn]);

  async function openConv(id: number) {
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/ai/conversations?id=${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: Msg[] };
      setMessages(data.messages ?? []);
    } catch {
      // keep current messages on failure
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setMode("chat");
    setAttach(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function deleteConv(id: number) {
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    await fetch(`/api/ai/conversations?id=${id}`, { method: "DELETE" });
    setConvs((c) => c.filter((x) => x.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/!\[.*?\]\(.*?\)/g, "").trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean.slice(0, 1000));
    u.lang = detectInputLang(clean);
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang?.toLowerCase().startsWith(u.lang.slice(0, 2)));
    if (match) u.voice = match;
    u.onend = () => {
      if (callOnRef.current) startListening();
    };
    window.speechSynthesis.speak(u);
  }

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) {
      alert("Voice typing is not supported in this browser. Please type instead.");
      return;
    }
    try {
      recRef.current?.stop();
    } catch {
      // ignore
    }
    const rec = new SR();
    rec.lang = detectInputLang(input);
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = e.results[e.results.length - 1]?.[0]?.transcript ?? "";
      if (transcript) setInput(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (callOnRef.current && inputRef.current?.value?.trim()) {
        // In a call, send what was heard once listening stops.
        sendRef.current?.();
      }
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (sending) return;
    if (!text && !attach) return;
    if (remaining !== null && remaining <= 0) {
      alert("Daily limit reached — 50 messages a day on the free plan. Come back tomorrow.");
      return;
    }
    const userText = text || (attach?.kind === "image" ? "📷 Photo" : "📎 File");
    const currentMode = mode;
    const currentAttach = attach;
    setInput("");
    setAttach(null);
    setMode("chat");
    setPlusOpen(false);
    setPluginsOpen(false);
    setSending(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: userText },
      { role: "assistant", content: "" },
    ]);
    // The reply endpoint is occasionally slow (free AI service + platform
    // limits) — retry once automatically when nothing came back at all.
    let lastError: string | null = null;
    let noRetry = false;
    let succeeded = false;
    for (let attempt = 1; attempt <= 2 && !succeeded; attempt++) {
      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, 1500));
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: "" };
          return copy;
        });
      }
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeId ?? undefined,
            message: text,
            mode: currentMode,
            imageDataUrl: currentAttach?.kind === "image" ? currentAttach.dataUrl : undefined,
            fileText: currentAttach?.kind === "file" ? currentAttach.text : undefined,
            fileName: currentAttach?.name,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          lastError = data.error ?? "Something went wrong. Please try again.";
          if (res.status === 400 || res.status === 429) noRetry = true;
          if (res.status === 401) window.location.reload();
          throw new Error(lastError);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");
        const decoder = new TextDecoder();
        let buf = "";
        let full = "";
        let doneId: number | null = null;
        let streamFailed = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            for (const line of part.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              try {
                const evt = JSON.parse(t.slice(5).trim()) as {
                  delta?: string;
                  done?: boolean;
                  conversationId?: number;
                  remaining?: number;
                  error?: string;
                };
                if (typeof evt.delta === "string") {
                  full += evt.delta;
                  setMessages((m) => {
                    const copy = [...m];
                    copy[copy.length - 1] = { role: "assistant", content: full };
                    return copy;
                  });
                }
                if (evt.error) {
                  lastError = evt.error;
                  if (!full.trim()) streamFailed = true;
                  else {
                    setMessages((m) => {
                      const copy = [...m];
                      copy[copy.length - 1] = { role: "assistant", content: evt.error as string };
                      return copy;
                    });
                  }
                }
                if (evt.done) {
                  doneId = evt.conversationId ?? null;
                  if (typeof evt.remaining === "number") setRemaining(evt.remaining);
                }
              } catch {
                // ignore partial JSON
              }
            }
          }
          if (streamFailed) break;
        }
        if (streamFailed) throw new Error(lastError ?? "Stream failed");
        if (doneId) {
          setActiveId(doneId);
          loadConvs();
        }
        if (callOnRef.current && full.trim()) speak(full);
        succeeded = true;
      } catch {
        if (attempt >= 2 || noRetry) {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              content:
                lastError ??
                "The reply could not finish. Please check your connection and try again.",
            };
            return copy;
          });
        }
        // otherwise the loop retries once automatically
      }
    }
    setSending(false);
  }

  const sendRef = useRef(send);
  sendRef.current = send;

  async function onPickFile(file: File | undefined, kind: "camera" | "photo" | "file") {
    if (!file) return;
    if (kind === "file") {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        alert("PDF reading is coming soon — for now, please paste the text you want to ask about.");
        return;
      }
      if (!/\.(txt|md|csv|json|log)$/i.test(file.name)) {
        alert("Please pick a text file (.txt, .md, .csv or .json).");
        return;
      }
      const text = await file.text();
      setAttach({ kind: "file", text: text.slice(0, 8000), name: file.name });
      return;
    }
    try {
      const dataUrl = await downscaleImage(file);
      setAttach({ kind: "image", dataUrl, name: file.name });
    } catch {
      alert("Could not read that photo. Please try another one.");
    }
  }

  const filtered = convs.filter((c) =>
    c.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className={styles.wrap}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <button type="button" className="btn btn-primary" onClick={newChat}>
          ✎ New chat
        </button>
        <input
          className={styles.search}
          type="search"
          placeholder="Search chats…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.convList}>
          {filtered.length === 0 && (
            <p className={styles.empty}>No chats yet. Start a new one.</p>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`${styles.convItem} ${c.id === activeId ? styles.convActive : ""}`}
            >
              <button type="button" onClick={() => openConv(c.id)} className={styles.convTitle}>
                {c.title}
              </button>
              <button
                type="button"
                className={styles.convDelete}
                title="Delete chat"
                onClick={() => deleteConv(c.id)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
        <div className={styles.planFooter}>
          <div>Free plan</div>
          <div>
            {remaining === null ? "…" : `${remaining} of 50 messages left today`}
          </div>
          <div className={styles.userEmail}>{email}</div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className={styles.backdrop}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column */}
      <section className={styles.main}>
        <header className={styles.chatHeader}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setSidebarOpen(true)}
            title="Chats"
          >
            ☰
          </button>
          <strong>Nizafa.ai</strong>
          <span className={styles.headerHint}>replies in your language</span>
          <button
            type="button"
            className={`${styles.callBtn} ${callOn ? styles.callOn : ""}`}
            onClick={() => setCallOn((v) => !v)}
            title={callOn ? "End call" : "Call — talk hands-free"}
          >
            📞 {callOn ? "End call" : "Call"}
          </button>
        </header>

        <div className={styles.messages} ref={scrollRef}>
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <div style={{ fontSize: 44 }} aria-hidden>
                🤖
              </div>
              <h2>Good to see you</h2>
              <p>Ask anything — in Urdu, English, Roman Urdu or Pashto.</p>
              <p style={{ color: "var(--muted)" }}>
                کسی بھی زبان میں پوچھیں — جواب اسی زبان میں ملے گا۔
              </p>
              <div className={styles.suggestions}>
                {[
                  "What can you do?",
                  "آج کی تازہ خبریں بتاؤ",
                  "Mujhe aik kahani likh do",
                  "Explain photosynthesis simply",
                ].map((s) => (
                  <button key={s} type="button" onClick={() => setInput(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.msg} ${m.role === "user" ? styles.msgUser : styles.msgAi}`}
            >
              {m.role === "assistant" && m.content === "" ? (
                <span className={styles.typing} aria-label="Thinking">
                  <span>•</span>
                  <span>•</span>
                  <span>•</span>
                </span>
              ) : (
                renderContent(m.content)
              )}
            </div>
          ))}
        </div>

        <div className={styles.composer}>
          {mode !== "chat" && (
            <div className={styles.modeChip}>
              {MODE_LABEL[mode]} on
              <button type="button" onClick={() => setMode("chat")} title="Turn off">
                ✕
              </button>
            </div>
          )}
          {attach && (
            <div className={styles.attachChip}>
              {attach.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attach.dataUrl} alt={attach.name} />
              ) : (
                <span>📎</span>
              )}
              <span>{attach.name}</span>
              <button type="button" onClick={() => setAttach(null)} title="Remove">
                ✕
              </button>
            </div>
          )}
          {listening && (
            <div className={styles.listening}>🎙 Listening… speak now</div>
          )}
          {plusOpen && (
            <div className={styles.plusMenu}>
              <button type="button" onClick={() => { setPlusOpen(false); cameraRef.current?.click(); }}>
                📷 Camera
              </button>
              <button type="button" onClick={() => { setPlusOpen(false); photoRef.current?.click(); }}>
                🖼️ Photos
              </button>
              <button type="button" onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}>
                📎 Files
              </button>
              <button type="button" onClick={() => { setPlusOpen(false); setPluginsOpen(true); }}>
                🧩 Plugins
              </button>
              <button type="button" onClick={() => { setMode("deep"); setPlusOpen(false); }}>
                🔬 Deep research
              </button>
              <button type="button" onClick={() => { setMode("research"); setPlusOpen(false); }}>
                🌐 Live web research
              </button>
            </div>
          )}
          {pluginsOpen && (
            <div className={styles.plusMenu}>
              <button type="button" onClick={() => { setMode("image"); setPluginsOpen(false); inputRef.current?.focus(); }}>
                🎨 Draw a picture
              </button>
              <button type="button" onClick={() => { setMode("deep"); setPluginsOpen(false); inputRef.current?.focus(); }}>
                🔬 Deep research
              </button>
              <button type="button" onClick={() => { setMode("research"); setPluginsOpen(false); inputRef.current?.focus(); }}>
                🌐 Live web research
              </button>
              <button type="button" onClick={() => { setPluginsOpen(false); setInput("Translate this to Urdu: "); inputRef.current?.focus(); }}>
                🌍 Translate
              </button>
              <button type="button" onClick={() => { setPluginsOpen(false); setInput("Write code for: "); inputRef.current?.focus(); }}>
                💻 Write code
              </button>
              <button type="button" onClick={() => setPluginsOpen(false)}>
                ✕ Close
              </button>
            </div>
          )}
          <div className={styles.composerRow}>
            <button
              type="button"
              className={styles.plusBtn}
              onClick={() => { setPlusOpen((v) => !v); setPluginsOpen(false); }}
              title="Attach & tools"
            >
              +
            </button>
            <textarea
              ref={inputRef}
              className={styles.input}
              rows={1}
              placeholder="Message Nizafa.ai…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => (listening ? recRef.current?.stop() : startListening())}
              title="Voice input"
            >
              🎙️
            </button>
            <button
              type="button"
              className={styles.sendBtn}
              onClick={send}
              disabled={sending || (!input.trim() && !attach)}
              title="Send"
            >
              ↑
            </button>
          </div>
          <div className={styles.composerNote}>
            Nizafa.ai can make mistakes — check important answers.
            {remaining !== null && ` · ${remaining} of 50 left today`}
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0], "camera")}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0], "photo")}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.csv,.json,.log,.pdf"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0], "file")}
          />
        </div>
      </section>
    </div>
  );
}
