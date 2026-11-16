// POST /api/consistency — title ↔ description ↔ script ↔ thumbnail match.
// Body: { packageId, action?: "score" | "apply", title?, variant?: 0 | 1 | 2 }
//  - score (default): consistency for the pack's current title + 3
//    alternative titles, each with its own consistency score.
//  - apply: saves `title` as the pack's chosen title (bestTitle +
//    chosenTitle + chosenAt in payload_json) and returns the fresh score.
// Scores are computed from the saved pack text only — nothing is invented.
// Regenerate cycles variant 0 (topic-led) → 1 (question/how) → 2 (punch-led);
// every variant scores its titles with the same real consistency scorer and
// returns the top 3 by title match (mean of the three title parts).
import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import {
  alternativesForPack,
  consistencyForPack,
  currentPackTitle,
  type ConsistencyResult,
  type StoredPack,
} from "@/lib/consistency";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    packageId?: number;
    action?: "score" | "apply";
    title?: string;
    variant?: number;
  };
  const packageId = Number(body.packageId);
  if (!packageId) {
    return NextResponse.json({ error: "packageId is required." }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("packages")
    .select("id,topic,payload_json")
    .eq("id", packageId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  }
  const pack = data.payload_json as StoredPack;
  let currentTitle = currentPackTitle(pack);

  if (body.action === "apply") {
    const title = (body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "title is required to apply." }, { status: 400 });
    }
    const updated: StoredPack = {
      ...pack,
      bestTitle: title,
      chosenTitle: title,
      chosenAt: new Date().toISOString(),
    };
    const { error: upErr } = await admin
      .from("packages")
      .update({ payload_json: updated })
      .eq("id", packageId);
    if (upErr) {
      return NextResponse.json({ error: `Could not save: ${upErr.message}` }, { status: 500 });
    }
    currentTitle = title;
    const consistency: ConsistencyResult = consistencyForPack(updated);
    return NextResponse.json({
      packageId,
      topic: pack.topic,
      currentTitle,
      applied: true,
      consistency,
      alternatives: alternativesForPack(updated, currentTitle, 0),
    });
  }

  const variant = body.variant === 1 || body.variant === 2 ? body.variant : 0;
  return NextResponse.json({
    packageId,
    topic: pack.topic,
    currentTitle,
    applied: false,
    consistency: consistencyForPack(pack),
    alternatives: alternativesForPack(pack, currentTitle, variant),
  });
}
