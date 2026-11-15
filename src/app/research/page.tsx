"use client";

// /research — keyword research.
// The search box is debounced (500ms) and search results are cached
// server-side for 24h, so typing never spends YouTube quota per keystroke.
import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { KeywordIdea } from "@/lib/generator";
import type { TrendItem } from "@/lib/trends";

type ResearchResult = {
  query: string;
  keywordIdeas: KeywordIdea[];
  searchResults: Array<{ videoId: string; title: string; channelTitle: string }>;
  searchCached: boolean;
  searchAvailable: boolean;
  outliers: Array<{
    videoId: string;
    title: string;
    url: string;
    viewCount: number;
    ratio: number;
  }>;
  channelAverageViews: number | null;
  channel: { id: number; title: string } | null;
  rising: TrendItem[];
  note?: string;
};

type ChannelOption = { id: number; title: string };

export default function ResearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [channelId, setChannelId] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d: { channels?: Array<{ id: number; title: string; role: string }> }) => {
        const own = (d.channels ?? []).filter((c) => c.role === "own");
        setChannels(own.map((c) => ({ id: c.id, title: c.title })));
      })
      .catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(q.trim()), 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    if (debounced.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ q: debounced });
    if (channelId) params.set("channelId", channelId);
    fetch(`/api/research?${params.toString()}`)
      .then(async (res) => {
        const d = (await res.json()) as ResearchResult & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "Research failed.");
        setData(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Research failed."))
      .finally(() => setLoading(false));
  }, [debounced, channelId]);

  return (
    <div>
      <div className="hero">
        <div className="kicker">Growth engine</div>
        <h1>Keyword research</h1>
        <p className="muted">
          Keyword ideas, top videos for the phrase, your channel&apos;s outlier
          videos, and rising keywords. Search results are cached for 24 hours
          — typing here never spends YouTube quota per keystroke.
        </p>
      </div>

      <div className="card">
        <label className="label" htmlFor="q">Keyword or topic</label>
        <input
          id="q"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. gold reserves"
          maxLength={200}
        />
        {channels.length > 1 ? (
          <>
            <div style={{ height: 12 }} />
            <label className="label" htmlFor="channel">Outliers for channel</label>
            <select
              id="channel"
              className="select input"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="">First connected channel</option>
              {channels.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.title}</option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      {loading ? <p className="muted" style={{ marginTop: 16 }}>Researching…</p> : null}
      {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}
      {data?.note ? <div className="notice" style={{ marginTop: 16 }}>{data.note}</div> : null}

      {data ? (
        <div style={{ marginTop: 24 }}>
          <div className="grid grid-2">
            <div className="card">
              <SectionTitle title="Keyword ideas" sub={`For “${data.query}”`} />
              {data.keywordIdeas.map((k) => (
                <div key={k.keyword} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{k.keyword}</div>
                    <div className="small muted">{k.angle}</div>
                  </div>
                  <CopyButton text={k.keyword} />
                </div>
              ))}
            </div>

            <div className="card">
              <SectionTitle
                title="Top videos for this phrase"
                sub={
                  data.searchCached
                    ? "From cache (24h) — no quota spent."
                    : data.searchAvailable
                      ? "Live YouTube search, now cached for 24h."
                      : "YouTube search is not configured on the server."
                }
              />
              {data.searchResults.length === 0 ? (
                <EmptyState
                  title="No videos found"
                  body="Try a broader phrase, or check that the YouTube API key is set on the server."
                />
              ) : (
                data.searchResults.map((v) => (
                  <div key={v.videoId} className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a
                        href={`https://www.youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 700, overflowWrap: "anywhere" }}
                      >
                        {v.title}
                      </a>
                      <div className="small muted">{v.channelTitle}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="section">
            <SectionTitle
              title="Outlier videos"
              sub={
                data.channel
                  ? `${data.channel.title} — videos performing ≥1.5× the channel average${
                      data.channelAverageViews != null
                        ? ` (average ${data.channelAverageViews.toLocaleString()} views)`
                        : ""
                    }.`
                  : "Connect a channel to see which of your videos outperform your average."
              }
            />
            {data.outliers.length === 0 ? (
              <EmptyState
                title="No outliers yet"
                body="No saved video is performing at 1.5× your channel average, or no channel videos are saved yet."
              />
            ) : (
              <div className="card">
                <table className="table">
                  <thead>
                    <tr><th>Video</th><th>Views</th><th>vs average</th></tr>
                  </thead>
                  <tbody>
                    {data.outliers.map((v) => (
                      <tr key={v.videoId}>
                        <td>
                          <a href={v.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                            {v.title}
                          </a>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{v.viewCount.toLocaleString()}</td>
                        <td><span className="badge badge-gold">{v.ratio}×</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="section">
            <SectionTitle title="Rising keywords" sub="From today's Google Trends snapshot (US + Pakistan)." />
            {data.rising.length === 0 ? (
              <EmptyState title="No trends saved yet" body="Trending keywords appear once the daily snapshot has run." />
            ) : (
              <div className="card">
                {data.rising.map((t) => (
                  <button
                    key={`${t.geo}-${t.title}`}
                    type="button"
                    className="badge"
                    style={{ margin: "0 6px 6px 0", cursor: "pointer", border: "1px solid var(--line)" }}
                    onClick={() => setQ(t.title)}
                    title={`Search “${t.title}”`}
                  >
                    {t.title} {t.geo ? `· ${t.geo}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        !loading && (
          <div className="section">
            <EmptyState
              title="Start with a keyword"
              body="Type a topic above — keyword ideas appear as you type, with top videos, your outliers and rising keywords."
            />
          </div>
        )
      )}
    </div>
  );
}
