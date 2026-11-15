# Nizafa — YouTube SEO & Growth Tool

**Nizafa** helps YouTube creators grow: SEO packs, keyword research, channel
audits, trending topics, daily ideas, a thumbnail studio, and a multilingual
assistant — from live public data and the official YouTube Data API.

Tagline: **Nizafa — YouTube SEO & Growth Tool.**

> 100% original code, design, wording, and branding. Same *kinds* of features
> as other SEO tools, but nothing copied — no copied UI, text, logos, or
> proprietary scores. Every number in Nizafa comes from live public data or
> the YouTube Data API and is labelled as such.

## Stack (all free tier, $0/month to start)

| Piece | Service | Notes |
|---|---|---|
| Hosting | Netlify (Free) | Team "Nizafa", auto-deploy on push to `main` |
| Database + Auth | Supabase (Free) | Project "nizafa", Postgres, Google sign-in |
| Framework | Next.js 14 (App Router) + TypeScript | One responsive build (mobile + desktop) |
| YouTube data | YouTube Data API v3 | Server-side only; aggressively cached |

## Features (v1)

- **Home dashboard** — your channel's profile (avatar, name, subs, views,
  videos, description), recent videos with views/likes, views-per-hour
  chart, best time to post, trending now, recent SEO packs.
- **Generate** — full SEO pack: 5 scored titles, 15 tags, hashtags,
  description, hook, script outline, thumbnail concepts, one-story
  consistency check. One-click copy. (Rule-based + templates, labelled.)
- **Research** — keyword ideas, outlier videos, rising keywords from the
  trending snapshot.
- **Daily ideas** — fresh ideas every day, tailored to your channel's niche
  and best-performing videos + trending topics in that niche. Daily refresh.
- **Optimize** — per-video SEO scores, VPH, best posting times, channel
  audit, competitor comparison.
- **Thumbnail Studio** — canvas composer (16:9 / 9:16 / 1:1) that makes a
  real downloadable PNG in the Nizafa style; reference-image analysis that
  writes a prompt in the reference's style (never stored); thumbnail scorer.
- **Assistant** — answers in your language (Urdu / English / more),
  grounded in your own channel data + a growth playbook; common questions
  cached for instant answers.
- **Plans** — Free / Pro Rs 2,499 / Team Rs 7,499. Manual Easypaisa /
  JazzCash / Stripe payments (owner-approved), referral programme.
- **Academy, Team, API keys** — growth curriculum, team workspace, API keys.
- **Account** — Google sign-in only (no passwords, no email sign-up, so no
  temp-mail accounts). Channel connect via official YouTube OAuth,
  owner-only until sensitive-scope verification is approved.
- **Premium UI** — dark/light mode, English/Urdu switch, charts, PWA
  (install on mobile like an app), onboarding tour.

### Not in v1 (v1.1)
- AI image generation in Thumbnail Studio (needs an image API key;
  the canvas composer works without one).
- LLM-powered Assistant answers (v1 answers from your data + playbook).
- Public channel connect (waiting on Google's sensitive-scope verification
  for the YouTube scope; sign-in works now).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your values (never commit them)
npm run dev                  # http://localhost:3000
```

## Deploy (Netlify)

1. Create the GitHub repo `nizafa` under `nizamdudin034-ai` (private ok).
2. Push this code to `main`. Netlify auto-deploys on push.
3. In Netlify: Site settings → Environment variables — paste every var
   from `.env.example` (values come from the Supabase and Google Cloud
   dashboards; never from chat).
4. In Supabase: SQL Editor → run `supabase/schema.sql`.
5. In Supabase: Authentication → Providers → Google → enable with the
   Google OAuth client ID/secret, redirect URL
   `https://btqueqyatpatxqyfanzo.supabase.co/auth/v1/callback`.
6. In Google Cloud (project `Nizafa`): create a **Web application** OAuth
   client; add redirect URI `https://<your-site>.netlify.app/nizafa-auth`;
   set the OAuth consent screen to **In production**.
7. Open the site, sign in with Google, connect a channel (owner only for
   now), generate a pack.

See `docs/deploy-runbook.md` for the exact click-by-click steps, and
`docs/oauth-plan.md` for the Google setup.

## Speed & quota

- Static assets are CDN-cached (`Cache-Control: immutable` on `/_next/static`).
- Channel/video data is cached in Supabase and refreshed only when older
  than 6 hours. Trending is fetched once per day. Search results are cached
  ≥ 24h in `yt_cache`. The YouTube API's `search.list` quota is only
  100 calls/day for the whole app — the app never calls it per click.
- Pages load data in parallel (`Promise.all`) and ship slim payloads
  (no heavy chart/UI libraries).

## Editing later

Edit code → commit → push to `main` → Netlify redeploys automatically.
That is the whole release process.

## Honesty notes

- Title/tag scores are transparent rule-based estimates, labelled
  "Editorial estimate". They are not vidIQ's (or anyone else's) scores.
- The generator is rule-based + templates in v1 (no LLM key). It produces
  real, usable packs — just without an LLM.
- The Muse artifact copy of Nizafa stays as a backup; this repo is the
  public home from now on.
