# Market Watch — Complete Project & Viva Guide

> Read-only NSE/BSE market-data dashboard. Live streaming prices over WebSockets,
> full-universe equity search, per-user watchlists, historical candles, and an
> investing library.
>
> This document is written for an oral examination (viva) or technical defense.
> It explains every part of the system in plain English, then ends with a large
> bank of likely examiner questions and model answers.

**Repository:** <https://github.com/Gunjan00001/live-stock-dashboard>
**Primary docs:** [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/API.md`](docs/API.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md),
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

---

## How to use this guide

- Sections 1–8 explain **what the project is**, **how it is structured**, and
  **how data moves through it**. Read these first.
- Sections 9–19 are the **reference material** (API, protocol, deployment).
- Section 22 collects **extra Q&A** you can drill from—exactly the kind of
  questions a viva panel asks.
- Section 24 is a **one-page command cheat sheet** you can keep open during a
  demo.

If you only have five minutes before the viva: read Section 2 (elevator pitch),
Section 6 (the four data flows), Section 7 (backend pieces), and the Q&A bank's
"Architecture", "Real-time", and "Angel One" groups.

---

## 1. Project at a glance

| Item | Value |
| --- | --- |
| Project name | Market Watch |
| Type | Full-stack, read-only financial market-data web application |
| Domain | Indian stock markets — NSE (National Stock Exchange) and BSE (Bombay Stock Exchange) |
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript, deployed on Vercel |
| Backend | Fastify 5 + `ws` + TypeScript (ESM), deployed as a persistent Docker service on Render |
| Market data source | Angel One SmartAPI — REST quotes/historical + Smart Stream V2 WebSocket |
| Optional storage | Redis (quote snapshots + tick fan-out) and PostgreSQL (candles, future user tables) |
| Repo type | pnpm workspace monorepo (3 packages) |
| Package manager | pnpm 9.15.0 (pinned via `packageManager` + Corepack) |
| Node version | Node 22+ (Docker image is `node:22-alpine`) |
| Searchable universe | 7,567 NSE/BSE cash-market equities (generated snapshot, ~1.7 MB) |
| Default watchlist | 9 instruments (2 indices + 7 large-cap equities) |
| Tests | 70+ unit tests (Vitest) + Playwright end-to-end specs |
| Verified status | `typecheck` passes, unit tests pass, production build passes |

### One-line pitch

> Market Watch is a read-only dashboard that streams live NSE/BSE prices to the
> browser by proxying and normalizing Angel One SmartAPI data through a Fastify
> backend, with full-universe search, dynamic watchlists, and historical charts.

---

## 2. Problem statement and objectives

### The problem

Retail investors who want a simple, fast, read-only view of Indian market data
face two obstacles:

1. **Licensed data feeds are hard to consume.** Angel One SmartAPI exposes market
   data, but a browser cannot safely hold broker credentials, and the streaming
   feed is a binary WebSocket protocol that a browser cannot parse directly.
2. **Existing dashboards are heavy.** Many market sites are cluttered, slow, or
   require login, and they do not let you build a small custom watchlist with
   live prices.

### The objectives

1. **Stream live prices end-to-end** — from the broker feed, through a secure
   backend, to the browser, with automatic reconnection at every hop.
2. **Keep broker credentials server-side only** — never ship the API key, MPIN,
   TOTP secret, JWT, or feed token to the client.
3. **Make the whole listed-equity universe searchable** without hammering the
   broker API on every keystroke.
4. **Let users watch exactly what they care about** — add and remove instruments,
   with only the actively watched tokens subscribed upstream.
5. **Provide historical context** — daily/weekly/monthly/yearly candles.
6. **Degrade gracefully** — clear states for market-closed, backend-offline, and
   no-results, plus light/dark themes.
7. **Be teachable** — include an educational article library and an explicit
   "not investment advice" disclaimer.

### In scope

- Read-only market data (no order placement, no trading).
- NSE/BSE cash-market equities and the NIFTY 50 / SENSEX indices.
- REST + WebSocket API, browser dashboard, optional persistence.

### Explicitly out of scope

- Placing orders, GTT, portfolio holdings, or any write/trading API.
- Authentication/accounts in the running app (watchlists are stored client-side;
  database tables exist for future accounts).
- Derivatives, options, futures, mutual funds, debt, and ETFs.
- Investment advice or recommendations.

---

## 3. Technology stack and why each choice was made

### Language and tooling

| Technology | Version | Why |
| --- | --- | --- |
| TypeScript | ^5.7.2 | End-to-end type safety; wire types shared across frontend and backend so a protocol change breaks the build instead of production. |
| pnpm workspaces | 9.15.0 | Fast, disk-efficient monorepo manager; `workspace:*` links the shared types package without publishing. |
| Corepack | – | Honours the pinned `packageManager` field so every machine uses the same pnpm. |
| `tsconfig.base.json` | – | Single strict baseline (`strict`, `noUncheckedIndexedAccess`, `moduleResolution: Bundler`) inherited by all packages. |

### Backend

| Technology | Version | Why |
| --- | --- | --- |
| Fastify | ^5.1.0 | Very fast Node HTTP framework, first-class TypeScript types, built-in `inject()` for route tests without opening a port. |
| `@fastify/websocket` | ^11.0.2 | Adds WebSocket upgrade support on the same server/port (no second service). |
| `@fastify/cors` | ^10.0.1 | Lets the Vercel frontend call the Render backend cross-origin. |
| `ws` | ^8.18.0 | Low-level WebSocket client used to connect to Angel One's Smart Stream and in tests. |
| `pg` | ^8.13.1 | PostgreSQL driver; connection pooling. |
| `redis` (node-redis) | ^4.7.0 | Redis client for optional cross-instance pub/sub and snapshots. |
| `tsx` | ^4.19.2 | Runs the TypeScript backend directly in dev with watch/restart. |
| Vitest | ^2.1.8 | Fast Vite-native test runner; mocks timers and sockets well. |

### Frontend

| Technology | Version | Why |
| --- | --- | --- |
| Next.js | ^15.1.3 (built on 15.5.23) | App Router, React Server Components where useful, static generation for articles, easy Vercel deploy. |
| React | ^19.0.0 | Current React; `use()` hook for async params in pages. |
| `lightweight-charts` | ^5.0.7 | TradingView's small, fast candlestick/volume charting library. |
| Playwright | ^1.62.1 | Cross-browser end-to-end tests, including offline and theme-persistence. |

### Infrastructure

| Technology | Why |
| --- | --- |
| Docker (`node:22-alpine`) | Reproducible backend image; installs only backend + shared-types deps via `--filter ...`. |
| `docker-compose.yml` | Local Redis 7 and PostgreSQL 16 with health checks for integration work. |
| Render | Hosts the long-lived HTTP + WebSocket backend (Vercel serverless cannot hold a socket or a broker feed session). |
| Vercel | Hosts the Next.js frontend with a global CDN. |

---

## 4. Repository layout (what every file does)

```
.
├─ apps/
│  ├─ backend/                     # @market-watch/backend — Fastify API + Angel One
│  │  ├─ migrations/
│  │  │  └─ 001_market_data.sql    # candles, users, watchlists, watchlist_items, price_alerts
│  │  ├─ scripts/
│  │  │  ├─ sync-instruments.mjs   # builds the full NSE/BSE equity snapshot
│  │  │  └─ resolve-angelone-tokens.mjs  # resolves tokens for the 9 catalog instruments
│  │  └─ src/
│  │     ├─ angelone/
│  │     │  ├─ totp.ts             # RFC-6238 TOTP (HMAC-SHA1, 30s, 6 digits)
│  │     │  ├─ stream-parser.ts    # decodes little-endian Smart Stream V2 frames
│  │     │  └─ instruments.*.ts    # generated token map for catalog symbols
│  │     ├─ instruments/
│  │     │  ├─ registry.ts         # instrument identity + ranked search over the snapshot
│  │     │  └─ instruments.generated.ts  # 7,567-equity snapshot (generated)
│  │     ├─ storage/
│  │     │  ├─ quote-store.ts      # QuoteStore interface
│  │     │  ├─ in-memory-quote-store.ts
│  │     │  └─ redis-quote-store.ts
│  │     ├─ events/
│  │     │  ├─ event-bus.ts        # EventBus interface
│  │     │  ├─ in-memory-event-bus.ts
│  │     │  └─ redis-event-bus.ts
│  │     ├─ database/
│  │     │  ├─ postgres.ts         # Pool + candle upserts
│  │     │  └─ migrations.ts       # runs the SQL migration at startup (+ TimescaleDB hook)
│  │     ├─ app.ts                 # routes, WebSocket, subscription wiring, tick fan-out
│  │     ├─ server.ts              # process bootstrap + provider selection
│  │     ├─ config.ts              # environment parsing and validation
│  │     ├─ provider.ts            # PriceProvider contract + MockPriceProvider
│  │     ├─ smart-api-provider.ts  # Angel One implementation
│  │     ├─ catalog.ts             # the 9 built-in instruments
│  │     ├─ calendar.ts            # IST market-hours + holiday calendar
│  │     └─ logger.ts              # structured JSON logging (no secrets)
│  └─ web/                         # @market-watch/web — Next.js dashboard
│     ├─ app/
│     │  ├─ layout.tsx             # metadata, theme bootstrap script, footer
│     │  ├─ page.tsx               # home dashboard
│     │  ├─ globals.css            # design tokens + all component styles
│     │  ├─ not-found.tsx          # 404
│     │  ├─ stock/[symbol]/page.tsx        # instrument detail + chart
│     │  └─ articles/[slug]/page.tsx       # statically generated article pages
│     ├─ components/               # TopBar, SectionNav, Watchlist, MarketCard,
│     │                            # TickerStrip, StockChart, ArticleCard,
│     │                            # StateMessage, icons
│     ├─ lib/
│     │  ├─ api.ts                 # REST client + openMarketSocket()
│     │  ├─ reconnecting-socket.ts # browser WebSocket with backoff + resubscribe
│     │  ├─ instrument-key.ts      # exchange:symbol helper
│     │  ├─ format.ts              # Indian volume formatting (L / Cr)
│     │  └─ use-theme.ts           # observes the data-theme attribute
│     ├─ content/articles.ts       # 10 articles as typed blocks
│     └─ e2e/edge-states.spec.ts   # Playwright specs
├─ packages/
│  └─ shared-types/src/index.ts    # wire types shared by web + backend
├─ Dockerfile                      # backend production image
├─ docker-compose.yml              # local Redis + PostgreSQL
├─ render.yaml                     # Render Blueprint for the backend
├─ tsconfig.base.json              # shared strict TS config
├─ pnpm-workspace.yaml             # apps/* and packages/*
└─ docs/                           # architecture, API, deployment, development
```

---

## 5. High-level architecture

```
                              ┌──────────────────────────────────┐
                              │         Browser (apps/web)       │
                              │  Next.js UI · watchlist · chart  │
                              └────────┬────────────────┬────────┘
                        REST fetch     │                │  /ws (subscribe, ticks)
                     (quotes, search,  │                │
                      candles, status) ▼                ▼
                     ┌────────────────────────────────────────────┐
                     │         Backend (Fastify + ws)             │
                     │  app.ts routes · SubscriptionRegistry ·    │
                     │  EventBus · QuoteStore · market-hours gate │
                     └──────┬───────────────────────────┬─────────┘
                            │ ticks (normalized)        │ REST (quotes, candles)
                            ▼                           ▼
                   ┌───────────────────┐      ┌──────────────────────────┐
                   │ Angel One Smart   │      │ Optional Redis           │
                   │ Stream V2 (WSS)   │      │ Optional PostgreSQL      │
                   │ binary frames     │      └──────────────────────────┘
                   └───────────────────┘
```

### The three workspaces

| Workspace | Package | Responsibility |
| --- | --- | --- |
| `apps/web` | `@market-watch/web` | Renders quotes/watchlist/charts; talks REST + WebSocket. |
| `apps/backend` | `@market-watch/backend` | Fastify API, WebSocket fan-out, provider integration, search, optional Redis/PostgreSQL. |
| `packages/shared-types` | `@market-watch/shared-types` | Wire types (`Quote`, `Tick`, `Candle`, WS messages, `InstrumentSearchResult`). |

### The single most important design idea: instrument identity

Everywhere in the system an instrument is identified by **`exchange:symbol`**
(for example `NSE:YESBANK` versus `BSE:YESBANK`). This composite key is used by:

- The backend `EventBus` and `QuoteStore` keys.
- The `/ws` per-socket subscription sets.
- The frontend `useState` maps and `localStorage` watchlist.
- The `SubscriptionRegistry` reference counts.

Both `instrumentKey()` helpers (backend `instruments/registry.ts`, frontend
`lib/instrument-key.ts`) produce the same string, which is why NSE and BSE
listings of the same company never collide.

---

## 6. End-to-end data flows

This section is the heart of the viva. Be able to draw each flow on a
whiteboard.

### 6.1 Live tick flow (the streaming pipeline)

```
Angel One Smart Stream
   │  binary frame (little-endian)
   ▼
SmartAPIPriceProvider.parseStreamFrame()
   │  → { token, exchangeType, mode, timestamp, price(paise→₹), volume }
   ▼
activeByToken map  →  { symbol, exchange }   (token → instrument)
   │
   ▼  tickHandler (registered by app.ts via provider.subscribeTicks)
app.ts onTick
   │  market-hours gate: if (!FORCE_MARKET_OPEN && !isMarketOpen()) return;
   ▼
eventBus.publish(instrumentKey, tick)
   │
   ├─▶ QuoteStore: merge tick into the latest Quote
   │     (price, timestamp, volume, change, changePercent, dayHigh, dayLow)
   │
   └─▶ for each connected socket whose key set contains this instrument:
          socket.send({ version: 1, type: "tick", payload: { tick } })
```

Key points to state:

- The provider emits **normalized** `Tick` objects, so the rest of the system
  never sees Angel One's binary format or paise integers.
- The market-hours gate sits **in the backend**, so no ticks are pushed outside
  trading hours even if a client subscribed.
- The `EventBus` decouples ingestion from delivery. With the in-memory bus it is
  a `Map<string, Set<handler>>`; with Redis it is real pub/sub, allowing
  multiple backend instances to share ticks.

### 6.2 REST quote flow

```
GET /api/quote/:symbol?exchange=
   │
   ├─ parseExchange(query.exchange) → "NSE" | "BSE" | undefined
   ├─ resolveAny(symbol, exchange):
   │     1. default watchlist by exchange key, else by symbol
   │     2. otherwise the full instrument registry (NSE-first if no exchange)
   │     3. if unknown → 404 { error: "Symbol not found" }
   ├─ quoteStore.get(key)         ← return the cached live quote if present
   │     else provider.getQuote() ← SmartAPI REST "FULL" quote
   ├─ quoteStore.set(key, quote)  ← cache it
   └─ return Quote JSON
```

Why check the store first? During market hours the streaming pipeline is
continuously updating the quote, so the REST endpoint returns an up-to-the-tick
value without a new broker request.

### 6.3 Historical candles flow

```
GET /api/historical/:symbol?range=1D|1W|1M|1Y&exchange=
   │
   ├─ validate range (invalid → 400 { error: "Invalid range" })
   ├─ resolveAny(...) → 404 if unknown
   └─ provider.getHistorical(symbol, range, exchange)
         SmartAPIPriceProvider:
           interval = (range === "1D") ? "ONE_MINUTE" : "ONE_DAY"
           fromdate = now − rangeDays[range] days, todate = now
           POST /rest/secure/angelbroking/historical/v1/getCandleData
           map rows → Candle[] { time: epoch seconds, open, high, low, close, volume }
```

### 6.4 Search flow (never hits the broker per keystroke)

```
Browser input (debounced 200 ms, minimum 2 characters)
   │
   ▼
GET /api/instruments/search?q=&limit=
   │
   ▼
instruments/registry.search(query, limit)
   │  normalize(query) = lowercase + strip everything non-alphanumeric
   │  compare against pre-normalized symbol / tradingSymbol / name
   │  rank: exact symbol > symbol prefix > trading prefix > name prefix > contains
   │  tie-break by symbol, then exchange; cap 1..50 (default 20)
   ▼
{ query, results: InstrumentSearchResult[] }
```

### 6.5 WebSocket subscription lifecycle

```
Client connects → GET /ws (upgrade)
Server: clientId = randomUUID(); clients.set(socket, new Set())

Client sends: { version:1, type:"subscribe", payload:{ instruments:[{exchange,symbol}] } }
Server:
   resolveAny() each instrument → ProviderInstrument (with token!)
   for each: socketKeys.add("NSE:YESBANK"); registry.add(clientId, instrument)
   registry logic: if global count 0→1 and not a default → provider.subscribe(token)
   reply: { version:1, type:"subscribed", payload:{ instruments:[...] } }

Tick arrives at EventBus handler → send only to sockets whose set contains the key

Client sends unsubscribe → socketKeys.delete(key); registry.remove(clientId, inst)
   if global count 1→0 and not a default → provider.unsubscribe(token)

Client disconnects → clients.delete(socket); registry.removeClient(clientId)
   (releases every instrument that client held)
```

---

## 7. Backend deep dive

### 7.1 `server.ts` — process bootstrap

The entry point does exactly five things, in order:

1. `loadConfig()` parses and validates the environment; it throws on invalid
   configuration instead of starting in a broken state ("fail fast").
2. If Redis is enabled it connects a `RedisQuoteStore` and a `RedisEventBus`
   in parallel; if PostgreSQL is enabled it connects and runs migrations.
3. Selects a `PriceProvider`:
   - `MARKET_DATA_PROVIDER=angelone` → `SmartAPIPriceProvider`
   - anything else (`mock`, the default) → `MockPriceProvider`
4. `createApp(provider, { quoteStore, eventBus })`.
5. `app.listen({ port, host: "0.0.0.0" })` and logs the banner.

Note the subtle detail: `provider` is `undefined` when the mock is used, and
`createApp` defaults its parameter to `new MockPriceProvider()`. This keeps the
process bootstrap honest about whether real credentials were configured.

### 7.2 `config.ts` — environment validation

- `NODE_ENV` must be `development`, `test`, or `production`.
- `REDIS_ENABLED` defaults to `true` **only if** `REDIS_URL` is set; when enabled
  the URL must be present and parseable.
- `POSTGRES_ENABLED` behaves the same with `DATABASE_URL`.
- `FORCE_MARKET_OPEN=true` is **rejected** when `NODE_ENV=production`.
- `MARKET_DATA_PROVIDER` must be `mock` or `angelone`.
- When `angelone` is selected, four variables are required and the process fails
  with a clear message if any is missing: `ANGELONE_API_KEY`,
  `ANGELONE_CLIENT_CODE`, `ANGELONE_PASSWORD`, `ANGELONE_TOTP_SECRET`.
- Optional login headers and URLs have safe defaults (base URL, WebSocket URL,
  MAC/IP placeholders).
- `ANGELONE_SUBSCRIPTION_MODE` must be `1`, `2`, or `3` (default `2` = QUOTE).

### 7.3 `app.ts` — routes, sockets, and wiring

This is the largest backend file and the one to know best. Responsibilities:

- Creates or receives the `QuoteStore` and `EventBus` (dependency injection makes
  testing trivial — tests pass fakes).
- Guards against `FORCE_MARKET_OPEN` in production (defense in depth on top of
  `config.ts`).
- Builds `defaultInstruments()` from `catalog.ts`, attaching each default's Angel
  One token/exchangeType from the generated token map.
- `resolveAny(symbol, exchange)` is the universal symbol resolver: defaults
  first, then the full registry.
- `activate(instrument)` / `deactivate(instrument)` manage the per-instrument
  `EventBus` subscriptions and the handler that updates the quote store and
  broadcasts ticks. `handlers` is a map so activation is idempotent.
- Instantiates `SubscriptionRegistry` with `onActivate`/`onDeactivate` callbacks
  that both (a) wire the event-bus handler and (b) call `provider.subscribe` /
  `provider.unsubscribe`.
- Registers CORS (`origin: true`) and the WebSocket plugin.
- Defines the REST routes (search, legacy search, quote, historical, market
  status) and the `/ws` handler.
- Seeds the 9 defaults by calling `activate` for each, then calls
  `provider.subscribeTicks(defaultSymbols, onTick)`.
- Registers an `onClose` hook that unsubscribes the provider, tears down every
  event-bus handler, and closes the bus and quote store.

The `onTick` callback is where the **market-hours gate** lives:

```ts
const forceOpen = process.env.NODE_ENV !== "production" && process.env.FORCE_MARKET_OPEN === "true";
provider.subscribeTicks(defaults.map((i) => i.symbol), (tick) => {
  if (!forceOpen && !isMarketOpen()) return;
  const key = instrumentKey(tick.exchange, tick.symbol);
  void eventBus.publish(key, tick).catch(...);
});
```

The EventBus handler merges a tick into the stored quote:

```ts
const quote = await quoteStore.get(key);
if (quote) await quoteStore.set(key, {
  ...quote,
  timestamp: tick.timestamp,
  price: tick.price,
  change: tick.price - quote.previousClose,
  changePercent: (tick.price - quote.previousClose) / quote.previousClose * 100,
  volume: tick.volume,
  dayHigh: Math.max(quote.dayHigh, tick.price),
  dayLow: Math.min(quote.dayLow, tick.price),
});
```

and then fans the raw tick out to subscribed sockets.

### 7.4 `provider.ts` — the `PriceProvider` abstraction

```ts
interface PriceProvider {
  getQuote(symbol: string, exchange?: Exchange): Promise<Quote>;
  getHistorical(symbol: string, range: HistoricalRange, exchange?: Exchange): Promise<Candle[]>;
  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void): () => void;
  subscribe(instrument: ProviderInstrument): void;
  unsubscribe(instrument: ProviderInstrument): void;
}
```

This is the seam that makes the project testable and demo-safe: the entire
backend runs against `MockPriceProvider` with no credentials, and the same code
runs against `SmartAPIPriceProvider` in production.

**`MockPriceProvider`** generates deterministic, session-shaped synthetic data:

- A linear-congruential generator seeded from the symbol string gives repeatable
  pseudo-random numbers (same symbol → same sequence).
- `generateTick()` applies a small random move, an occasional larger "shock",
  a session trend, and an opening/closing volume pulse derived from the IST
  clock, so a demo looks realistic.
- `subscribeTicks()` emits a tick for every active instrument every 1.5 seconds.
- It tracks an `active` set so `subscribe`/`unsubscribe` behave like the real
  provider (needed for ref-counting tests).

### 7.5 `smart-api-provider.ts` — the Angel One implementation

Covered in detail in Section 15. Highlights:

- TOTP login, midnight-IST token expiry, automatic re-auth and retry.
- Smart Stream V2 WebSocket with `ping` heartbeat and exponential backoff.
- Binary frame parsing and token→instrument mapping.
- Telemetry that never logs secrets.

### 7.6 `subscriptions.ts` — reference-counted subscriptions

`SubscriptionRegistry` holds:

- `defaults`: a `Set` of the 9 always-on keys.
- `clients`: `Map<clientId, Map<instrumentKey, ProviderInstrument>>`.
- `counts`: `Map<instrumentKey, number>` global reference counts.

Transitions:

- `add(clientId, instrument)`: ignore duplicates; increment the count; if the
  count went `0 → 1` and the key is **not** a default, call `onActivate`
  (which calls `provider.subscribe`).
- `remove(clientId, instrument)`: decrement; if `1 → 0` and not a default, call
  `onDeactivate` (which calls `provider.unsubscribe`).
- `removeClient(clientId)`: releases everything for a disconnected socket.
- `isActive(key)` / `activeCount(key)` / `clientCount()` for introspection/tests.

Why this matters: 50 users watching RELIANCE produce **one** upstream
subscription, and one user adding/removing an instrument never disturbs another
user's stream.

### 7.7 `events/` — the EventBus

- `EventBus` interface: `publish(key, tick)`, `subscribe(key, handler) → unsubscribe`, `close()`.
- `InMemoryEventBus`: a `Map<string, Set<TickHandler>>`. `publish` awaits all
  handlers with `Promise.all`.
- `RedisEventBus`: one publisher client and one duplicated subscriber client;
  subscribes lazily per channel on first handler, unsubscribes when the last
  handler leaves. Channel naming: `market:ticks:<KEY>`. This enables horizontal
  fan-out across backend instances.

### 7.8 `storage/` — the QuoteStore

- `QuoteStore` interface: `get`, `set`, `close`.
- `InMemoryQuoteStore`: a `Map` keyed by the instrument key.
- `RedisQuoteStore`: `market:quote:<KEY>` string keys holding JSON.

Both are keyed by the same composite instrument key, so switching adapters does
not change behavior.

### 7.9 `instruments/registry.ts` — identity and ranked search

Built once at module load from the generated snapshot:

- `instrumentKey(exchange, symbol)` → `"NSE:YESBANK"`.
- `normalize(value)` → lowercase and strip all non-alphanumerics:
  `"Yes Bank"` → `yesbank`, `"M&M"` → `mm`, `"Reliance Industries"` →
  `relianceindustries`.
- `byKey` and `byToken` (`exchangeType:token`) lookup maps.
- `resolve(symbol, exchange?)`: exact exchange if given, otherwise NSE-first.
- `search(query, limit)`: requires ≥ 2 normalized characters; scores every entry
  with the rank ladder (5 exact symbol, 4 symbol prefix, 3 trading-symbol prefix,
  2 name prefix, 1 contains); sorts by score then symbol then exchange; returns
  at most `min(max(limit,1),50)`.

The snapshot itself is tagged `// @ts-nocheck` because it is a multi-megabyte
data literal, but consumers still see the declared `InstrumentSearchResult[]`
type, so type safety at the boundary is preserved.

### 7.10 `calendar.ts` — market hours

- Computes NSE/BSE session state in `Asia/Kolkata` using
  `Intl.DateTimeFormat(..., { timeZone: "Asia/Kolkata" })`.
- Open when the weekday is not Saturday/Sunday, the date is not in the holiday
  set, and the time is between 09:15 (555 minutes) and 15:30 (930 minutes) IST.
- `getMarketStatus()` returns `{ open, session: "OPEN" | "CLOSED", timestamp }`.
- `isMarketOpen()` gates tick forwarding in `app.ts`.
- The holiday set is hardcoded for 2026 (see Section 21 for the limitation).

> Note the honest discrepancy: the shared `MarketStatus` type allows
> `session: "PRE_OPEN" | "OPEN" | "CLOSED"` and an optional `nextOpen`, but the
> current implementation only ever emits `"OPEN"`/`"CLOSED"` and never sets
> `nextOpen`. The frontend renders `nextOpen` defensively (`formatNextOpen`)
> but it is undefined in practice. This is documented rather than hidden.

### 7.11 `catalog.ts` — the nine built-in instruments

```
NIFTY50 (NSE, INDEX)   SENSEX (BSE, INDEX)
RELIANCE  TCS  HDFCBANK  INFY  ICICIBANK  SBIN  HINDUNILVR  (NSE, EQUITY)
```

`defaultInstruments()` in `app.ts` maps these to `ProviderInstrument`s with the
Angel One tokens resolved by `resolveAngelInstruments()`.

### 7.12 `logger.ts` — structured, secret-free logging

`logInfo` / `logError` emit single-line JSON with `level`, `timestamp`, `layer`
(`provider`, `websocket`, `ingestion`, `redis`, `postgres`), `message`, and a
context object. Convention: **credentials, TOTP, JWT, and feed tokens are never
placed in the context.** A test asserts that search responses do not contain
such strings.

### 7.13 Database (`database/`, `migrations/`)

- `PostgresDatabase.connect()` creates a `Pool`, pings with `SELECT 1`, then runs
  migrations.
- `runMigrations()` reads `001_market_data.sql`, executes it, and if the
  TimescaleDB extension is present, converts `candles` into a hypertable.
- `saveCandles()` inserts candles in a transaction with
  `ON CONFLICT ... DO UPDATE` (idempotent upsert).

Schema summary:

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `candles` | OHLCV history | PK `(symbol, exchange, interval, time)`; `CHECK (high >= low)`, `CHECK (volume >= 0)`; index on `(symbol, time DESC)`. |
| `users` | Future accounts | unique email. |
| `watchlists` | Future named lists | `UNIQUE (user_id, name)`, FK to users. |
| `watchlist_items` | Instruments in a list | PK `(watchlist_id, symbol, exchange)`. |
| `price_alerts` | Future alerts | `direction IN ('ABOVE','BELOW')`, `active` flag. |

The running app stores watchlists in the browser; these tables are provisioned
for a future server-side accounts feature.

---

## 8. Frontend deep dive

### 8.1 Routing (Next.js App Router)

| Route | File | Rendering | Purpose |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | Client component | Home dashboard. |
| `/stock/[symbol]` | `app/stock/[symbol]/page.tsx` | Client, dynamic (`ƒ`) | Instrument detail + chart. |
| `/articles/[slug]` | `app/articles/[slug]/page.tsx` | Static (SSG) | Article pages, pre-rendered via `generateStaticParams`. |
| not found | `app/not-found.tsx` | Static | 404 page. |

`app/layout.tsx` sets metadata (title template, description, OpenGraph,
`themeColor`), injects an inline **theme bootstrap script** that reads
`localStorage.theme` (falling back to the OS preference) and sets
`data-theme` **before paint** to avoid a flash of the wrong theme, and renders
the footer disclaimer.

### 8.2 Home dashboard (`app/page.tsx`)

State:

- `quotes: Quote[]` — the current watchlist quotes.
- `watchlist: WatchItem[]` — defaults merged with anything saved in
  `localStorage` under `market-watch:watchlist`.
- `query` / `results` / `searchError` — universe search.
- `offline` / `marketClosed` / `nextOpen` — banner state.
- `liveRef` — the open market socket, kept in a ref so add/remove can subscribe
  and unsubscribe without re-creating it.

Behaviour:

1. On mount: load defaults + saved extras, open the market socket, subscribe to
   all of them, then fetch initial quotes and market status in parallel.
2. Tick handler: update the matching quote by composite key (price, timestamp,
   volume, change, changePercent, dayHigh/dayLow).
3. Search effect: 200 ms debounce, ignore queries under 2 characters, call
   `/api/instruments/search`.
4. `IntersectionObserver` adds an `is-visible` class to `[data-reveal]` blocks
   for entrance animations (with a graceful fallback if unsupported).
5. `addInstrument` appends to the watchlist, persists non-defaults, subscribes
   the socket, and fetches the new quote.
6. `removeInstrument` removes it from state and storage and unsubscribes; defaults
   are not removable.

Rendered sections: hero, `TickerStrip`, offline/closed `StateMessage`, indices
(`MarketCard` x2), top gainers, full watchlist, article grid (`ArticleCard`).

### 8.3 Instrument detail (`app/stock/[symbol]/page.tsx`)

- Reads `symbol` from the async `params` (React 19 `use()`) and `exchange` from
  the query string.
- Fetches quote + market status and historical candles for the selected range.
- Opens a market socket and subscribes to the instrument, updating the quote on
  each matching tick.
- Renders a header with price/change, a range switcher (`1D/1W/1M/1Y`), the
  `StockChart`, and a stats grid (open, day high/low, previous close, 52-week
  high/low, volume, last update).
- Error handling: `quoteError` → "Instrument unavailable"; `historicalError` →
  "Historical data unavailable" while the quote still renders; offline and
  market-closed states are distinct.

### 8.4 Components

| Component | What it does |
| --- | --- |
| `TopBar` | Brand, live/closed/offline status pill, and `ThemeToggle`. |
| `ThemeToggle` | Toggles `data-theme` on `<html>` and persists `theme` in `localStorage`. |
| `SectionNav` | Sticky nav whose active link is driven by an `IntersectionObserver`. |
| `Watchlist` | Table of quotes with links to detail pages and optional remove buttons. |
| `MarketCard` | Index card with price and change, labelled NIFTY 50 / BSE SENSEX. |
| `TickerStrip` | Scrolling price chips; duplicates items for the marquee and disables motion when `prefers-reduced-motion` is set. |
| `StockChart` | `lightweight-charts` v5 candlestick + volume histogram; updates the last candle from the latest tick; re-themes with light/dark palette; `ResizeObserver` keeps width responsive. |
| `ArticleCard` | Link card for an article. |
| `StateMessage` | Neutral/error/closed inline message. |
| `icons` | Small inline SVG icon set (arrows, search, sun, moon). |

### 8.5 `lib/`

- `api.ts` — typed REST client (`quote`, `historical`, `instruments.search`,
  legacy `search`, `status`) using `cache: "no-store"`, plus `openMarketSocket()`
  which wraps `ReconnectingWebSocket`, parses `tick` messages, and exposes
  `subscribe`/`unsubscribe`/`close`.
- `reconnecting-socket.ts` — browser WebSocket manager:
  - Keeps a `Map` of desired subscriptions keyed by `exchange:symbol`.
  - On open, flushes all subscriptions (so a reconnect automatically
    re-subscribes).
  - On error/close, reconnects with exponential backoff
    (`baseDelayMs` 1000, factor 2, cap 30000) and resets the attempt counter on a
    successful open.
  - `close()` stops reconnection permanently.
  - Fully injectable (`createSocket`, timers) which is why it has 7 unit tests.
- `instrument-key.ts` — `instrumentKey()` and `parseExchange()`.
- `format.ts` — Indian volume formatting (`1.2 Cr`, `3.4 L`).
- `use-theme.ts` — reads `data-theme` and watches it with a `MutationObserver`.

### 8.6 Content and styling

- `content/articles.ts` defines 10 articles as structured blocks (`p`, `h2`,
  `stat`, `quote`, `list`, `callout`). The article page renders each block type and
  is statically generated at build time.
- `globals.css` holds the design system: CSS custom properties for colors,
  typography, spacing, radii; an up/down semantic palette (green/red) separate
  from the brand palette; and dark-mode overrides via `[data-theme="dark"]`.
- Accessibility touches: `aria-label`s on controls, `role="status"` on state
  messages, `aria-hidden` on decorative SVGs, reduced-motion support.

---

## 9. Shared types (`packages/shared-types`)

Single source of truth for the wire contract, imported by both apps as
`@market-watch/shared-types`:

```ts
type Exchange = "NSE" | "BSE";
type InstrumentType = "EQUITY" | "INDEX";
type HistoricalRange = "1D" | "1W" | "1M" | "1Y";

interface Instrument { symbol; exchange; type; name; sector?; marketCap?; }
interface Quote { symbol; exchange; timestamp; price; open; high; low;
  previousClose; change; changePercent; volume; dayHigh; dayLow;
  week52High; week52Low; }
interface Tick { symbol; exchange; timestamp; price; volume; }
interface Candle { time; open; high; low; close; volume; }
interface MarketStatus { open; session: "PRE_OPEN"|"OPEN"|"CLOSED";
  timestamp; nextOpen?; }
interface SearchResult extends Instrument {}
interface InstrumentSearchResult { exchange; exchangeType; token; symbol;
  tradingSymbol; name; isin?; type: "EQUITY"; }
interface WsInstrument { exchange; symbol; }
interface WsSubscriptionPayload { symbols?; instruments?; }
interface WsMessage<TType, TPayload> { version: 1; type: TType; payload: TPayload; }
type ClientWsMessage = WsMessage<"subscribe"|"unsubscribe", WsSubscriptionPayload>;
type ServerWsMessage = WsMessage<"tick", { tick: Tick }>
  | WsMessage<"subscribed"|"unsubscribed", WsSubscriptionPayload>
  | WsMessage<"status", MarketStatus>
  | WsMessage<"error", { message: string }>;
```

The package `exports` maps types to `./src/index.ts` (so editors read source)
while `main`/default point to compiled `./dist/index.js`. The versioned
`WsMessage` envelope (`version: 1`) means the protocol can evolve without
breaking older clients.

---

## 10. REST API reference

Base URL is the backend origin (`NEXT_PUBLIC_API_URL`). All payloads JSON.
Errors return an HTTP status plus `{ "error": "..." }`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/instruments/search?q=&limit=` | Search the equity universe. `limit` default 20, clamped 1–50; queries under 2 chars return `[]`. Returns `{ query, results }`. |
| GET | `/api/search?q=` | Legacy alias returning `SearchResult[]`. |
| GET | `/api/quote/:symbol?exchange=` | Latest quote. `exchange` optional (defaults to the default-watchlist exchange, else NSE, else BSE). |
| GET | `/api/historical/:symbol?range=&exchange=` | Candles for `1D|1W|1M|1Y` (default `1D`); invalid range → 400. |
| GET | `/api/market-status` | `{ open, session, timestamp, nextOpen? }`. |
| GET | `/ws` | WebSocket upgrade for live ticks. |

Example requests and responses:

```bash
curl "http://localhost:4000/api/instruments/search?q=yes%20bank"
# {"query":"yes bank","results":[
#   {"exchange":"NSE","exchangeType":1,"token":"11915","symbol":"YESBANK","tradingSymbol":"YESBANK-EQ","name":"Yes Bank Limited","isin":"INE528G01035","type":"EQUITY"},
#   {"exchange":"BSE","exchangeType":3,"token":"532648","symbol":"YESBANK","tradingSymbol":"YESBANK","name":"Yes Bank Ltd.","isin":"INE528G01035","type":"EQUITY"}]}

curl "http://localhost:4000/api/quote/RELIANCE"
# {"symbol":"RELIANCE","exchange":"NSE","timestamp":"...","price":1257.5,
#  "open":1267,"high":1267.4,"low":1253,"previousClose":1274,"change":-16.5,
#  "changePercent":-1.3,"volume":8777736,"dayHigh":1267.4,"dayLow":1253,
#  "week52High":1611.8,"week52Low":1249.8}

curl "http://localhost:4000/api/historical/TCS?range=1M"
# [{"time":1757001600,"open":2185.5,"high":2232.6,"low":2185.5,"close":2200.8,"volume":2634124}]
```

---

## 11. WebSocket protocol

Connect to `/ws` (use `wss://` in production). Messages are versioned JSON.

### Client to server

```jsonc
// Preferred, exchange-qualified
{ "version": 1, "type": "subscribe",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
{ "version": 1, "type": "unsubscribe", "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }

// Legacy, symbol-only (resolved NSE-first / via defaults)
{ "version": 1, "type": "subscribe",   "payload": { "symbols": ["TCS"] } }
```

At least one of `instruments` or `symbols` must be present and non-empty, or the
server replies with an `error` message.

### Server to client

```jsonc
// Acknowledgement echoes the same form the client used
{ "version": 1, "type": "subscribed",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
{ "version": 1, "type": "subscribed",   "payload": { "symbols": ["TCS"] } }

// Live tick
{ "version": 1, "type": "tick", "payload": { "tick": {
  "symbol": "YESBANK", "exchange": "NSE", "timestamp": "2026-09-14T04:00:12.345Z",
  "price": 21.35, "volume": 1023400 } } }

// Application error
{ "version": 1, "type": "error", "payload": { "message": "No instruments requested" } }
```

Rules: ticks flow only during market hours; always key by exchange + symbol;
the server tracks subscriptions per socket and reference-counts upstream
subscriptions globally.

---

## 12. Instrument universe and search

### What is included

The searchable universe is the set of **NSE/BSE listed cash-market equities that
also have an Angel One market-data token**. It is generated, not hand-written.

### How it is generated (`scripts/sync-instruments.mjs`)

1. Download the Angel One instrument master
   (`OpenAPIScripMaster.json`).
2. Download NSE `EQUITY_L.csv` and keep rows whose series is `EQ`, `BE`, or `BZ`.
3. Download the BSE `ListofScripData` endpoint for
   `segment=Equity&Status=Active`.
4. Reconcile:
   - **NSE**: match each symbol against Angel NSE rows trying suffixes
     `-EQ`, `-BE`, `-BZ`, then the bare symbol.
   - **BSE**: match by `SCRIP_CD === Angel token` — authoritative, no heuristics.
5. Emit `src/instruments/instruments.generated.ts` as
   `{ generatedAt, instruments: InstrumentSearchResult[] }`.
6. Print a report: per-exchange source/included/omitted counts (with samples of
   listed equities that had no Angel token) and the snapshot size.

Current snapshot: **7,567 instruments** (~1.7 MB).

### Exclusions

Derivatives, options, futures, debt, ETFs, and indices are excluded. Listed
equities without an Angel One token are **reported, not silently dropped** — but
they are not selectable in search because they cannot be subscribed.

### How search works (recap)

Normalize, rank by the ladder (exact > symbol prefix > trading prefix > name
prefix > contains), tie-break, cap at 50. No broker call per keystroke.

### Updating the snapshot

```bash
corepack pnpm --filter @market-watch/backend sync:instruments
git add apps/backend/src/instruments/instruments.generated.ts
git commit -m "chore: refresh instrument snapshot"
```

---

## 13. Dynamic watchlists and the subscription model

- **9 defaults** are always active: `NIFTY50`, `SENSEX`, `RELIANCE`, `TCS`,
  `HDFCBANK`, `INFY`, `ICICIBANK`, `SBIN`, `HINDUNILVR`.
- Adding an instrument calls `registry.add`, which subscribes its token upstream
  **only** when it is the first watcher (global count `0 → 1`).
- Removing it calls `registry.remove`, which unsubscribes **only** when the last
  watcher releases it (`1 → 0`).
- Disconnecting a socket releases everything it held.
- The full universe is never subscribed — only defaults plus actively watched
  instruments.
- The frontend keeps defaults, persists user additions under
  `market-watch:watchlist` in `localStorage`, and shows NSE/BSE badges with
  add/remove controls.

---

## 14. Market calendar and data gating

- Session state is computed in `Asia/Kolkata` (IST), Monday–Friday,
  09:15–15:30, excluding a hardcoded 2026 holiday set.
- `isMarketOpen()` gates tick forwarding in `app.ts`.
- `FORCE_MARKET_OPEN=true` bypasses the gate in development and is rejected in
  production by both `config.ts` and `app.ts`.
- `/api/market-status` exposes the status to the UI, which shows a "Market closed
  · showing last prices" state.

---

## 15. Angel One SmartAPI integration (detail)

### 15.1 Authentication

`POST {baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword` with headers:

```
Content-Type: application/json
Accept: application/json
X-UserType: USER
X-SourceID: WEB
X-ClientLocalIP: <ANGELONE_CLIENT_LOCAL_IP>
X-ClientPublicIP: <ANGELONE_CLIENT_PUBLIC_IP>
X-MACAddress: <ANGELONE_MAC_ADDRESS>
X-PrivateKey: <ANGELONE_API_KEY>
```

Body: `{ clientcode, password, totp }`. The `totp` is generated server-side from
`ANGELONE_TOTP_SECRET` using RFC 6238 (`angelone/totp.ts`): base32-decode the
secret, build an 8-byte big-endian time counter (`floor(now/1000/30)`),
HMAC-SHA1 it, apply dynamic truncation, and reduce modulo 10^6 to 6 digits. The
response yields `jwtToken` and `feedToken`.

### 15.2 Token lifecycle

- Tokens expire at **the next midnight IST** minus a 60-second safety margin
  (`hasFreshTokens()` checks `now < expiresAt − 60s`).
- `authenticate()` re-logs in when tokens are missing or stale.
- `request()` automatically clears tokens and retries **once** on auth errors:
  error codes `AG8002`/`AG8003`, HTTP 401, or messages matching
  `token expired|invalid token|session expired`.
- A WebSocket authentication failure clears tokens so the next reconnect performs
  a fresh login.

### 15.3 Smart Stream V2

- Connects to `ANGELONE_WEBSOCKET_URL` with headers `Authorization: Bearer <jwt>`,
  `x-api-key`, `x-client-code`, `x-feed-token`.
- Subscribe frame:

```json
{ "correlationID": "market-watch", "action": 1,
  "params": { "mode": 2, "tokenList": [{ "exchangeType": 1, "tokens": ["11915"] }] } }
```

- `action: 1` subscribes, `action: 0` unsubscribes. Single-token frames carry
  dynamic watchlist changes; the full active set is (re)subscribed on
  open/reconnect (`sendAllSubscriptions` groups active tokens by exchange type).
- Sends the text frame `"ping"` every 10 seconds as a heartbeat.
- Reconnects with exponential backoff `1s, 2s, 4s, 8s, 16s, 32s, 60s (cap)` and
  resets the attempt counter on a successful open.

### 15.4 Binary frame layout (little-endian)

| Offset | Field | Notes |
| --- | --- | --- |
| 0 | subscription mode | 1 LTP, 2 QUOTE, 3 SNAP_QUOTE, 4 DEPTH |
| 1 | exchange type | 1 NSE_CM, 3 BSE_CM |
| 2–26 | token | 25-byte null-padded ASCII |
| 27–34 | sequence number | int64 |
| 35–42 | exchange timestamp | int64 (ms) |
| 43–50 | last traded price | int64 in **paise** (÷100 → rupees) |
| 51–58 | last traded quantity | QUOTE+ |
| 59–66 | average traded price | QUOTE+ |
| 67–74 | volume for the day | QUOTE+ |
| 75– | buy/sell qty, OHLC, … | QUOTE+ |

`parseStreamFrame()` returns `undefined` for frames shorter than 51 bytes or for
control frames (mode outside 1–4). For LTP-only frames it returns volume 0. The
packet token is mapped back to an instrument through `activeByToken`
(`exchangeType:token`).

### 15.5 Telemetry (non-secret)

Structured JSON events: `SmartAPI authenticated`, `SmartAPI stream connected`
(with token count), `SmartAPI first tick` (symbol), `SmartAPI stream closed`
(code/reason), and on failure `SmartAPI WebSocket error`, `SmartAPI WebSocket
authentication failed`, `SmartAPI request failed`. Credentials, TOTP, JWT, and
feed tokens are never logged.

---

## 16. Security considerations

- **Server-side secrets only.** Angel One credentials live in backend
  environment variables. There are no `NEXT_PUBLIC_` variants; a test asserts the
  search response contains no `api-key`/`jwtToken`/`feedToken`/`totp`/`password`.
- **Public data only.** The committed instrument snapshot contains only public
  instrument metadata (symbol, name, ISIN, token).
- **Read-only API.** No write endpoints exist; nothing can place trades.
- **CORS is permissive (`origin: true`)** because the API serves public market
  data. This is flagged as something to tighten before adding user accounts.
- **Config fail-fast.** Missing credentials or `FORCE_MARKET_OPEN` in production
  stop the process rather than degrade silently.
- **Git hygiene.** `.env` and `opencode.json` (which holds an API key) are
  gitignored; `.dockerignore` excludes them from the image.
- **No secrets in logs** by convention, enforced in the logger design.

---

## 17. Testing strategy

### Unit tests (Vitest)

Run from the root: `corepack pnpm test`.

| Workspace | Suite | Covers |
| --- | --- | --- |
| backend | `config.test.ts` | Env validation, provider requirements, production guard. |
| backend | `calendar.test.ts` | Open/closed logic and holidays. |
| backend | `catalog.test.ts` | Instrument lookup and search. |
| backend | `provider.test.ts` | Mock provider quotes, historicals, ticks, subscribe set. |
| backend | `subscriptions.test.ts` | Reference counting, defaults never deactivate, disconnect cleanup. |
| backend | `app.test.ts` | Search without credential leakage, legacy alias, per-exchange resolution, ref-counted `/ws` subscribe/unsubscribe, legacy symbol acks. |
| backend | `websocket.test.ts` | Real WS upgrade and subscription ack. |
| backend | `angelone/totp.test.ts` | TOTP correctness. |
| backend | `angelone/stream-parser.test.ts` | Frame parsing, short/control frames, volume extraction. |
| backend | `angelone/instruments.test.ts` | Token resolution and token→symbol map. |
| backend | `instruments/registry.test.ts` | Identity, normalization, ranking, limit clamping. |
| backend | `smart-api-provider.test.ts` | Auth, token lifecycle/telemetry, stream subscribe mode, resubscribe after drop, dynamic frames, backoff cap, midnight re-auth. |
| backend | `events/in-memory-event-bus.test.ts`, `storage/in-memory-quote-store.test.ts` | In-memory adapter behavior. |
| backend | `database/migrations.test.ts` | Migration SQL handling. |
| backend | Redis/PG suites | Skipped unless a live service is available (4 skipped). |
| web | `reconnecting-socket.test.ts` | Backoff, resubscribe on reconnect, unsubscribe, close. |
| shared-types | `index.test.ts` | Protocol/type smoke tests. |

Latest verified result: **backend 61 passed / 4 skipped, web 7 passed,
shared-types 2 passed.**

### End-to-end tests (Playwright)

`apps/web/e2e/edge-states.spec.ts` covers:

- Empty search state ("No matching symbols").
- Invalid symbol ("Instrument unavailable").
- Historical failure while the quote still renders.
- Market-closed messaging with a stale snapshot.
- Offline state after going offline.
- Dark-mode toggle and persistence across reload.
- Full article page rendering and disclaimer.

`playwright.config.ts` boots the compiled backend (`node dist/server.js`) and
`next dev` automatically. Run with:

```bash
corepack pnpm --filter @market-watch/web exec playwright test
```

---

## 18. Deployment

Two tiers, because a long-lived WebSocket server and a broker feed session
cannot run on serverless functions:

| Tier | Platform | Notes |
| --- | --- | --- |
| Frontend `apps/web` | **Vercel** | Root Directory `apps/web`; set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`; `NEXT_PUBLIC_*` are inlined at build time so a rebuild is required after changes. |
| Backend `apps/backend` | **Render** (Docker) or any persistent Docker host | `render.yaml` Blueprint, health check `/api/market-status`. |

### Backend image

The `Dockerfile` installs only the backend + shared-types workspace
dependencies (`pnpm install --frozen-lockfile --filter @market-watch/backend...`),
copies source, runs `pnpm --filter @market-watch/backend build` (`tsc`), and runs
`node dist/server.js` from `/app/apps/backend`.

### Minimum production environment

```
NODE_ENV=production
REDIS_ENABLED=false
POSTGRES_ENABLED=false
MARKET_DATA_PROVIDER=angelone
ANGELONE_API_KEY=...
ANGELONE_CLIENT_CODE=...
ANGELONE_PASSWORD=...       # account MPIN
ANGELONE_TOTP_SECRET=...    # base32 secret from the authenticator QR
```

Do not set `PORT` on Render (it injects its own) and never set
`FORCE_MARKET_OPEN` in production.

### Static IP note

Angel One requires a whitelisted static IP **only for Order and GTT APIs**. This
project uses login, REST market data, and the WebSocket feed, so no static IP,
dedicated IP, or proxy is required. The MAC/IP login headers are optional and
default to placeholders.

### Verification after deploy

```bash
curl https://<backend>/api/market-status
curl "https://<backend>/api/quote/RELIANCE"
curl "https://<backend>/api/instruments/search?q=yes%20bank"
```

Expected logs: `Backend listening on <port> (market data: angelone)`,
`SmartAPI authenticated`, `SmartAPI stream connected`, `SmartAPI first tick`.

---

## 19. Development workflow

```bash
corepack enable
corepack pnpm install
corepack pnpm dev          # web :3000 + backend :4000, in parallel
```

With no configuration the backend uses the in-memory mock provider, so the whole
UI works without credentials. For Docker-backed Redis/PostgreSQL:

```bash
docker compose up -d
$env:REDIS_ENABLED="true"; $env:REDIS_URL="redis://localhost:6379"
$env:POSTGRES_ENABLED="true"; $env:DATABASE_URL="postgresql://market_watch:market_watch@localhost:5432/market_watch"
$env:FORCE_MARKET_OPEN="true"   # dev-only: bypass the market-hours gate
corepack pnpm dev
```

Quality gates before pushing: `corepack pnpm typecheck`, `corepack pnpm test`,
`corepack pnpm -r build`.

### Conventions

- TypeScript strict everywhere, `noUncheckedIndexedAccess` on.
- Backend is ESM (`"type": "module"`); relative imports use `.js` specifiers.
- `exchange:symbol` is the canonical identity — always use `instrumentKey()`.
- No secrets in logs; use `logInfo`/`logError`.
- Wire types live in `packages/shared-types`.
- Commits are scoped, e.g. `feat(angelone): ...`, `fix(...)`, `docs: ...`.

---

## 20. Design decisions and trade-offs

| Decision | Alternative | Why this choice |
| --- | --- | --- |
| Monorepo with pnpm workspaces | Separate repos | One PR can change the protocol and both consumers atomically; shared types cannot drift. |
| Shared types package | Duplicate interfaces | A protocol change becomes a compile error on both sides. |
| `exchange:symbol` composite identity | Symbol alone | Same company lists on both NSE and BSE; symbol-only keys collide. |
| `PriceProvider` abstraction | Call Angel One directly in routes | Testability and demo-safety; the whole app runs on a mock with no credentials. |
| Reference-counted subscriptions | Subscribe per client | One upstream subscription per instrument regardless of user count; respects broker limits. |
| Server-side market-hours gate | Client-side gate | Clients cannot force ticks when the market is closed; one source of truth. |
| Generated instrument snapshot | Live broker search per keystroke | No rate-limit risk, instant search, works offline of the broker. |
| Composite-key Redis channels | A single channel | Fine-grained invalidation; only interested handlers wake up. |
| Optional persistence | Mandatory database | Local dev and tests need zero external services; production can scale horizontally. |
| Two deploy tiers | All on one PaaS | Serverless cannot hold a long-lived WebSocket or broker session. |
| Versioned WS envelope | Untyped messages | Forward-compatible protocol evolution. |

---

## 21. Known limitations and honest future work

State these confidently in a viva — acknowledging limits is a strength.

1. **`PRE_OPEN`/`nextOpen` not implemented.** The `MarketStatus` type allows them
   and the UI reads `nextOpen` defensively, but `calendar.ts` only emits
   `"OPEN"`/`"CLOSED"` and never computes the next open. Implementing it is a
   small, isolated change.
2. **Holidays are hardcoded for 2026.** A production system should load the
   official exchange holiday calendar per year, or store it in a table.
3. **CORS is permissive** (`origin: true`). Acceptable for public read-only data;
   must be restricted before adding accounts or writes.
4. **Watchlists are client-side only.** The `users`, `watchlists`, and
   `watchlist_items` tables exist but are unused; there is no authentication yet.
5. **The home hero date is a static string** ("Saturday, 08 August 2026"). It
   should be derived from the current date (or removed) for a polished product.
6. **PostgreSQL is write-only in practice.** `saveCandles` exists but the running
   app serves historicals live from Angel One; there is no read-through candle
   cache yet.
7. **`mapSmartTick` is currently only used by tests**, not the live socket path
   (which uses `parseStreamFrame`).
8. **No rate limiting or response caching** on the REST routes; fine at this
   scale, worth adding for a public deployment.
9. **Single-process subscription state.** With `REDIS_ENABLED=false` and multiple
   backend instances, each instance would hold its own count; Redis solves this.
10. **No CI workflow committed.** Running typecheck/test/build is manual (or via
    platform build hooks); a GitHub Actions pipeline is the natural next step.

---

## 22. Viva question bank

Answers are intentionally short and technical — expand from the sections above.

### A. Project and general

**Q1. What is this project in one sentence?**
A read-only NSE/BSE market-data dashboard: a Next.js frontend and a Fastify
backend that proxies and normalizes Angel One SmartAPI data, streaming live
prices over WebSockets with full-universe search and dynamic watchlists.

**Q2. What problem does it solve?**
It makes a licensed broker data feed safely consumable in a browser: credentials
stay server-side, the binary stream is normalized to JSON, and users get a fast,
read-only dashboard with only the instruments they care about.

**Q3. Why is it read-only?**
Safety and scope. No order placement means no trading risk, no regulatory write
surface, and the public API can be permissive without exposing anything
actionable.

**Q4. What are the three workspaces?**
`apps/web` (Next.js), `apps/backend` (Fastify), and `packages/shared-types`
(shared wire types).

**Q5. What is explicitly out of scope?**
Orders/GTT, accounts/auth in the running app, derivatives/options/mutual funds,
and investment advice.

### B. Architecture

**Q6. Draw the architecture.**
Browser → (REST + `/ws`) → Fastify backend → (REST + WebSocket) → Angel One
SmartAPI, with optional Redis (pub/sub + snapshots) and PostgreSQL (candles).

**Q7. What is the canonical instrument identity and why?**
`exchange:symbol` (e.g. `NSE:YESBANK`). It prevents collisions between NSE and
BSE listings of the same company and is used for event-bus keys, quote-store
keys, socket subscription sets, and UI state.

**Q8. Why a monorepo?**
Atomic protocol changes, shared types with no drift, one install/lockfile, and
consistent tooling.

**Q9. Why a shared-types package instead of duplicating interfaces?**
A change to `Tick` or a WS message breaks both builds immediately, catching
contract mismatches at compile time.

**Q10. What does `tsconfig.base.json` enforce?**
`strict`, `noUncheckedIndexedAccess`, `moduleResolution: Bundler` — so all
members are type-safe consistently.

**Q11. Why is `instruments.generated.ts` marked `@ts-nocheck`?**
It is a multi-megabyte data literal; type-checking it is slow and pointless.
Consumers still get the declared `InstrumentSearchResult[]` type, so safety is
preserved at the boundary.

### C. Backend and provider

**Q12. What does `server.ts` do?**
Loads/validates config, connects optional Redis/PostgreSQL, selects the provider
(`SmartAPIPriceProvider` or mock), creates the app, and listens on
`0.0.0.0:PORT`.

**Q13. Why the `PriceProvider` abstraction?**
It decouples the app from Angel One. The mock provider enables credential-free
development and deterministic tests; production swaps in the real provider.

**Q14. How does the mock provider generate data?**
A seeded linear-congruential generator per symbol plus a session trend and an
opening/closing volume pulse, emitting a tick every 1.5 seconds. Deterministic
and realistic-looking.

**Q15. How does `resolveAny` work?**
It resolves an instrument by default-watchlist key/symbol first, then the full
registry (NSE-first when no exchange), returning a `ProviderInstrument` with the
Angel One token — or `undefined` for a 404.

**Q16. Why is `activate` idempotent?**
It keys on the instrument key in a `handlers` map, so subscribing twice does not
create duplicate event-bus handlers.

**Q17. What does the `onClose` hook do?**
Unsubscribes the provider, removes every event-bus handler, then closes the bus,
quote store, and database pool.

### D. Real-time and WebSocket

**Q18. Walk through a live tick.**
Provider parses a binary frame → normalizes to `Tick` → `app.onTick` passes the
market-hours gate → publishes on the `EventBus` by instrument key → the bus
handler updates the `QuoteStore` and sends `tick` messages to subscribed sockets.

**Q19. Where does the market-hours gate live and why?**
In the backend `onTick` callback. A client cannot force ticks when the market is
closed; there is a single source of truth.

**Q20. How are subscriptions reference-counted?**
`SubscriptionRegistry` keeps a global count per instrument; `0→1` subscribes
upstream, `1→0` unsubscribes, and defaults are never unsubscribed.

**Q21. Two users watch RELIANCE. How many upstream subscriptions?**
One. The second user only increments the count.

**Q22. What happens when a client disconnects?**
`registry.removeClient(clientId)` releases all of its instruments, decrementing
counts and unsubscribing anything that reaches zero (except defaults).

**Q23. What are the two subscription message forms?**
The preferred exchange-qualified `{ instruments: [{ exchange, symbol }] }` and
the legacy `{ symbols: [...] }`, which resolves NSE-first.

**Q24. How does the browser stay connected?**
`ReconnectingWebSocket` keeps the desired subscription set, replays it on every
open, and reconnects with exponential backoff (1s → 30s cap).

**Q25. How does the backend reconnect to Angel One?**
Exponential backoff `1s, 2s, 4s, 8s, 16s, 32s, 60s`, resetting on a successful
open, and it re-subscribes the full active token set.

### E. Angel One and market data

**Q26. How is authentication done?**
`loginByPassword` with a server-generated TOTP (HMAC-SHA1, 30-second step, 6
digits) from the base32 secret; the response gives `jwtToken` and `feedToken`.

**Q27. When do tokens expire and what happens then?**
At the next midnight IST minus a 60-second margin. `authenticate()` re-logs in
when tokens are stale, and `request()` clears tokens and retries once on auth
errors.

**Q28. How do you detect an auth error?**
Error codes `AG8002`/`AG8003`, HTTP 401, or messages matching
`token expired|invalid token|session expired`.

**Q29. What subscription mode is used and what do the modes mean?**
Mode 2 (QUOTE). Mode 1 is LTP only, mode 2 adds volume/OHLC fields, mode 3
(SNAP_QUOTE) adds full market depth, mode 4 is depth.

**Q30. How are binary frames parsed?**
Little-endian: mode at byte 0, exchange type at 1, a 25-byte token at 2–26,
int64 timestamp at 35, price in paise at 43 (÷100), volume at 67. Frames under 51
bytes or with an out-of-range mode are ignored.

**Q31. Why divide the price by 100?**
Angel One sends price as an integer in paise; dividing yields rupees.

**Q32. How is a packet mapped back to an instrument?**
`activeByToken` maps `exchangeType:token` to the instrument.

**Q33. What keeps the stream alive?**
A `"ping"` text frame every 10 seconds and the reconnect/backoff loop.

**Q34. How do dynamic watchlist changes reach Angel One?**
`subscribe`/`unsubscribe` send single-token `action: 1`/`action: 0` frames when
connected, so no full resubscribe is needed for a small change.

**Q35. What telemetry exists?**
Structured logs for authentication, stream connect (with token count), first
tick, stream close, and non-secret errors. Secrets are never logged.

### F. Search and instruments

**Q36. Why not search the broker on every keystroke?**
Rate limits and latency. The universe is a committed snapshot served from memory,
so search is instant and offline of the broker.

**Q37. How is the snapshot built?**
NSE `EQUITY_L.csv` (series EQ/BE/BZ) joined to the Angel master, and BSE
`ListofScripData` joined by `SCRIP_CD === Angel token`; equities without a token
are reported, not selectable.

**Q38. Why is punctuation-insensitive search important?**
Users type `M&M` or `yes bank`; normalization to `mm`/`yesbank` makes matching
forgiving without affecting ranking.

**Q39. How does ranking work?**
Exact symbol > symbol prefix > trading-symbol prefix > name prefix > contains,
tie-broken by symbol then exchange, capped at 50.

**Q40. How many instruments are in the universe?**
7,567 NSE/BSE cash equities.

### G. Frontend

**Q41. How does the home page update prices?**
It opens one `ReconnectingWebSocket`, subscribes the watchlist, and maps each
incoming tick onto the matching quote by composite key.

**Q42. How are watchlists persisted?**
Defaults are in code; user additions are stored in `localStorage` under
`market-watch:watchlist` and merged on load.

**Q43. How is the chart implemented?**
`lightweight-charts` v5 with a candlestick series and a volume histogram;
updates the last candle from the latest tick; re-themes on light/dark switches
and resizes with a `ResizeObserver`.

**Q44. How is dark mode implemented without a flash?**
An inline script in `layout.tsx` sets `data-theme` from `localStorage` (or OS
preference) before paint; `use-theme.ts` observes the attribute so React knows.

**Q45. Which pages are static vs dynamic?**
Articles are statically generated via `generateStaticParams`; the stock detail
page is dynamic; the home page is a client-rendered dashboard.

**Q46. What states does the UI handle?**
Live, market-closed (stale snapshot), backend-offline, no search results, invalid
symbol, and historical-failure-with-quote-available.

### H. Database and storage

**Q47. Why is persistence optional?**
Local dev and tests need zero external services; production can opt into Redis
and PostgreSQL for horizontal consistency and candle storage.

**Q48. What is the `candles` primary key and why?**
`(symbol, exchange, interval, time)` — it makes upserts idempotent and prevents
duplicate candles.

**Q49. What is the difference between the EventBus and the QuoteStore?**
The EventBus is transient pub/sub for ticks; the QuoteStore keeps the latest
snapshot per instrument.

**Q50. How does Redis enable horizontal scaling?**
Ticks are published to `market:ticks:<KEY>` channels so every backend instance
sees every tick, and quotes are shared via `market:quote:<KEY>` keys.

**Q51. Why is `saveCandles` transactional?**
A batch insert is all-or-nothing; on error it rolls back and rethrows.

### I. Security

**Q52. Where do broker credentials live?**
Only in backend environment variables; never in the frontend, responses, the
snapshot, or logs.

**Q53. Why is permissive CORS acceptable here?**
The API is public, read-only market data with no cookies or auth; tighten it
before adding accounts.

**Q54. How do you prove no credential leakage?**
A test (`app.test.ts`) asserts the search response body does not match
`api-key|privateKey|jwtToken|feedToken|totp|password`.

**Q55. What prevents `FORCE_MARKET_OPEN` in production?**
Both `config.ts` and `app.ts` reject it when `NODE_ENV=production`.

### J. Testing

**Q56. What do the tests cover?**
Config, calendar, catalog, mock provider, subscription ref-counting, routes
(inject), real WebSocket upgrade, TOTP, binary parsing, instrument mapping,
registry search, the full SmartAPI provider lifecycle, the reconnecting socket,
and Playwright edge states.

**Q57. What is skipped and why?**
Redis/PostgreSQL integration suites and one migration test are skipped unless a
live service is available; they are skipped rather than failing by design.

**Q58. How do route tests avoid opening a port?**
Fastify's `inject()` calls handlers in-process; only the WebSocket tests bind an
ephemeral port (`port: 0`).

**Q59. Why is the reconnecting socket easy to test?**
Its socket factory and timers are injectable, so tests can simulate drops,
backoff, and resubscribe deterministically.

### K. Deployment

**Q60. Why can't the backend run on Vercel?**
It calls `app.listen`, holds WebSocket connections, and keeps a broker feed
session — serverless functions cannot do any of that.

**Q61. What is the deployment split?**
Next.js on Vercel; Fastify as a Docker service on Render (or any persistent
Docker host).

**Q62. How does the frontend find the backend?**
`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`, inlined at build time, so a
rebuild is required after changing them.

**Q63. Is a static IP required for Angel One?**
Only for Order/GTT APIs. This project uses login, REST market data, and the feed,
so no.

### L. Tricky and edge cases

**Q64. What happens if the user searches one character?**
`search()` returns `[]` (needs ≥ 2 normalized characters); the UI also debounces
and clears results.

**Q65. What if a symbol exists on NSE but not BSE and the user asks for BSE?**
`resolve` returns `undefined` for the exact exchange and the route returns 404.

**Q66. What if the market is closed?**
`/api/quote` still returns the latest snapshot (provider/cache), but no ticks are
forwarded; the UI shows "Market closed · showing last prices".

**Q67. What if Angel One returns an expired token mid-session?**
`request()` clears the tokens and retries once; a WebSocket auth failure clears
tokens so the next reconnect re-logs in.

**Q68. What if two clients subscribe and one unsubscribes?**
The count goes `2 → 1`, so the upstream subscription stays; only the last
watcher's removal unsubscribes.

**Q69. What if `instruments.generated.ts` falls out of sync with the type?**
Typecheck catches a schema mismatch (or re-run `sync:instruments`); the file is
`@ts-nocheck` only for the data literal, not for its declared type.

**Q70. Named limitation to offer proactively:** `nextOpen`/`PRE_OPEN` and the
hardcoded holiday list are the honest gaps; the schema and UI are already
prepared for them.

---

## 23. Glossary

| Term | Meaning |
| --- | --- |
| NSE / BSE | National Stock Exchange / Bombay Stock Exchange (India). |
| Cash market | The segment for buying/selling actual equities (as opposed to derivatives). |
| LTP | Last traded price. |
| OHLC | Open, high, low, close — the four prices of a candle. |
| Candle | A time-bucketed OHLCV record used for charts. |
| Tick | A single price/volume update from the feed. |
| Quote | A fuller latest snapshot (price, OHLC, previous close, 52-week range, etc.). |
| ISIN | International Securities Identification Number (a security's global ID). |
| Token | Angel One's numeric instrument identifier used by its APIs. |
| Exchange type | Angel One code: 1 = NSE_CM, 3 = BSE_CM. |
| SmartAPI | Angel One's REST + streaming market-data API. |
| Smart Stream V2 | Angel One's binary WebSocket price feed. |
| TOTP | Time-based one-time password (RFC 6238) used for login. |
| MPIN | The account PIN used as the SmartAPI password. |
| Feed token | Token attached to the streaming WebSocket handshake. |
| QUOTE mode | Subscription mode 2, which includes volume and OHLC beyond LTP. |
| IST | Indian Standard Time (UTC+05:30); the market's timezone. |
| Reference counting | Tracking how many clients want an instrument so upstream subscriptions are shared. |
| Event bus | A pub/sub abstraction that routes ticks from ingestion to delivery. |
| Provider | The pluggable source of market data (`mock` or `angelone`). |
| Composite key | `exchange:symbol`, the canonical instrument identity. |

---

## 24. Command cheat sheet

```bash
# Install and run everything (mock provider, no credentials needed)
corepack enable
corepack pnpm install
corepack pnpm dev                     # web :3000, backend :4000

# Quality gates
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -r build

# Run only one tier
corepack pnpm --filter @market-watch/backend dev
corepack pnpm --filter @market-watch/web build

# Refresh the searchable universe
corepack pnpm --filter @market-watch/backend sync:instruments

# Resolve catalog tokens (the 9 defaults)
node apps/backend/scripts/resolve-angelone-tokens.mjs

# Local infrastructure
docker compose up -d

# End-to-end tests
corepack pnpm --filter @market-watch/web exec playwright test

# Manual API checks
curl "http://localhost:4000/api/instruments/search?q=yes%20bank"
curl "http://localhost:4000/api/quote/RELIANCE"
curl "http://localhost:4000/api/historical/TCS?range=1M"
curl "http://localhost:4000/api/market-status"
```

---

*Educational content only — not investment advice.*
