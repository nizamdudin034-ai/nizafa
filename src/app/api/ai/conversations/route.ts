import { NextResponse } from "next/server";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { AI_DAILY_LIMIT, countTodayUsage } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

// GET /api/ai/conversations → { conversations, remaining, limit }
// GET /api/ai/conversations?id=123 → { conversation, messages }
// POST /api/ai/conversations { title? } → { conversation }
// DELETE /api/ai/conversations?id=123 → { ok: true }
// All rows are scoped to the signed-in user by the own-row RLS policies.

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Chat is not configured yet." }, { status: 503 });
  }
  const supabase = createSupabaseServer();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const cid = Number(id);
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ error: "Bad id." }, { status: 400 });
    }
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id, title, created_at, updated_at")
      .eq("id", cid)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    return NextResponse.json({ conversation: conv, messages: messages ?? [] });
  }

  const { data: conversations } = await supabase
    .from("chat_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  const used = await countTodayUsage(supabase, user.id);
  return NextResponse.json({
    conversations: conversations ?? [],
    remaining: Math.max(0, AI_DAILY_LIMIT - used),
    limit: AI_DAILY_LIMIT,
  });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Chat is not configured yet." }, { status: 503 });
  }
  const supabase = createSupabaseServer();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  let title = "New chat";
  try {
    const body = (await req.json()) as { title?: string };
    if (body.title && body.title.trim()) title = body.title.trim().slice(0, 60);
  } catch {
    // empty body — default title
  }
  const { data: conv, error } = await supabase
    .from("chat_conversations")
    .insert({ user_id: user.id, title })
    .select("id, title, created_at, updated_at")
    .single();
  if (error || !conv) {
    return NextResponse.json({ error: "Could not create the chat." }, { status: 500 });
  }
  return NextResponse.json({ conversation: conv });
}

export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Chat is not configured yet." }, { status: 503 });
  }
  const supabase = createSupabaseServer();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Bad id." }, { status: 400 });
  }
  const { error } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not delete the chat." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
