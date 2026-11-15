# Nizafa — deploy runbook for the parent agent (live browser steps)

Date: 2026-11-15. Goal: public Nizafa at $0 (Netlify Free + Supabase Free).
Repo: `repo/` in this folder — Next.js 14 + Supabase, build-verified
(`npm run build` passes). Secrets are NEVER in chat or in the repo.

## Preconditions (all verified tonight)
- Netlify: team "Nizafa" (slug nizam-dudin), nizamdudin034@gmail.com, Free.
- GitHub: nizamdudin034-ai, nizamdudin034@gmail.com, free. No repo yet.
- Supabase: org "nizamdudin034-ai's Org", project "nizafa",
  https://btqueqyatpatxqyfanzo.supabase.co, Healthy. DB password unknown to
  everyone (generated in the form, never shared) — the browser reads the
  connection string from the signed-in Supabase dashboard when needed.
- Google Cloud project 'Nizafa' (ultimate-balm-514214-c5) holds the YouTube
  Data API key + "Nizafa Desktop" OAuth client. Which Google account owns it
  is OPEN — evidence says shujauddin7593@gmail.com (see oauth-plan.md).

## Step 1 — GitHub repo (browser task)
- Open https://github.com/new (signed in as nizamdudin034-ai).
- Repository name: `nizafa`. Description: "Nizafa — YouTube SEO & Growth Tool".
- Public (so Netlify can read it on the free plan without extra config) or
  Private (fine too — Netlify links with the GitHub App). Choose Public.
- Do NOT initialise with README/.gitignore/license (the repo already has them).
- Done when: https://github.com/nizamdudin034-ai/nizafa exists and is empty.

## Step 2 — push the code (needs a GitHub token; browser task for the owner)
The VM has no GitHub auth (`gh` not logged in), so the code cannot be pushed
from here without a token. Two options; use A:
- **A (recommended):** owner creates a fine-grained Personal Access Token:
  GitHub → Settings → Developer settings → Personal access tokens →
  Fine-grained tokens → Generate new token; name "nizafa-deploy"; expiry 7
  days; Repository access: Only select repositories → nizafa; Permissions:
  Contents: Read and write. The owner saves the token via the Secure Vault
  (never in chat). Then the parent runs, on the VM:
  `git init` in the repo dir (if needed), `git remote add origin
  https://<token>@github.com/nizamdudin034-ai/nizafa.git`,
  `git add -A && git commit -m "Nizafa v1 public launch" && git push -u origin main`.
  (node_modules/ and .next/ are gitignored — the push is source only.)
- **B (fallback):** zip the repo dir (excluding node_modules, .next) and use
  GitHub web upload. Slow and error-prone for ~45 files — only if A fails.

## Step 3 — Supabase schema (browser task)
- Open the Supabase SQL Editor for project "nizafa" (signed in via GitHub
  as nizamdudin034-ai).
- Run `repo/supabase/schema.sql` (attach the file to the browser task).
- Done when: all tables exist (settings, app_users, channels,
  channel_videos, audits, packages, trending_snapshots, trend_alerts,
  team_members, api_keys, payments, chat_conversations, chat_messages,
  academy_progress, assistant_cache, daily_idea_runs, yt_cache).
- Then read the connection details (Project Settings → Database → Connection
  string, **Transaction pooler** URI) and the API keys (Project Settings →
  API: Project URL + anon key + service_role key). The browser holds these
  for Step 5 — never paste them in chat.

## Step 4 — Netlify site (browser task)
- Netlify dashboard (team Nizafa) → Add new site → Import an existing project
  → GitHub → select nizamdudin034-ai/nizafa → Deploy.
- Build settings: build command `npm run build`, publish directory `.next`
  (already in netlify.toml; Netlify auto-detects Next.js).
- Site name: set to `nizafa` (→ https://nizafa.netlify.app) if free.
- Done when: the first deploy succeeds and the site URL is known.

## Step 5 — env vars (browser task, values from signed-in dashboards)
Netlify → Site settings → Environment variables. Add each (scope: all):
- NEXT_PUBLIC_SUPABASE_URL = https://btqueqyatpatxqyfanzo.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY = (Supabase API, from Step 3)
- SUPABASE_SERVICE_ROLE_KEY = (Supabase API, from Step 3)
- YOUTUBE_API_KEY = (Google Cloud project 'Nizafa', existing key)
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET = (new Web client, Step 6)
- NEXT_PUBLIC_APP_URL = https://<site>.netlify.app
- OWNER_EMAIL = nizamdudin034@gmail.com
- CRON_SECRET = (generate a random 32-char string in the browser; same value
  goes in the scheduled function env — Netlify env vars cover functions too)
Then: Deploys → Trigger deploy → Deploy site (env vars apply on rebuild).

## Step 6 — Google OAuth Web client + consent screen (browser task)
See oauth-plan.md for the exact steps. In short:
- Cloud Console → project 'Nizafa' → Credentials → Create OAuth client →
  Web application "Nizafa Web (Production)"; redirect URIs:
  `https://<site>.netlify.app/nizafa-auth` and
  `https://btqueqyatpatxqyfanzo.supabase.co/auth/v1/callback`.
- Consent screen → Publishing status → **In production**.
- Put the Client ID/Secret in Supabase (Auth → Providers → Google) and in
  Netlify env vars (Step 5). NOTE the account question in oauth-plan.md:
  if the project is not visible while signed in as nizamdudin034, the owner
  must sign in as shujauddin7593@gmail.com for this step.

## Step 7 — verify (browser task)
- Open the live site → /api/health → expect ok:true, supabase:true,
  youtubeKey:true, googleOAuth:true.
- Sign in with Google (nizamdudin034) → home loads → connect The Y Lab
  channel (owner-only) → generate a pack → open Thumbnail Studio →
  download a test PNG → check /plans shows Free/Pro/Team.
- Mobile check: open the site on a phone-width viewport — no horizontal
  overflow, bottom nav visible.
- Done when: the live URL serves the app and Google sign-in works. Report
  the URL to the owner.

## If anything blocks
- Netlify build fails: read the deploy log; most likely a missing env var.
- Supabase Google provider fails: the OAuth client redirect URIs must match
  exactly (no trailing slash).
- YouTube quota: the app caches aggressively; a 403 quota error means the
  key's project quota is spent — wait for the midnight-PT reset.
- The artifact copy of Nizafa keeps working as the backup; nothing in this
  plan touches it.
