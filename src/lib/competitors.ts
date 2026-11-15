// Competitor channel connect — shared by /api/competitors and /optimize.
// Same connect flow as /api/channels, but the channel is stored with
// role='competitor'. A channel already connected as 'own' is never
// re-labelled as a competitor. Cached data is reused when it is fresher
// than 6 hours, so no YouTube quota is spent on repeat adds.

import { createSupabaseAdmin } from "./supabase-server";
import {
  fetchChannel,
  fetchLatestVideos,
  parseChannelInput,
} from "./youtube";

const STALE_MS = 6 * 60 * 60 * 1000;

export type ConnectCompetitorResult =
  | { channel: Record<string, unknown>; cached: boolean }
  | { error: string };

export async function connectCompetitorChannel(
  input: string,
  userId: string
): Promise<ConnectCompetitorResult> {
  if (!process.env.YOUTUBE_API_KEY) {
    return { error: "YouTube API key is not configured on the server." };
  }
  const admin = createSupabaseAdmin();
  const parsed = parseChannelInput(input);

  if (parsed.kind === "id") {
    const { data: cached } = await admin
      .from("channels")
      .select("*")
      .eq("channel_id", parsed.value)
      .maybeSingle();
    if (cached) {
      if (cached.role === "own") {
        return { error: "That channel is already connected as your own channel." };
      }
      if (Date.now() - new Date(cached.updated_at as string).getTime() < STALE_MS) {
        return { channel: cached as Record<string, unknown>, cached: true };
      }
    }
  }

  try {
    const channel = await fetchChannel(input);
    const { data: existing } = await admin
      .from("channels")
      .select("role")
      .eq("channel_id", channel.channelId)
      .maybeSingle();
    if (existing && existing.role === "own") {
      return { error: "That channel is already connected as your own channel." };
    }
    const { data: saved, error } = await admin
      .from("channels")
      .upsert(
        {
          user_id: userId,
          channel_id: channel.channelId,
          title: channel.title,
          description: channel.description,
          avatar_url: channel.thumbnailUrl,
          url: channel.url,
          role: "competitor",
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
      return { error: error?.message ?? "Could not save competitor." };
    }
    if (channel.uploadsPlaylistId) {
      const latest = await fetchLatestVideos(channel.uploadsPlaylistId, 10);
      if (latest.length > 0) {
        await admin.from("channel_videos").upsert(
          latest.map((v) => ({
            channel_id: saved.id,
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
    }
    return { channel: saved as Record<string, unknown>, cached: false };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not connect competitor." };
  }
}
