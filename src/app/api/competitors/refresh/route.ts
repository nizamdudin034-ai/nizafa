import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser, isOwner, ensureAppUser } from "@/lib/auth";
import { fetchChannel, fetchLatestVideos } from "@/lib/youtube";
import { recordChannelSnapshot } from "@/lib/channel-snapshots";

// POST /api/competitors/refresh — owner-only. Re-fetches a competitor's
// live stats from the YouTube Data API, updates the channels row, refreshes
// its latest videos, and records a channel_snapshots row so the 7/30/90-day
// growth on /competitors has a real baseline to compare against. The
// snapshot write is best-effort: if the snapshots table does not exist yet
// the refresh still succeeds.

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured yet." }, { status: 503 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in with Google first." }, { status: 401 });
  }
  if (!isOwner(user)) {
    return NextResponse.json({ error: "Only the workspace owner can refresh competitors." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: "Missing competitor id." }, { status: 400 });

  const admin = createSupabaseAdmin();
  await ensureAppUser(admin, user);
  const { data: row, error: rowErr } = await admin
    .from("channels")
    .select("id,channel_id,title")
    .eq("id", id)
    .eq("role", "competitor")
    .maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "Competitor not found." }, { status: 404 });
  }

  let channel;
  try {
    channel = await fetchChannel((row as { channel_id: string }).channel_id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not fetch fresh stats from YouTube." },
      { status: 502 }
    );
  }

  const { data: saved, error: upErr } = await admin
    .from("channels")
    .update({
      title: channel.title,
      description: channel.description,
      avatar_url: channel.thumbnailUrl,
      url: channel.url,
      subscriber_count: channel.subscriberCount,
      video_count: channel.videoCount,
      view_count: channel.viewCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (upErr || !saved) {
    return NextResponse.json({ error: upErr?.message ?? "Could not save refreshed stats." }, { status: 500 });
  }

  await recordChannelSnapshot(admin, id, {
    subscriberCount: channel.subscriberCount,
    viewCount: channel.viewCount,
    videoCount: channel.videoCount,
  });

  if (channel.uploadsPlaylistId) {
    try {
      const latest = await fetchLatestVideos(channel.uploadsPlaylistId, 10);
      if (latest.length > 0) {
        await admin.from("channel_videos").upsert(
          latest.map((v) => ({
            channel_id: id,
            video_id: v.videoId,
            title: v.title,
            url: v.url,
            published_at: v.publishedAt,
            view_count: v.viewCount,
            like_count: v.likeCount,
            comment_count: v.commentCount,
          })),
          { onConflict: "channel_id,video_id" }
        );
      }
    } catch {
      // Video refresh is a bonus; the stats refresh already succeeded.
    }
  }

  // Return the fresh row so the page can re-render without another read.
  return NextResponse.json({ channel: saved });
}
