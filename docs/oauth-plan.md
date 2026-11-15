# Nizafa — Google sign-in plan (public launch)

Date: 2026-11-15. Status: plan + code ready; dashboard steps need the parent's
live browser (signed-in Google sessions) — see deploy-runbook.md.

## What users get at launch: sign-in ONLY (no verification needed)

- **Scopes:** `openid`, `userinfo.email`, `userinfo.profile` — classified by
  Google as **non-sensitive**. No verification, no review, no waiting.
- **Effect:** anyone with a real Google account can sign in. No passwords
  stored, no email sign-up form — temp-mail / fake accounts cannot be
  created this way. (Honest limit: this strongly deters fake accounts but
  does not literally guarantee one person per device.)
- **Implementation:** Supabase Auth, Google provider. The app's Nav calls
  `supabase.auth.signInWithOAuth({ provider: "google", scopes: "openid email profile" })`
  and Supabase handles the exchange; the callback is `/auth/callback`.

## Supabase Google provider setup (browser step)

1. Supabase dashboard → project "nizafa" → Authentication → Providers → Google → Enable.
2. Client ID + Client Secret: from the Google Cloud OAuth client (below).
3. Supabase shows its callback URL — it is:
   `https://btqueqyatpatxqyfanzo.supabase.co/auth/v1/callback`
   (already the standard Supabase callback; just confirm it is listed in the
   Google Cloud OAuth client as an authorised redirect URI too).

## Google Cloud — Web application OAuth client (browser step)

Project: **'Nizafa'** (`ultimate-balm-514214-c5`). It already holds the
YouTube Data API v3 key and a "Nizafa Desktop" OAuth client (desktop type —
cannot be reused for a website).

1. Google Cloud Console → APIs & Services → Credentials → **Create Credentials
   → OAuth client ID → Web application**, name e.g. "Nizafa Web (Production)".
2. **Authorised redirect URIs** (exact — scheme, host, path, no trailing slash):
   - `https://<site-name>.netlify.app/nizafa-auth`  (YouTube channel connect)
   - `https://btqueqyatpatxqyfanzo.supabase.co/auth/v1/callback`  (Supabase Auth)
   - `http://localhost:3000/nizafa-auth` (local dev — optional)
   Replace `<site-name>` with the real Netlify site name once the site exists.
   The app's YouTube callback page is `/nizafa-auth`; it exchanges the code
   server-side via `/api/youtube-callback`.
3. Copy the new Client ID + Client Secret into:
   - Supabase Google provider (step above), AND
   - Netlify env vars `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   (browser reads them from the signed-in Cloud Console; NEVER in chat).

## OAuth consent screen (browser step)

Google Cloud Console → APIs & Services → OAuth consent screen:
- User type: **External**. App name: **Nizafa**. Homepage + Privacy Policy
  URLs: the live Netlify URL and `https://<site>/privacy`.
- **Publishing status → "In production".** This is what removes the
  100-test-user cap for the non-sensitive sign-in scopes. Do this BEFORE
  announcing the public link.
- No verification submission is needed for sign-in-only launch.

## Channel connect (owner-only until verification) — the sensitive scope

- Scope `https://www.googleapis.com/auth/youtube.readonly` (view your
  YouTube account) is **sensitive**. Public users connecting their own
  channels needs Google's sensitive-scope verification: brand check (name,
  logo, homepage, privacy policy) + a short demo video in English. Typical
  timeline: days to weeks once submitted.
- Until approval: the app gates channel connect to the workspace owner
  (`OWNER_EMAIL`), and shows everyone else an honest "coming soon" state.
  Public users can still sign in, generate packs, use the studio, and see
  trending. Channel data for the owner comes through the YouTube Data API
  key (public data, no OAuth) + the Web-client OAuth flow for `mine=true`.
- NEVER request Gmail/Drive scopes — those are **restricted** and would
  trigger a paid CASA security assessment. Nizafa does not need them.

## Open question — which Google account owns the Cloud project?

Evidence: inside Nizafa (artifact), the saved Google sign-in is
**shujauddin7593@gmail.com**, and the "Nizafa Desktop" client was created
under that sign-in. The parent's cloud browser is signed in as
**nizamdudin034@gmail.com**. If project `ultimate-balm-514214-c5` belongs to
shujauddin7593, the OAuth steps above must be done while signed in with
**shujauddin7593@gmail.com** — the owner must sign in with that account for
this step (or move/duplicate the project). Check first: open
https://console.cloud.google.com/ while signed in as nizamdudin034 — if the
'Nizafa' project is not listed, switch to shujauddin7593.

## YouTube Data API quota (separate from OAuth)

- Free; default 10,000 units/day per project; `search.list` has its own
  bucket of **100 calls/day** for the whole app; resets midnight Pacific.
- The app caches channel/video data (6h) and search results (24h) and never
  calls `search.list` per click. The existing API key in the project is
  reused via the `YOUTUBE_API_KEY` Netlify env var (server-side only).
