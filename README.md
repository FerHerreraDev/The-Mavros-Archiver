# 🎬 The Mavros Archiver

> A private, invite-only video-on-demand platform. Next.js + Supabase for access control, Cloudflare R2 + a Worker for HLS streaming with signed, per-movie tokens.

## Architecture

```
Browser / Android app
   │  session (cookie on web, Bearer token on Android)
   ▼
Next.js 16 (App Router, Server Actions)  ──►  Supabase (Postgres + Auth, RLS on every table)
   │  GET /api/playback/<id> → signed URL (4 h, one movie folder)
   ▼
Cloudflare Worker  mavros-video  ──►  R2 bucket "videos" (private)
   /t/<token>/movies/<slug>/master.m3u8  → 4 qualities, 6 s HLS segments
```

- **Access is invite-only.** Public sign-up is disabled; admins invite from the panel; invitees pick their password via an email link.
- **Rules live in the database.** RLS on `profiles`, `movies`, `watch_progress` and `rate_limits` means the web app and the future Android app (supabase-kt) share exactly the same permissions.
- **Video never passes through Next.js.** The Worker streams straight from R2 and only with a valid HMAC token in the path, so relative playlist URIs inherit it.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase (`@supabase/ssr`) · Video.js 10 (`@videojs/react` + hls.js) · Cloudflare R2 + Workers · Vitest · Playwright

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + video values
pnpm dev
```

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | public, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | bypasses RLS; only used in `lib/supabase/admin.ts` |
| `NEXT_PUBLIC_SITE_URL` | server | base for email links; falls back to the request origin |
| `VIDEO_CDN_URL` | server | the Worker URL |
| `VIDEO_TOKEN_SECRET` | server + Worker | ≥ 32 chars; same value as the Worker secret |

Database changes live in `supabase/migrations/` — run new files in the Supabase SQL Editor (production) in order.

## Tests

Every requirement is written first in [`tests/SPEC.md`](tests/SPEC.md) with an ID; every test cites the ID it verifies. Tests never touch production: they run against a local Supabase in Docker.

```bash
pnpm db:start            # local Supabase (Docker)
pnpm test:all            # typecheck + lint + unit + integration/RLS + E2E
pnpm test                # unit only (no Docker)
```

| Layer | Where | Runs against |
|---|---|---|
| Unit | `tests/unit` | pure functions |
| Integration | `tests/integration` | real Server Actions, routes and proxy vs local Supabase |
| DB / RLS | `tests/db` | Postgres + Auth with real users of each role |
| E2E | `tests/e2e` | production build + local Supabase + Mailpit + the real Worker handler; playback runs in Google Chrome |

CI (`.github/workflows/ci.yml`) runs the full suite on every push to `main` and on pull requests.

## Video pipeline

```bash
pnpm hls:encode "<original.mp4>" ~/Downloads/Movies/<slug>          # 1080p/720p/480p/360p, 6 s segments
pnpm hls:verify ~/Downloads/Movies/<slug> --source "<original.mp4>"  # VID-01..06
pnpm r2:upload ~/Downloads/Movies/<slug> movies/<slug>               # rclone, segments first
pnpm hls:verify "$(pnpm -s video:url movies/<slug>/master.m3u8)"     # VID-07 through the Worker
```

Then create the movie in **Admin → Películas** with path `movies/<slug>/master.m3u8`.

## Deploying

- **Worker:** `pnpm video:deploy` (`workers/video/wrangler.toml`); set its secret with `wrangler secret put VIDEO_TOKEN_SECRET`.
- **App:** any Node host for Next.js (Vercel recommended). Set the env vars above, and add the production URL to Supabase → Authentication → URL Configuration (Site URL + Redirect URLs).
- **Email:** Supabase's built-in SMTP only delivers to project members; configure custom SMTP for real invitations.
