import Link from "next/link";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { bestPostingTimes, viewsPerHour } from "@/lib/audit";
import SubscribersPage, {
  type SubscriberVideoItem,
  type SubscriberChannelItem,
} from "@/components/SubscribersPage";

export const dynamic = "force-dynamic";

type ChannelRow = {
  id: number;
  channel_id: string;
  title: string;
  avatar_url: string | null;
  url: string;
  role: string;
  subscriber_count: number | null;
  video_count: number | null;
  view_count: number | null;
};

type VideoRow = {
  video_id: string;
  title: string;
  url: string;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
};

/** Six dayparts (UTC) for the best-time heatmap. */
const DAYPARTS = [
  { label: "Night", short: "12–4am", from: 0, to: 4 },
  { label: "Morning", short: "4–8am", from: 4, to: 8 },
  { label: "Late morning", short: "8–12pm", from: 8, to: 12 },
  { label: "Afternoon", short: "12–4pm", from: 12, to: 16 },
  { label: "Evening", short: "4–8pm", from: 16, to: 20 },
  { label: "Late night", short: "8–12am", from: 20, to: 24 },
] as const;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function Subscribers() {
  const user = await getSessionUser();
  const configured = isSupabaseConfigured();

  let channels: ChannelRow[] = [];
  let ownVideos: VideoRow[] = [];
  let trending: SubscriberVideoItem[] = [];
  let topChannels: SubscriberChannelItem[] = [];
  let heatmap: number[][] = DAY_NAMES.map(() => DAYPARTS.map(() => 0));
  let bestSlots: Array<{ day: string; hour: number; count: number; label: string }> = [];
  let loadError: string | null = null;

  if (configured) {
    try {
      const supabase = createSupabaseServer();
      let chQuery = supabase
        .from("channels")
        .select("*")
        .order("connected_at", { ascending: true });
      if (user) chQuery = chQuery.eq("user_id", user.id);
      const { data: chData, error: chErr } = await chQuery;
      if (chErr) throw new Error(chErr.message);
      channels = (chData ?? []) as ChannelRow[];
      const own = channels.find((c) => c.role === "own") ?? channels[0] ?? null;

      if (own) {
        const { data: vids } = await supabase
          .from("channel_videos")
          .select("*")
          .eq("channel_id", own.id)
          .order("published_at", { ascending: false })
          .limit(200);
        ownVideos = (vids ?? []) as VideoRow[];

        // Heatmap: day (Mon–Sun) × daypart, from real publish times (UTC).
        for (const v of ownVideos) {
          if (!v.published_at) continue;
          const d = new Date(v.published_at);
          const dayIdx = (d.getUTCDay() + 6) % 7; // Monday = 0
          const hour = d.getUTCHours();
          const part = DAYPARTS.findIndex((p) => hour >= p.from && hour < p.to);
          if (part >= 0) heatmap[dayIdx][part] += 1;
        }
        bestSlots = bestPostingTimes(
          ownVideos.map((v) => ({
            title: v.title,
            publishedAt: v.published_at,
            viewCount: v.view_count,
            likeCount: v.like_count,
            commentCount: v.comment_count,
          }))
        ).slice(0, 3);
      }

      // Trending in the niche: own + competitor videos, outlier ratio vs
      // each channel's own saved-video average, ranked by views/hour.
      // This is NOT subscriber watch data (YouTube does not share that) —
      // the page labels it honestly as niche/competitor trending.
      const pool: Array<{ ch: ChannelRow; rows: VideoRow[] }> = [];
      for (const ch of channels) {
        const limit = ch.role === "own" ? 50 : 30;
        const { data: vids } = await supabase
          .from("channel_videos")
          .select("video_id,title,url,published_at,view_count")
          .eq("channel_id", ch.id)
          .order("published_at", { ascending: false })
          .limit(limit);
        pool.push({ ch, rows: (vids ?? []) as VideoRow[] });
      }
      for (const { ch, rows } of pool) {
        if (rows.length === 0) continue;
        const avg =
          rows.reduce((s, v) => s + Number(v.view_count ?? 0), 0) / rows.length;
        const total = rows.reduce((s, v) => s + Number(v.view_count ?? 0), 0);
        const top = rows.reduce((best, v) =>
          Number(v.view_count ?? 0) > Number(best.view_count ?? 0) ? v : best
        );
        topChannels.push({
          id: ch.id,
          title: ch.title,
          url: ch.url,
          avatarUrl: ch.avatar_url,
          subs: ch.subscriber_count,
          videoCount: ch.video_count ?? rows.length,
          totalViews: total,
          avgViews: Math.round(avg),
          topVideo: { title: top.title, views: Number(top.view_count ?? 0) },
          isOwn: ch.role === "own",
        });
        for (const v of rows) {
          const views = Number(v.view_count ?? 0);
          trending.push({
            videoId: v.video_id,
            title: v.title,
            url: v.url,
            publishedAt: v.published_at,
            viewCount: views,
            vph: viewsPerHour(v.view_count, v.published_at),
            ratio: avg > 0 ? Math.round((views / avg) * 10) / 10 : 0,
            channelId: ch.id,
            channelTitle: ch.title,
            isOwn: ch.role === "own",
          });
        }
      }
      trending.sort((a, b) => b.vph - a.vph);
      topChannels.sort((a, b) => (b.subs ?? 0) - (a.subs ?? 0));
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Could not load subscriber data.";
    }
  }

  const own = channels.find((c) => c.role === "own") ?? channels[0] ?? null;

  return (
    <>
      <div className="opt-page-head">
        <h1>Subscribers</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          When your viewers are most active, and what is trending around your
          channel — all from real data. Best time to post is free in Nizafa:
          it comes from your own upload history.
        </p>
      </div>

      {!configured ? (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Setup needed:</strong> Supabase is not configured yet. Add
          the env vars from <code>.env.example</code> and redeploy.
        </div>
      ) : null}
      {loadError ? <p className="error" style={{ marginTop: 16 }}>{loadError}</p> : null}

      {!configured || !own ? (
        <section className="section">
          <EmptyState
            title="No channel connected yet"
            body="Connect your channel first — best posting times come from your own upload history, and trending comes from the channels you track."
            action={<Link href="/" className="btn btn-primary">Connect a channel</Link>}
          />
        </section>
      ) : (
        <SubscribersPage
          ownTitle={own.title}
          videoCount={ownVideos.length}
          heatmap={heatmap}
          dayNames={DAY_NAMES}
          dayparts={DAYPARTS.map((d) => ({ label: d.label, short: d.short }))}
          bestSlots={bestSlots}
          trending={trending.slice(0, 30)}
          topChannels={topChannels}
        />
      )}
    </>
  );
}
