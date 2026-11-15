// POST /api/cron/daily-ideas — daily batch job for ALL own channels.
// Auth: header `x-cron-secret` must equal process.env.CRON_SECRET.
// Called once a day by the Netlify Scheduled Function
// (netlify/functions/daily-ideas.ts). Without CRON_SECRET configured the
// endpoint refuses every call — it is never open.
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";
import {
  ensureDailyIdeasForChannel,
  todayDateString,
} from "@/lib/daily-ideas";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 503 }
    );
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  const admin = createSupabaseAdmin();
  const runDate = todayDateString();
  const { data: channels, error } = await admin
    .from("channels")
    .select("id,title,description")
    .eq("role", "own");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const generated: string[] = [];
  const alreadyDone: string[] = [];
  const errors: Array<{ channel: string; error: string }> = [];
  for (const ch of channels ?? []) {
    const channel = ch as { id: number; title: string; description: string | null };
    try {
      const result = await ensureDailyIdeasForChannel(admin, channel, runDate);
      if (result.created) generated.push(channel.title);
      else alreadyDone.push(channel.title);
    } catch (e) {
      errors.push({
        channel: channel.title,
        error: e instanceof Error ? e.message : "Unknown error.",
      });
    }
  }
  return NextResponse.json({
    date: runDate,
    generated,
    alreadyDone,
    errors,
    channelsChecked: (channels ?? []).length,
  });
}
