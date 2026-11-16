import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";

// /api/create/feedback — thumbs up/down + niche tuning for /create.
// Persists in Supabase in the existing `packages` table
// (kind='create-feedback', one row per user + channel; no new table).
// Liked topics are pinned first, disliked topics are hidden from the feed.
//
// GET  ?channelId=… → { liked, disliked, niche, channelId }
// POST { channelId, like?: string, dislike?: string, undo?: string,
//        niche?: string[], action?: "reset" }
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateFeedback = {
  liked: string[];
  disliked: string[];
  niche: string[] | null;
};

function feedbackTopic(channelId: number): string {
  return `create-feedback:${channelId}`;
}

function keyOf(title: string): string {
  return title.trim().toLowerCase();
}

async function loadFeedback(
  admin: SupabaseClient,
  userId: string,
  channelId: number
): Promise<CreateFeedback> {
  const empty: CreateFeedback = { liked: [], disliked: [], niche: null };
  const { data } = await admin
    .from("packages")
    .select("payload_json")
    .eq("user_id", userId)
    .eq("kind", "create-feedback")
    .eq("topic", feedbackTopic(channelId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.payload_json as CreateFeedback | null;
  if (!payload) return empty;
  return {
    liked: Array.isArray(payload.liked) ? payload.liked : [],
    disliked: Array.isArray(payload.disliked) ? payload.disliked : [],
    niche: Array.isArray(payload.niche) ? payload.niche : null,
  };
}

async function saveFeedback(
  admin: SupabaseClient,
  userId: string,
  channelId: number,
  fb: CreateFeedback
): Promise<void> {
  const { data: existing } = await admin
    .from("packages")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "create-feedback")
    .eq("topic", feedbackTopic(channelId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    await admin
      .from("packages")
      .update({ payload_json: fb })
      .eq("id", (existing as { id: number }).id);
  } else {
    await admin.from("packages").insert({
      user_id: userId,
      kind: "create-feedback",
      topic: feedbackTopic(channelId),
      payload_json: fb,
    });
  }
}

async function ownChannelId(
  admin: SupabaseClient,
  userId: string,
  param: string | null
): Promise<number | null> {
  const { data: channels } = await admin
    .from("channels")
    .select("id")
    .eq("role", "own")
    .eq("user_id", userId)
    .order("connected_at", { ascending: true });
  const list = (channels ?? []) as Array<{ id: number }>;
  if (list.length === 0) return null;
  if (param) {
    const found = list.find((c) => c.id === Number(param));
    if (found) return found.id;
  }
  return list[0].id;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const admin = createSupabaseAdmin();
  const channelId = await ownChannelId(
    admin,
    user.id,
    new URL(req.url).searchParams.get("channelId")
  );
  if (!channelId) {
    return NextResponse.json({ liked: [], disliked: [], niche: null, channelId: null });
  }
  const fb = await loadFeedback(admin, user.id, channelId);
  return NextResponse.json({ ...fb, channelId });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    channelId?: number | string;
    like?: string;
    dislike?: string;
    undo?: string;
    niche?: string[];
    action?: string;
  };
  const admin = createSupabaseAdmin();
  const channelId = await ownChannelId(
    admin,
    user.id,
    body.channelId != null ? String(body.channelId) : null
  );
  if (!channelId) {
    return NextResponse.json({ error: "No channel connected yet." }, { status: 400 });
  }
  let fb = await loadFeedback(admin, user.id, channelId);

  if (body.action === "reset") {
    fb = { liked: [], disliked: [], niche: null };
  } else {
    if (typeof body.like === "string" && body.like.trim()) {
      const k = keyOf(body.like);
      fb.disliked = fb.disliked.filter((t) => keyOf(t) !== k);
      if (!fb.liked.some((t) => keyOf(t) === k)) fb.liked.push(body.like.trim());
    }
    if (typeof body.dislike === "string" && body.dislike.trim()) {
      const k = keyOf(body.dislike);
      fb.liked = fb.liked.filter((t) => keyOf(t) !== k);
      if (!fb.disliked.some((t) => keyOf(t) === k)) fb.disliked.push(body.dislike.trim());
    }
    if (typeof body.undo === "string" && body.undo.trim()) {
      const k = keyOf(body.undo);
      fb.liked = fb.liked.filter((t) => keyOf(t) !== k);
      fb.disliked = fb.disliked.filter((t) => keyOf(t) !== k);
    }
    if (Array.isArray(body.niche)) {
      fb.niche = body.niche
        .map((n) => n.trim())
        .filter((n) => n.length > 0 && n.length <= 64)
        .slice(0, 12);
    }
  }

  await saveFeedback(admin, user.id, channelId, fb);
  return NextResponse.json({ ...fb, channelId });
}
