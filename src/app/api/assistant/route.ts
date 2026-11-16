import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import {
  answerFromData,
  buildAnswer,
  detectDataIntent,
  detectLanguageDetailed,
  emptyDataBundle,
  FALLBACK,
  normalizeQuestion,
  type AssistantDataBundle,
  type AssistantLang,
  type ChannelContext,
  type DataIntent,
} from "@/lib/assistant";
import {
  isAssistantLang,
  isChannelQuestion,
  langInfo,
} from "@/lib/assistant-i18n";
import { bestPostingTimes, computeAudit, scoreVideoSeo } from "@/lib/audit";
import { ensureDailyIdeasForChannel } from "@/lib/daily-ideas";
import { consistencyForPack, type StoredPack } from "@/lib/consistency";
import { matchPackToVideo, scoreVideoThumbnail, type PackRow } from "@/lib/seo-checklist";
import { scoreTitle } from "@/lib/generator";
import type { TrendItem } from "@/lib/trends";

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

/** Load the live data one data intent needs (audit, ideas, latest-video
 *  review, views, script topic, community post). Pure reads except the
 *  ideas intent, which uses the same ensureDailyIdeasForChannel as the
 *  /ideas page (one run row per day, idempotent). */
async function loadAssistantData(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  intent: DataIntent
): Promise<AssistantDataBundle> {
  const data = emptyDataBundle();
  const { data: ch } = await admin
    .from("channels")
    .select("id,title,description,avatar_url,subscriber_count,view_count,video_count")
    .eq("user_id", userId)
    .eq("role", "own")
    .order("connected_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ch) return data;
  const channelId = ch.id as number;

  const { data: vidRows } = await admin
    .from("channel_videos")
    .select("video_id,title,published_at,view_count,like_count,comment_count")
    .eq("channel_id", channelId)
    .order("published_at", { ascending: false })
    .limit(25);
  const videos = (vidRows ?? []) as Array<{
    video_id: string;
    title: string;
    published_at: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
  }>;
  const auditVideos = videos.map((v) => ({
    title: v.title,
    publishedAt: v.published_at,
    viewCount: v.view_count,
    likeCount: v.like_count,
    commentCount: v.comment_count,
  }));
  const topVideos = [...videos]
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, 3)
    .map((v) => ({ title: v.title, views: v.view_count }));
  data.channel = {
    title: ch.title as string,
    subscribers: ch.subscriber_count as number | null,
    views: ch.view_count as number | null,
    videos: ch.video_count as number | null,
    topVideos,
  };
  if (videos[0]) {
    data.latestVideo = {
      videoId: videos[0].video_id,
      title: videos[0].title,
      views: videos[0].view_count,
      publishedAt: videos[0].published_at,
    };
  }
  data.audit = computeAudit(
    {
      title: ch.title as string,
      description: ch.description as string | null,
      avatarUrl: ch.avatar_url as string | null,
      subscriberCount: ch.subscriber_count as number | null,
      videoCount: ch.video_count as number | null,
      viewCount: ch.view_count as number | null,
    },
    auditVideos
  );
  data.bestPosting = bestPostingTimes(auditVideos)
    .slice(0, 2)
    .map((s) => s.label);

  const { data: snap } = await admin
    .from("trending_snapshots")
    .select("items")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const trends = ((snap?.items ?? []) as TrendItem[]).filter(
    (t) => t && typeof t.title === "string"
  );
  data.trendingTitles = trends.slice(0, 5).map((t) => t.title);

  if (intent === "ideas") {
    const res = await ensureDailyIdeasForChannel(admin, {
      id: channelId,
      title: ch.title as string,
      description: ch.description as string | null,
    });
    data.ideas = res.ideas;
  }

  if (intent === "latest-review" && data.latestVideo) {
    const { data: pkgRows } = await admin
      .from("packages")
      .select("id,topic,payload_json")
      .eq("kind", "package")
      .order("created_at", { ascending: false })
      .limit(15);
    const matched = matchPackToVideo(
      data.latestVideo.title,
      (pkgRows ?? []) as PackRow[]
    );
    const stored = matched ? (matched.payload_json as StoredPack) : null;
    const seo = scoreVideoSeo({
      title: data.latestVideo.title,
      publishedAt: data.latestVideo.publishedAt,
      viewCount: data.latestVideo.views,
      likeCount: null,
      commentCount: null,
    });
    const failed = seo.checks.filter((c) => !c.pass);
    data.latestReview = {
      title: data.latestVideo.title,
      titleScore: stored ? scoreTitle(data.latestVideo.title, stored.topic).score : null,
      thumbScore:
        stored?.thumbnailConcepts?.[0] != null
          ? (scoreVideoThumbnail(stored.thumbnailConcepts[0])?.score ?? null)
          : null,
      consistency: stored ? consistencyForPack(stored).score : null,
      checks: seo.checks,
      fixes: failed.map((c) => c.detail).slice(0, 3),
    };
  }
  return data;
}

/** Save one exchange to the signed-in user's chat history (bonus —
//  never blocks the answer). */
async function saveExchange(
  admin: ReturnType<typeof createSupabaseAdmin>,
  user: { id: string; email: string | undefined },
  conversationId: number | null,
  message: string,
  answer: string
): Promise<number | null> {
  try {
    await ensureAppUser(admin, user);
    let convId = conversationId;
    if (!convId) {
      const { data: conv } = await admin
        .from("chat_conversations")
        .insert({ user_id: user.id, title: message.slice(0, 60) })
        .select("id")
        .single();
      convId = (conv?.id as number | undefined) ?? null;
    }
    if (convId) {
      await admin.from("chat_messages").insert([
        { conversation_id: convId, role: "user", content: message },
        { conversation_id: convId, role: "assistant", content: answer },
      ]);
      await admin
        .from("chat_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    }
    return convId;
  } catch {
    return conversationId;
  }
}

/** The user's last Assistant language, from their own chat history
 *  (existing chat_messages — no new table). Used only when the new
 *  message gives no clear language signal of its own. */
async function getLastAssistantLang(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<AssistantLang | null> {
  try {
    const { data: convs } = await admin
      .from("chat_conversations")
      .select("id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3);
    if (!convs?.length) return null;
    const ids = (convs as Array<{ id: number }>).map((c) => c.id);
    const { data: msgs } = await admin
      .from("chat_messages")
      .select("content")
      .eq("role", "user")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(3);
    for (const m of (msgs ?? []) as Array<{ content: string }>) {
      const d = detectLanguageDetailed(m.content);
      if (d.confidence === "high") return d.lang;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    conversationId?: number | string;
    /** Explicit language from the chat UI's selector. */
    lang?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message is too long (max 1000 characters)." }, { status: 400 });
  }

  const user = await getSessionUser();

  // Language resolution, in order:
  //  1. a clear signal in this message (script or distinctive words) —
  //     a mid-chat language switch is honoured per message;
  //  2. the language the user picked in the chat UI;
  //  3. the language of their last message to the Assistant (chat
  //     history), so a short follow-up ("hi", "thanks", "اور؟") keeps
  //     answering in the same language;
  //  4. English.
  const detected = detectLanguageDetailed(message);
  let lang: AssistantLang = "en";
  let langSource: "detected" | "selected" | "history" | "default" = "default";
  if (detected.confidence === "high") {
    lang = detected.lang;
    langSource = "detected";
  } else if (typeof body.lang === "string" && isAssistantLang(body.lang)) {
    lang = body.lang;
    langSource = "selected";
  } else if (user && isSupabaseConfigured()) {
    try {
      const fromHistory = await getLastAssistantLang(
        createSupabaseAdmin(),
        user.id
      );
      if (fromHistory) {
        lang = fromHistory;
        langSource = "history";
      }
    } catch {
      // History is a bonus; never block the answer on it.
    }
  }

  const norm = normalizeQuestion(message);
  const dataIntent = detectDataIntent(message);

  // Channel-grounded answers are live data: never served from the cache.
  // Data-intent answers are live too (audit, ideas, latest video, …).
  const isChannelQ = isChannelQuestion(message);

  let cached = false;
  let answer: string | null = null;
  let grounded = false;

  if (isSupabaseConfigured()) {
    try {
      const admin = createSupabaseAdmin();
      if (!isChannelQ && !dataIntent && norm) {
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

  // Data intent (ideas / views / audit / latest-video review / script /
  // community post): answer from live channel data, never from the cache.
  if (dataIntent) {
    let data: AssistantDataBundle = emptyDataBundle();
    if (user && isSupabaseConfigured()) {
      try {
        data = await loadAssistantData(createSupabaseAdmin(), user.id, dataIntent);
      } catch {
        data = emptyDataBundle();
      }
    }
    const answer = answerFromData(message, lang, data) ?? FALLBACK[lang];
    if (user && isSupabaseConfigured()) {
      conversationId = await saveExchange(
        createSupabaseAdmin(),
        user,
        conversationId,
        message,
        answer
      );
    }
    return NextResponse.json({
      answer,
      lang,
      langName: langInfo(lang).native,
      langSource,
      cached: false,
      grounded: true,
      conversationId,
    });
  }

  if (!answer) {
    let channel: ChannelContext | null = null;
    if (user && isSupabaseConfigured()) {
      try {
        const admin = createSupabaseAdmin();
        channel = await loadChannelContext(admin, user.id);
      } catch {
        channel = null;
      }
    }
    const built = buildAnswer(message, channel, lang);
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

  return NextResponse.json({
    answer,
    lang,
    langName: langInfo(lang).native,
    langSource,
    cached,
    grounded,
    conversationId,
  });
}
