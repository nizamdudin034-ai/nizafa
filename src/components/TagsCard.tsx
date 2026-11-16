// Tags card — the latest pack's tags, each with a real, explainable
// score (topic match, title, description, live trending, length).
// "Publish tags" copies all tags to the clipboard: direct publishing to
// YouTube needs the verified channel-connect OAuth, which is still
// pending, so copy-and-paste in YouTube Studio is the real action today.
"use client";

import { useState } from "react";
import type { TagScore } from "@/lib/consistency";

function badgeClass(score: number): string {
  if (score >= 75) return "score-badge sb-good";
  if (score >= 50) return "score-badge sb-warn";
  return "score-badge sb-bad";
}

export default function TagsCard({
  tags,
  topic,
}: {
  tags: TagScore[];
  topic: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = expanded ? tags : tags.slice(0, 3);

  async function publish() {
    const text = tags.map((t) => t.tag).join(", ");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2 style={{ marginBottom: 2 }}>Tags</h2>
          <div className="small muted">
            From your latest pack: “{topic}”. Scores are computed from your
            title, description and live trending searches.
          </div>
        </div>
        <span className="badge">{tags.length} tags</span>
      </div>

      {shown.map((t) => (
        <div key={t.tag} className="tag-row">
          <span className={badgeClass(t.score)}>{t.score}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600 }}>{t.tag}</span>
            <span className="small muted" style={{ display: "block" }}>
              {t.signals.join(" · ")}
            </span>
          </span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {tags.length > 3 ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : `More (${tags.length - 3} more)`}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={publish}>
          {copied ? "✓ Copied — paste in YouTube Studio" : "Publish tags"}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
        Direct publish to YouTube needs channel connect (verification
        pending) — for now Nizafa copies your tags; paste them in YouTube
        Studio to publish.
      </p>
    </div>
  );
}
