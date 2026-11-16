// POST /api/optimize/tags — add or remove a tag on a saved SEO pack.
// Body: { packageId, tag, action: "add" | "remove" }
// Tags live in the pack (payload_json.tags). They are NOT pushed to
// YouTube — the user copies them into YouTube Studio (the UI says so).
// Same mutation pattern as /api/consistency.
import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import type { SeoPack } from "@/lib/generator";

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    packageId?: number;
    tag?: string;
    action?: "add" | "remove";
  };
  const packageId = Number(body.packageId);
  const tag = (body.tag ?? "").trim().slice(0, 60);
  if (!packageId || !tag || (body.action !== "add" && body.action !== "remove")) {
    return NextResponse.json(
      { error: "packageId, tag and action (add|remove) are required." },
      { status: 400 }
    );
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("packages")
    .select("id,payload_json")
    .eq("id", packageId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Pack not found." }, { status: 404 });
  }
  const pack = data.payload_json as SeoPack;
  const tags = [...(pack.tags ?? [])];
  const lower = tag.toLowerCase();
  if (body.action === "add") {
    if (tags.some((t) => t.toLowerCase() === lower)) {
      return NextResponse.json({ packageId, tags, added: false });
    }
    if (tags.length >= 30) {
      return NextResponse.json(
        { error: "A pack holds at most 30 tags." },
        { status: 400 }
      );
    }
    tags.push(tag);
  } else {
    const idx = tags.findIndex((t) => t.toLowerCase() === lower);
    if (idx === -1) {
      return NextResponse.json({ packageId, tags, removed: false });
    }
    tags.splice(idx, 1);
  }
  const { error: upErr } = await admin
    .from("packages")
    .update({ payload_json: { ...pack, tags } })
    .eq("id", packageId);
  if (upErr) {
    return NextResponse.json({ error: `Could not save: ${upErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ packageId, tags, added: body.action === "add" });
}
