"use client";

// /ideas — today's 5 video ideas for your channel, built from your own
// videos (niche + best-performing patterns) and today's trending topics.
// Generated once per day and stored; revisiting shows the stored set.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { DailyIdea } from "@/lib/daily-ideas";

type IdeasResult = {
  date: string;
  channelId: number | null;
  channelTitle: string | null;
  channel: { id: number; title: string } | null;
  channels: Array<{ id: number; title: string }>;
  ideas: DailyIdea[];
  created: boolean;
  nicheThemes: string[];
  note?: string;
  error?: string;
};

export default function IdeasPage() {
  const [data, setData] = useState<IdeasResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");

  const load = useCallback(async (cid: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = cid ? `?channelId=${cid}` : "";
      const res = await fetch(`/api/daily-ideas${params}`);
      const d = (await res.json()) as IdeasResult;
      if (!res.ok) throw new Error(d.error ?? "Could not load today's ideas.");
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load today's ideas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(channelId);
  }, [load, channelId]);

  return (
    <div>
      <div className="hero">
        <div className="kicker">Growth engine</div>
        <h1>Today&apos;s video ideas</h1>
        <p className="muted">
          Five ideas a day, built from your own videos and today&apos;s trends —
          never from a generic list. Generated once per day and saved.
        </p>
      </div>

      {data && data.channels.length > 1 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <label className="label" htmlFor="channel">Channel</label>
          <select
            id="channel"
            className="select input"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">First connected channel</option>
            {data.channels.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.title}</option>
            ))}
          </select>
        </div>
      ) : null}

      {loading ? <p className="muted">Building today&apos;s ideas…</p> : null}
      {error ? <div className="error">{error}</div> : null}

      {data && !loading && !error ? (
        <div>
          <SectionTitle
            title={data.channelTitle ? `For ${data.channelTitle}` : "No channel yet"}
            sub={
              data.date
                ? `${data.date} · ${data.created ? "Freshly generated today" : "Saved from today's run"}${data.nicheThemes.length > 0 ? ` · Niche: ${data.nicheThemes.join(", ")}` : ""}`
                : undefined
            }
            action={<Link href="/generate" className="btn btn-primary btn-sm">Turn an idea into a pack →</Link>}
          />
          {data.note ? <div className="notice" style={{ marginBottom: 16 }}>{data.note}</div> : null}
          {data.ideas.length === 0 ? (
            <EmptyState
              title="No ideas yet"
              body="Connect your channel from the home page and today's ideas will be built from your own videos."
              action={<Link href="/" className="btn btn-primary">Go to home →</Link>}
            />
          ) : (
            data.ideas.map((idea, i) => (
              <div key={idea.title} className="card" style={{ marginBottom: 12 }}>
                <div className="section-head">
                  <div>
                    <span className="badge badge-teal">Idea {i + 1}</span>
                    <h3 style={{ marginTop: 8 }}>{idea.title}</h3>
                  </div>
                  <CopyButton text={idea.title} label="Copy title" />
                </div>
                <p><strong>Hook:</strong> {idea.hook}</p>
                <p className="muted" style={{ marginBottom: 0 }}>
                  <strong>Why it fits:</strong> {idea.whyFits}
                </p>
              </div>
            ))
          )}
          <p className="small muted">
            Ideas come from your channel&apos;s own videos and today&apos;s Google
            Trends snapshot. No search quota is spent, and no numbers are
            invented — view counts quoted above come from your saved videos.
          </p>
        </div>
      ) : null}
    </div>
  );
}
