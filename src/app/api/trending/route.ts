import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { fetchTrendsAll, type TrendItem } from "@/lib/trends";

// GET /api/trending — today's Google Trends snapshot (US + Pakistan).
// Cached in Supabase once per day; the home page never waits on a live fetch.
export async function GET() {
  if (!isSupabaseConfigured()) {
    // No DB yet: try a live fetch, return what we get (or an empty list).
    try {
      const items = await fetchTrendsAll();
      return NextResponse.json({ items, fetchedAt: new Date().toISOString(), cached: false });
    } catch (e) {
      return NextResponse.json(
        { items: [], error: e instanceof Error ? e.message : "Trends unavailable." },
        { status: 200 }
      );
    }
  }

  const admin = createSupabaseAdmin();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data: existing } = await admin
    .from("trending_snapshots")
    .select("fetched_at,items")
    .gte("fetched_at", todayStart.toISOString())
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      items: (existing.items ?? []) as TrendItem[],
      fetchedAt: existing.fetched_at as string,
      cached: true,
    });
  }

  try {
    const items = await fetchTrendsAll();
    if (items.length > 0) {
      await admin.from("trending_snapshots").insert({ items });
    }
    return NextResponse.json({
      items,
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (e) {
    // Fall back to the most recent snapshot, even if stale.
    const { data: last } = await admin
      .from("trending_snapshots")
      .select("fetched_at,items")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({
      items: ((last?.items ?? []) as TrendItem[]),
      fetchedAt: (last?.fetched_at as string | null) ?? null,
      cached: true,
      stale: true,
      error: e instanceof Error ? e.message : "Trends fetch failed.",
    });
  }
}
