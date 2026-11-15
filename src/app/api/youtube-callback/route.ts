import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser, isOwner } from "@/lib/auth";

// YouTube OAuth callback — GET /api/youtube-callback?code=…
// Exchanges the authorization code server-side (Google OAuth token
// endpoint) using GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, then reads the
// signed-in Google account's own channel via the YouTube Data API and
// connects it (role 'own'). No fake success: if the OAuth client is not
// configured, or the user is not the owner, this returns an honest error
// and the /nizafa-auth page shows setup instructions instead.

function redirectUri(req: Request): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/nizafa-auth`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.json(
      { ok: false, error: `Google sign-in was not completed (${oauthError}). Please try again.` },
      { status: 400 }
    );
  }
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "No authorization code was returned by Google." },
      { status: 400 }
    );
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in with Google first, then connect your channel." },
      { status: 401 }
    );
  }
  if (!isOwner(user)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Channel connect opens for everyone after YouTube approves the sensitive-scope verification. Right now only the workspace owner can connect a channel.",
      },
      { status: 403 }
    );
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The YouTube OAuth client is not configured yet. In Google Cloud Console, create a “Web application” OAuth client, set its redirect URI to this page's URL, and add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify environment variables.",
        setup: true,
        redirectUri: redirectUri(req),
      },
      { status: 503 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured yet." },
      { status: 503 }
    );
  }

  // 1. Exchange the code for tokens.
  let tokens: { access_token?: string; error?: string; error_description?: string };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    tokens = (await res.json()) as typeof tokens;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Could not reach Google's token endpoint: ${e instanceof Error ? e.message : "network error"}` },
      { status: 502 }
    );
  }
  if (!tokens.access_token) {
    return NextResponse.json(
      {
        ok: false,
        error: `Google refused the code exchange${tokens.error ? ` (${tokens.error})` : ""}. The code may have expired — please start the connect flow again.`,
      },
      { status: 502 }
    );
  }

  // 2. Read the Google account's own channel.
  let channelJson: {
    items?: Array<{
      id: string;
      snippet?: { title?: string; description?: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
    }>;
    error?: { message?: string };
  };
  try {
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    channelJson = (await res.json()) as typeof channelJson;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Could not reach the YouTube Data API: ${e instanceof Error ? e.message : "network error"}` },
      { status: 502 }
    );
  }
  const item = channelJson.items?.[0];
  if (!item) {
    return NextResponse.json(
      {
        ok: false,
        error:
          channelJson.error?.message ??
          "Google signed in, but no YouTube channel was found on this Google account. Create a channel on YouTube first, then try again.",
      },
      { status: 502 }
    );
  }

  // 3. Save it as the owner's own channel.
  const admin = createSupabaseAdmin();
  const { data: appUser } = await admin.from("app_users").select("id").eq("id", user.id).maybeSingle();
  if (!appUser) {
    await admin.from("app_users").insert({
      id: user.id,
      google_sub: user.id,
      email: user.email ?? "unknown@nizafa.app",
      plan: "free",
    });
  }
  const channelId = item.id;
  const title = item.snippet?.title ?? "My channel";
  const { data: saved, error } = await admin
    .from("channels")
    .upsert(
      {
        user_id: user.id,
        channel_id: channelId,
        title,
        description: item.snippet?.description ?? null,
        avatar_url: item.snippet?.thumbnails?.default?.url ?? null,
        url: `https://www.youtube.com/channel/${channelId}`,
        role: "own",
        stats_source: "youtube-api",
        subscriber_count: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : null,
        video_count: item.statistics?.videoCount ? Number(item.statistics.videoCount) : null,
        view_count: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" }
    )
    .select("id,title,url")
    .single();
  if (error || !saved) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save the channel." },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    channel: { id: saved.id, title: saved.title, url: saved.url },
  });
}
