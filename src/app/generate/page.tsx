"use client";

// /generate — the full video pack, vidIQ-style flow, Nizafa's own engine.
// Start screen (topic in, Generate, "surprise me") → one scrolling pack:
// Customize, Title (real rule-based score), Thumbnail, Hook, Outline
// (timed beats), Script (full draft), Voiceover (ElevenLabs MP3 from the
// script + free browser preview; no Boost lock anywhere), Tags (real
// scored tags), Description.
// Every section has Regenerate (✦) and Copy (⧉). Edits are saved back
// to the saved pack with PATCH; per-section Regenerate never writes a
// new pack row (save:false). Scores are labelled editorial estimates.
import { useEffect, useMemo, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { EmptyState, SectionTitle } from "@/components/ui";
import type { SeoPack, VideoLength } from "@/lib/generator";
import { wordCount, readMinutes } from "@/lib/generator";
import { buildThumbnailPrompt } from "@/lib/thumbnail";
import { scoreConsistency } from "@/lib/consistency";
import { scoreVideoThumbnail } from "@/lib/seo-checklist";
import type { TagScore } from "@/lib/consistency";

type SavedPack = {
  id: number;
  topic: string;
  created_at: string;
  payload_json: SeoPack;
};

type PackView = SeoPack & { id?: number | null };

function fmtSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function scoreClass(score: number): string {
  if (score >= 80) return "gen-score gen-score-good";
  if (score >= 60) return "gen-score gen-score-mid";
  return "gen-score gen-score-low";
}

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [length, setLength] = useState<VideoLength>("long");
  const [pack, setPack] = useState<PackView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [recent, setRecent] = useState<SavedPack[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pack view state (reset on every new pack).
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [titleIdx, setTitleIdx] = useState(0);
  const [hookIdx, setHookIdx] = useState(0);
  const [conceptIdx, setConceptIdx] = useState(0);
  const [hookText, setHookText] = useState("");
  const [descText, setDescText] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptEditing, setScriptEditing] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [outlineVariant, setOutlineVariant] = useState(0);
  const [scriptVariant, setScriptVariant] = useState(0);
  const [descVariant, setDescVariant] = useState(0);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);

  // Tags (editable list + real scores).
  const [tags, setTags] = useState<string[]>([]);
  const [tagScores, setTagScores] = useState<TagScore[]>([]);
  const [recommended, setRecommended] = useState<TagScore[]>([]);
  const [trendingAvailable, setTrendingAvailable] = useState<boolean | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Surprise me.
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseNote, setSurpriseNote] = useState<string | null>(null);

  // Voiceover (ElevenLabs MP3 + free browser preview).
  const [voLang, setVoLang] = useState<"en" | "ur">("en");
  const [voVoices, setVoVoices] = useState<Array<{ id: string; name: string; note: string }>>([]);
  const [voVoiceId, setVoVoiceId] = useState("");
  const [voConfigured, setVoConfigured] = useState<boolean | null>(null);
  const [voUsage, setVoUsage] = useState<{ count: number; chars: number } | null>(null);
  const [voLimits, setVoLimits] = useState<{ perDay: number; charsPerDay: number } | null>(null);
  const [voBusy, setVoBusy] = useState(false);
  const [voError, setVoError] = useState<string | null>(null);
  const [voAudioUrl, setVoAudioUrl] = useState<string | null>(null);
  const [voChunks, setVoChunks] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  async function loadRecent() {
    try {
      const res = await fetch("/api/generate");
      const data = (await res.json()) as { packages?: SavedPack[] };
      setRecent(data.packages ?? []);
    } catch {
      setRecent([]);
    }
  }

  async function loadVoiceover() {
    try {
      const res = await fetch("/api/voiceover");
      const data = (await res.json()) as {
        configured?: boolean;
        voices?: Array<{ id: string; name: string; note: string }>;
        limits?: { perDay: number; charsPerDay: number };
        usage?: { count: number; chars: number };
      };
      setVoConfigured(Boolean(data.configured));
      const list = data.voices ?? [];
      setVoVoices(list);
      if (list.length > 0) setVoVoiceId((prev) => prev || list[0].id);
      if (data.limits) setVoLimits(data.limits);
      if (data.usage) setVoUsage(data.usage);
    } catch {
      setVoConfigured(false);
      setVoVoices([]);
    }
  }

  /** ElevenLabs MP3 of the current script draft (real script text only). */
  async function generateVoiceover() {
    if (!pack || voBusy) return;
    if (!scriptText.trim()) {
      setVoError("Generate a script first.");
      return;
    }
    if (!voVoiceId) {
      setVoError("Pick a voice first.");
      return;
    }
    setVoBusy(true);
    setVoError(null);
    try {
      const res = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: scriptText, voiceId: voVoiceId, language: voLang }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (res.ok && contentType.includes("audio/")) {
        const blob = await res.blob();
        if (voAudioUrl) URL.revokeObjectURL(voAudioUrl);
        setVoAudioUrl(URL.createObjectURL(blob));
        setVoChunks(Number(res.headers.get("x-voiceover-chunks") ?? "1"));
        const used = res.headers.get("x-voiceover-used-today");
        const chars = res.headers.get("x-voiceover-chars-today");
        if (used !== null && chars !== null) {
          setVoUsage({ count: Number(used), chars: Number(chars) });
        }
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
      };
      throw new Error(data.reason ?? data.error ?? "Could not generate the voiceover.");
    } catch (err) {
      setVoError(err instanceof Error ? err.message : "Could not generate the voiceover.");
    } finally {
      setVoBusy(false);
    }
  }

  /** Free browser preview — device voices only, plays aloud, no MP3. */
  function stopPreview() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewPlaying(false);
  }

  function previewVoiceover() {
    if (previewPlaying) {
      stopPreview();
      return;
    }
    if (!scriptText.trim()) {
      setVoError("Generate a script first, then preview it.");
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoError("This browser has no built-in voices — try Chrome or Edge.");
      return;
    }
    setVoError(null);
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(scriptText);
    utter.lang = voLang === "ur" ? "ur-PK" : "en-US";
    const match = synth
      .getVoices()
      .find((v) => v.lang?.toLowerCase().startsWith(voLang === "ur" ? "ur" : "en"));
    if (match) utter.voice = match;
    utter.onend = () => setPreviewPlaying(false);
    utter.onerror = () => setPreviewPlaying(false);
    synth.speak(utter);
    setPreviewPlaying(true);
  }

  useEffect(() => {
    loadRecent();
    loadVoiceover();
    // Deep links: Optimize ("Generate scores"), Create (Preview a topic).
    const t = new URLSearchParams(window.location.search).get("topic");
    if (t) setTopic(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the audio blob + stop any preview when it changes / on unmount.
  useEffect(() => {
    return () => {
      if (voAudioUrl) URL.revokeObjectURL(voAudioUrl);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voAudioUrl]);

  const currentTitle = useMemo(
    () => (pack ? pack.titles[titleIdx] ?? pack.titles[0] : null),
    [pack, titleIdx]
  );
  const currentConcept = useMemo(
    () => (pack ? pack.thumbnailConcepts[conceptIdx] ?? pack.thumbnailConcepts[0] : null),
    [pack, conceptIdx]
  );

  const consistency = useMemo(() => {
    if (!pack || !currentTitle) return null;
    return scoreConsistency({
      title: currentTitle.title,
      description: descText,
      scriptText: `${scriptText} ${(pack.videoOutline ?? []).map((b) => `${b.name} ${b.guidance}`).join(" ")}`,
      thumbnailText: currentConcept ? `${currentConcept.bigText} ${currentConcept.layout}` : "",
    });
  }, [pack, currentTitle, descText, scriptText, currentConcept]);

  const thumbScore = useMemo(
    () => (currentConcept ? scoreVideoThumbnail(currentConcept) : null),
    [currentConcept]
  );

  const scriptWords = useMemo(() => wordCount(scriptText), [scriptText]);
  const scriptMins = useMemo(() => readMinutes(scriptText), [scriptText]);

  function applyPack(p: SeoPack, id?: number | null) {
    setPack({ ...p, id: id ?? null });
    setTitleIdx(0);
    setHookIdx(0);
    setConceptIdx(0);
    setHookText(p.hook);
    setDescText(p.descriptionStarter);
    setScriptText(p.scriptDraft ?? "");
    setScriptEditing(false);
    setOutlineOpen(false);
    setScriptOpen(false);
    setOutlineVariant(0);
    setScriptVariant(0);
    setDescVariant(0);
    setTags(p.tags);
    setDirty(false);
    setTagScores([]);
    setRecommended([]);
    setTrendingAvailable(null);
    // New pack → new voiceover (old audio belongs to the old script).
    setVoError(null);
    setVoChunks(0);
    if (voAudioUrl) URL.revokeObjectURL(voAudioUrl);
    setVoAudioUrl(null);
    stopPreview();
  }

  async function fetchTagScores(
    p: PackView,
    tagList: string[],
    title: string,
    description: string
  ) {
    setTagsLoading(true);
    try {
      const res = await fetch("/api/generate/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: p.topic,
          title,
          description,
          currentTags: tagList,
          packTags: p.tags,
        }),
      });
      const data = (await res.json()) as {
        current?: TagScore[];
        recommended?: TagScore[];
        trendingAvailable?: boolean;
      };
      setTagScores(data.current ?? []);
      setRecommended(data.recommended ?? []);
      setTrendingAvailable(data.trendingAvailable ?? false);
    } catch {
      setTagScores([]);
      setRecommended([]);
    } finally {
      setTagsLoading(false);
    }
  }

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
        body: JSON.stringify({
          topic: topic.trim(),
          channelTitle: channelTitle.trim() || undefined,
          length,
        }),
      });
      const data = (await res.json()) as {
        pack?: SeoPack;
        saved?: boolean;
        packageId?: number | null;
        saveError?: string | null;
        error?: string;
      };
      if (!res.ok || !data.pack) throw new Error(data.error ?? "Could not generate a pack.");
      applyPack(data.pack, data.packageId ?? null);
      if (data.saved) {
        setSaveNote("Saved to your packs.");
        loadRecent();
      } else if (data.saveError) {
        setSaveNote(`Pack generated but not saved: ${data.saveError}`);
      }
      void fetchTagScores(
        data.pack,
        data.pack.tags,
        data.pack.bestTitle,
        data.pack.descriptionStarter
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a pack.");
    } finally {
      setLoading(false);
    }
  }

  /** A real topic from the channel's niche + today's trends — never random. */
  async function surpriseMe() {
    setSurpriseNote(null);
    setSurpriseLoading(true);
    try {
      // First: one of today's 4 daily ideas (already personalised to the channel).
      const ideasRes = await fetch("/api/daily-ideas");
      if (ideasRes.ok) {
        const ideasData = (await ideasRes.json()) as {
          ideas?: Array<{ title?: string }>;
        };
        const ideas = (ideasData.ideas ?? []).map((i) => i.title ?? "").filter(Boolean);
        if (ideas.length > 0) {
          setTopic(ideas[Math.floor(Math.random() * ideas.length)]);
          return;
        }
      }
      // Fallback: a rising keyword that fits the channel's niche.
      const feedRes = await fetch("/api/research/feed");
      if (feedRes.ok) {
        const feed = (await feedRes.json()) as {
          topics?: string[];
          keywords?: { today?: Array<{ title?: string }> };
        };
        const kws = (feed.keywords?.today ?? []).map((k) => k.title ?? "").filter(Boolean);
        const topics = feed.topics ?? [];
        const topicWords = new Set(
          topics.flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length > 2)
        );
        const fitting = kws.filter((k) =>
          k.toLowerCase().split(/[^a-z0-9]+/).some((w) => topicWords.has(w))
        );
        const pick = fitting[0] ?? kws[0];
        if (pick) {
          setTopic(pick);
          return;
        }
      }
      setSurpriseNote(
        "Nothing to surprise you with yet — connect your channel and open Research once so Nizafa can learn your niche, then try again."
      );
    } catch {
      setSurpriseNote("Could not fetch a suggestion right now — type a topic instead.");
    } finally {
      setSurpriseLoading(false);
    }
  }

  /** Per-section Regenerate: variant 0 ⇄ 1, never writes a new pack row. */
  async function regenSection(kind: "outline" | "script" | "description") {
    if (!pack || regenBusy) return;
    const nextVariant =
      (kind === "outline" ? outlineVariant : kind === "script" ? scriptVariant : descVariant) === 0
        ? 1
        : 0;
    setRegenBusy(kind);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: pack.topic,
          channelTitle: pack.channelTitle ?? undefined,
          length: pack.length,
          variant: nextVariant,
          save: false,
        }),
      });
      const data = (await res.json()) as { pack?: SeoPack; error?: string };
      if (!res.ok || !data.pack) throw new Error(data.error ?? "Could not regenerate.");
      if (kind === "outline") {
        setOutlineVariant(nextVariant);
        setPack((prev) => (prev ? { ...prev, videoOutline: data.pack!.videoOutline } : prev));
      } else if (kind === "script") {
        setScriptVariant(nextVariant);
        setScriptText(data.pack.scriptDraft);
      } else {
        setDescVariant(nextVariant);
        setDescText(data.pack.descriptionStarter);
      }
      setDirty(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate.");
    } finally {
      setRegenBusy(null);
    }
  }

  function cycleTitle() {
    if (!pack) return;
    const next = (titleIdx + 1) % pack.titles.length;
    setTitleIdx(next);
    setDirty(true);
    void fetchTagScores(pack, tags, pack.titles[next].title, descText);
  }

  function cycleHook() {
    if (!pack) return;
    const variants = pack.hookVariants?.length ? pack.hookVariants : [pack.hook];
    const next = (hookIdx + 1) % variants.length;
    setHookIdx(next);
    setHookText(variants[next]);
    setDirty(true);
  }

  function cycleConcept() {
    if (!pack) return;
    const next = (conceptIdx + 1) % pack.thumbnailConcepts.length;
    setConceptIdx(next);
    setDirty(true);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
    setDirty(true);
  }

  function addTag(tag: string) {
    const clean = tag.trim();
    if (!clean) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    const next = [...tags, clean];
    setTags(next);
    setNewTag("");
    setDirty(true);
    if (pack && currentTitle) void fetchTagScores(pack, next, currentTitle.title, descText);
  }

  async function saveChanges() {
    if (!pack?.id) {
      setSaveNote("This pack was never saved — sign in with Google first, then generate again.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/generate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: pack.id,
          patch: {
            bestTitle: currentTitle?.title ?? pack.bestTitle,
            chosenTitle: currentTitle?.title ?? pack.bestTitle,
            hook: hookText,
            descriptionStarter: descText,
            scriptDraft: scriptText,
            tags,
            videoOutline: pack.videoOutline,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save changes.");
      setDirty(false);
      setSaveNote("Changes saved.");
      loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePack() {
    if (!pack?.id) {
      setPack(null);
      return;
    }
    if (!window.confirm("Delete this saved pack?")) return;
    try {
      await fetch(`/api/generate?id=${pack.id}`, { method: "DELETE" });
    } catch {
      // The pack is gone from view either way.
    }
    setPack(null);
    loadRecent();
  }

  async function openPack(p: SavedPack) {
    const payload = p.payload_json;
    // Packs saved before the outline/script fields existed get them from a
    // fresh unsaved generation for the same topic (no new row written).
    if (!payload.videoOutline || !payload.scriptDraft) {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topic: p.topic,
            channelTitle: payload.channelTitle ?? undefined,
            length: payload.length ?? "long",
            save: false,
          }),
        });
        const data = (await res.json()) as { pack?: SeoPack };
        if (data.pack) {
          applyPack({ ...payload, ...data.pack, tags: payload.tags }, p.id);
          setDirty(true);
          setTopic(p.topic);
          return;
        }
      } catch {
        // Fall through: open the pack as-is.
      }
    }
    applyPack(payload, p.id);
    setTopic(p.topic);
    if (currentTitle) {
      void fetchTagScores(payload, payload.tags, payload.bestTitle, payload.descriptionStarter);
    }
  }

  const allTags = tags.join(", ");
  const allHashtags = pack ? pack.hashtags.join(" ") : "";
  const outlineBeats = pack?.videoOutline ?? [];
  const outlineTotal = outlineBeats.reduce((s, b) => s + b.seconds, 0);
  const visibleBeats = outlineOpen ? outlineBeats : outlineBeats.slice(0, 3);
  const scriptShown = scriptOpen ? scriptText : scriptText.slice(0, 600);
  const thumbPrompt = pack
    ? buildThumbnailPrompt({
        topic: pack.topic,
        punchWords: currentConcept?.bigText ?? "",
      })
    : "";

  // ── Start screen ───────────────────────────────────────────────────────
  if (!pack) {
    return (
      <div className="gen-start">
        <h1 className="gen-start-title">Start your next video</h1>
        <p className="gen-start-sub">
          Generate proven titles, thumbnails, descriptions, and outlines
        </p>

        <form onSubmit={generate}>
          <input
            className="input gen-topic-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="anything you'd like to make a video about"
            maxLength={200}
            aria-label="Video topic"
          />
          <div style={{ height: 12 }} />
          <button className="btn btn-primary gen-generate-btn" type="submit" disabled={loading}>
            {loading ? "Generating…" : "✦ Generate"}
          </button>
        </form>

        <p className="gen-surprise">
          I&apos;m not sure what to make,{" "}
          <button type="button" className="gen-link" onClick={surpriseMe} disabled={surpriseLoading}>
            {surpriseLoading ? "thinking…" : "surprise me"}
          </button>
        </p>
        {surpriseNote ? <div className="notice" style={{ marginTop: 12 }}>{surpriseNote}</div> : null}
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
        {saveNote ? <div className="notice" style={{ marginTop: 12 }}>{saveNote}</div> : null}

        <div className="section">
          <SectionTitle title="Recent packs" sub="Your last 10 saved packs." />
          {recent.length === 0 ? (
            <EmptyState
              title="No packs yet"
              body="Type a topic above and press Generate — your pack will appear here."
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
                  onClick={() => void openPack(p)}
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

  // ── Pack view ──────────────────────────────────────────────────────────
  return (
    <div className="gen-pack">
      <div className="gen-pack-head">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setPack(null)}
          aria-label="Back to Generate"
        >
          ← Back
        </button>
        <div className="gen-pack-title" title={pack.topic}>
          {pack.topic}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void deletePack()}
          aria-label="Delete this pack"
          title="Delete this pack"
        >
          🗑
        </button>
      </div>

      {dirty && pack.id ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%", marginBottom: 16 }}
          onClick={() => void saveChanges()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      ) : null}
      {error ? <div className="error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {saveNote ? <div className="notice" style={{ marginBottom: 16 }}>{saveNote}</div> : null}

      {/* Customize */}
      <div className="card gen-section">
        <button
          type="button"
          className="gen-customize-bar"
          onClick={() => setCustomizeOpen((v) => !v)}
          aria-expanded={customizeOpen}
        >
          <span className="muted">Customize</span>
          <span>{customizeOpen ? "▴" : "▾"}</span>
        </button>
        {customizeOpen ? (
          <div style={{ marginTop: 12 }}>
            <label className="label" htmlFor="gen-channel">Channel name (added to titles)</label>
            <input
              id="gen-channel"
              className="input"
              value={channelTitle}
              onChange={(e) => setChannelTitle(e.target.value)}
              placeholder="e.g. Nizam Afridi"
              maxLength={100}
            />
            <div style={{ height: 12 }} />
            <label className="label" htmlFor="gen-length">Video length</label>
            <select
              id="gen-length"
              className="input"
              value={length}
              onChange={(e) => setLength(e.target.value as VideoLength)}
            >
              <option value="long">Long — 8–9 min documentary</option>
              <option value="short">Short — about 60 seconds</option>
            </select>
            <div style={{ height: 12 }} />
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const res = await fetch("/api/generate", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      topic: pack.topic,
                      channelTitle: channelTitle.trim() || undefined,
                      length,
                      save: false,
                    }),
                  });
                  const data = (await res.json()) as { pack?: SeoPack; error?: string };
                  if (!res.ok || !data.pack) throw new Error(data.error ?? "Could not regenerate.");
                  const id = pack.id;
                  applyPack(data.pack, id);
                  setDirty(true);
                  setSaveNote("Regenerated with your settings — press “Save changes” to keep it.");
                  void fetchTagScores(data.pack, data.pack.tags, data.pack.bestTitle, data.pack.descriptionStarter);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not regenerate.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Regenerating…" : "Apply & regenerate"}
            </button>
            <p className="small muted" style={{ marginTop: 8 }}>
              Regenerating rewrites the titles, hook, outline, script and description for the new
              length. Nothing is saved until you press “Save changes”.
            </p>
          </div>
        ) : null}
      </div>

      {/* Title */}
      {currentTitle ? (
        <div className="card gen-section">
          <div className="section-head">
            <h3 style={{ margin: 0 }}>Title</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={cycleTitle}
                title="Try the next title option"
                aria-label="Regenerate title"
              >
                ✦
              </button>
              <CopyButton text={currentTitle.title} />
            </div>
          </div>
          <div className="gen-big-title">{currentTitle.title}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span className={scoreClass(currentTitle.score)}>{currentTitle.score}</span>
            <span className="small muted">
              Title score /100 — editorial estimate ({currentTitle.style})
            </span>
          </div>
          <details className="small muted" style={{ marginTop: 8 }}>
            <summary>Why this score</summary>
            <p style={{ margin: "6px 0 0" }}>{currentTitle.why}</p>
          </details>
          {consistency ? (
            <p className="small" style={{ margin: "10px 0 0" }}>
              Consistency {consistency.score}/100 — {consistency.notes[0]}
            </p>
          ) : null}
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {pack.disclaimer}
          </p>
        </div>
      ) : null}

      {/* Thumbnail */}
      {currentConcept ? (
        <div className="card gen-section">
          <div className="section-head">
            <h3 style={{ margin: 0 }}>Thumbnail</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={cycleConcept}
                title="Try the next thumbnail concept"
                aria-label="Regenerate thumbnail"
              >
                ✦
              </button>
              <CopyButton text={thumbPrompt} label="Copy prompt" />
            </div>
          </div>
          <div className="gen-thumb-big">{currentConcept.bigText}</div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>{currentConcept.layout}</p>
          <p style={{ margin: "8px 0 0" }}>{currentConcept.imageIdea}</p>
          {thumbScore ? (
            <p className="small" style={{ margin: "10px 0 0" }}>
              Concept score {thumbScore.score}/100 — {thumbScore.label}.{" "}
              {thumbScore.fixes[0] ?? ""}
            </p>
          ) : null}
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            The face in the thumbnail is always the person this video is about — never the
            channel owner&apos;s face. Generate the image in Thumbnail Studio: the text is added
            afterwards with real fonts, never baked into the image.
          </p>
          <a className="btn btn-ghost btn-sm" href="/thumbnails" style={{ marginTop: 10 }}>
            Open in Thumbnail Studio →
          </a>
        </div>
      ) : null}

      {/* Hook */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Hook</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={cycleHook}
              title="Try the next hook"
              aria-label="Regenerate hook"
            >
              ✦
            </button>
            <CopyButton text={hookText} />
          </div>
        </div>
        <textarea
          className="input gen-textarea"
          value={hookText}
          rows={3}
          onChange={(e) => {
            setHookText(e.target.value);
            setDirty(true);
          }}
          aria-label="Hook"
        />
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          The first line of your video — spoken in the first 15 seconds.
        </p>
      </div>

      {/* Outline */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Outline</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void regenSection("outline")}
              disabled={regenBusy !== null}
              title="Rewrite the outline directions"
              aria-label="Regenerate outline"
            >
              ✦
            </button>
            <CopyButton
              text={outlineBeats.map((b) => `${b.name} • ${fmtSeconds(b.seconds)}\n${b.guidance}`).join("\n\n")}
            />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          {outlineBeats.length} beats · {fmtSeconds(outlineTotal)} total
        </p>
        {visibleBeats.map((b) => (
          <div key={b.name} className="gen-beat">
            <div style={{ fontWeight: 700 }}>
              {b.name} <span className="muted">• {fmtSeconds(b.seconds)}</span>
            </div>
            <p style={{ margin: "6px 0 0" }}>{b.guidance}</p>
          </div>
        ))}
        {outlineBeats.length > 3 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setOutlineOpen((v) => !v)}
          >
            {outlineOpen ? "Show Less ⌃" : "Show More ⌄"}
          </button>
        ) : null}
      </div>

      {/* Script */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Script</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void regenSection("script")}
              disabled={regenBusy !== null}
              title="Rewrite the draft script"
              aria-label="Regenerate script"
            >
              ✦
            </button>
            <CopyButton text={scriptText} />
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          {scriptWords} words · about {scriptMins} min at natural pace
        </p>
        {scriptEditing ? (
          <textarea
            className="input gen-textarea"
            value={scriptText}
            rows={14}
            onChange={(e) => {
              setScriptText(e.target.value);
              setDirty(true);
            }}
            aria-label="Script"
          />
        ) : (
          <pre className="gen-script">{scriptShown}{scriptText.length > 600 && !scriptOpen ? "…" : ""}</pre>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {scriptText.length > 600 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setScriptOpen((v) => !v)}
            >
              {scriptOpen ? "Show Less ⌃" : "Show More ⌄"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setScriptEditing((v) => !v)}
          >
            {scriptEditing ? "Done editing" : "Edit script"}
          </button>
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Draft script — check every claim against your sources before recording. It is shorter
          than the full runtime: expand each beat with your own research.
        </p>
      </div>

      {/* Voiceover — ElevenLabs MP3 from the script + free browser preview */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Voiceover</h3>
          <CopyButton text={scriptText} label="Copy script" />
        </div>
        <p style={{ marginTop: 0 }}>
          Your script is ready to narrate — {scriptWords} words, about {scriptMins} min at natural
          pace.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <select
            className="input"
            style={{ maxWidth: 180 }}
            value={voLang}
            onChange={(e) => {
              setVoLang(e.target.value as "en" | "ur");
              setVoError(null);
            }}
            aria-label="Voiceover language"
          >
            <option value="en">English</option>
            <option value="ur">اردو (Urdu)</option>
          </select>
          <select
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            value={voVoiceId}
            onChange={(e) => setVoVoiceId(e.target.value)}
            aria-label="Voice"
          >
            {voVoices.length === 0 ? <option value="">Loading voices…</option> : null}
            {voVoices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.note ? ` — ${v.note}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={voBusy || !voConfigured || !scriptText.trim()}
            onClick={() => void generateVoiceover()}
          >
            {voBusy ? "Generating…" : "Generate voiceover"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={previewVoiceover}>
            {previewPlaying ? "⏹ Stop preview" : "🔊 Browser preview"}
          </button>
        </div>
        {voConfigured === false ? (
          <p className="notice" style={{ marginTop: 12 }}>
            Voiceover needs an ElevenLabs API key — the owner adds it in{" "}
            <a href="/settings">Settings</a> (or sets ELEVENLABS_API_KEY in Netlify). Meanwhile,
            the free browser preview reads the script aloud with your device&apos;s voices.
          </p>
        ) : null}
        {voUsage && voLimits ? (
          <p className="small muted" style={{ margin: "10px 0 0" }}>
            Free — {voLimits.perDay} voiceovers a day (
            {voLimits.charsPerDay.toLocaleString()} characters). Used today: {voUsage.count}/
            {voLimits.perDay} · {voUsage.chars.toLocaleString()} chars.
          </p>
        ) : null}
        {voError ? (
          <p className="error" style={{ marginTop: 10 }}>
            {voError}
          </p>
        ) : null}
        {voAudioUrl ? (
          <div style={{ marginTop: 14 }}>
            <audio controls src={voAudioUrl} style={{ width: "100%" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <a
                className="btn btn-ghost btn-sm"
                href={voAudioUrl}
                download={`${(pack?.topic ?? "voiceover").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "voiceover"}-voiceover.mp3`}
              >
                ⬇ Download MP3
              </a>
              <span className="small muted" style={{ alignSelf: "center" }}>
                {voChunks > 1 ? `${voChunks} chunks stitched · ` : ""}Voiceover of the script
                above — change the voice and generate again for another take.
              </span>
            </div>
          </div>
        ) : null}
        {voLang === "ur" ? (
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            Urdu uses ElevenLabs&apos; multilingual voices. The KikiVoice &ldquo;Julian&rdquo;
            voice from the tutorial can&apos;t be used inside Nizafa — KikiVoice has no public
            API.
          </p>
        ) : null}
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          Browser preview uses your device&apos;s built-in voices — quality varies, and it
          can&apos;t be downloaded. The MP3 above is the real narration of the script text,
          nothing added.
        </p>
      </div>

      {/* Tags */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Tags</h3>
          <CopyButton text={allTags} label="Copy tags" />
        </div>
        {tagsLoading ? <p className="small muted">Scoring tags…</p> : null}
        {trendingAvailable === false ? (
          <p className="small muted" style={{ marginTop: 0 }}>
            Tag scores don&apos;t include trending points yet — open Research once so Nizafa can
            compare tags with live searches.
          </p>
        ) : null}
        <div className="gen-tag-wrap">
          {tags.map((tag) => {
            const s = tagScores.find((x) => x.tag.toLowerCase() === tag.toLowerCase());
            return (
              <span key={tag} className="gen-tag-chip">
                <strong>{s ? s.score : "–"}</strong>
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <div className="gen-add-tag">
          <input
            className="input"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(newTag);
              }
            }}
            placeholder="Add tags"
            aria-label="Add a tag"
          />
          <button type="button" className="btn btn-ghost" onClick={() => addTag(newTag)}>
            Add
          </button>
        </div>
        {recommended.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="stat-label">Recommended</div>
            <div className="gen-tag-wrap" style={{ marginTop: 8 }}>
              {recommended.map((r) => (
                <span key={r.tag} className="gen-tag-chip gen-tag-rec">
                  <strong>{r.score}</strong>
                  <span>{r.tag}</span>
                  <button
                    type="button"
                    onClick={() => addTag(r.tag)}
                    aria-label={`Add recommended tag ${r.tag}`}
                    title={`Add ${r.tag}`}
                  >
                    +
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Description */}
      <div className="card gen-section">
        <div className="section-head">
          <h3 style={{ margin: 0 }}>Description</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void regenSection("description")}
              disabled={regenBusy !== null}
              title="Rewrite the description"
              aria-label="Regenerate description"
            >
              ✦
            </button>
            <CopyButton text={descText} />
          </div>
        </div>
        <textarea
          className="input gen-textarea"
          value={descText}
          rows={10}
          onChange={(e) => {
            setDescText(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (pack && currentTitle) void fetchTagScores(pack, tags, currentTitle.title, descText);
          }}
          aria-label="Description"
        />
        <div style={{ marginTop: 14 }}>
          <div className="section-head">
            <h3 style={{ margin: 0, fontSize: 15 }}>Hashtags</h3>
            <CopyButton text={allHashtags} label="Copy hashtags" />
          </div>
          <p style={{ overflowWrap: "anywhere", margin: "8px 0 0" }}>{allHashtags}</p>
        </div>
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Consistency check: {pack.consistency.pass ? "PASS" : "Needs a look"}</strong>
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
            {pack.consistency.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
