// /api/daily-ideas/state — Save / Dismiss / Restore for daily ideas.
// Persists in Supabase in the existing `packages` table
// (kind='daily-idea-states', one row per user + channel; no new table or
// migration needed). States are keyed by idea title, so a saved idea
// stays saved even after its day's set has rotated away.
//
// GET  ?channelId=… → { saved, dismissed, channelId }
// POST { channelId, action, idea? } — actions: save | dismiss | restore
//   | delete (remove from saved) | restore-all
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import type { DailyIdea } from "@/lib/daily-ideas";

export type IdeaState = DailyIdea & { date: string };

type StatePayload = {
  channelId: number;
  saved: IdeaState[];
  dismissed: IdeaState[];
};

function stateTopic(channelId: number): string {
  return `idea-states:${channelId}`;
}

function keyOf(title: string): string {
  return title.trim().toLowerCase();
}

async function loadState(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  channelId: number
): Promise<StatePayload> {
  const empty: StatePayload = { channelId, saved: [], dismissed: [] };
  const { data } = await admin
    .from("packages")
    .select("payload_json")
    .eq("user_id", userId)
    .eq("kind", "daily-idea-states")
    .eq("topic", stateTopic(channelId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payload = data?.payload_json as StatePayload | null;
  if (!payload) return empty;
  return {
    channelId,
    saved: Array.isArray(payload.saved) ? payload.saved : [],
    dismissed: Array.isArray(payload.dismissed) ? payload.dismissed : [],
  };
}

async function saveState(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  state: StatePayload
): Promise<void> {
  const { data: existing } = await admin
    .from("packages")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "daily-idea-states")
    .eq("topic", stateTopic(state.channelId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    await admin
      .from("packages")
      .update({ payload_json: state })
      .eq("id", (existing as { id: number }).id);
  } else {
    await admin.from("packages").insert({
      user_id: userId,
      kind: "daily-idea-states",
      topic: stateTopic(state.channelId),
      payload_json: state,
    });
  }
}

async function ownChannelId(
  admin: ReturnType<typeof createSupabaseAdmin>,
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
    return NextResponse.json({ saved: [], dismissed: [], channelId: null });
  }
  const state = await loadState(admin, user.id, channelId);
  return NextResponse.json({ ...state, channelId });
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
    action?: string;
    idea?: DailyIdea & { date?: string };
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
  const state = await loadState(admin, user.id, channelId);
  const action = body.action ?? "";
  const idea = body.idea;

  if (action === "restore-all") {
    state.dismissed = [];
  } else if (idea && typeof idea.title === "string" && idea.title.trim()) {
    const k = keyOf(idea.title);
    const full: IdeaState = {
      title: idea.title,
      hook: idea.hook ?? "",
      whyFits: idea.whyFits ?? "",
      prediction: idea.prediction ?? "Medium",
      predictionWhy: idea.predictionWhy ?? "",
      date: idea.date ?? "",
    };
    if (action === "save") {
      state.dismissed = state.dismissed.filter((s) => keyOf(s.title) !== k);
      if (!state.saved.some((s) => keyOf(s.title) === k)) state.saved.push(full);
    } else if (action === "dismiss") {
      state.saved = state.saved.filter((s) => keyOf(s.title) !== k);
      if (!state.dismissed.some((s) => keyOf(s.title) === k)) state.dismissed.push(full);
    } else if (action === "restore") {
      state.dismissed = state.dismissed.filter((s) => keyOf(s.title) !== k);
    } else if (action === "delete") {
      state.saved = state.saved.filter((s) => keyOf(s.title) !== k);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "An idea is required for this action." }, { status: 400 });
  }

  await saveState(admin, user.id, state);
  return NextResponse.json({ ...state, channelId });
}
