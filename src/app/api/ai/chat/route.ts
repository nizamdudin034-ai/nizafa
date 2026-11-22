import { NextResponse } from "next/server";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import {
  AI_DAILY_LIMIT,
  countTodayUsage,
  detectChatLang,
  imageUrl,
  streamChatCompletion,
  systemPrompt,
  webSearch,
  type AiMode,
  type ChatMsg,
} from "@/lib/ai-chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/chat { conversationId?, message, mode?, imageDataUrl?, fileText?, fileName? }
// Streams SSE: data: {"delta": "..."} ... data: {"done": true, "conversationId": N, "remaining": R}
// Replies are fast by design: auth + one count query + one insert happen
// before the first token, then the LLM stream is passed straight through
// with no buffering. No service-role key is needed — every write uses the
// user-scoped client and the existing own-row RLS policies.

type Body = {
  conversationId?: number;
  message?: string;
  mode?: AiMode;
  imageDataUrl?: string;
  fileText?: string;
  fileName?: string;
};

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Chat is not configured yet." }, { status: 503 });
  }
  const supabase = createSupabaseServer();
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  const mode: AiMode =
    body.mode === "image" || body.mode === "research" || body.mode === "deep"
      ? body.mode
      : "chat";
  if (!message && !body.imageDataUrl) {
    return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  }
  if (message.length > 8000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  // Make sure the user has an app_users row (own-row RLS allows this).
  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!existing) {
    await supabase.from("app_users").insert({
      id: user.id,
      google_sub: user.id,
      email: user.email ?? "unknown@nizafa.app",
      plan: "free",
    });
  }

  // Free plan: 50 user messages per day.
  const used = await countTodayUsage(supabase, user.id);
  if (used >= AI_DAILY_LIMIT) {
    return NextResponse.json(
      {
        error:
          "Daily limit reached — 50 messages a day on the free plan. Come back tomorrow.",
        remaining: 0,
      },
      { status: 429 }
    );
  }
  const remainingAfter = AI_DAILY_LIMIT - used - 1;

  // Conversation: verify ownership, or create one.
  let conversationId = body.conversationId;
  if (conversationId) {
    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conv) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
  } else {
    const title = (message || "New chat").slice(0, 60);
    const { data: conv, error } = await supabase
      .from("chat_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !conv) {
      return NextResponse.json({ error: "Could not start the chat." }, { status: 500 });
    }
    conversationId = conv.id as number;
  }

  await supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  const savedContent = message || "(image)";
  const { error: msgErr } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role: "user", content: savedContent });
  if (msgErr) {
    return NextResponse.json({ error: "Could not save the message." }, { status: 500 });
  }

  const lang = detectChatLang(message);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        // ── Image mode: no LLM call, just a generated picture. ──
        if (mode === "image") {
          const prompt = message || "a beautiful picture";
          const url = imageUrl(prompt);
          const text = `![${prompt.replace(/\]/g, "")}](${url})\n\nHere is your picture — ${prompt}.`;
          send({ delta: text });
          await supabase
            .from("chat_messages")
            .insert({ conversation_id: conversationId, role: "assistant", content: text });
          send({ done: true, conversationId, remaining: remainingAfter });
          controller.close();
          return;
        }

        // ── History (last 12 messages, oldest first). ──
        const { data: history } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(12);
        const ordered = [...(history ?? [])].reverse();

        const modelMessages: ChatMsg[] = [
          { role: "system", content: systemPrompt(lang, mode) },
        ];
        for (const m of ordered.slice(0, -1)) {
          if (m.role === "user" || m.role === "assistant") {
            modelMessages.push({ role: m.role, content: m.content as string });
          }
        }

        // Current turn: plain text, plus attached file text / photo.
        let userContent: ChatMsg["content"] = message;
        if (body.fileText) {
          userContent = `${message}\n\n[Attached file ${body.fileName ?? ""} — use it to answer:]\n${body.fileText.slice(0, 4000)}`;
        }
        if (body.imageDataUrl) {
          userContent = [
            { type: "text", text: typeof userContent === "string" ? userContent : message },
            { type: "image_url", image_url: { url: body.imageDataUrl } },
          ];
        }

        if (mode === "research" || mode === "deep") {
          const queries =
            mode === "deep"
              ? [message, `${message} details explained`]
              : [message];
          const all: { title: string; url: string; snippet: string }[] = [];
          for (const q of queries) {
            const results = await webSearch(q);
            for (const item of results) {
              if (!all.some((a) => a.url === item.url)) all.push(item);
            }
          }
          const ctx = all.length
            ? all
                .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.snippet}`)
                .join("\n\n")
            : "No useful web results were found; say so and answer from general knowledge.";
          const last = typeof userContent === "string" ? userContent : message;
          modelMessages.push({
            role: "user",
            content: `${last}\n\n[Fresh web results:]\n${ctx}`,
          });
        } else {
          modelMessages.push({ role: "user", content: userContent });
        }

        const upstream = await streamChatCompletion(modelMessages, {
          maxTokens: mode === "deep" ? 2000 : mode === "research" ? 1500 : 900,
          temperature: mode === "deep" ? 0.6 : 0.7,
        });
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let full = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            for (const line of part.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const delta = json?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta) {
                  full += delta;
                  send({ delta });
                }
              } catch {
                // Partial JSON across chunk boundaries — ignore.
              }
            }
          }
        }
        const text = full.trim();
        if (text) {
          await supabase
            .from("chat_messages")
            .insert({ conversation_id: conversationId, role: "assistant", content: text });
        }
        send({ done: true, conversationId, remaining: remainingAfter });
        controller.close();
      } catch (e) {
        console.error("ai chat stream failed:", e);
        try {
          send({ error: "The reply could not finish. Please try again." });
        } catch {
          // controller already closed
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
