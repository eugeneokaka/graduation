# Gmail Graduation Alert — Build Plan

## Goal
Watch a school Gmail inbox for emails containing "graduation", email an alert to
a personal Gmail account, and provide a dashboard to browse the matches — later
extended to full-text search across the mailbox.

## Stack
- **Frontend:** Next.js (App Router) + Tailwind + shadcn/ui — deployed on Vercel (free).
- **Backend:** Convex (database + cron + Node actions) — free tier.
  - Replaces Redis (storage) and Pub/Sub (real-time) → **no billing account needed**.
- **Gmail API** for reading/searching/sending — free.
- **No ngrok, no inbound webhooks** — polling is outbound only, so the Convex
  cloud backend never needs a tunnel.

## Architecture
```
Convex cron (every 15 min)
  └─▶ gmail.poll action
        ├─ refresh access token
        ├─ messages.list({ q: 'graduation' })
        ├─ messages.get() new ids → from / subject / date / snippet
        ├─ upsert into `messages` (dedupe on gmailId)
        └─ send alert → personal Gmail

Vercel · Next.js UI ──useQuery(api.messages.list)──▶ Convex DB (reactive/live)
  /api/auth/start + /api/auth/callback → OAuth → auth.saveToken → session cookie
```

## Build Phases
### Phase 1 — Login & show inbox
1. Wire up Convex provider in the Next.js app.
2. `convex/schema.ts` (see below).
3. `/api/auth/start` → Google consent (`gmail.readonly`, `gmail.send`, offline, consent).
4. `/api/auth/callback` → exchange code → `auth.saveToken` → session cookie.
5. Show the inbox: `gmail.listInbox` action (live fetch) rendered in the dashboard.

### Phase 2 — Polling & graduation alerts
6. `gmail.poll` action + `crons.interval({ minutes: 15 })`.
7. `gmail.backfill` — one-time scan of `q:'graduation'` (paginated).
8. Send alert email on new match + dedupe via `notifiedAt`.

### Phase 3 — Text search
9. `gmail.search({ query, pageToken })` action (live Gmail search, paginated).
10. Global search bar (Gmail query syntax) + preset chips:
    All · Graduation · Unread · Has attachment.

## Schema (`convex/schema.ts`)
- **auth** — OAuth credentials for the connected Gmail account (single user).
  `accountEmail`, `refreshToken`, `accessToken?`, `accessTokenExpiresAt?`,
  `scope?`, `updatedAt`. Index `by_accountEmail`.
- **messages** — emails persisted from Gmail (graduation matches / alerts).
  `gmailId`, `threadId`, `from`, `subject`, `snippet`, `receivedAt`,
  `labelIds[]`, `unread`, `matchedQueries[]`, `notifiedAt?`, `syncedAt`.
  Indexes `by_gmailId`, `by_receivedAt`.
- **syncState** — polling bookkeeping for the UI ("last checked …").
  `key`, `lastPolledAt`, `lastError?`, `lastMessageAt?`. Index `by_key`.

> The inbox view in Phase 1 is a **live** Gmail fetch (not persisted), so we
> don't store an entire mailbox. Only matched emails land in `messages`.

## Convex functions
- `crons.ts` → poll every 15 min
- `gmail.listInbox` (action), `gmail.poll` (action), `gmail.backfill` (action),
  `gmail.search` (action)
- `messages.list` (query)
- `auth.saveToken` (mutation)

## Setup
- **GCP:** Gmail API enabled; OAuth client (Web app) redirect URIs =
  `http://localhost:3000/api/auth/callback` and
  `https://<app>.vercel.app/api/auth/callback`. Consent screen → **Production**.
- **Env (Vercel):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `OAUTH_REDIRECT_URI`, `ALLOWED_EMAIL`, `SESSION_SECRET`.
  The Gmail token is stored in Convex, not in env.
- **Security:** rotate the plaintext API key currently in `.env`; never commit
  `ClientID` / `Clientsecret` / tokens.

## Costs — all free
| Service | Cost | Notes |
|---|---|---|
| Vercel Hobby | Free | UI + OAuth routes |
| Convex Free | Free | 1M calls/mo, 20 GB-hrs, DB, crons |
| Gmail API | Free | trivial for one user |
| Poll load (~2880/mo) | Free | far under limits |

## Risks / gotchas
- OAuth **Testing** mode expires refresh tokens every 7 days → publish to Production.
- Gmail `q` is full-text (matches sender/body/labels too).
- Store full message bodies only on demand to keep the DB small.
- Debounce search input; require a query to avoid listing the whole mailbox.

## Open decisions
1. UI style: clean shadcn (light/dark) vs Gmail-like.
2. Protection: `ALLOWED_EMAIL` via OAuth session (recommended) vs passphrase.
3. Alert content: short summary + link (recommended) vs full forward.
