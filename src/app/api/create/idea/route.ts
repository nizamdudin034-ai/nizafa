import { NextResponse } from "next/server";
import { generateSeoPack, cleanTopic } from "@/lib/generator";

// POST /api/create/idea — "Start From Your Idea": title + thumbnail
// recommendations for a topic, from Nizafa's own generator (the same
// rule-based flow /generate uses). No YouTube quota, no LLM: titles are
// scored by rule-based signals and thumbnail concepts follow Nizafa's own
// thumbnail rule. Scores are editorial estimates, never view predictions.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    channelTitle?: string;
  };
  const topic = cleanTopic(body.topic ?? "");
  if (topic.length < 3) {
    return NextResponse.json(
      { error: "Give a topic of at least 3 characters." },
      { status: 400 }
    );
  }
  const pack = generateSeoPack(topic, body.channelTitle?.trim() || undefined);
  return NextResponse.json({
    topic: pack.topic,
    titles: pack.titles.slice(0, 3).map((t) => ({
      title: t.title,
      score: t.score,
      style: t.style,
      why: t.why,
    })),
    bestTitle: pack.bestTitle,
    hook: pack.hook,
    thumbnailConcepts: pack.thumbnailConcepts.slice(0, 2).map((c) => ({
      bigText: c.bigText,
      layout: c.layout,
      imageIdea: c.imageIdea,
    })),
    disclaimer: pack.disclaimer,
  });
}
