"use client";

// Connect a YouTube channel by URL, @handle, or channel ID.
// Uses the server route (YouTube Data API, cached) — never asks for a
// password and never scrapes. Channel connect is owner-only until the
// sensitive-scope verification is approved (see /settings).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConnectChannel() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!input.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not connect channel.");
      setDone(`Connected: ${data.channel.title}`);
      setInput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect channel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <label className="label" htmlFor="channel-input">
        Connect your YouTube channel
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="channel-input"
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a channel link, @handle, or channel ID"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Public data only, via the official YouTube Data API. Nizafa never asks
        for your password.
      </p>
      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
      {done ? <p className="notice" style={{ marginTop: 12 }}>{done}</p> : null}
    </form>
  );
}
