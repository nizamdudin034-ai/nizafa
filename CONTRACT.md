# Nizafa standalone build — contract for feature builders

Repo: `repo/` (Next.js 14 App Router + TypeScript + Supabase). Owner: the
user (shujauddin / Nizam Afridi). Deadline: live link by ~07:00 PKT, 16 Nov 2026.
The Muse fullstack artifact (`nizafa`) CANNOT be exported — this repo is a
clean-room rebuild from the artifact's observable behaviour (48 actions).
100% ORIGINAL code, design, wording, branding. Do NOT copy vidIQ's UI,
logos, text, or proprietary scores. Our numbers come only from live public
data + the YouTube Data API, and are labelled as such.

## What exists already (scaffold — DO NOT rewrite, only use)
- `package.json` (next 14, react 18, @supabase/ssr, @supabase/supabase-js),
  `tsconfig.json`, `next.config.mjs`, `.env.example`, `.gitignore`, `netlify.toml`
- `src/lib/supabase.ts` (browser client), `src/lib/supabase-server.ts`
  (server + admin clients), `src/lib/auth.ts` (getSessionUser/isOwner),
  `src/lib/youtube.ts` (YouTube Data API v3, quota-guarded),
  `src/lib/trends.ts` (Google Trends RSS US+PK), `src/lib/plans.ts` (plan
  catalogue Free/Pro Rs 2,499/Team Rs 7,499), `src/lib/i18n.ts` (EN/UR chrome strings)
- `src/app/layout.tsx`, `src/app/globals.css` (brand: deep teal/emerald +
  amber/gold; `[data-theme="dark"]` vars; classes: .container .card .grid
  .grid-2/3/4 .stat-num .stat-label .badge(-gold/-teal/-red) .btn(-primary/
  -gold/-ghost/-sm) .input .label .table .list-row .notice .error .hero
  .section .section-head .heatmap .tour-backdrop .topnav .bottomnav)
- `src/components/Nav.tsx` (top nav + mobile bottom nav, theme + EN/UR
  toggles, Google sign-in/out), `ThemeScript.tsx`, `ui.tsx`
  (StatCard/SectionTitle/EmptyState), `CopyButton.tsx`, `ConnectChannel.tsx`,
  `OnboardingTour.tsx`
- `src/app/page.tsx` (home dashboard: channel profile, stats, VPH chart,
  best-time heatmap, recent videos w/ views+likes, trending, recent packs)
- `src/app/api/health`, `src/app/api/trending`, `src/app/api/channels`
  (connect/list/disconnect, 6h cache), `src/app/auth/callback`
- `supabase/schema.sql` — Postgres schema (tables: settings, app_users,
  channels, channel_videos, audits, packages, trending_snapshots,
  trend_alerts, team_members, api_keys, payments, chat_conversations,
  chat_messages, academy_progress, assistant_cache, daily_idea_runs,
  yt_cache). Use THESE table/column names. Never invent a new table without
  adding it to the schema file.

## Rules for every builder
- TypeScript strict. `npm run build` must pass. No TODO / placeholder stubs:
  every route/page you ship must work end-to-end, or be left out entirely
  (list it as v1.1 in README, not as dead UI).
- No secrets anywhere: never paste keys, tokens, passwords, or connection
  strings in code, comments, or reports. Env vars only (see .env.example).
- No new dependencies without a reason in your report (keep the build fast).
- Mobile first: one responsive build. No horizontal overflow at 360px.
  Thumb-friendly: bottom nav exists; keep tap targets ≥ 44px.
- Speed: server components + parallel Promise.all loads; never call
  `search.list` per click — cache in `yt_cache` (key, payload, fetched_at)
  with ≥ 24h TTL for search results; channel/video refresh only when > 6h old.
- Language: reply/answer in the user's language (detect Urdu script vs
  English). Keep answers concise.
- Honesty: label every estimate ("Editorial estimate", "from live public
  data"). Never invent view counts, scores, or subscribers.

## Ownership (do not edit another builder's files)
- **B — Growth engine**: `src/lib/generator.ts`, `src/lib/daily-ideas.ts`,
  `src/app/api/generate/route.ts`, `src/app/api/research/route.ts`,
  `src/app/api/daily-ideas/route.ts`, `src/app/api/cron/daily-ideas/route.ts`,
  `src/app/generate/page.tsx`, `src/app/research/page.tsx`,
  `src/app/ideas/page.tsx`, `netlify/functions/daily-ideas.ts`
  (scheduled daily call to /api/cron/daily-ideas with CRON_SECRET).
- **C — Optimize + Thumbnails**: `src/lib/audit.ts`, `src/lib/thumbnail.ts`,
  `src/app/api/audit/route.ts`, `src/app/api/competitors/route.ts`,
  `src/app/api/thumbnail-image/route.ts`, `src/app/optimize/page.tsx`,
  `src/app/thumbnails/page.tsx`.
- **D — Assistant + Account**: `src/lib/assistant.ts`,
  `src/app/api/assistant/route.ts`, `src/app/api/keys/route.ts`,
  `src/app/api/payments/route.ts`, `src/app/api/settings/route.ts`,
  `src/app/assistant/page.tsx`, `src/app/academy/page.tsx`,
  `src/app/plans/page.tsx`, `src/app/settings/page.tsx`,
  `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`,
  `public/manifest.webmanifest`, PWA icon PNGs (192/512, generate with a
  node script — no external fetch), `src/app/nizafa-auth/page.tsx`
  (YouTube OAuth callback page: exchanges code server-side; owner-only
  until verification — show a clear "coming soon for everyone" state for
  non-owners).
- **Coordinator (me)**: scaffold, home, channels/trending/health APIs,
  README, runbook, OAuth plan, integration, build verification, final report.

## Feature spec (from the artifact's observable behaviour)
- Generator: POST {topic, channelTitle?} → {bestTitle, titles[5]{title,
  score, style, why}, tags[15], hashtags[], descriptionStarter, hook,
  scriptOutline[{section, seconds, points}], thumbnailConcepts[3]{bigText,
  layout, imageIdea}, consistency{pass, notes[]}}. Rule-based + templates,
  labelled as such. Save as packages kind='package' (+ kinds 'titles' /
  'tags' for the single-tool calls). One-click copy everywhere.
- Research: keyword ideas (from topic + cached search suggestions — use
  yt_cache; NO live search.list per keystroke), outlier videos (viewCount
  vs channel average — compute from cached channel_videos + one batched
  videos.list call), rising keywords from the trending snapshot.
- Daily ideas: for each own channel, once per day: niche from the
  channel's own videos (titles/tags) + top-performing video patterns +
  trending topics in that niche → 5 ideas {title, hook, whyFits}. Store as
  packages kind='daily-ideas' + daily_idea_runs row. Zero search.list calls.
  Feed at /ideas + linked from home.
- Audit: channel health from real data (metadata completeness, title/tag
  quality, upload consistency, VPH) with a transparent rule-based score
  and fixes. Competitors: add/list competitor channels (same connect flow,
  role='competitor'), side-by-side stats.
- Optimize: connected channel's videos with SEO scores (rule-based:
  title length/keywords, description, tags, thumbnail presence) + VPH +
  best posting days/times from upload history.
- Thumbnails: canvas composer (16:9 / 9:16 / 1:1), background presets +
  image upload, face cutout upload (right third), red banner + huge text +
  yellow punch word, download PNG. Reference upload → client-side colour/
  layout analysis → style summary + fresh prompt (never stored/copied).
  Scorer: rule-based 0–100 with fixes. /api/thumbnail-image: if
  REPLICATE_API_TOKEN or OPENAI_API_KEY is set, call the provider; else
  return {status:"unavailable", reason} honestly.
- Assistant: POST {message, conversationId?} → detects language (Urdu
  script → ur, else en), answers concisely from (a) the user's own channel
  data, (b) a curated growth playbook in the file, (c) assistant_cache
  (normalised question + lang). Save to chat_conversations/messages.
  No LLM key in v1 — the route must say so in code comments, not to users.
- Academy: static lesson list (YouTube growth curriculum) with progress
  saved to academy_progress. Team: list/add/remove members (team_members).
  API keys: create (return full key once, store prefix+hash) / list / revoke.
- Plans: PLANS from lib/plans.ts; payment submit {plan, method
  (easypaisa|jazzcash|stripe), transactionId} → payments (pending);
  owner-only review list (approve → set user's plan). Referral code shown
  (referralCodeFor). Easypaisa/JazzCash numbers from settings (owner-only
  edit; show "not set yet" otherwise).
- Settings: status cards (Supabase ✓/✗, YouTube key set? Google OAuth
  set? — NEVER show values), owner-only Easypaisa/JazzCash numbers +
  payment note, Google sign-in status + disconnect, channel-connect state
  (owner-only until verification — explain why on the page).
- Privacy/Terms: original pages stating exactly what Google data is used
  for (sign-in: name/email/avatar; YouTube connect (owner-only): channel
  stats/videos via Data API; no passwords stored; no data sold; delete on
  request to the owner email). No copied text from any other product.
- PWA: manifest (name Nizafa, theme #0b4f46, display standalone, icons
  192/512 PNG), register a minimal service worker for offline shell caching
  (do not cache API responses), Apple touch icon.
- /nizafa-auth: YouTube OAuth callback. If the Web client is not
  configured, show setup instructions (no fake success). Non-owners see
  "channel connect opens after verification" and can still use sign-in.
