// Netlify Scheduled Function — daily ideas batch.
// Runs once a day (@daily) and calls the app's authenticated cron endpoint
// POST /api/cron/daily-ideas with the CRON_SECRET header. No secrets in
// code: CRON_SECRET is a Netlify env var, and the site URL comes from
// Netlify's built-in URL env var (falling back to NEXT_PUBLIC_APP_URL).
// If either is missing, the run fails loudly instead of calling unauthenticated.

export const config = { schedule: "@daily" };

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const base = process.env.URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!secret || !base) {
    const missing = [!secret ? "CRON_SECRET" : null, !base ? "site URL (URL / NEXT_PUBLIC_APP_URL)" : null]
      .filter(Boolean)
      .join(" and ");
    console.error(`[daily-ideas] Not configured: ${missing} is missing.`);
    return new Response(`Not configured: ${missing} is missing.`, { status: 500 });
  }

  const cronUrl = `${base.replace(/\/$/, "")}/api/cron/daily-ideas`;
  try {
    const res = await fetch(cronUrl, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    console.log(`[daily-ideas] Cron ${res.status}: ${body.slice(0, 500)}`);
    return new Response(body, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron call failed.";
    console.error(`[daily-ideas] Cron call failed: ${message}`);
    return new Response(message, { status: 502 });
  }
}

