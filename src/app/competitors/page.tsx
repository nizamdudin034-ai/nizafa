import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin, createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { connectCompetitorChannel } from "@/lib/competitors";
import { loadSnapshots, growthInWindow } from "@/lib/channel-snapshots";
import { viewsPerHour } from "@/lib/audit";
import CompetitorsPage, {
  type CompetitorItem,
  type CompetitorVideoItem,
} from "@/components/CompetitorsPage";

export const dynamic = "force-dynamic";

type ChannelRow = {
  id: number;
  channel_id: string;
  title: string;
  description: string | null;
  avatar_url: string | null;
  url: string;
  role: string;
  subscriber_count: number | null;
  video_count: number | null;
  view_count: number | null;
  updated_at: string;
  connected_at: string;
};

type VideoRow = {
  video_id: string;
  title: string;
  url: string;
  published_at: string | null;
  view_count: number | null;
};

async function addCompetitorAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || !isOwner(user)) return;
  const input = String(formData.get("input") ?? "").trim();
  if (!input) return;
  await connectCompetitorChannel(input, user.id);
  revalidatePath("/competitors");
}

async function removeCompetitorAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || !isOwner(user)) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const admin = createSupabaseAdmin();
  await admin.from("channels").delete().eq("id", id).eq("role", "competitor");
  revalidatePath("/competitors");
}

export default async function Competitors() {
  const user = await getSessionUser();
  const owner = isOwner(user);
  const configured = isSupabaseConfigured();

  let channels: ChannelRow[] = [];
  let videos: CompetitorVideoItem[] = [];
  let competitors: CompetitorItem[] = [];
  let loadError: string | null = null;
  let anySnapshots = false;

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

      const own = channels.find((c) => c.role === "own") ?? null;
      const comps = channels.filter((c) => c.role === "competitor");

      // Growth history (best-effort: empty until the migration is applied
      // and a second snapshot exists for a channel).
      const snapMap = await loadSnapshots(supabase, comps.map((c) => c.id));
      for (const snaps of snapMap.values()) {
        if (snaps.length > 0) anySnapshots = true;
      }
      competitors = comps.map((c) => {
        const snaps = snapMap.get(c.id) ?? [];
        const growth: CompetitorItem["growth"] = { 7: null, 30: null, 90: null };
        const viewsGrowth: CompetitorItem["growth"] = { 7: null, 30: null, 90: null };
        for (const d of [7, 30, 90] as const) {
          growth[d] = growthInWindow(snaps, d, "subscriber_count", c.subscriber_count);
          viewsGrowth[d] = growthInWindow(snaps, d, "view_count", c.view_count);
        }
        return {
          id: c.id,
          title: c.title,
          url: c.url,
          avatarUrl: c.avatar_url,
          subs: c.subscriber_count,
          views: c.view_count,
          videoCount: c.video_count,
          updatedAt: c.updated_at,
          growth,
          viewsGrowth,
          snapshotCount: snaps.length,
        };
      });

      // Top-videos pool: own (50) + each competitor (30), same as Research.
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
        for (const v of rows) {
          const views = Number(v.view_count ?? 0);
          videos.push({
            videoId: v.video_id,
            title: v.title,
            url: v.url,
            publishedAt: v.published_at,
            viewCount: views,
            vph: viewsPerHour(v.view_count, v.published_at),
            ratio: avg > 0 ? Math.round((views / avg) * 10) / 10 : 0,
            channelId: ch.id,
            channelTitle: ch.title,
            channelAvatar: ch.avatar_url,
            isOwn: ch.role === "own",
          });
        }
      }
      videos.sort((a, b) => b.viewCount - a.viewCount);
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Could not load competitors.";
    }
  }

  const own = channels.find((c) => c.role === "own") ?? null;

  return (
    <>
      <div className="opt-page-head">
        <h1>Competitors</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          How the channels you track are growing, and their top videos — all
          from real YouTube data. Growth needs history: a channel shows “—”
          until it has a snapshot from before the period you pick.
        </p>
      </div>

      {!configured ? (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Setup needed:</strong> Supabase is not configured yet. Add
          the env vars from <code>.env.example</code> and redeploy.
        </div>
      ) : null}
      {loadError ? <p className="error" style={{ marginTop: 16 }}>{loadError}</p> : null}

      {!configured || channels.length === 0 ? (
        <section className="section">
          <EmptyState
            title="No channel connected yet"
            body="Connect your channel first — then add competitors to compare growth and top videos."
            action={<Link href="/" className="btn btn-primary">Connect a channel</Link>}
          />
        </section>
      ) : (
        <CompetitorsPage
          own={own ? { id: own.id, title: own.title, avatarUrl: own.avatar_url } : null}
          competitors={competitors}
          videos={videos}
          owner={owner}
          anySnapshots={anySnapshots}
          addAction={addCompetitorAction}
          removeAction={removeCompetitorAction}
        />
      )}
    </>
  );
}
