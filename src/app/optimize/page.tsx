import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";
import { StatCard, SectionTitle, EmptyState } from "@/components/ui";
import {
  runAudit,
  scoreVideoSeo,
  viewsPerHour,
  bestPostingTimes,
  type AuditReport,
} from "@/lib/audit";
import { connectCompetitorChannel } from "@/lib/competitors";

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

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function runAuditAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || !isOwner(user)) return;
  const channelId = Number(formData.get("channelId"));
  if (!channelId) return;
  try {
    await runAudit(channelId);
  } catch {
    // The page re-renders with the last saved audit; a failed run simply
    // leaves it unchanged.
  }
  revalidatePath("/optimize");
}

async function addCompetitorAction(formData: FormData) {
  "use server";
  const user = await getSessionUser();
  if (!user || !isOwner(user)) return;
  const input = String(formData.get("input") ?? "").trim();
  if (!input) return;
  await connectCompetitorChannel(input, user.id);
  revalidatePath("/optimize");
}

export default async function OptimizePage({
  searchParams,
}: {
  searchParams: { channel?: string };
}) {
  const user = await getSessionUser();
  const owner = isOwner(user);
  const configured = isSupabaseConfigured();

  let channels: ChannelRow[] = [];
  let competitors: ChannelRow[] = [];
  let videos: VideoRow[] = [];
  let latestAudit: { report: AuditReport; created_at: string } | null = null;
  let loadError: string | null = null;

  if (configured) {
    try {
      const supabase = createSupabaseServer();
      const [chRes, compRes] = await Promise.all([
        supabase.from("channels").select("*").order("connected_at", { ascending: true }),
        supabase.from("channels").select("*").eq("role", "competitor").order("connected_at", { ascending: true }),
      ]);
      channels = (chRes.data ?? []) as ChannelRow[];
      competitors = (compRes.data ?? []) as ChannelRow[];
      const selected =
        channels.find((c) => String(c.id) === searchParams.channel) ??
        channels.find((c) => c.role === "own") ??
        channels[0];
      if (selected) {
        const [vidRes, auditRes] = await Promise.all([
          supabase
            .from("channel_videos")
            .select("*")
            .eq("channel_id", selected.id)
            .order("published_at", { ascending: false })
            .limit(25),
          supabase
            .from("audits")
            .select("report,created_at")
            .eq("channel_id", selected.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        videos = (vidRes.data ?? []) as VideoRow[];
        if (auditRes.data) {
          latestAudit = {
            report: auditRes.data.report as AuditReport,
            created_at: auditRes.data.created_at as string,
          };
        }
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Could not load optimize data.";
    }
  }

  const own = channels.find((c) => c.role === "own") ?? channels[0] ?? null;
  const selectedId =
    channels.find((c) => String(c.id) === searchParams.channel)?.id ?? own?.id;
  const scored = videos.map((v) => ({
    ...v,
    vph: viewsPerHour(v.view_count, v.published_at),
    seo: scoreVideoSeo({
      title: v.title,
      publishedAt: v.published_at,
      viewCount: v.view_count,
      likeCount: v.like_count,
      commentCount: v.comment_count,
    }),
  }));
  const avgSeo = scored.length
    ? Math.round(scored.reduce((s, v) => s + v.seo.score, 0) / scored.length)
    : null;
  const slots = bestPostingTimes(
    videos.map((v) => ({
      title: v.title,
      publishedAt: v.published_at,
      viewCount: v.view_count,
      likeCount: v.like_count,
      commentCount: v.comment_count,
    }))
  );
  const avgVph = scored.length
    ? Math.round(scored.reduce((s, v) => s + v.vph, 0) / scored.length)
    : null;

  return (
    <>
      <section className="hero">
        <div className="kicker">Optimize</div>
        <h1>SEO scores, best posting times &amp; competitors</h1>
        <p className="muted">
          Rule-based scores from your real video data — title length, hooks,
          engagement and views per hour. Nothing here is a guessed or
          proprietary score.
        </p>
      </section>

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
            body="Connect your channel first — Optimize scores your real videos, runs a channel audit, and compares you with competitors."
            action={<Link href="/" className="btn btn-primary">Connect a channel</Link>}
          />
        </section>
      ) : null}

      {own ? (
        <>
          <section className="section">
            <div className="grid grid-4">
              <StatCard label="Average video SEO score" value={avgSeo === null ? "—" : `${avgSeo}/100`} sub="Rule-based estimate" />
              <StatCard label="Average views / hour" value={avgVph === null ? "—" : `${avgVph}/h`} sub="Across loaded videos" />
              <StatCard label="Videos scored" value={String(scored.length)} />
              <StatCard
                label="Latest audit"
                value={latestAudit ? `${latestAudit.report.score}/100` : "—"}
                sub={latestAudit ? `${latestAudit.report.grade} · ${new Date(latestAudit.created_at).toLocaleDateString()}` : "No audit run yet"}
              />
            </div>
            {channels.length > 1 ? (
              <p className="small" style={{ marginTop: 12 }}>
                Channel:{" "}
                {channels.map((c) => (
                  <span key={c.id}>
                    <Link href={`/optimize?channel=${c.id}`}>{c.title}</Link>{" "}
                  </span>
                ))}
              </p>
            ) : null}
          </section>

          <section className="section">
            <div className="card">
              <SectionTitle
                title="Channel health audit"
                sub="Transparent, rule-based: every point comes from a stated rule applied to your real data."
                action={
                  owner && selectedId ? (
                    <form action={runAuditAction}>
                      <input type="hidden" name="channelId" value={selectedId} />
                      <button type="submit" className="btn btn-primary btn-sm">
                        Run audit
                      </button>
                    </form>
                  ) : null
                }
              />
              {!latestAudit ? (
                <p className="muted" style={{ marginBottom: 0 }}>
                  No audit saved yet. {owner ? "Press “Run audit” to score the channel." : "The workspace owner can run an audit."}
                </p>
              ) : (
                <>
                  <p style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 26 }}>{latestAudit.report.score}/100</strong>{" "}
                    <span className="badge badge-teal">{latestAudit.report.grade}</span>{" "}
                    <span className="small muted">
                      {new Date(latestAudit.report.computedAt).toLocaleString()}
                    </span>
                  </p>
                  <p className="small muted">{latestAudit.report.method}</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {latestAudit.report.checks.map((c) => (
                      <div key={c.label} className="list-row" style={{ padding: "8px 0" }}>
                        <span className={`badge ${c.pass ? "badge-teal" : "badge-red"}`}>
                          {c.pass ? "✓" : "✗"}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <strong>{c.label}</strong>{" "}
                          <span className="small muted">
                            {c.points}/{c.maxPoints} pts
                          </span>
                          <div className="small muted">{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {latestAudit.report.fixes.length > 0 ? (
                    <>
                      <h3 style={{ marginTop: 16 }}>Fixes to try first</h3>
                      <ul style={{ margin: "4px 0 0", paddingInlineStart: 20 }}>
                        {latestAudit.report.fixes.map((f) => (
                          <li key={f} className="small" style={{ marginBottom: 6 }}>{f}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </section>

          <section className="section">
            <div className="grid grid-2">
              <div className="card">
                <SectionTitle title="Best posting times" sub="From your upload history (UTC). Your proven windows, not a generic chart." />
                {slots.length === 0 ? (
                  <p className="muted">No upload history loaded yet.</p>
                ) : (
                  <ol style={{ margin: 0, paddingInlineStart: 20 }}>
                    {slots.slice(0, 4).map((s) => (
                      <li key={s.day} style={{ marginBottom: 8 }}>
                        <strong>{s.label}</strong>
                        <div className="small muted">
                          {s.hour}:00–{s.hour + 1}:00 UTC was your most-used hour that day.
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Times are in UTC, as stored by YouTube. Your audience is
                  mostly in the US and Pakistan — check the dashboard heatmap
                  for the matching local times.
                </p>
              </div>

              <div className="card">
                <SectionTitle title="Competitors" sub="Side-by-side stats from the YouTube Data API." />
                {competitors.length === 0 ? (
                  <p className="muted">No competitors added yet.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Subs</th>
                          <th>Views</th>
                          <th>Videos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {own ? (
                          <tr>
                            <td>
                              <strong>{own.title}</strong>{" "}
                              <span className="badge badge-teal">You</span>
                            </td>
                            <td>{fmt(own.subscriber_count)}</td>
                            <td>{fmt(own.view_count)}</td>
                            <td>{fmt(own.video_count)}</td>
                          </tr>
                        ) : null}
                        {competitors.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <a href={c.url} target="_blank" rel="noreferrer">
                                {c.title}
                              </a>
                            </td>
                            <td>{fmt(c.subscriber_count)}</td>
                            <td>{fmt(c.view_count)}</td>
                            <td>{fmt(c.video_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {owner ? (
                  <form action={addCompetitorAction} style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label htmlFor="competitor-input" className="label" style={{ width: "100%", marginBottom: 0 }}>
                      Add a competitor
                    </label>
                    <input
                      id="competitor-input"
                      name="input"
                      className="input"
                      style={{ flex: "1 1 200px" }}
                      placeholder="Channel link, @handle or ID"
                      required
                    />
                    <button type="submit" className="btn btn-ghost">Add</button>
                  </form>
                ) : (
                  <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
                    Only the workspace owner can add competitors in this version.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="section">
            <div className="card">
              <SectionTitle
                title="Videos — SEO score & views per hour"
                sub="Scores are rule-based estimates from cached video data. Descriptions and tags are not stored in the cache, so they are not scored."
              />
              {scored.length === 0 ? (
                <p className="muted">No videos loaded yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Video</th>
                        <th>SEO</th>
                        <th>VPH</th>
                        <th>Views</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scored.map((v) => (
                        <tr key={v.video_id}>
                          <td style={{ minWidth: 220 }}>
                            <a href={v.url} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600 }}>
                              {v.title}
                            </a>
                            <div className="small muted">
                              {v.seo.checks.filter((c) => !c.pass).map((c) => c.label).join(" · ") || "All checks pass"}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${v.seo.score >= 75 ? "badge-teal" : v.seo.score >= 55 ? "badge-gold" : "badge-red"}`}>
                              {v.seo.score}/100
                            </span>
                          </td>
                          <td>{v.vph}/h</td>
                          <td>{fmt(v.view_count)}</td>
                          <td className="small">
                            {v.published_at ? new Date(v.published_at).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
