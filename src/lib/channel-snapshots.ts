// Channel stat snapshots — the history behind Competitors growth %.
//
// The channels table only holds CURRENT stats, so growth over 7/30/90 days
// needs a history table (channel_snapshots). A snapshot is recorded every
// time fresh YouTube stats are fetched for a competitor (add + refresh).
// Growth is computed ONLY from real stored snapshots: if no snapshot exists
// at or before the start of the requested window, the result is null and
// the UI shows "—" with "Not tracked yet" — a baseline is never invented.
//
// The table may not exist yet in a deployed database (migration:
// hidden_files/public-launch/channel-snapshots-migration.sql). Every
// function here is best-effort: a missing table must never break the page
// or the connect flow, so all DB errors are swallowed and treated as
// "no history yet".

export type ChannelSnapshot = {
  id: number;
  channel_id: number;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  recorded_at: string;
};

export type GrowthResult = {
  /** Percentage change vs the baseline snapshot, e.g. +14.7. */
  pct: number;
  /** Absolute change, e.g. +17,000 subscribers. */
  gained: number;
  /** When the baseline snapshot was taken. */
  baselineAt: string;
};

const DEDUPE_MS = 6 * 60 * 60 * 1000;

/** Minimal Supabase-client shape used here (admin or server client). */
type Db = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Record a snapshot of a channel's current stats. Skips the write when the
 * latest snapshot is under 6h old with identical counts (a refresh that
 * changed nothing adds no history). Never throws.
 */
export async function recordChannelSnapshot(
  admin: Db,
  channelDbId: number,
  stats: { subscriberCount: number | null; viewCount: number | null; videoCount: number | null }
): Promise<void> {
  try {
    const { data } = await admin
      .from("channel_snapshots")
      .select("subscriber_count,view_count,video_count,recorded_at")
      .eq("channel_id", channelDbId)
      .order("recorded_at", { ascending: false })
      .limit(1);
    const latest = (data as ChannelSnapshot[] | null)?.[0];
    if (latest) {
      const ageMs = Date.now() - new Date(latest.recorded_at).getTime();
      const same =
        Number(latest.subscriber_count ?? 0) === Number(stats.subscriberCount ?? 0) &&
        Number(latest.view_count ?? 0) === Number(stats.viewCount ?? 0) &&
        Number(latest.video_count ?? 0) === Number(stats.videoCount ?? 0);
      if (ageMs < DEDUPE_MS && same) return;
    }
    await admin.from("channel_snapshots").insert({
      channel_id: channelDbId,
      subscriber_count: stats.subscriberCount,
      view_count: stats.viewCount,
      video_count: stats.videoCount,
      recorded_at: new Date().toISOString(),
    });
  } catch {
    // Table missing / RLS / network — growth simply stays untracked.
  }
}

/** Load all snapshots for a set of channels, oldest first. Never throws. */
export async function loadSnapshots(
  db: Db,
  channelDbIds: number[]
): Promise<Map<number, ChannelSnapshot[]>> {
  const out = new Map<number, ChannelSnapshot[]>();
  if (channelDbIds.length === 0) return out;
  try {
    // One query per channel keeps the shape simple and the result small
    // (a channel gains at most ~4 snapshots a day).
    for (const id of channelDbIds) {
      const { data } = await db
        .from("channel_snapshots")
        .select("id,channel_id,subscriber_count,view_count,video_count,recorded_at")
        .eq("channel_id", id)
        .order("recorded_at", { ascending: true })
        .limit(120);
      out.set(id, ((data as ChannelSnapshot[] | null) ?? []).slice().sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      ));
    }
  } catch {
    // Missing table → every channel simply has no history.
  }
  return out;
}

/**
 * Growth of one stat over a window, from stored snapshots only.
 * Baseline = the latest snapshot at or before the window start; if the
 * channel was added after the window start there is no baseline → null.
 * `current` is the channel's live stats from the channels table.
 */
export function growthInWindow(
  snapshots: ChannelSnapshot[],
  days: number,
  field: "subscriber_count" | "view_count",
  current: number | null
): GrowthResult | null {
  if (current === null || current === undefined) return null;
  const windowStart = Date.now() - days * 24 * 60 * 60 * 1000;
  let baseline: ChannelSnapshot | null = null;
  for (const s of snapshots) {
    if (new Date(s.recorded_at).getTime() <= windowStart) baseline = s;
    else break;
  }
  if (!baseline) return null;
  const baseVal = Number(baseline[field] ?? 0);
  if (baseVal <= 0) return null;
  const gained = current - baseVal;
  return {
    pct: Math.round(((gained / baseVal) * 1000)) / 10,
    gained,
    baselineAt: baseline.recorded_at,
  };
}
