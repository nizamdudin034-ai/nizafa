// POST /api/generate/tags — real scores for a pack's tags.
// Scores every current tag and recommends the pack's remaining tags,
// using Nizafa's own rule-based tag scorer (topic + title + description
// + trending snapshot + length). The "trending" points come from the
// latest stored trending snapshot; when no snapshot exists the scores
// simply have no trending points and the response says so — never a
// fake volume. No AI, no external calls.
import { NextResponse } from "next/server";
import { scoreTag, type TagScore } from "@/lib/consistency";
import { recommendTags } from "@/lib/seo-checklist";
import { topicKeywords } from "@/lib/generator";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";

type TrendItem = { title?: string };

async function trendingTitles(): Promise<{ titles: string[]; available: boolean }> {
  if (!isSupabaseConfigured()) return { titles: [], available: false };
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("trending_snapshots")
      .select("items")
      .order("fetched_at", { ascending: false })
      .limit(1);
    const items = ((data?.[0]?.items ?? []) as TrendItem[])
      .map((i) => i.title ?? "")
      .filter(Boolean);
    return { titles: items, available: items.length > 0 };
  } catch {
    return { titles: [], available: false };
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    title?: string;
    description?: string;
    currentTags?: string[];
    packTags?: string[];
  };
  const topic = (body.topic ?? "").trim();
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim();
  const currentTags = (body.currentTags ?? []).filter(Boolean).slice(0, 30);
  const packTags = (body.packTags ?? []).filter(Boolean).slice(0, 30);
  if (!topic) {
    return NextResponse.json({ error: "Need a topic." }, { status: 400 });
  }
  const { titles: trend, available } = await trendingTitles();
  const kws = topicKeywords(topic);
  const ctx = { title, description, topicKeywords: kws, trendingTitles: trend };
  const current: TagScore[] = currentTags.map((t) => scoreTag(t, ctx));
  const recommended = recommendTags({
    packTags,
    currentTags,
    title,
    description,
    topic,
    trendingTitles: trend,
    limit: 6,
  });
  return NextResponse.json({
    current,
    recommended,
    trendingAvailable: available,
  });
}
