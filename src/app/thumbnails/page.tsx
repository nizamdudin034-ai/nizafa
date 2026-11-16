"use client";

// Thumbnail Studio — generator form + canvas editor + reference analysis
// + rule-based scorer + saved compositions.
//
// HOUSE STYLE — DECIDED 16 Nov 2026 from the user's 6 example thumbnails
// (THE SECRET OF TIME, MOTHER KILLED HER DAUGHTER?, THIS IS STRANGE!,
// ELON MUSK EXPOSED, THE 1947 FILES, UFO FILES EXPOSED): 1280×720,
// cinematic, dark moody background, strong red + blue rim lighting, high
// contrast. Big bold distressed white text across the TOP (usually 2
// lines); the punch word inside a solid RED box. Subject imagery fills
// the left/centre. FACE RULE: the ONLY face in the thumbnail is the
// person the video is about (supplied via the reference face upload) —
// NEVER the channel owner's / creator's face.
//
// WORKFLOW (user-confirmed 16 Nov 2026): the user takes Nizafa's prompt
// and generates the image himself in FLUX — the prompt carries the exact
// on-image text, so FLUX renders the text right in the image. The canvas
// editor below stays as the fallback: the text is drawn there with real
// fonts, stays editable, and Download PNG always exports the composed
// canvas — text included, never a bare image.
//
// Everything visual here runs in the browser: reference images are
// analysed on an offscreen canvas and are NEVER uploaded or stored
// anywhere. AI image generation (if a key is set on the server) goes
// through /api/thumbnail-image; without a key the page says so honestly
// and the canvas editor is the way to build a thumbnail. Saved
// compositions store SETTINGS only (no image data).

import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import {
  BACKGROUND_PRESETS,
  buildThumbnailPrompt,
  scoreThumbnailConcept,
  type ThumbnailPromptInput,
} from "@/lib/thumbnail";
import { defaultTextSpec, drawThumbnailText } from "@/lib/thumbnail-text";
import type { SavedThumbnail } from "@/app/api/thumbnails/saved/route";

type SizeKey = "16:9" | "9:16" | "1:1";
const SIZES: Record<SizeKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 1280, h: 720, label: "16:9 — 1280×720 (long video)" },
  "9:16": { w: 1080, h: 1920, label: "9:16 — 1080×1920 (Short)" },
  "1:1": { w: 1080, h: 1080, label: "1:1 — 1080×1080 (square)" },
};

/** Punch-box colours — solid red is the house default. */
const BOX_COLORS = [
  { name: "Red", value: "#d92d20" },
  { name: "Black", value: "#111111" },
  { name: "White", value: "#f5f5f0" },
  { name: "Teal", value: "#0e7c6b" },
  { name: "Gold", value: "#f5b301" },
];

/** Main top-text colours — distressed white is the house default. */
const TEXT_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Yellow", value: "#ffe600" },
  { name: "Amber", value: "#ffd60a" },
  { name: "Black", value: "#111111" },
];

const FONTS = [
  { name: "Arial Black (heavy — closest to the distressed look)", value: "'Arial Black', Arial, sans-serif" },
  { name: "Arial (clean sans)", value: "Arial, Helvetica, sans-serif" },
  { name: "Georgia (serif)", value: "Georgia, 'Times New Roman', serif" },
  { name: "Trebuchet (rounded)", value: "'Trebuchet MS', Verdana, sans-serif" },
  { name: "Verdana (wide)", value: "Verdana, Geneva, sans-serif" },
];

function readFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file is not a readable image."));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function loadRemoteImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be loaded for editing."));
    img.src = src;
  });
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(2, "0")}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `${hex(r)}${hex(g)}${hex(b)}`;
}

/** Face photo cropped to the face zone with a feathered left edge, so the
 * cutout blends into the background instead of showing a hard rectangle. */
function featheredFace(face: HTMLImageElement, fw: number, fh: number): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(fw));
  off.height = Math.max(1, Math.round(fh));
  const octx = off.getContext("2d");
  if (!octx) return off;
  const scale = Math.max(fw / face.width, fh / face.height);
  const dw = face.width * scale;
  const dh = face.height * scale;
  octx.drawImage(face, (fw - dw) / 2, (fh - dh) / 2, dw, dh);
  const grad = octx.createLinearGradient(0, 0, fw * 0.16, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,1)");
  octx.globalCompositeOperation = "destination-in";
  octx.fillStyle = grad;
  octx.fillRect(0, 0, fw, fh);
  octx.globalCompositeOperation = "source-over";
  return off;
}

export default function ThumbnailsPage() {
  // ── (1) Generator form ──────────────────────────────────────────────
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [mood, setMood] = useState<ThumbnailPromptInput["mood"]>("dramatic");
  const [punchWords, setPunchWords] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [genSize, setGenSize] = useState<SizeKey>("16:9");
  const [genImage, setGenImage] = useState<string | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const prompt = topic.trim()
    ? buildThumbnailPrompt({ topic, subject, mood, punchWords, styleNotes })
    : "";

  async function generateImage() {
    if (!prompt) return;
    setGenerating(true);
    setGenNote(null);
    setGenImage(null);
    try {
      const res = await fetch("/api/thumbnail-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: genSize }),
      });
      const data = (await res.json()) as {
        status?: string;
        imageUrl?: string;
        reason?: string;
        error?: string;
      };
      if (data.status === "ok" && data.imageUrl) {
        setGenImage(data.imageUrl);
        // Text ON by default: fill the top text + punch word from the
        // form so the editor preview shows the composed thumbnail, not a
        // bare image. Never overwrites text the user typed.
        applyDefaultText();
      } else {
        setGenNote(
          data.reason ?? data.error ?? "Image generation is not available right now."
        );
      }
    } catch {
      setGenNote("Could not reach the image service. Try the canvas editor below.");
    } finally {
      setGenerating(false);
    }
  }

  // ── (2) Editor (canvas composer) ────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SizeKey>("16:9");
  const [preset, setPreset] = useState(0); // 0 = "Cinematic dark"
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgName, setBgName] = useState<string | null>(null);
  const [faceImage, setFaceImage] = useState<HTMLImageElement | null>(null);
  const [faceName, setFaceName] = useState<string | null>(null);
  // Top text: main line in huge distressed white + punch word in a solid box.
  const [topText, setTopText] = useState("");
  const [punchWord, setPunchWord] = useState("");
  const [boxColor, setBoxColor] = useState("#d92d20");
  const [textColor, setTextColor] = useState("#ffffff");
  const [showText, setShowText] = useState(true);
  const [fontFamily, setFontFamily] = useState(FONTS[0].value);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [editorNote, setEditorNote] = useState<string | null>(null);

  // True once the user has typed the top text or punch word themselves.
  // Auto-text (below) only fills empty fields before that point.
  const textTouchedRef = useRef(false);

  /** Fill the top text + punch word from the topic/punch-words form when
   *  both are still empty and the user has not typed them — so the editor
   *  preview (and the downloaded PNG) shows the composed thumbnail with
   *  its text, never a bare image. */
  function applyDefaultText() {
    if (textTouchedRef.current) return;
    if (topText.trim() || punchWord.trim()) return;
    const spec = defaultTextSpec(topic, punchWords);
    if (spec.topText) setTopText(spec.topText);
    if (spec.punchWord) setPunchWord(spec.punchWord);
  }

  // Prefill from an Analysis thumbnail concept (?topText=&punch=&topic=&notes=).
  // Runs once on mount; the fields stay editable afterwards.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topTextParam = params.get("topText") ?? "";
    const punchParam = params.get("punch") ?? "";
    const topicParam = params.get("topic") ?? "";
    const notesParam = params.get("notes") ?? "";
    if (!topTextParam && !punchParam && !topicParam && !notesParam) return;
    if (topTextParam) setTopText(topTextParam);
    if (punchParam) {
      setPunchWord(punchParam);
      setPunchWords(punchParam);
    }
    if (topicParam) setTopic(topicParam);
    if (notesParam) setStyleNotes(notesParam);
    setEditorNote(
      "Concept loaded from Analysis — edit the text and image below, then download. " +
        "A downloaded thumbnail is a file for YouTube Studio; Nizafa does not change the thumbnail on YouTube directly."
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = SIZES[size];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background: uploaded/generated image (cover) or gradient preset.
    if (bgImage) {
      const scale = Math.max(w / bgImage.width, h / bgImage.height);
      const dw = bgImage.width * scale;
      const dh = bgImage.height * scale;
      ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, BACKGROUND_PRESETS[preset].from);
      grad.addColorStop(1, BACKGROUND_PRESETS[preset].to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Subject's face on the right third: feathered left edge + red/blue
    // rim glow. This is the ONLY face in the thumbnail — never the
    // channel owner's face.
    if (faceImage) {
      const fx = (w * 2) / 3;
      const fw = w / 3;
      const feathered = featheredFace(faceImage, fw, h);
      ctx.save();
      ctx.shadowColor = "rgba(90, 160, 255, 0.7)";
      ctx.shadowBlur = 24;
      ctx.drawImage(feathered, fx, 0);
      ctx.restore();
      // Red rim on the left edge of the cutout, blue on the right.
      ctx.strokeStyle = "rgba(255, 60, 40, 0.55)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fx + fw * 0.16, 0);
      ctx.lineTo(fx + fw * 0.16, h);
      ctx.stroke();
      ctx.strokeStyle = "rgba(90, 160, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(fx + fw - 2, 0);
      ctx.lineTo(fx + fw - 2, h);
      ctx.stroke();
    }

    // Top text: main line(s) in huge bold distressed white across the
    // top, punch word in a solid red box underneath — drawn by the shared
    // helper (lib/thumbnail-text.ts), the same one the Generate concept
    // previews and the Analysis Thumbnail tab use. The preview always
    // shows the composed thumbnail with its text, and Download PNG
    // exports this same canvas.
    drawThumbnailText(
      ctx,
      { topText, punchWord, boxColor, textColor, fontFamily, showText },
      w,
      h
    );
  }, [size, preset, bgImage, faceImage, topText, punchWord, boxColor, textColor, showText, fontFamily]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setComposerError("Could not export this canvas — remove any image that blocks export and try again.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nizafa-thumbnail-${size.replace(":", "x")}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch {
      setComposerError("This canvas uses an image that blocks export — remove the background image and try again.");
    }
  }

  async function onBgUpload(file: File | undefined) {
    if (!file) return;
    try {
      setBgImage(await readFileAsImage(file));
      setBgName(file.name);
      setComposerError(null);
      applyDefaultText();
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : "Could not load that image.");
    }
  }

  async function onFaceUpload(file: File | undefined) {
    if (!file) return;
    try {
      setFaceImage(await readFileAsImage(file));
      setFaceName(file.name);
      setComposerError(null);
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : "Could not load that image.");
    }
  }

  async function useGeneratedAsBackground() {
    if (!genImage) return;
    try {
      const img = await loadRemoteImage(genImage);
      setBgImage(img);
      setBgName("AI-generated image");
      applyDefaultText();
      setEditorNote("Generated image loaded as the editor background — the text from the form is already on it; edit it below if you want.");
    } catch {
      setEditorNote("That image could not be loaded into the editor (its provider blocks cross-origin use). Download it from the preview instead.");
    }
  }

  // ── (3) Reference thumbnail (style only) ────────────────────────────
  const [refSummary, setRefSummary] = useState<string | null>(null);
  const [refPrompt, setRefPrompt] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [refName, setRefName] = useState<string | null>(null);

  async function analyseReference(file: File | undefined) {
    if (!file) return;
    setRefError(null);
    setRefSummary(null);
    setRefPrompt(null);
    try {
      const img = await readFileAsImage(file);
      setRefName(file.name);
      const off = document.createElement("canvas");
      off.width = 120;
      off.height = 68;
      const ctx = off.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser.");
      ctx.drawImage(img, 0, 0, 120, 68);
      const data = ctx.getImageData(0, 0, 120, 68).data;

      // Dominant colours: quantise RGB into 32-step buckets.
      const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
      const thirdLum = [0, 0, 0];
      const thirdCount = [0, 0, 0];
      let totalLum = 0;
      for (let y = 0; y < 68; y++) {
        for (let x = 0; x < 120; x++) {
          const i = (y * 120 + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${r >> 5},${g >> 5},${b >> 5}`;
          const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          entry.count += 1;
          entry.r += r;
          entry.g += g;
          entry.b += b;
          buckets.set(key, entry);
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const third = Math.min(2, Math.floor(x / 40));
          thirdLum[third] += lum;
          thirdCount[third] += 1;
          totalLum += lum;
        }
      }
      const total = 120 * 68;
      const top = [...buckets.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((c) => ({
          hex: rgbToHex(
            Math.round(c.r / c.count),
            Math.round(c.g / c.count),
            Math.round(c.b / c.count)
          ),
          pct: Math.round((c.count / total) * 100),
        }));
      const thirds = thirdLum.map((l, i) =>
        Math.round(l / Math.max(1, thirdCount[i]))
      );
      const avgLum = Math.round(totalLum / total);
      const zone = (v: number) => (v < 70 ? "dark" : v < 150 ? "mid-tone" : "bright");
      const moodGuess: ThumbnailPromptInput["mood"] =
        avgLum < 90 ? "dramatic" : avgLum < 150 ? "bold" : "hopeful";
      const notes =
        `Dominant colours ${top.map((c) => `${c.hex} (${c.pct}%)`).join(", ")}; ` +
        `brightness left ${zone(thirds[0])}, centre ${zone(thirds[1])}, right ${zone(thirds[2])}; ` +
        `overall ${avgLum < 90 ? "dark and dramatic" : avgLum < 150 ? "balanced" : "bright and open"}.`;
      setStyleNotes(notes);
      setMood(moodGuess);
      setRefSummary(
        `${notes} Style to copy: big bold text across the TOP, punch word in a solid red box, cinematic subject image left/centre, subject's face only on the right, dark background with red + blue rim light. ` +
          `Only the style is copied — the reference image itself is never reused.`
      );
      setRefPrompt(
        buildThumbnailPrompt({
          topic: topic.trim() || "your video topic",
          subject,
          mood: moodGuess,
          punchWords,
          styleNotes: notes,
        })
      );
    } catch (e) {
      setRefError(e instanceof Error ? e.message : "Could not analyse that image.");
    }
  }

  // ── (4) Scorer ──────────────────────────────────────────────────────
  const [scoreText, setScoreText] = useState("");
  const [scorePunch, setScorePunch] = useState("");
  const [scoreFace, setScoreFace] = useState(true);
  const [scoreDark, setScoreDark] = useState(true);
  const [scoreContrast, setScoreContrast] = useState(true);
  const [scoreResult, setScoreResult] = useState<ReturnType<
    typeof scoreThumbnailConcept
  > | null>(null);

  function runScore() {
    setScoreResult(
      scoreThumbnailConcept({
        bigText: scoreText,
        punchWord: scorePunch,
        facePresent: scoreFace,
        backgroundDark: scoreDark,
        contrastHigh: scoreContrast,
      })
    );
  }

  // ── (5) Saved compositions ──────────────────────────────────────────
  const [saved, setSaved] = useState<SavedThumbnail[]>([]);
  const [savedLoaded, setSavedLoaded] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/thumbnails/saved")
      .then(async (r) => {
        const d = (await r.json()) as { compositions?: SavedThumbnail[]; error?: string };
        if (r.ok) setSaved(d.compositions ?? []);
      })
      .catch(() => {
        // Signed out or unavailable — saving simply stays off.
      })
      .finally(() => setSavedLoaded(true));
  }, []);

  async function saveComposition() {
    setSavedMsg(null);
    try {
      const res = await fetch("/api/thumbnails/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          composition: {
            topic,
            subject,
            mood,
            punchWords,
            size,
            preset,
            topText,
            punchWord,
            boxColor,
            textColor,
            showText,
            fontFamily,
            styleNotes,
          },
        }),
      });
      const d = (await res.json()) as { composition?: SavedThumbnail; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not save composition.");
      if (d.composition) setSaved((prev) => [d.composition as SavedThumbnail, ...prev]);
      setSavedMsg("Composition saved — settings only; re-attach images when you reload it.");
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "Could not save composition.");
    }
  }

  function loadComposition(c: SavedThumbnail) {
    setTopic(c.topic);
    setSubject(c.subject);
    setMood(c.mood as ThumbnailPromptInput["mood"]);
    setPunchWords(c.punchWords);
    setSize(c.size as SizeKey);
    setPreset(c.preset);
    setTopText(c.topText);
    setPunchWord(c.punchWord);
    setBoxColor(c.boxColor);
    setTextColor(c.textColor);
    setShowText(c.showText);
    setFontFamily(c.fontFamily);
    setStyleNotes(c.styleNotes);
    setEditorNote(`Loaded “${c.name}” — re-attach the face/background images if the original used them.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteComposition(id: number) {
    try {
      const res = await fetch(`/api/thumbnails/saved?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete it.");
      setSaved((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : "Could not delete it.");
    }
  }

  return (
    <>
      <section className="hero">
        <div className="kicker">Thumbnail Studio</div>
        <h1>Thumbnails that get the click</h1>
        <p className="muted">
          Generate a cinematic image from a prompt — the prompt includes the
          exact words for the thumbnail, so FLUX renders the text right in
          the image. Place the subject&apos;s real face cutout, or match a
          reference thumbnail&apos;s style — and adjust the text any time in
          the editor below.
        </p>
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>House style (from your 6 examples):</strong> cinematic
          dark background, red + blue rim light, big bold distressed white
          text across the TOP, punch word in a solid RED box, subject imagery
          left/centre, and the subject&apos;s face only on the right — never
          the channel owner&apos;s face.
        </div>
      </section>

      {/* (1) Generator form */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>1 · Generator</h2>
          <p className="small muted">
            Describe the video, attach the subject&apos;s face and/or a
            reference thumbnail, and generate the image — the prompt carries
            the exact on-image text (top line + punch word in the red box)
            for FLUX.
          </p>
          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="th-topic">Video topic / prompt</label>
              <input
                id="th-topic"
                className="input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Why central banks are buying gold"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-subject">Main subject / face — the person the video is about</label>
              <input
                id="th-subject"
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Jerome Powell, serious expression"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-mood">Mood</label>
              <select
                id="th-mood"
                className="input"
                value={mood}
                onChange={(e) => setMood(e.target.value as ThumbnailPromptInput["mood"])}
              >
                <option value="dramatic">Dramatic</option>
                <option value="bold">Bold</option>
                <option value="curious">Curious</option>
                <option value="urgent">Urgent</option>
                <option value="hopeful">Hopeful</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="th-punch">Punch words (goes in the red box)</label>
              <input
                id="th-punch"
                className="input"
                value={punchWords}
                onChange={(e) => setPunchWords(e.target.value)}
                placeholder="e.g. EXPOSED"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-face-gen">Reference face photo — the subject&apos;s face only</label>
              <input
                id="th-face-gen"
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => onFaceUpload(e.target.files?.[0])}
              />
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                {faceName ? `Attached: ${faceName}. ` : ""}
                The face in the thumbnail is ONLY the person the video is
                about — never the channel owner&apos;s face. For the
                cleanest cutout, upload a PNG with the background already
                removed. Otherwise the photo fills the right third with a
                soft-blended edge.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="th-ref">Reference thumbnail (style only)</label>
              <input
                id="th-ref"
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => analyseReference(e.target.files?.[0])}
              />
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Only the layout, colours and feel are copied — the reference
                image itself is never reused. It is processed in your browser
                and never uploaded.
              </p>
            </div>
          </div>
          {refError ? <p className="error" style={{ marginTop: 12 }}>{refError}</p> : null}
          {refSummary ? (
            <div style={{ marginTop: 12 }}>
              <p style={{ marginBottom: 4 }}>
                <strong>{refName}</strong>
              </p>
              <p className="small" style={{ marginBottom: 0 }}>{refSummary}</p>
            </div>
          ) : null}
          {prompt ? (
            <>
              <pre className="code" style={{ marginTop: 16 }}>{prompt}</pre>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <CopyButton text={prompt} label="Copy prompt" />
                <select
                  className="input"
                  style={{ width: "auto", flex: "0 0 auto" }}
                  value={genSize}
                  onChange={(e) => setGenSize(e.target.value as SizeKey)}
                  aria-label="Image size"
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={generateImage}
                  disabled={generating}
                >
                  {generating ? "Generating…" : "Generate image (AI)"}
                </button>
              </div>
              {genNote ? <p className="notice" style={{ marginTop: 12 }}>{genNote}</p> : null}
              {genImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={genImage}
                    alt="AI-generated thumbnail image (with text)"
                    style={{ width: "100%", borderRadius: 12, marginTop: 12 }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={useGeneratedAsBackground}>
                      Use as editor background ↓
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Type a video topic to build your prompt.
            </p>
          )}
        </div>
      </section>

      {/* (2) Editor */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>2 · Editor</h2>
          <p className="small muted">
            Compose the thumbnail and download it as a PNG — the preview
            always shows the text, and the download includes it. Big bold
            text across the top, punch word in a solid red box,
            subject&apos;s face on the right — all drawn with real fonts.
            Works fully offline in your browser.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {(Object.keys(SIZES) as SizeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`btn btn-sm ${size === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSize(k)}
              >
                {SIZES[k].label}
              </button>
            ))}
          </div>
          <div className="grid grid-2" style={{ marginBottom: 12 }}>
            <div>
              <span className="label">Background preset</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BACKGROUND_PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`btn btn-sm ${preset === i && !bgImage ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => {
                      setPreset(i);
                      setBgImage(null);
                      setBgName(null);
                    }}
                    title={`${p.from} → ${p.to}`}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                        marginInlineEnd: 6,
                        verticalAlign: "-2px",
                      }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="th-bg">Background image (optional)</label>
              <input
                id="th-bg"
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => onBgUpload(e.target.files?.[0])}
              />
              {bgImage ? (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setBgImage(null); setBgName(null); }}>
                  Remove background image{bgName ? ` (${bgName})` : ""}
                </button>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="th-top">Top text (main line)</label>
              <input
                id="th-top"
                className="input"
                value={topText}
                onChange={(e) => {
                  setTopText(e.target.value);
                  textTouchedRef.current = true;
                }}
                placeholder="e.g. THE SECRET OF"
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`btn btn-sm ${textColor === c.value ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setTextColor(c.value)}
                    title={`Top text in ${c.name}`}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: c.value,
                        marginInlineEnd: 6,
                        verticalAlign: "-2px",
                        border: "1px solid var(--line)",
                      }}
                    />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="th-punch-word">Punch word (in the solid box)</label>
              <input
                id="th-punch-word"
                className="input"
                value={punchWord}
                onChange={(e) => {
                  setPunchWord(e.target.value);
                  textTouchedRef.current = true;
                }}
                placeholder="e.g. TIME"
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {BOX_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`btn btn-sm ${boxColor === c.value ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setBoxColor(c.value)}
                    title={`Punch box in ${c.name}`}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: c.value,
                        marginInlineEnd: 6,
                        verticalAlign: "-2px",
                        border: "1px solid var(--line)",
                      }}
                    />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="th-font">Text font (real font, not baked art)</label>
              <select
                id="th-font"
                className="input"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
              >
                {FONTS.map((f) => (
                  <option key={f.value} value={f.value}>{f.name}</option>
                ))}
              </select>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={showText}
                  onChange={(e) => setShowText(e.target.checked)}
                />
                Show top text
              </label>
            </div>
            <div>
              <span className="label">Face cutout</span>
              <p className="small muted" style={{ margin: "0 0 8px" }}>
                {faceName ? `Attached: ${faceName}. ` : "No face attached yet. "}
                Upload the subject&apos;s photo in step 1 — it appears on the
                right third with a blended edge and red + blue rim light.
              </p>
              {faceImage ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFaceImage(null); setFaceName(null); }}>
                  Remove face
                </button>
              ) : null}
            </div>
          </div>
          {composerError ? <p className="error">{composerError}</p> : null}
          {editorNote ? <p className="small" style={{ marginBottom: 8 }}>{editorNote}</p> : null}
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", background: "#14181d" }}
          />
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-primary" onClick={downloadPng}>
              Download PNG
            </button>
            <button type="button" className="btn btn-ghost" onClick={saveComposition}>
              Save composition
            </button>
            <span className="small muted">
              {SIZES[size].w}×{SIZES[size].h} · PNG
            </span>
          </div>
          {savedMsg ? <p className="small" style={{ marginTop: 10 }}>{savedMsg}</p> : null}

          {savedLoaded && saved.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 8 }}>Saved compositions</h3>
              <p className="small muted">
                Settings only — images are never stored, so re-attach the face
                and background images when you reload one.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {saved.map((c) => (
                  <div key={c.id} className="list-row" style={{ padding: "10px 0" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong>{c.name}</strong>
                      <div className="small muted">
                        {c.size} · {c.topText || c.topic || "No text yet"} ·{" "}
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadComposition(c)}>
                      Load
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteComposition(c.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* (3) Scorer */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>3 · Thumbnail scorer</h2>
          <p className="small muted">
            A rule-based checklist score against the house style — an{" "}
            <strong>editorial estimate</strong>, not a prediction of clicks.
          </p>
          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="th-score-text">Top text</label>
              <input
                id="th-score-text"
                className="input"
                value={scoreText}
                onChange={(e) => setScoreText(e.target.value)}
                placeholder="e.g. THE SECRET OF"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-score-punch">Punch word (in the red box)</label>
              <input
                id="th-score-punch"
                className="input"
                value={scorePunch}
                onChange={(e) => setScorePunch(e.target.value)}
                placeholder="e.g. TIME"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" checked={scoreFace} onChange={(e) => setScoreFace(e.target.checked)} />
              Subject&apos;s face only (right third)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" checked={scoreDark} onChange={(e) => setScoreDark(e.target.checked)} />
              Dark, cinematic background
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" checked={scoreContrast} onChange={(e) => setScoreContrast(e.target.checked)} />
              High contrast
            </label>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={runScore}>
            Score this concept
          </button>
          {scoreResult ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 26 }}>{scoreResult.score}/100</strong>{" "}
                <span className="badge badge-teal">{scoreResult.label}</span>{" "}
                <span className="small muted">Editorial estimate</span>
              </p>
              {scoreResult.checks.map((c) => (
                <div key={c.label} className="list-row" style={{ padding: "8px 0" }}>
                  <span className={`badge ${c.pass ? "badge-teal" : "badge-red"}`}>
                    {c.pass ? "✓" : "✗"}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{c.label}</strong>
                    <div className="small muted">{c.detail}</div>
                  </div>
                </div>
              ))}
              {scoreResult.fixes.length > 0 ? (
                <>
                  <h3 style={{ marginTop: 12 }}>Fixes</h3>
                  <ul style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
                    {scoreResult.fixes.map((f) => (
                      <li key={f} className="small" style={{ marginBottom: 6 }}>{f}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
