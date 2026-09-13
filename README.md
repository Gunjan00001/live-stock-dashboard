# Market Watch

A read-only **NSE/BSE market-data dashboard**: live streaming prices over
WebSockets, search across the full listed-equity universe, per-user watchlists,
historical candles, and a small investing library.

It is a TypeScript pnpm monorepo with a Next.js frontend, a Fastify backend that
proxies/normalizes Angel One SmartAPI data, and a shared types package.

- **Frontend:** Next.js 15 (App Router) + React 19, deployed on Vercel
- **Backend:** Fastify 5 + `ws`, deployed as a persistent Docker service on Render
- **Market data:** Angel One SmartAPI (login + REST quotes/historical + Smart Stream V2 WebSocket)
- **Storage (optional):** Redis (quote snapshots + tick fan-out), PostgreSQL (candles)

> Educational content only — not investment advice.

---

## Table of contents

1. [Features](#features)
2. [Monorepo layout](#monorepo-layout)
3. [Architecture at a glance](#architecture-at-a-glance)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Scripts](#scripts)
7. [HTTP API](#http-api)
8. [WebSocket protocol](#websocket-protocol)
9. [Search & the instrument universe](#search--the-instrument-universe)
10. [Dynamic watchlists & subscription model](#dynamic-watchlists--subscription-model)
11. [Market calendar & data gating](#market-calendar--data-gating)
12. [Angel One integration](#angel-one-integration)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Documentation index](#documentation-index)
16. [Security notes](#security-notes)

---

## Features

- **Live prices** streamed end-to-end: Angel One Smart Stream → backend → `/ws` → browser.
- **Full-universe search** over every NSE/BSE listed cash-market equity that has
  an Angel One token (trading symbol, company name, partial, case-insensitive,
  punctuation-insensitive).
- **NSE/BSE disambiguation** everywhere: results, quotes, watchlist, and ticks are
  keyed by `exchange:symbol`.
- **Dynamic watchlists**: add any searched instrument; only watched tokens are
  subscribed to Angel One, reference-counted across clients.
- **9 default instruments** always available as the initial watchlist.
- **Historical candles** for `1D`, `1W`, `1M`, `1Y`.
- **Resilient streaming**: backend reconnects to Angel One with exponential
  backoff and re-subscribes; the browser reconnects to the backend the same way.
- **Daily-safe authentication**: sessions are re-established automatically when
  Angel One expires them at midnight IST.
- **Optional Redis/PostgreSQL** for horizontally consistent state; in-memory
  fallback for local development and tests.
- **Dark/light theme**, article library, and graceful empty/offline/closed states.

## Monorepo layout

```
.
├─ apps/
│  ├─ backend/                 # Fastify API + Angel One integration
│  │  ├─ migrations/           # PostgreSQL schema
│  │  ├─ scripts/              # One-off data sync scripts
│  │  └─ src/
│  │     ├─ angelone/          # TOTP, binary stream parser, default tokens
│  │     ├─ instruments/       # Generated equity snapshot + search registry
│  │     ├─ events/            # Event bus (in-memory | Redis)
│  │     ├─ storage/           # Quote store (in-memory | Redis)
│  │     ├─ database/          # PostgreSQL pool + migrations
│  │     ├─ app.ts             # Routes, WebSocket, subscription wiring
│  │     ├─ server.ts          # Process bootstrap / provider selection
│  │     ├─ config.ts          # Environment parsing & validation
│  │     ├─ provider.ts        # PriceProvider contract + mock provider
│  │     └─ smart-api-provider.ts  # Angel One implementation
│  └─ web/                     # Next.js dashboard
│     ├─ app/                  # Routes: /, /stock/[symbol], /articles/[slug]
│     ├─ components/           # UI components
│     ├─ lib/                  # API client, reconnecting socket, helpers
│     ├─ content/              # Article content
│     └─ e2e/                  # Playwright specs
├─ packages/
│  └─ shared-types/            # Types shared by web + backend
├─ Dockerfile                  # Backend production image
├─ docker-compose.yml          # Local Redis + PostgreSQL
├─ render.yaml                 # Render Blueprint for the backend
└─ docs/                       # Architecture, API, deployment, development
```

## Architecture at a glance

```
                         ┌──────────────────────────┐
                         │        Browser (web)      │
                         │  Next.js UI + watchlist   │
                         └───────┬───────────┬───────┘
                     REST/quotes │           │ /ws (subscribe, ticks)
                                 ▼           ▼
                   ┌─────────────────────────────────────┐
                   │        Backend (Fastify + ws)        │
                   │  routes · SubscriptionRegistry ·     │
                   │  EventBus · QuoteStore · market gate │
                   └───────┬─────────────────────┬───────┘
                           │ ticks               │ REST
                           ▼                     ▼
                   ┌───────────────┐   ┌────────────────────────┐
                   │ SmartAPI       │   │ Optional Redis         │
                   │ Smart Stream   │   │ Optional PostgreSQL    │
                   │ V2 (WebSocket) │   └────────────────────────┘
                   └───────────────┘
```

1. `server.ts` selects a `PriceProvider` (`SmartAPIPriceProvider` when
   `MARKET_DATA_PROVIDER=angelone`, otherwise the in-memory `MockPriceProvider`).
2. `app.ts` seeds the 9 default instruments, opens `/ws`, and subscribes the
   provider to the active token set.
3. Angel One ticks are normalized to `Tick`, published on the `EventBus`, used to
   update the `QuoteStore`, and broadcast to subscribed sockets.
4. REST quote/historical requests resolve instruments through the registry and
   call Angel One directly.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the detailed design.

## Quick start

Requirements: Node 22+, pnpm 9 (`corepack enable`), and optionally Docker.

```bash
corepack pnpm install
corepack pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

`corepack pnpm dev` runs both workspace `dev` scripts in parallel. With no
configuration the backend uses the in-memory mock provider (development only).

To use Docker-backed Redis/PostgreSQL locally:

```bash
docker compose up -d
```

Then set `REDIS_ENABLED=true`, `REDIS_URL=redis://localhost:6379`,
`POSTGRES_ENABLED=true`, and
`DATABASE_URL=postgresql://market_watch:market_watch@localhost:5432/market_watch`.

## Environment variables

### Shared / frontend (Vercel)

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend REST base URL. Inlined at build time. |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4000/ws` | Backend WebSocket URL. Use `wss://` in production. |

### Backend (Render / Docker)

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. |
| `PORT` | `4000` | HTTP/WS listen port. Render injects its own `PORT`. |
| `FORCE_MARKET_OPEN` | `false` | Development-only override that bypasses the market-hours gate. Rejected when `NODE_ENV=production`. |
| `REDIS_ENABLED` | `true` if `REDIS_URL` set | Use Redis for quote snapshots and tick fan-out. |
| `REDIS_URL` | – | Required when Redis is enabled. |
| `POSTGRES_ENABLED` | `true` if `DATABASE_URL` set | Use PostgreSQL for candle storage/migrations. |
| `DATABASE_URL` | – | Required when PostgreSQL is enabled. |
| `MARKET_DATA_PROVIDER` | `mock` | `mock` (local/test) or `angelone` (production). |
| `ANGELONE_API_KEY` | – | SmartAPI API key. Required when `angelone`. |
| `ANGELONE_CLIENT_CODE` | – | Angel One client code. Required when `angelone`. |
| `ANGELONE_PASSWORD` | – | Account MPIN used for login. Required when `angelone`. |
| `ANGELONE_TOTP_SECRET` | – | Base32 TOTP secret (from the authenticator QR). Required when `angelone`. |
| `ANGELONE_MAC_ADDRESS` | `00:00:00:00:00:00` | `X-MACAddress` login header (optional). |
| `ANGELONE_CLIENT_LOCAL_IP` | `127.0.0.1` | `X-ClientLocalIP` login header (optional). |
| `ANGELONE_CLIENT_PUBLIC_IP` | `127.0.0.1` | `X-ClientPublicIP` login header (optional). |
| `ANGELONE_BASE_URL` | `https://apiconnect.angelone.in` | SmartAPI REST base URL. |
| `ANGELONE_WEBSOCKET_URL` | `wss://smartapisocket.angelone.in/smart-stream` | Smart Stream WebSocket URL. |
| `ANGELONE_SUBSCRIPTION_MODE` | `2` | `1` LTP, `2` QUOTE, `3` SNAP_QUOTE. |

> Angel One credentials are **server-side only**. Never prefix them with
> `NEXT_PUBLIC_`. A whitelisted static IP is required by Angel One **only for
> Order/GTT APIs**, not for login, REST market data, or the streaming feed —
> see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

Run from the repo root unless noted.

| Command | Description |
| --- | --- |
| `corepack pnpm dev` | Run frontend + backend in development. |
| `corepack pnpm build` | Build all workspaces. |
| `corepack pnpm typecheck` | Typecheck all workspaces. |
| `corepack pnpm test` | Run all unit tests. |
| `corepack pnpm --filter @market-watch/backend dev` | Backend only (`tsx watch`). |
| `corepack pnpm --filter @market-watch/backend build` | Compile backend (`tsc` → `dist/`). |
| `corepack pnpm --filter @market-watch/backend start` | Run the compiled backend. |
| `corepack pnpm --filter @market-watch/backend sync:instruments` | Refresh the NSE/BSE equity snapshot. |
| `corepack pnpm --filter @market-watch/web build` | Next.js production build. |
| `corepack pnpm --filter @market-watch/web exec playwright test` | End-to-end tests (requires a running backend). |

## HTTP API

All responses are JSON. Base URL is the backend origin (`NEXT_PUBLIC_API_URL`).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/instruments/search?q=&limit=` | Search the NSE/BSE equity universe. Returns `{ query, results: InstrumentSearchResult[] }`. `limit` default 20, max 50; queries shorter than 2 characters return `[]`. |
| `GET` | `/api/search?q=` | Legacy alias returning `SearchResult[]` (`symbol`, `exchange`, `type`, `name`). |
| `GET` | `/api/quote/:symbol?exchange=` | Latest quote for an instrument. `exchange` is optional (default: default-watchlist exchange, else NSE). `Quote`. |
| `GET` | `/api/historical/:symbol?range=&exchange=` | Candles for `1D` \| `1W` \| `1M` \| `1Y`. Returns `Candle[]`. |
| `GET` | `/api/market-status` | `{ open, session, timestamp, nextOpen? }` from the IST calendar. |
| `GET` | `/ws` | WebSocket upgrade for live ticks. |

Example:

```bash
curl "https://<backend>/api/instruments/search?q=yes%20bank"
curl "https://<backend>/api/quote/YESBANK?exchange=BSE"
curl "https://<backend>/api/historical/RELIANCE?range=1D"
```

Full request/response examples live in [docs/API.md](docs/API.md).

## WebSocket protocol

Client messages are versioned JSON. The server acknowledges subscriptions and
pushes ticks.

**New, exchange-qualified form (preferred):**

```jsonc
// client → server
{ "version": 1, "type": "subscribe",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
{ "version": 1, "type": "unsubscribe", "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }

// server → client (ack)
{ "version": 1, "type": "subscribed",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
```

**Legacy form (still supported):**

```jsonc
{ "version": 1, "type": "subscribe", "payload": { "symbols": ["TCS"] } }
{ "version": 1, "type": "subscribed", "payload": { "symbols": ["TCS"] } }
```

**Live ticks (shape unchanged):**

```jsonc
{
  "version": 1,
  "type": "tick",
  "payload": {
    "tick": { "symbol": "YESBANK", "exchange": "NSE", "timestamp": "2026-09-14T04:00:12.345Z", "price": 21.35, "volume": 1023400 }
  }
}
```

Clients must key instruments by **`exchange` + `symbol`**. Errors are delivered as
`{ "version": 1, "type": "error", "payload": { "message": "..." } }`.

## Search & the instrument universe

The search universe is the set of **NSE/BSE listed cash-market equities that have
a corresponding Angel One market-data token**. It is generated from authoritative
sources:

- NSE: [`EQUITY_L.csv`](https://archives.nseindia.com/content/equities/EQUITY_L.csv) (EQ/BE/BZ series)
- BSE: `ListofScripData` (`segment=Equity`, `Status=Active`)
- Tokens: Angel One official instrument master

Derivatives, options, futures, debt, ETFs, and indices are excluded. Equities
that are listed but have no Angel One token are excluded from selectable results
and **reported** by the sync script. No heuristics are used for BSE
classification.

Regenerate the snapshot:

```bash
corepack pnpm --filter @market-watch/backend sync:instruments
```

This writes `apps/backend/src/instruments/instruments.generated.ts` and prints the
included/omitted counts and snapshot size. Search is served from this local index
— Angel One is never queried per keystroke.

## Dynamic watchlists & subscription model

- The **9 default instruments** (`NIFTY50`, `SENSEX`, `RELIANCE`, `TCS`,
  `HDFCBANK`, `INFY`, `ICICIBANK`, `SBIN`, `HINDUNILVR`) are always subscribed.
- Adding an instrument subscribes its token to Angel One **only** if no other
  client already watches it; removing it unsubscribes only when the last watching
  client releases it. This is tracked by `SubscriptionRegistry` using
  `exchange:symbol` identity.
- The whole NSE/BSE universe is never subscribed — only defaults plus actively
  watched instruments.
- The frontend keeps the defaults, persists user-added instruments in
  `localStorage`, and shows NSE/BSE badges with add/remove controls.

## Market calendar & data gating

`apps/backend/src/calendar.ts` computes NSE/BSE session state in `Asia/Kolkata`
(`Mon–Fri`, 09:15–15:30 IST, with a holiday list). Ticks are only forwarded
during market hours. `FORCE_MARKET_OPEN=true` bypasses the gate in development
and is rejected in production.

## Angel One integration

- **Auth:** `POST /rest/auth/angelbroking/user/v1/loginByPassword` with a
  server-generated TOTP (HMAC-SHA1, 30s step). Returns `jwtToken` + `feedToken`.
- **Token lifecycle:** tokens are cached with an expiry at the next midnight IST;
  they are refreshed when stale and on auth errors (`AG8002`/`AG8003`, HTTP 401,
  token-expired messages). WebSocket auth failures clear tokens and re-login.
- **Streaming:** Smart Stream V2 (`wss://smartapisocket.angelone.in/smart-stream`),
  QUOTE mode, 10s `ping` heartbeat, exponential backoff `1s → 60s`, and
  re-subscription of the active set on reconnect.
- **Parsing:** little-endian binary frames; price is normalized from paise; the
  packet token is mapped back to the instrument.
- **Telemetry:** non-secret logs for authentication, stream connect, subscription
  count, first tick, and stream close. Credentials, TOTP, JWTs, and feed tokens
  are never logged.

Details, including the binary frame layout, are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Testing

- **Unit tests:** Vitest across `apps/backend`, `apps/web`, and
  `packages/shared-types`.
- **E2E:** Playwright specs in `apps/web/e2e` (search empty state, invalid
  symbol, market-closed, offline, theme, article page).

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @market-watch/web build
```

## Deployment

The app is split across two platforms:

- **Frontend → Vercel** with Root Directory `apps/web`.
- **Backend → Render** (Docker) or any persistent Docker host, because it runs a
  long-lived server with WebSocket connections.

Set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` on Vercel to the backend URL.
Full steps, the `render.yaml` blueprint, and the Angel One static-IP guidance are
in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation index

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, provider/event/store design, Angel One internals, DB schema. |
| [docs/API.md](docs/API.md) | REST + WebSocket contracts with examples and error handling. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Render + Docker, environment matrices, sync cadence, static-IP note. |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, scripts, testing, data sync, conventions, troubleshooting. |
| [docs/superpowers/specs](docs/superpowers/specs) | Design specs. |
| [docs/superpowers/plans](docs/superpowers/plans) | Implementation plans. |

## Security notes

- Angel One credentials live only in backend environment variables and are never
  sent to the browser, API responses, the committed snapshot, or logs.
- `opencode.json` (local editor config, contains an API key) is gitignored.
- CORS is currently permissive (`origin: true`) for the public read-only API;
  restrict it to the deployed frontend origins if you add authenticated features.
