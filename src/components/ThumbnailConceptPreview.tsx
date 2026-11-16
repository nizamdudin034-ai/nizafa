"use client";

// ThumbnailConceptPreview — a small composited preview of one thumbnail
// concept, WITH its text rendered (never a bare image). Used by the
// Generate page's Thumbnail section and the Analysis Thumbnail tab.
//
// Usage (Generate page, Thumbnail section):
//   <ThumbnailConceptPreview
//     bigText={currentConcept.bigText}
//     punchWord=""               // or the concept's punch word, if any
//     topic={pack.topic}
//   />
// And the "Open in Thumbnail Studio" link next to it should carry the
// concept's text along, so the composed thumbnail has it:
//   href={`/thumbnails?${new URLSearchParams({
//     topText: currentConcept.bigText,
//     topic: pack.topic,
//   }).toString()}`}
//
// The preview is drawn by the shared helper (lib/thumbnail-text.ts):
// dark cinematic gradient + the text on top. It is a preview only —
// the real image comes from FLUX using the prompt (which carries the
// same exact text), or from Thumbnail Studio.

import { useEffect, useRef } from "react";
import { renderCompositedThumbnail } from "@/lib/thumbnail-text";

type Props = {
  /** Main text across the top (the concept's big text). */
  bigText: string;
  /** Punch word in the solid red box — empty means no box. */
  punchWord?: string;
  /** Topic, used only to derive a top text when bigText is empty. */
  topic?: string;
  /** Backing canvas size (16:9 preview). */
  width?: number;
  height?: number;
};

export default function ThumbnailConceptPreview({
  bigText,
  punchWord = "",
  topic = "",
  width = 640,
  height = 360,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const composed = renderCompositedThumbnail(
      null,
      {
        topText: bigText.trim() || topic.trim(),
        punchWord: punchWord.trim(),
      },
      width,
      height
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(composed, 0, 0);
  }, [bigText, punchWord, topic, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: "100%", height: "auto", borderRadius: 12, display: "block", background: "#14181d" }}
      aria-label={`Thumbnail preview with the text: ${bigText}`}
    />
  );
}
