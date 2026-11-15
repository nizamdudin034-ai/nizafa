import Link from "next/link";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { StatCard, SectionTitle, EmptyState } from "@/components/ui";
import ConnectChannel from "@/components/ConnectChannel";
import OnboardingTour from "@/components/OnboardingTour";

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

type PackageRow = {
  id: number;
  kind: string;
  topic: string;
  created_at: string;
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function hoursSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(1, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}

function vph(v: VideoRow): number {
  return Math.round((v.view_count ?? 0) / hoursSince(v.published_at));
}

export default async function Home({
  searchParams,
}: {
  searchParams: { channel?: string };
}) {
  const user = await getSessionUser();
  const configured = isSupabaseConfigured();

  let channels: ChannelRow[] = [];
  let videos: VideoRow[] = [];
  let packages: PackageRow[] = [];
  let trending: Array<{ title: string; traffic: string; geo: string }> = [];
  let trendingAt: string | null = null;
  let loadError: string | null = null;
  let selectedChannel: ChannelRow | null = null;

  if (configured) {
    try {
      const supabase = createSupabaseServer();
      const [chRes, pkgRes, trRes] = await Promise.all([
        supabase
          .from("channels")
          .select("*")
          .order("connected_at", { ascending: true }),
        supabase
          .from("packages")
          .select("id,kind,topic,created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("trending_snapshots")
          .select("fetched_at,items")
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      channels = (chRes.data ?? []) as ChannelRow[];
      packages = (pkgRes.data ?? []) as PackageRow[];
      if (trRes.data) {
        trendingAt = trRes.data.fetched_at as string;
        const items = (trRes.data.items ?? []) as Array<{
          title: string;
          traffic: string;
          geo: string;
        }>;
        trending = items.slice(0, 8);
      }
      const selected =
        channels.find((c) => String(c.id) === searchParams.channel) ??
        channels.find((c) => c.role === "own") ??
        channels[0];
      if (selected) {
        const { data } = await supabase
          .from("channel_videos")
          .select("*")
          .eq("channel_id", selected.id)
          .order("published_at", { ascending: false })
          .limit(10);
        videos = (data ?? []) as VideoRow[];
      }
      selectedChannel = selected ?? null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Could not load dashboard data.";
    }
  }

  const selected = selectedChannel;
  const own = channels.find((c) => c.role === "own");
  const topVideos = [...videos].sort((a, b) => vph(b) - vph(a)).slice(0, 5);
  const maxVph = Math.max(1, ...topVideos.map((v) => vph(v)));

  // Best time to post: bucket video publish times into 4 dayparts.
  const dayparts = ["Night 12–6", "Morning 6–12", "Afternoon 12–18", "Evening 18–24"];
  const buckets = [0, 0, 0, 0];
  for (const v of videos) {
    if (!v.published_at) continue;
    const h = new Date(v.published_at).getUTCHours();
    buckets[Math.min(3, Math.floor(h / 6))] += 1;
  }
  const maxBucket = Math.max(1, ...buckets);

  return (
    <>
      {user ? <OnboardingTour /> : null}
      <section className="hero">
        <div className="kicker">Nizafa · YouTube SEO &amp; Growth Tool</div>
        <h1>
          {selected ? `${selected.title} — your channel, at a glance` : "Grow your YouTube channel"}
        </h1>
        <p className="muted">
          Real stats from the YouTube Data API, trending topics, and SEO packs
          built from your own videos. No copied scores — every number comes
          from live public data.
        </p>
      </section>

      {!configured ? (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>Setup needed:</strong> Supabase is not configured yet. Add
          the env vars from <code>.env.example</code> in Netlify (or{" "}
          <code>.env.local</code> locally) and redeploy. The pages below will
          work once the database is connected.
        </div>
      ) : null}
      {loadError ? <p className="error" style={{ marginTop: 16 }}>{loadError}</p> : null}

      {configured && channels.length === 0 ? (
        <div className="section">
          <ConnectChannel />
        </div>
      ) : null}

      {selected ? (
        <>
          <section className="section">
            <div className="card" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {selected.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.avatar_url}
                  alt=""
                  width={72}
                  height={72}
                  style={{ borderRadius: "50%", flex: "none" }}
                />
              ) : (
                <div
                  style={{
                    width: 72, height: 72, borderRadius: "50%", flex: "none",
                    background: "var(--teal-700)", color: "#fff",
                    display: "grid", placeItems: "center",
                    fontSize: 30, fontWeight: 800,
                  }}
                >
                  {selected.title.charAt(0)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <h2 style={{ marginBottom: 2 }}>{selected.title}</h2>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    {selected.url}
                  </a>
                  {" · "}
                  <span className="badge badge-teal">{selected.role === "own" ? "Your channel" : "Competitor"}</span>
                </p>
                {selected.description ? (
                  <p className="small" style={{ marginBottom: 0 }}>
                    {selected.description.slice(0, 280)}
                    {selected.description.length > 280 ? "…" : ""}
                  </p>
                ) : null}
                {channels.length > 1 ? (
                  <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                    Switch channel:{" "}
                    {channels.map((c) => (
                      <span key={c.id}>
                        <Link href={`/?channel=${c.id}`}>{c.title}</Link>{" "}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="grid grid-4">
              <StatCard label="Subscribers" value={fmt(selected.subscriber_count)} />
              <StatCard label="Total views" value={fmt(selected.view_count)} />
              <StatCard label="Videos" value={fmt(selected.video_count)} />
              <StatCard
                label="Best VPH"
                value={topVideos.length ? `${vph(topVideos[0])}/h` : "—"}
                sub={topVideos.length ? topVideos[0].title.slice(0, 42) : "No videos yet"}
              />
            </div>
          </section>

          <section className="section">
            <div className="grid grid-2">
              <div className="card">
                <SectionTitle title="Views per hour — top videos" sub="Views ÷ hours since publish, from your real video data." />
                {topVideos.length === 0 ? (
                  <p className="muted">No videos loaded yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {topVideos.map((v) => (
                      <div key={v.video_id}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <a href={v.url} target="_blank" rel="noreferrer" className="small" style={{ color: "var(--ink)" }}>
                            {v.title.slice(0, 64)}
                          </a>
                          <strong className="small" style={{ whiteSpace: "nowrap" }}>{vph(v)}/h</strong>
                        </div>
                        <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 999, marginTop: 4 }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.max(4, Math.round((vph(v) / maxVph) * 100))}%`,
                              background: "var(--teal-600)",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <SectionTitle title="Best time to post" sub="When your videos were published, by time of day (UTC)." />
                <div className="heatmap">
                  {dayparts.map((d, i) => (
                    <div
                      key={d}
                      className={buckets[i] === maxBucket && buckets[i] > 0 ? "hot" : buckets[i] > 0 ? "warm" : ""}
                      title={`${d}: ${buckets[i]} videos`}
                    >
                      {d.split(" ")[0]}
                      <br />
                      {buckets[i]}
                    </div>
                  ))}
                </div>
                <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  {buckets.reduce((a, b) => a + b, 0) === 0
                    ? "Connect a channel with videos to see your best posting times."
                    : `Most uploads: ${dayparts[buckets.indexOf(maxBucket)]}. Posting near your proven windows usually performs best.`}
                </p>
                <div style={{ marginTop: 16 }}>
                  <SectionTitle title="Recent videos" sub="Views and likes, latest first." />
                  {videos.length === 0 ? (
                    <p className="muted">No videos loaded yet.</p>
                  ) : (
                    videos.slice(0, 5).map((v) => (
                      <div className="list-row" key={v.video_id}>
                        <div style={{ minWidth: 0 }}>
                          <a href={v.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600 }}>
                            {v.title}
                          </a>
                          <div className="small muted">
                            {fmt(v.view_count)} views · {fmt(v.like_count)} likes ·{" "}
                            {v.published_at ? new Date(v.published_at).toLocaleDateString() : "—"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="section">
        <div className="grid grid-2">
          <div className="card">
            <SectionTitle
              title="Trending now"
              sub={trendingAt ? `Snapshot from ${new Date(trendingAt).toLocaleString()}` : "US + Pakistan, refreshed daily."}
              action={<Link href="/research" className="btn btn-ghost btn-sm">Research →</Link>}
            />
            {trending.length === 0 ? (
              <p className="muted">
                No trending snapshot yet.{" "}
                <a href="/api/trending">Refresh trending</a> (fetches the public Google Trends feeds).
              </p>
            ) : (
              trending.map((t, i) => (
                <div className="list-row" key={`${t.geo}-${t.title}-${i}`}>
                  <span className="badge">{t.geo}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{t.title}</strong>
                    <div className="small muted">{t.traffic ? `${t.traffic} searches` : ""}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="card">
            <SectionTitle
              title="Recent SEO packs"
              sub="Your latest generated titles, tags and full packages."
              action={<Link href="/generate" className="btn btn-primary btn-sm">New pack →</Link>}
            />
            {packages.length === 0 ? (
              <EmptyState
                title="No packs yet"
                body="Generate your first SEO pack for a video topic — titles, tags, hashtags, description, outline and thumbnail ideas in one click."
                action={<Link href="/generate" className="btn btn-primary">Generate a pack</Link>}
              />
            ) : (
              packages.map((p) => (
                <div className="list-row" key={p.id}>
                  <span className="badge badge-gold">{p.kind}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.topic}</strong>
                    <div className="small muted">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            <p style={{ marginTop: 16, marginBottom: 0 }}>
              <Link href="/ideas">Today&apos;s ideas for your channel →</Link>
            </p>
          </div>
        </div>
      </section>

      {configured && channels.length > 0 ? (
        <section className="section">
          <ConnectChannel />
        </section>
      ) : null}
    </>
  );
}
