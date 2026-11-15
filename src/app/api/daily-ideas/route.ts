// GET /api/daily-ideas[?channelId=…] — today's 5 ideas for the signed-in
// user's own channel. Generates + stores (packages kind='daily-ideas' +
// daily_idea_runs row) when none exist for today; returns the stored set
// otherwise. Zero search.list calls.
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import {
  ensureDailyIdeasForChannel,
  todayDateString,
} from "@/lib/daily-ideas";

export async function GET(req: Request) {
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
  const admin = createSupabaseAdmin();
  const channelIdParam = new URL(req.url).searchParams.get("channelId");

  const { data: channels } = await admin
    .from("channels")
    .select("id,title,description")
    .eq("role", "own")
    .eq("user_id", user.id)
    .order("connected_at", { ascending: true });
  const list = (channels ?? []) as Array<{
    id: number;
    title: string;
    description: string | null;
  }>;
  if (list.length === 0) {
    return NextResponse.json({
      date: todayDateString(),
      channel: null,
      channels: [],
      ideas: [],
      note: "No channel connected yet. Connect your channel first, then today's ideas are built from your own videos.",
    });
  }
  const channel =
    (channelIdParam
      ? list.find((c) => c.id === Number(channelIdParam))
      : undefined) ?? list[0];

  try {
    const result = await ensureDailyIdeasForChannel(admin, channel);
    return NextResponse.json({
      ...result,
      channels: list.map((c) => ({ id: c.id, title: c.title })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not build today's ideas." },
      { status: 500 }
    );
  }
}
