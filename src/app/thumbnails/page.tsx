"use client";

// Thumbnail Studio — prompt builder, canvas composer, reference analysis
// and a rule-based scorer. Everything visual here runs in the browser:
// reference images are analysed on an offscreen canvas and are NEVER
// uploaded or stored anywhere. AI image generation (if a key is set on
// the server) goes through /api/thumbnail-image; without a key the page
// says so honestly and the canvas composer is the way to build a thumbnail.

import { useEffect, useRef, useState } from "react";
import CopyButton from "@/components/CopyButton";
import {
  BACKGROUND_PRESETS,
  buildThumbnailPrompt,
  scoreThumbnailConcept,
  type ThumbnailPromptInput,
} from "@/lib/thumbnail";

type SizeKey = "16:9" | "9:16" | "1:1";
const SIZES: Record<SizeKey, { w: number; h: number; label: string }> = {
  "16:9": { w: 1280, h: 720, label: "16:9 — 1280×720 (long video)" },
  "9:16": { w: 1080, h: 1920, label: "9:16 — 1080×1920 (Short)" },
  "1:1": { w: 1080, h: 1080, label: "1:1 — 1080×1080 (square)" },
};

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

function hex(n: number): string {
  return `#${n.toString(16).padStart(2, "0")}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `${hex(r)}${hex(g)}${hex(b)}`;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  weight = 800
): number {
  let px = startPx;
  while (px > 18) {
    ctx.font = `${weight} ${px}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 4;
  }
  return px;
}

export default function ThumbnailsPage() {
  // ── (a) Prompt builder ──────────────────────────────────────────────
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [mood, setMood] = useState<ThumbnailPromptInput["mood"]>("dramatic");
  const [punchWords, setPunchWords] = useState("");
  const [genSize, setGenSize] = useState<SizeKey>("16:9");
  const [genImage, setGenImage] = useState<string | null>(null);
  const [genNote, setGenNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const prompt = topic.trim()
    ? buildThumbnailPrompt({ topic, subject, mood, punchWords })
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
      } else {
        setGenNote(
          data.reason ?? data.error ?? "Image generation is not available right now."
        );
      }
    } catch {
      setGenNote("Could not reach the image service. Try the canvas composer below.");
    } finally {
      setGenerating(false);
    }
  }

  // ── (b) Canvas composer ─────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<SizeKey>("16:9");
  const [preset, setPreset] = useState(0);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [faceImage, setFaceImage] = useState<HTMLImageElement | null>(null);
  const [bannerText, setBannerText] = useState("");
  const [bannerPunch, setBannerPunch] = useState("");
  const [showBanner, setShowBanner] = useState(true);
  const [composerError, setComposerError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = SIZES[size];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background: uploaded image (cover) or gradient preset.
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

    // Face cutout on the right third (cover-crop, blue rim light).
    if (faceImage) {
      const fx = (w * 2) / 3;
      const fw = w / 3;
      const scale = Math.max(fw / faceImage.width, h / faceImage.height);
      const dw = faceImage.width * scale;
      const dh = faceImage.height * scale;
      ctx.save();
      ctx.shadowColor = "rgba(90, 160, 255, 0.9)";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.rect(fx, 0, fw, h);
      ctx.clip();
      ctx.drawImage(faceImage, fx + (fw - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = "rgba(120, 180, 255, 0.85)";
      ctx.lineWidth = 4;
      ctx.strokeRect(fx + 2, 2, fw - 4, h - 4);
    }

    // Red banner across the bottom with huge text + yellow punch word.
    if (showBanner) {
      const bannerH = Math.round(h * 0.26);
      const by = h - bannerH;
      ctx.fillStyle = "#d92d20";
      ctx.fillRect(0, by, w, bannerH);
      const main = bannerText.trim();
      const punch = bannerPunch.trim();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (main || punch) {
        if (main && punch) {
          const mainPx = fitFont(ctx, main.toUpperCase(), w * 0.9, Math.round(bannerH * 0.3));
          ctx.fillStyle = "#ffffff";
          ctx.font = `800 ${mainPx}px Arial, Helvetica, sans-serif`;
          ctx.fillText(main.toUpperCase(), w / 2, by + bannerH * 0.28);
          const punchPx = fitFont(ctx, punch.toUpperCase(), w * 0.9, Math.round(bannerH * 0.42), 900);
          ctx.fillStyle = "#ffd60a";
          ctx.font = `900 ${punchPx}px Arial, Helvetica, sans-serif`;
          ctx.fillText(punch.toUpperCase(), w / 2, by + bannerH * 0.74);
        } else {
          const text = (main || punch).toUpperCase();
          const px = fitFont(ctx, text, w * 0.9, Math.round(bannerH * 0.5), 900);
          ctx.fillStyle = punch && !main ? "#ffd60a" : "#ffffff";
          ctx.font = `900 ${px}px Arial, Helvetica, sans-serif`;
          ctx.fillText(text, w / 2, by + bannerH / 2);
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        const px = Math.round(bannerH * 0.22);
        ctx.font = `700 ${px}px Arial, Helvetica, sans-serif`;
        ctx.fillText("YOUR BANNER TEXT HERE", w / 2, by + bannerH / 2);
      }
    }
  }, [size, preset, bgImage, faceImage, bannerText, bannerPunch, showBanner]);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nizafa-thumbnail-${size.replace(":", "x")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function onBgUpload(file: File | undefined) {
    if (!file) return;
    try {
      setBgImage(await readFileAsImage(file));
      setComposerError(null);
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : "Could not load that image.");
    }
  }

  async function onFaceUpload(file: File | undefined) {
    if (!file) return;
    try {
      setFaceImage(await readFileAsImage(file));
      setComposerError(null);
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : "Could not load that image.");
    }
  }

  // ── (c) Reference analysis (client-side only) ───────────────────────
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

      setRefSummary(
        `Dominant colours: ${top.map((c) => `${c.hex} (${c.pct}%)`).join(", ")}. ` +
          `Brightness — left ${zone(thirds[0])} (${thirds[0]}), centre ${zone(thirds[1])} (${thirds[1]}), right ${zone(thirds[2])} (${thirds[2]}). ` +
          `Overall the thumbnail reads as ${avgLum < 90 ? "dark and dramatic" : avgLum < 150 ? "balanced" : "bright and open"}. ` +
          `Style to copy: ${moodGuess === "dramatic" ? "dark background, high contrast, one strong face" : moodGuess === "bold" ? "strong colours, bold contrast" : "bright, warm, open feel"}.`
      );
      setRefPrompt(
        buildThumbnailPrompt({
          topic: topic.trim() || "your video topic",
          subject,
          mood: moodGuess,
          punchWords,
        })
      );
    } catch (e) {
      setRefError(e instanceof Error ? e.message : "Could not analyse that image.");
    }
  }

  // ── (d) Scorer ──────────────────────────────────────────────────────
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

  return (
    <>
      <section className="hero">
        <div className="kicker">Thumbnail Studio</div>
        <h1>Thumbnails that get the click</h1>
        <p className="muted">
          Build a prompt, compose a thumbnail on a real canvas, learn from a
          reference image, or score a concept. The Nizafa style: dark navy
          background, face on the right third, red banner at the bottom with
          huge text and one punch word in yellow.
        </p>
      </section>

      {/* (a) Prompt builder */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>1 · Thumbnail prompt builder</h2>
          <p className="small muted">
            Describe the video and get a ready-to-use image prompt. The text
            is added afterwards in the editor with real fonts — never baked
            into generated art.
          </p>
          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="th-topic">Video topic</label>
              <input
                id="th-topic"
                className="input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Why central banks are buying gold"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-subject">Main subject / face</label>
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
              <label className="label" htmlFor="th-punch">Punch words</label>
              <input
                id="th-punch"
                className="input"
                value={punchWords}
                onChange={(e) => setPunchWords(e.target.value)}
                placeholder="e.g. GOLD RUSH"
              />
            </div>
          </div>
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={genImage}
                  alt="AI-generated thumbnail base image (no text)"
                  style={{ width: "100%", borderRadius: 12, marginTop: 12 }}
                />
              ) : null}
            </>
          ) : (
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Type a video topic to build your prompt.
            </p>
          )}
        </div>
      </section>

      {/* (b) Canvas composer */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>2 · Canvas composer</h2>
          <p className="small muted">
            Compose the real thumbnail and download it as a PNG. Works fully
            offline in your browser — no upload needed.
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
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setBgImage(null)}>
                  Remove background image
                </button>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="th-face">Face cutout image (right third)</label>
              <input
                id="th-face"
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => onFaceUpload(e.target.files?.[0])}
              />
              {faceImage ? (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setFaceImage(null)}>
                  Remove face image
                </button>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="th-banner">Banner text</label>
              <input
                id="th-banner"
                className="input"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                placeholder="e.g. THEY ARE BUYING"
              />
              <label className="label" htmlFor="th-banner-punch" style={{ marginTop: 10 }}>
                Punch word (yellow, biggest)
              </label>
              <input
                id="th-banner-punch"
                className="input"
                value={bannerPunch}
                onChange={(e) => setBannerPunch(e.target.value)}
                placeholder="e.g. GOLD"
              />
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontWeight: 600, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={showBanner}
                  onChange={(e) => setShowBanner(e.target.checked)}
                />
                Show red banner
              </label>
            </div>
          </div>
          {composerError ? <p className="error">{composerError}</p> : null}
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", background: "#06101f" }}
          />
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={downloadPng}>
              Download PNG
            </button>
            <span className="small muted" style={{ marginInlineStart: 12 }}>
              {SIZES[size].w}×{SIZES[size].h} · PNG
            </span>
          </div>
        </div>
      </section>

      {/* (c) Reference analysis */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>3 · Reference analysis</h2>
          <p className="small muted">
            Upload a thumbnail you like. Nizafa reads its colours and layout
            and writes you a fresh prompt in that style.{" "}
            <strong>
              The image is processed only in your browser — it is never
              uploaded, stored, or sent anywhere.
            </strong>
          </p>
          <label className="label" htmlFor="th-ref">Reference thumbnail</label>
          <input
            id="th-ref"
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => analyseReference(e.target.files?.[0])}
          />
          {refError ? <p className="error" style={{ marginTop: 12 }}>{refError}</p> : null}
          {refSummary ? (
            <>
              <p style={{ marginTop: 12, marginBottom: 4 }}>
                <strong>{refName}</strong>
              </p>
              <p className="small">{refSummary}</p>
              {refPrompt ? (
                <>
                  <pre className="code">{refPrompt}</pre>
                  <CopyButton text={refPrompt} label="Copy this style's prompt" />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {/* (d) Scorer */}
      <section className="section">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>4 · Thumbnail scorer</h2>
          <p className="small muted">
            A rule-based checklist score — an{" "}
            <strong>editorial estimate</strong>, not a prediction of clicks.
          </p>
          <div className="grid grid-2">
            <div>
              <label className="label" htmlFor="th-score-text">Banner text</label>
              <input
                id="th-score-text"
                className="input"
                value={scoreText}
                onChange={(e) => setScoreText(e.target.value)}
                placeholder="e.g. THEY ARE BUYING GOLD"
              />
            </div>
            <div>
              <label className="label" htmlFor="th-score-punch">Punch word</label>
              <input
                id="th-score-punch"
                className="input"
                value={scorePunch}
                onChange={(e) => setScorePunch(e.target.value)}
                placeholder="e.g. GOLD"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" checked={scoreFace} onChange={(e) => setScoreFace(e.target.checked)} />
              Face on the right third
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
              <input type="checkbox" checked={scoreDark} onChange={(e) => setScoreDark(e.target.checked)} />
              Dark background
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
