import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { fetchTopComments, type YtComment } from "@/lib/youtube";

// GET /api/create/comments — "Answer Your Audience": ideas from the
// channel's real comments section. Loads the own channel's most-viewed
// recent videos, reads their real top-level comments (commentThreads.list,
// 1 quota unit per video, cached 6h in yt_cache), and turns question-like
// comments into video ideas. NEVER invents comments: no channel → honest
// empty state; no questions → honest empty state.

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const QUESTION_WORDS = [
  "how", "why", "what", "when", "where", "which", "who", "can you",
  "could you", "will you", "do you", "is there", "are there", "please",
  "explain", "make a video", "cover", "part 2", "part two", "next video",
];

function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 8 || t.length > 280) return false;
  if (t.includes("?")) return true;
  return QUESTION_WORDS.some((w) => t.startsWith(w) || t.includes(` ${w} `));
}

export type CommentIdea = {
  idea: string;
  comment: string;
  author: string;
  authorAvatar: string | null;
  likes: number;
  videoTitle: string;
  videoId: string;
  videoUrl: string;
};

function ideaFrom(comment: string): string {
  const clean = comment.trim().replace(/\s+/g, " ");
  const q = clean.length > 120 ? `${clean.slice(0, 117).trimEnd()}…` : clean;
  return `Answering: “${q}”`;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  const admin = createSupabaseAdmin();

  const { data: channels } = await admin
    .from("channels")
    .select("id,title")
    .eq("role", "own")
    .eq("user_id", user.id)
    .order("connected_at", { ascending: true });
  const own = ((channels ?? []) as Array<{ id: number; title: string }>)[0];
  if (!own) {
    return NextResponse.json({
      channel: null,
      ideas: [],
      note: "No channel connected yet. Connect your channel to see ideas from your real comments.",
    });
  }

  const { data: vids } = await admin
    .from("channel_videos")
    .select("video_id,title,view_count,comment_count")
    .eq("channel_id", own.id)
    .order("view_count", { ascending: false })
    .limit(5);
  const videos = (vids ?? []) as Array<{
    video_id: string;
    title: string;
    view_count: number | null;
    comment_count: number | null;
  }>;
  const withComments = videos.filter((v) => Number(v.comment_count ?? 0) > 0);
  if (withComments.length === 0) {
    return NextResponse.json({
      channel: { id: own.id, title: own.title },
      ideas: [],
      note: "Your saved videos show no comments yet. New comments appear here once viewers start asking questions.",
    });
  }

  const ideas: CommentIdea[] = [];
  const seen = new Set<string>();
  for (const v of withComments) {
    if (ideas.length >= 6) break;
    const cacheKey = `create-comments:v1:${v.video_id}`;
    let comments: YtComment[] = [];
    try {
      const { data: cached } = await admin
        .from("yt_cache")
        .select("payload,fetched_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      const fresh =
        cached &&
        Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_TTL_MS;
      if (fresh && Array.isArray(cached.payload)) {
        comments = cached.payload as YtComment[];
      } else {
        comments = await fetchTopComments(v.video_id, 20);
        if (comments.length > 0) {
          await admin.from("yt_cache").upsert(
            { cache_key: cacheKey, payload: comments, fetched_at: new Date().toISOString() },
            { onConflict: "cache_key" }
          );
        }
      }
    } catch {
      // One video's comments failing must not block the rest.
      continue;
    }
    for (const c of comments) {
      if (ideas.length >= 6) break;
      if (!isQuestion(c.text)) continue;
      const k = c.text.trim().toLowerCase().slice(0, 80);
      if (seen.has(k)) continue;
      seen.add(k);
      ideas.push({
        idea: ideaFrom(c.text),
        comment: c.text,
        author: c.author,
        authorAvatar: c.authorAvatar,
        likes: c.likes,
        videoTitle: v.title,
        videoId: v.video_id,
        videoUrl: `https://www.youtube.com/watch?v=${v.video_id}`,
      });
    }
  }

  return NextResponse.json({
    channel: { id: own.id, title: own.title },
    ideas,
    note:
      ideas.length === 0
        ? "No questions found in your recent comments yet — check back after your next video."
        : undefined,
  });
}
