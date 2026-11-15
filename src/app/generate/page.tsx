"use client";

// /generate — SEO pack generator: topic in, full pack out.
// Rule-based + template pack (scores are labelled editorial estimates).
// One-click copy on every section; recent packs listed below.
import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { SeoPack } from "@/lib/generator";

type SavedPack = {
  id: number;
  topic: string;
  created_at: string;
  payload_json: SeoPack;
};

function fmtSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [pack, setPack] = useState<SeoPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedPack[]>([]);

  async function loadRecent() {
    try {
      const res = await fetch("/api/generate");
      const data = (await res.json()) as { packages?: SavedPack[] };
      setRecent(data.packages ?? []);
    } catch {
      setRecent([]);
    }
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveNote(null);
    setPack(null);
    if (topic.trim().length < 3) {
      setError("Give a topic of at least 3 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), channelTitle: channelTitle.trim() || undefined }),
      });
      const data = (await res.json()) as {
        pack?: SeoPack;
        saved?: boolean;
        saveError?: string | null;
        error?: string;
      };
      if (!res.ok || !data.pack) throw new Error(data.error ?? "Could not generate a pack.");
      setPack(data.pack);
      if (data.saved) {
        setSaveNote("Saved to your packs.");
        loadRecent();
      } else if (data.saveError) {
        setSaveNote(`Pack generated but not saved: ${data.saveError}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a pack.");
    } finally {
      setLoading(false);
    }
  }

  const allTags = pack ? pack.tags.join(", ") : "";
  const allHashtags = pack ? pack.hashtags.join(" ") : "";
  const allTitles = pack ? pack.titles.map((t) => t.title).join("\n") : "";

  return (
    <div>
      <div className="hero">
        <div className="kicker">Growth engine</div>
        <h1>SEO pack generator</h1>
        <p className="muted">
          One topic in — titles, tags, hashtags, description, hook, script
          outline and thumbnail ideas out. Rule-based and transparent: title
          scores are editorial estimates, not predictions.
        </p>
      </div>

      <form onSubmit={generate} className="card">
        <label className="label" htmlFor="topic">Video topic</label>
        <input
          id="topic"
          className="input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. why central banks are buying gold"
          maxLength={200}
        />
        <div style={{ height: 12 }} />
        <label className="label" htmlFor="channelTitle">Channel name (optional — added to titles)</label>
        <input
          id="channelTitle"
          className="input"
          value={channelTitle}
          onChange={(e) => setChannelTitle(e.target.value)}
          placeholder="e.g. Nizam Afridi"
          maxLength={100}
        />
        <div style={{ height: 14 }} />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Generating…" : "Generate SEO pack"}
        </button>
      </form>

      {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}
      {saveNote ? <div className="notice" style={{ marginTop: 16 }}>{saveNote}</div> : null}

      {pack ? (
        <div style={{ marginTop: 24 }}>
          <SectionTitle
            title="Your SEO pack"
            sub={pack.disclaimer}
            action={<CopyButton text={`${pack.bestTitle}\n\n${pack.descriptionStarter}\n\nTags: ${allTags}\n${allHashtags}`} label="Copy all" />}
          />

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="stat-label">Best title</div>
            <h2 style={{ marginTop: 6 }}>{pack.bestTitle}</h2>
            <CopyButton text={pack.bestTitle} label="Copy best title" />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <h3 style={{ margin: 0 }}>5 title options</h3>
              <CopyButton text={allTitles} label="Copy titles" />
            </div>
            {pack.titles.map((t) => (
              <div key={t.title} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{t.title}</div>
                  <div className="small muted">
                    {t.style} · Score {t.score}/100 (editorial estimate)
                  </div>
                  <div className="small muted">{t.why}</div>
                </div>
                <CopyButton text={t.title} />
              </div>
            ))}
          </div>

          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="section-head">
                <h3 style={{ margin: 0 }}>Tags ({pack.tags.length})</h3>
                <CopyButton text={allTags} label="Copy tags" />
              </div>
              <p style={{ overflowWrap: "anywhere" }}>
                {pack.tags.map((tag) => (
                  <span key={tag} className="badge" style={{ margin: "0 6px 6px 0" }}>{tag}</span>
                ))}
              </p>
            </div>
            <div className="card">
              <div className="section-head">
                <h3 style={{ margin: 0 }}>Hashtags</h3>
                <CopyButton text={allHashtags} label="Copy hashtags" />
              </div>
              <p style={{ overflowWrap: "anywhere" }}>{pack.hashtags.join(" ")}</p>
              <div className="stat-label" style={{ marginTop: 12 }}>Opening hook (first 15 seconds)</div>
              <p style={{ marginTop: 6 }}>{pack.hook}</p>
              <CopyButton text={pack.hook} label="Copy hook" />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-head">
              <h3 style={{ margin: 0 }}>Description starter</h3>
              <CopyButton text={pack.descriptionStarter} label="Copy description" />
            </div>
            <pre className="code">{pack.descriptionStarter}</pre>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Script outline — 8:30</h3>
            <table className="table">
              <thead>
                <tr><th>Section</th><th>Time</th><th>Beats</th></tr>
              </thead>
              <tbody>
                {pack.scriptOutline.map((s) => (
                  <tr key={s.section}>
                    <td style={{ fontWeight: 700 }}>{s.section}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtSeconds(s.seconds)}</td>
                    <td>
                      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                        {s.points.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Thumbnail concepts</h3>
            {pack.thumbnailConcepts.map((c, i) => (
              <div key={c.bigText + i} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{c.bigText}</div>
                  <div className="small muted">{c.layout}</div>
                  <div className="small">{c.imageIdea}</div>
                </div>
                <CopyButton text={c.bigText} label="Copy text" />
              </div>
            ))}
          </div>

          <div className={pack.consistency.pass ? "notice" : "error"}>
            <strong>Consistency check: {pack.consistency.pass ? "PASS" : "Needs a look"}</strong>
            <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
              {pack.consistency.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="section">
        <SectionTitle title="Recent packs" sub="Your last 10 saved packs." />
        {recent.length === 0 ? (
          <EmptyState
            title="No packs yet"
            body="Generate your first SEO pack above and it will appear here."
          />
        ) : (
          recent.map((p) => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div className="section-head">
                <div>
                  <div style={{ fontWeight: 700 }}>{p.payload_json.bestTitle}</div>
                  <div className="small muted">
                    Topic: {p.topic} · {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
                <CopyButton
                  text={`${p.payload_json.bestTitle}\n\n${p.payload_json.descriptionStarter}\n\nTags: ${p.payload_json.tags.join(", ")}\n${p.payload_json.hashtags.join(" ")}`}
                  label="Copy pack"
                />
              </div>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  setPack(p.payload_json);
                  setTopic(p.topic);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Open pack →
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
