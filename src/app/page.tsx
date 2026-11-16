import Link from "next/link";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { SectionTitle, EmptyState } from "@/components/ui";
import ConnectChannel from "@/components/ConnectChannel";
import OnboardingTour from "@/components/OnboardingTour";
import HomeShell from "@/components/HomeShell";
import ConsistencyCard, { type ConsistencyInitial } from "@/components/ConsistencyCard";
import TagsCard from "@/components/TagsCard";
import LatestVideoCard, { type LatestVideoData } from "@/components/LatestVideoCard";
import { scoreConsistency, scoreTag } from "@/lib/consistency";
import { topicKeywords, type SeoPack } from "@/lib/generator";
import { analysisHref } from "@/lib/video-links";

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
  payload_json: SeoPack & { chosenTitle?: string; chosenAt?: string };
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

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Next "round" milestone above n (e.g. 61,047 → 60K–65K; 225 → 200–300). */
function milestone(n: number): { prev: number; next: number } {
  if (n < 1000) {
    const next = Math.ceil((n + 1) / 100) * 100;
    return { prev: next - 100, next };
  }
  const step = Math.pow(10, Math.floor(Math.log10(n))) / 2;
  const next = Math.ceil((n + 1) / step) * step;
  return { prev: next - step, next };
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
          .select("id,kind,topic,created_at,payload_json")
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

  // Latest video + performance vs the channel median (views/hour).
  const latestVideo = videos[0] ?? null;
  const vphs = videos.map((v) => vph(v));
  const medianVph = median(vphs);
  let latestVideoData: LatestVideoData | null = null;
  if (latestVideo) {
    const ageHours = hoursSince(latestVideo.published_at);
    const sorted = [...videos].sort((a, b) => vph(b) - vph(a));
    const rank = sorted.findIndex((v) => v.video_id === latestVideo.video_id) + 1;
    latestVideoData = {
      videoId: latestVideo.video_id,
      title: latestVideo.title,
      url: latestVideo.url,
      publishedAt: latestVideo.published_at,
      viewCount: latestVideo.view_count,
      likeCount: latestVideo.like_count,
      vph: vph(latestVideo),
      medianVph,
      rankLabel:
        ageHours < 48
          ? "Too early"
          : `#${rank} of ${videos.length} by views/hour`,
      isOwn: selected?.role === "own",
    };
  }

  // Latest SEO pack → consistency + tag scores (all computed from the
  // pack's own saved text and the live trending snapshot).
  const latestPack = packages.find(
    (p) => p.kind === "package" && p.payload_json && p.payload_json.bestTitle
  );
  let consistencyInitial: ConsistencyInitial | null = null;
  let tagScores: Array<{ tag: string; score: number; signals: string[] }> = [];
  if (latestPack) {
    const pack = latestPack.payload_json;
    const currentTitle = pack.chosenTitle ?? pack.bestTitle;
    const description = pack.descriptionStarter ?? "";
    const scriptText = (pack.scriptOutline ?? [])
      .flatMap((s) => [s.section, ...s.points])
      .join(" ");
    const thumbnailText = (pack.thumbnailConcepts ?? [])
      .map((c) => `${c.bigText} ${c.layout}`)
      .join(" ");
    consistencyInitial = {
      packageId: latestPack.id,
      topic: pack.topic,
      currentTitle,
      consistency: scoreConsistency({
        title: currentTitle,
        description,
        scriptText,
        thumbnailText,
      }),
      alternatives: (pack.titles ?? [])
        .filter((t) => t.title !== currentTitle)
        .map((t) => {
          const c = scoreConsistency({
            title: t.title,
            description,
            scriptText,
            thumbnailText,
          });
          return {
            title: t.title,
            // Title match = mean of the three title parts (same as the
            // Analysis suggestions); consistencyScore = overall score.
            score: Math.round((c.parts[0].score + c.parts[1].score + c.parts[2].score) / 3),
            consistencyScore: c.score,
            titleScore: t.score,
            why: t.why,
          };
        })
        .sort((a, b) => b.score - a.score || b.titleScore - a.titleScore)
        .slice(0, 3),
    };
    const keywords = topicKeywords(pack.topic);
    const trendingTitles = trending.map((t) => t.title);
    tagScores = (pack.tags ?? []).map((tag) =>
      scoreTag(tag, {
        title: currentTitle,
        description,
        topicKeywords: keywords,
        trendingTitles,
      })
    );
  }

  const subs = selected?.subscriber_count ?? 0;
  const views = selected?.view_count ?? 0;
  const subsMile = milestone(subs);
  const viewsMile = milestone(views);
  const subsPct = Math.max(
    4,
    Math.min(100, Math.round(((subs - subsMile.prev) / (subsMile.next - subsMile.prev)) * 100))
  );
  const viewsPct = Math.max(
    4,
    Math.min(100, Math.round(((views - viewsMile.prev) / (viewsMile.next - viewsMile.prev)) * 100))
  );

  return (
    <>
      {user ? <OnboardingTour /> : null}
      <HomeShell
        channels={channels.map((c) => ({
          id: c.id,
          title: c.title,
          avatarUrl: c.avatar_url,
        }))}
        selectedId={selected?.id ?? null}
        email={user?.email ?? null}
      />

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
        <>
          <section className="hero">
            <div className="kicker">Nizafa · YouTube SEO &amp; Growth Tool</div>
            <h1>Grow your YouTube channel</h1>
            <p className="muted">
              Real stats from the YouTube Data API, trending topics, and SEO
              packs built from your own videos. No copied scores — every
              number comes from live public data.
            </p>
          </section>
          <div className="section">
            <ConnectChannel />
          </div>
        </>
      ) : null}

      {selected ? (
        <>
          {/* Channel stats — subscribers & views with progress to the next milestone. */}
          <section className="section">
            <div className="card milestone-card">
              <div className="milestone-half">
                <div className="stat-label">Subscribers</div>
                <div className="stat-num">{fmt(subs)}</div>
                <div className="meter">
                  <span style={{ width: `${subsPct}%` }} />
                </div>
                <div className="meter-labels">
                  <span>{fmt(subsMile.prev)}</span>
                  <span>{fmt(subsMile.next)}</span>
                </div>
              </div>
              <div className="milestone-half">
                <div className="stat-label">Views</div>
                <div className="stat-num">{fmt(views)}</div>
                <div className="meter">
                  <span style={{ width: `${viewsPct}%` }} />
                </div>
                <div className="meter-labels">
                  <span>{fmt(viewsMile.prev)}</span>
                  <span>{fmt(viewsMile.next)}</span>
                </div>
              </div>
              <div className="milestone-foot">
                <span>
                  <strong>{fmt(selected.video_count)}</strong> videos
                </span>
                <span>
                  Best <strong>{topVideos.length ? `${vph(topVideos[0])}/h` : "—"}</strong>
                  {topVideos.length ? ` · ${topVideos[0].title.slice(0, 42)}` : ""}
                </span>
                <span className="badge badge-teal">
                  {selected.role === "own" ? "Your channel" : "Competitor"}
                </span>
                <a href={selected.url} target="_blank" rel="noreferrer">
                  {selected.url}
                </a>
              </div>
              {selected.description ? (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {selected.description.slice(0, 280)}
                  {selected.description.length > 280 ? "…" : ""}
                </p>
              ) : null}
            </div>
          </section>

          <div className="home-grid">
            {latestVideoData ? (
              <section className="section home-grid-item">
                <LatestVideoCard video={latestVideoData} />
              </section>
            ) : null}

            {consistencyInitial ? (
              <section className="section home-grid-item">
                <ConsistencyCard initial={consistencyInitial} />
              </section>
            ) : (
              <section className="section home-grid-item">
                <div className="card">
                  <SectionTitle
                    title="Title match & consistency"
                    sub="Generate an SEO pack first — then Nizafa scores how well its title, description, script and thumbnail match, and suggests better titles."
                    action={<Link href="/generate" className="btn btn-primary btn-sm">Generate a pack →</Link>}
                  />
                </div>
              </section>
            )}

            {latestPack && tagScores.length > 0 ? (
              <section className="section home-grid-item">
                <TagsCard tags={tagScores} topic={latestPack.topic} />
              </section>
            ) : null}

            <section className="section home-grid-item">
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
                      <span className="trend-rank">{i + 1}</span>
                      <span className="badge">{t.geo}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong>{t.title}</strong>
                        <div className="small muted">{t.traffic ? `${t.traffic} searches` : ""}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="section home-grid-item">
              <div className="card">
                <SectionTitle title="Views per hour — top videos" sub="Views ÷ hours since publish, from your real video data." />
                {topVideos.length === 0 ? (
                  <p className="muted">No videos loaded yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {topVideos.map((v) => (
                      <div key={v.video_id}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <Link href={analysisHref(v.video_id, selected?.role === "own")} className="small" style={{ color: "var(--ink)" }}>
                            {v.title.slice(0, 64)}
                          </Link>
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
            </section>

            <section className="section home-grid-item">
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
                          <Link href={analysisHref(v.video_id, selected?.role === "own")} style={{ color: "var(--ink)", fontWeight: 600 }}>
                            {v.title}
                          </Link>
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
            </section>

            <section className="section home-grid-item">
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
            </section>
          </div>
        </>
      ) : null}

      {configured && channels.length > 0 ? (
        <section className="section">
          <ConnectChannel />
        </section>
      ) : null}
    </>
  );
}
