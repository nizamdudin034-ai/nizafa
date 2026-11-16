import Link from "next/link";
import {
  createSupabaseAdmin,
  createSupabaseServer,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import {
  ensureDailyIdeasForChannel,
  nicheThemes,
  type DailyIdea,
  type VideoForIdeas,
} from "@/lib/daily-ideas";
import type { TrendItem } from "@/lib/trends";
import CreatePage, {
  type CreateTopic,
  type ContentGap,
  type DoubleDownItem,
  type RemixItem,
} from "@/components/CreatePage";

export const dynamic = "force-dynamic";

type ChannelRow = {
  id: number;
  title: string;
  description: string | null;
};

type VideoRow = {
  video_id: string;
  title: string;
  url: string;
  published_at: string | null;
  view_count: number | null;
};

/** "100,000+" → 100000; "1.5M+" → 1500000; "" → null. */
function parseTraffic(raw: string | undefined): number | null {
  const s = (raw ?? "").trim().replace(/,/g, "").replace(/\+$/, "");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*([KM])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2]?.toUpperCase() === "M" ? 1_000_000 : m[2]?.toUpperCase() === "K" ? 1_000 : 1;
  return Math.round(n * mult);
}

function coreTitle(title: string): string {
  return title.replace(/\s*[|–—-].*$/, "").trim() || title;
}

export default async function Create() {
  const user = await getSessionUser();
  const configured = isSupabaseConfigured();

  let own: ChannelRow | null = null;
  let topicOfDay: DailyIdea | null = null;
  let savedIdeas: Array<{ title: string; hook: string; prediction: string; date: string }> = [];
  let moreTopics: CreateTopic[] = [];
  let searchTerms: string[] = [];
  let contentGaps: ContentGap[] = [];
  let doubleDown: DoubleDownItem[] = [];
  let remix: RemixItem[] = [];
  let themes: string[] = [];
  let loadError: string | null = null;

  if (configured && user) {
    try {
      const admin = createSupabaseAdmin();
      const server = createSupabaseServer();
      const { data: channels } = await server
        .from("channels")
        .select("id,title,description")
        .eq("role", "own")
        .eq("user_id", user.id)
        .order("connected_at", { ascending: true });
      const list = (channels ?? []) as ChannelRow[];
      own = list[0] ?? null;

      if (own) {
        // Today's 4 ideas — Topic of the Day is the first one.
        try {
          const result = await ensureDailyIdeasForChannel(admin, own);
          topicOfDay = result.ideas[0] ?? null;
          themes = result.nicheThemes;
        } catch {
          // Ideas failing must not block the rest of the page.
        }

        // Saved ideas (from the daily-ideas state row).
        const { data: stateRow } = await admin
          .from("packages")
          .select("payload_json")
          .eq("user_id", user.id)
          .eq("kind", "daily-idea-states")
          .eq("topic", `idea-states:${own.id}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const statePayload = stateRow?.payload_json as {
          saved?: Array<{ title: string; hook?: string; prediction?: string; date?: string }>;
        } | null;
        savedIdeas = (statePayload?.saved ?? []).map((s) => ({
          title: s.title,
          hook: s.hook ?? "",
          prediction: s.prediction ?? "Medium",
          date: s.date ?? "",
        }));

        // Own videos: niche, double-down (most viewed), remix (hottest VPH).
        const { data: vids } = await server
          .from("channel_videos")
          .select("video_id,title,url,published_at,view_count")
          .eq("channel_id", own.id)
          .order("published_at", { ascending: false })
          .limit(50);
        const videos = (vids ?? []) as VideoRow[];
        const forIdeas: VideoForIdeas[] = videos.map((v) => ({
          title: v.title,
          viewCount: Number(v.view_count ?? 0),
          publishedAt: v.published_at,
        }));
        if (themes.length === 0) themes = nicheThemes(forIdeas);
        const avgViews =
          videos.length > 0
            ? videos.reduce((s, v) => s + Number(v.view_count ?? 0), 0) / videos.length
            : 0;
        const byViews = [...videos].sort(
          (a, b) => Number(b.view_count ?? 0) - Number(a.view_count ?? 0)
        );
        doubleDown = byViews.slice(0, 3).map((v) => {
          const views = Number(v.view_count ?? 0);
          const ratio = avgViews > 0 ? Math.round((views / avgViews) * 10) / 10 : 0;
          return {
            videoId: v.video_id,
            title: v.title,
            url: v.url,
            views,
            ratio,
            sequel: `Part 2: ${coreTitle(v.title)}`,
            why:
              ratio >= 1
                ? `${views.toLocaleString("en-US")} views — ${ratio}× your channel average. A sequel doubles down on what already worked.`
                : `${views.toLocaleString("en-US")} views. A follow-up gives this story a second chance.`,
          };
        });
        const vphOf = (v: VideoRow): number => {
          if (!v.published_at) return Number(v.view_count ?? 0);
          const hours = Math.max(
            1,
            (Date.now() - new Date(v.published_at).getTime()) / 3_600_000
          );
          return Number(v.view_count ?? 0) / hours;
        };
        const byVph = [...videos].sort((a, b) => vphOf(b) - vphOf(a));
        remix = byVph.slice(0, 3).map((v) => ({
          videoId: v.video_id,
          title: v.title,
          url: v.url,
          vph: Math.round(vphOf(v)),
          shortIdea: `${coreTitle(v.title)} — in 60 seconds`,
          hook: `The one moment from “${coreTitle(v.title)}” that deserves its own Short.`,
        }));

        // Rising keywords: latest snapshot vs the previous one.
        const { data: snaps } = await admin
          .from("trending_snapshots")
          .select("fetched_at,items")
          .order("fetched_at", { ascending: false })
          .limit(2);
        const latest = ((snaps?.[0]?.items ?? []) as TrendItem[]).filter(
          (t) => t && typeof t.title === "string"
        );
        const prev = ((snaps?.[1]?.items ?? []) as TrendItem[]).filter(
          (t) => t && typeof t.title === "string"
        );
        const prevVol = new Map<string, number>();
        for (const t of prev) {
          const v = parseTraffic(t.traffic);
          if (v != null) prevVol.set(t.title.toLowerCase(), v);
        }
        const nicheWords = new Set(themes.flatMap((t) => t.split(" ")));
        const keywords = latest.map((t) => {
          const volume = parseTraffic(t.traffic);
          const p = prevVol.get(t.title.toLowerCase());
          const growthPct =
            p != null && p > 0 && volume != null
              ? Math.round(((volume - p) / p) * 100)
              : null;
          const matchesNiche = t.title
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .some((w) => nicheWords.has(w));
          return {
            title: t.title,
            traffic: t.traffic ?? "",
            volume,
            growthPct,
            isNew: p == null,
            matchesNiche,
          };
        });
        // Dedupe by title, keep highest volume.
        const best = new Map<string, (typeof keywords)[number]>();
        for (const k of keywords) {
          const cur = best.get(k.title.toLowerCase());
          if (!cur || (k.volume ?? 0) > (cur.volume ?? 0)) best.set(k.title.toLowerCase(), k);
        }
        const ranked = [...best.values()].sort((a, b) => {
          if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
          if ((b.growthPct ?? -1) !== (a.growthPct ?? -1)) return (b.growthPct ?? -1) - (a.growthPct ?? -1);
          return (b.volume ?? 0) - (a.volume ?? 0);
        });
        searchTerms = ranked.slice(0, 8).map((k) => k.title);

        // More Topics for You: niche-matched rising keywords as topic cards.
        const nicheMatched = ranked.filter((k) => k.matchesNiche);
        const topics = (nicheMatched.length > 0 ? nicheMatched : ranked).slice(0, 6);
        moreTopics = topics.map((k) => ({
          title: k.title,
          traffic: k.traffic,
          isNew: k.isNew,
          growthPct: k.growthPct,
        }));

        // Fill content gaps: rising keywords no own video title covers yet.
        const ownTitles = videos.map((v) => v.title.toLowerCase());
        contentGaps = ranked
          .filter((k) => {
            const words = k.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
            if (words.length === 0) return false;
            const covered = words.some((w) => ownTitles.some((t) => t.includes(w)));
            return !covered;
          })
          .slice(0, 6)
          .map((k) => ({ title: k.title, traffic: k.traffic }));
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Could not load Create data.";
    }
  }

  return (
    <>
      <div className="opt-page-head">
        <h1>Create</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          Today&apos;s topic, your saved ideas, and new angles from your niche
          — all from your real channel data and real trends. Free on every
          plan.
        </p>
      </div>

      {!configured ? (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Setup needed:</strong> Supabase is not configured yet. Add
          the env vars from <code>.env.example</code> and redeploy.
        </div>
      ) : null}
      {loadError ? <p className="error" style={{ marginTop: 16 }}>{loadError}</p> : null}

      {!configured || !user ? (
        <section className="section">
          <div className="card" style={{ textAlign: "center", padding: "28px 18px" }}>
            <h3>Sign in to see your Create feed</h3>
            <p className="muted">
              Topic of the Day, saved ideas and niche topics are built from
              your connected channel.
            </p>
            <Link href="/" className="btn btn-primary">Connect a channel</Link>
          </div>
        </section>
      ) : (
        <CreatePage
          own={own ? { id: own.id, title: own.title } : null}
          topicOfDay={topicOfDay}
          savedIdeas={savedIdeas}
          moreTopics={moreTopics}
          searchTerms={searchTerms}
          contentGaps={contentGaps}
          doubleDown={doubleDown}
          remix={remix}
          nicheThemes={themes}
        />
      )}
    </>
  );
}
