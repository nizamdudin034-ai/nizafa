import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import {
  buildAnswer,
  detectLanguage,
  normalizeQuestion,
  type ChannelContext,
} from "@/lib/assistant";

// POST /api/assistant { message, conversationId? }
// → { answer, lang, cached, grounded, conversationId }
// Answers come from the user's own channel data, then a curated playbook,
// then a cache of earlier answers. (v1 has no LLM key — see lib/assistant.ts.)

async function loadChannelContext(admin: ReturnType<typeof createSupabaseAdmin>, userId: string): Promise<ChannelContext | null> {
  const { data: ch } = await admin
    .from("channels")
    .select("id,title,subscriber_count,view_count,video_count")
    .eq("user_id", userId)
    .eq("role", "own")
    .order("connected_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ch) return null;
  const { data: vids } = await admin
    .from("channel_videos")
    .select("title,view_count")
    .eq("channel_id", ch.id)
    .order("view_count", { ascending: false })
    .limit(3);
  return {
    title: ch.title as string,
    subscribers: ch.subscriber_count as number | null,
    views: ch.view_count as number | null,
    videos: ch.video_count as number | null,
    topVideos: (vids ?? []).map((v) => ({
      title: v.title as string,
      views: v.view_count as number | null,
    })),
  };
}

async function ensureAppUser(admin: ReturnType<typeof createSupabaseAdmin>, user: { id: string; email: string | undefined }) {
  const { data } = await admin.from("app_users").select("id").eq("id", user.id).maybeSingle();
  if (!data) {
    await admin.from("app_users").insert({
      id: user.id,
      google_sub: user.id,
      email: user.email ?? "unknown@nizafa.app",
      plan: "free",
    });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    conversationId?: number | string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message is too long (max 1000 characters)." }, { status: 400 });
  }
  const lang = detectLanguage(message);
  const norm = normalizeQuestion(message);

  // Channel-grounded answers are live data: never served from the cache.
  const isChannelQuestion =
    /channel|my channel|subscrib|views|video|perform|how (am|is)|doing|growth|میرا چینل|سبسکرائبر|ویوز|ویڈیو|کیسا/.test(
      message.toLowerCase()
    );

  let cached = false;
  let answer: string | null = null;
  let grounded = false;

  if (isSupabaseConfigured()) {
    try {
      const admin = createSupabaseAdmin();
      if (!isChannelQuestion && norm) {
        const { data: hit } = await admin
          .from("assistant_cache")
          .select("answer,hits")
          .eq("question_norm", norm)
          .eq("lang", lang)
          .maybeSingle();
        if (hit) {
          answer = hit.answer as string;
          cached = true;
          await admin
            .from("assistant_cache")
            .update({ hits: ((hit.hits as number) ?? 0) + 1, updated_at: new Date().toISOString() })
            .eq("question_norm", norm)
            .eq("lang", lang);
        }
      }
    } catch {
      // Cache is a speed-up only; a cache failure must not block answers.
    }
  }

  let conversationId: number | null =
    body.conversationId != null ? Number(body.conversationId) : null;

  if (!answer) {
    const user = await getSessionUser();
    let channel: ChannelContext | null = null;
    if (user && isSupabaseConfigured()) {
      try {
        const admin = createSupabaseAdmin();
        channel = await loadChannelContext(admin, user.id);
      } catch {
        channel = null;
      }
    }
    const built = buildAnswer(message, channel);
    answer = built.answer;
    grounded = built.grounded;

    // Write the playbook answer to the cache for next time (not
    // channel-grounded answers — those go stale as stats change).
    if (isSupabaseConfigured() && !grounded && norm && built.topicId) {
      try {
        const admin = createSupabaseAdmin();
        await admin.from("assistant_cache").upsert(
          { question_norm: norm, lang, answer, hits: 1, updated_at: new Date().toISOString() },
          { onConflict: "question_norm,lang" }
        );
      } catch {
        // Non-fatal.
      }
    }

    // Save the exchange to the signed-in user's chat history.
    if (user && isSupabaseConfigured()) {
      try {
        const admin = createSupabaseAdmin();
        await ensureAppUser(admin, user);
        if (!conversationId) {
          const { data: conv } = await admin
            .from("chat_conversations")
            .insert({ user_id: user.id, title: message.slice(0, 60) })
            .select("id")
            .single();
          conversationId = (conv?.id as number | undefined) ?? null;
        }
        if (conversationId) {
          await admin.from("chat_messages").insert([
            { conversation_id: conversationId, role: "user", content: message },
            { conversation_id: conversationId, role: "assistant", content: answer },
          ]);
          await admin
            .from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        }
      } catch {
        // Chat history is a bonus; never block the answer on it.
      }
    }
  } else if (conversationId && isSupabaseConfigured()) {
    // Cached answer: still record the exchange in the open conversation.
    try {
      const admin = createSupabaseAdmin();
      await admin.from("chat_messages").insert([
        { conversation_id: conversationId, role: "user", content: message },
        { conversation_id: conversationId, role: "assistant", content: answer },
      ]);
    } catch {
      // Non-fatal.
    }
  }

  return NextResponse.json({ answer, lang, cached, grounded, conversationId });
}
