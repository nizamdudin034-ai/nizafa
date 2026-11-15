import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  createSupabaseServer,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";
import {
  fetchChannel,
  fetchLatestVideos,
  parseChannelInput,
} from "@/lib/youtube";

// Channels API — connect a channel (official YouTube Data API only),
// list connected channels, disconnect.
// Quota discipline: channel + videos are cached in Supabase and refreshed
// only when older than 6 hours. No search.list call happens here at all.

const STALE_MS = 6 * 60 * 60 * 1000;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ channels: [], configured: false });
  }
  const user = await getSessionUser();
  const supabase = createSupabaseServer();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("connected_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ channels: data ?? [], signedIn: !!user });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in with Google first." },
      { status: 401 }
    );
  }
  // Channel connect is owner-only until the sensitive-scope (YouTube)
  // verification is approved. Sign-in-only at public launch.
  if (!isOwner(user)) {
    return NextResponse.json(
      {
        error:
          "Channel connect is coming soon for everyone. Right now only the workspace owner can connect channels.",
      },
      { status: 403 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { input?: string };
  const input = (body.input ?? "").trim();
  if (!input) {
    return NextResponse.json({ error: "Give a channel link, @handle or ID." }, { status: 400 });
  }
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YouTube API key is not configured on the server." },
      { status: 503 }
    );
  }

  const admin = createSupabaseAdmin();
  const parsed = parseChannelInput(input);

  // Fresh cache? Serve it without spending quota.
  if (parsed.kind === "id") {
    const { data: cached } = await admin
      .from("channels")
      .select("*")
      .eq("channel_id", parsed.value)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.updated_at as string).getTime() < STALE_MS) {
      const { data: vids } = await admin
        .from("channel_videos")
        .select("*")
        .eq("channel_id", cached.id)
        .order("published_at", { ascending: false })
        .limit(10);
      return NextResponse.json({ channel: cached, videos: vids ?? [], cached: true });
    }
  }

  try {
    const channel = await fetchChannel(input);
    const { data: saved, error } = await admin
      .from("channels")
      .upsert(
        {
          user_id: user.id,
          channel_id: channel.channelId,
          title: channel.title,
          description: channel.description,
          avatar_url: channel.thumbnailUrl,
          url: channel.url,
          role: "own",
          stats_source: "youtube-api",
          subscriber_count: channel.subscriberCount,
          video_count: channel.videoCount,
          view_count: channel.viewCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel_id" }
      )
      .select()
      .single();
    if (error || !saved) {
      return NextResponse.json(
        { error: error?.message ?? "Could not save channel." },
        { status: 500 }
      );
    }
    let videos: Array<Record<string, unknown>> = [];
    if (channel.uploadsPlaylistId) {
      const latest = await fetchLatestVideos(channel.uploadsPlaylistId, 10);
      if (latest.length > 0) {
        const rows = latest.map((v) => ({
          channel_id: saved.id,
          video_id: v.videoId,
          title: v.title,
          url: v.url,
          published_at: v.publishedAt,
          view_count: v.viewCount,
          like_count: v.likeCount,
          comment_count: v.commentCount,
        }));
        await admin.from("channel_videos").upsert(rows, {
          onConflict: "channel_id,video_id",
        });
        videos = rows;
      }
    }
    return NextResponse.json({ channel: saved, videos, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not connect channel." },
      { status: 502 }
    );
  }
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("channels").delete().eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
