// POST /api/whatsapp-webhook — Meta WhatsApp Cloud API webhook receiver.
// Store-and-ack only: verify the signature, stash incoming messages in
// Supabase, answer 200 immediately. All reasoning happens on the VM cron
// (nizafa-wa-watch), never here — Netlify functions time out after 10 s.
//
// GET is the Meta verification handshake: hub.mode=subscribe +
// hub.verify_token must equal WHATSAPP_VERIFY_TOKEN, then return
// hub.challenge as plain text.
//
// Env (Netlify, server-side only, never committed):
//   WHATSAPP_VERIFY_TOKEN — invented by Muse, also pasted into Meta's
//     webhook configuration when the webhook is registered.
//   WHATSAPP_APP_SECRET — from the Meta app (Settings → Basic).
//   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — see
//     src/lib/supabase-server.ts. The whatsapp_messages table comes from
//     whatsapp-messages-migration.sql (run it in Supabase first).
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase-server";

export const runtime = "nodejs";

type WhatsappMessage = {
  from: string;
  id: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
};

type IncomingRow = {
  wamid: string;
  wa_id: string;
  profile_name: string | null;
  direction: "in";
  msg_type: string | null;
  body: string | null;
  status: string | null;
};

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function messageBody(msg: WhatsappMessage): string | null {
  if (msg.type === "text") return msg.text?.body ?? null;
  if (msg.type === "image") return msg.image?.caption ?? null;
  if (msg.type === "video") return msg.video?.caption ?? null;
  if (msg.type === "document") return msg.document?.caption ?? null;
  return null;
}

function extractIncomingMessages(payload: unknown): IncomingRow[] {
  if (!payload || typeof payload !== "object") return [];
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];
  const rows: IncomingRow[] = [];
  for (const e of entry) {
    const changes = (e as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: unknown }).value as
        | {
            messages?: WhatsappMessage[];
            contacts?: Array<{
              wa_id?: string;
              profile?: { name?: string };
            }>;
          }
        | undefined;
      if (!value || !Array.isArray(value.messages)) continue;
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }
      for (const msg of value.messages) {
        if (!msg || typeof msg.id !== "string" || typeof msg.from !== "string")
          continue;
        rows.push({
          wamid: msg.id,
          wa_id: msg.from,
          profile_name: names.get(msg.from) ?? null,
          direction: "in",
          msg_type: typeof msg.type === "string" ? msg.type : null,
          body: messageBody(msg),
          status: null,
        });
      }
    }
  }
  return rows;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Verification failed.", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { error: "WHATSAPP_APP_SECRET is not configured on the server." },
      { status: 503 }
    );
  }
  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const rows = extractIncomingMessages(payload);
  if (rows.length > 0) {
    const admin = createSupabaseAdmin();
    const { error } = await admin
      .from("whatsapp_messages")
      .upsert(rows, { onConflict: "wamid", ignoreDuplicates: true });
    if (error) {
      console.error("whatsapp-webhook insert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, stored: rows.length });
}
