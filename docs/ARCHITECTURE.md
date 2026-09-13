# Architecture

This document describes how Market Watch is put together: the monorepo
workspaces, the real-time data pipeline, the market-data provider abstraction,
the searchable instrument universe, and the optional persistence layers.

## 1. Workspaces

| Workspace | Package | Responsibility |
| --- | --- | --- |
| `apps/web` | `@market-watch/web` | Next.js dashboard. Renders quotes/watchlist, talks to the backend over REST + WebSocket. |
| `apps/backend` | `@market-watch/backend` | Fastify API, WebSocket fan-out, provider integration, search registry, optional Redis/PostgreSQL. |
| `packages/shared-types` | `@market-watch/shared-types` | Wire types shared by both apps (`Quote`, `Tick`, `Candle`, WS messages, `InstrumentSearchResult`). |

`pnpm-workspace.yaml` includes `apps/*` and `packages/*`. TypeScript is configured
from a common `tsconfig.base.json` (`strict`, `moduleResolution: Bundler`,
`noUncheckedIndexedAccess`).

## 2. Backend composition

`apps/backend/src/server.ts` is the process entry point:

1. `loadConfig()` validates environment variables (see `config.ts`).
2. Optionally connects to Redis and/or PostgreSQL.
3. Selects a `PriceProvider`:
   - `MARKET_DATA_PROVIDER=angelone` → `SmartAPIPriceProvider`
   - otherwise → `MockPriceProvider` (local/test only)
4. Calls `createApp(provider, { quoteStore, eventBus })` and listens on
   `0.0.0.0:PORT`.

`apps/backend/src/app.ts` owns everything request-scoped:

- HTTP routes (`/api/*`).
- The `/ws` WebSocket handler and per-socket subscription sets.
- The `SubscriptionRegistry` and provider subscribe/unsubscribe transitions.
- The `EventBus` handlers that update the `QuoteStore` and broadcast ticks.

## 3. Real-time data flow

```
Angel One Smart Stream
        │  binary frame
        ▼
SmartAPIPriceProvider.parseStreamFrame ──▶ Tick { symbol, exchange, timestamp, price, volume }
        │
        ▼  tickHandler (set by subscribeTicks)
app.ts onTick ── market-hours gate ──▶ instrumentKey(exchange, symbol)
        │
        ▼  eventBus.publish(key, tick)
EventBus handler
        ├─ quoteStore.set(key, updatedQuote)
        └─ clients.forEach(socket) ── if socket subscribed to key ──▶ send { type: "tick", payload: { tick } }
```

Identity is `exchange:symbol` (`instrumentKey`) everywhere: `EventBus` keys,
`QuoteStore` keys, `/ws` subscription sets, and frontend state. This keeps
`NSE:YESBANK` and `BSE:YESBANK` distinct.

## 4. Provider abstraction

`apps/backend/src/provider.ts` defines the contract:

```ts
interface PriceProvider {
  getQuote(symbol: string, exchange?: Exchange): Promise<Quote>;
  getHistorical(symbol: string, range: HistoricalRange, exchange?: Exchange): Promise<Candle[]>;
  subscribeTicks(symbols: string[], onTick: (tick: Tick) => void): () => void;
  subscribe(instrument: ProviderInstrument): void;
  unsubscribe(instrument: ProviderInstrument): void;
}
```

- `MockPriceProvider` — deterministic, session-shaped synthetic data for local
  development and unit tests only. It tracks an active set so `subscribe` /
  `unsubscribe` behave like the real provider.
- `SmartAPIPriceProvider` — Angel One implementation (see §7). It resolves
  instruments through the registry (falling back to the catalog/angel defaults
  for indices), tracks the active token set, and talks to the Smart Stream.

## 5. Event bus & quote store

Both have in-memory and Redis implementations selected by configuration.

- `EventBus` (`events/event-bus.ts`): `publish(symbol, tick)` and
  `subscribe(symbol, handler)` keyed by instrument key. In-memory uses `Map` sets;
  Redis uses pub/sub channels for cross-instance fan-out.
- `QuoteStore` (`storage/quote-store.ts`): `get`/`set`/`close` for the latest
  `Quote` per instrument. In-memory uses a `Map`; Redis uses per-symbol keys.

## 6. Instrument universe & search registry

### 6.1 Snapshot generation

`apps/backend/scripts/sync-instruments.mjs`:

1. Downloads the Angel One OpenAPI instrument master.
2. Downloads NSE `EQUITY_L.csv` (columns: `SYMBOL`, `NAME OF COMPANY`, `SERIES`,
   `ISIN NUMBER`).
3. Downloads the BSE `ListofScripData` endpoint for `segment=Equity&Status=Active`.
4. Reconciles:
   - NSE: matches `EQUITY_L` symbols to Angel rows with suffixes `-EQ`, `-BE`,
     `-BZ`, or bare.
   - BSE: matches by `SCRIP_CD === Angel token` (authoritative, no heuristics).
5. Emits `src/instruments/instruments.generated.ts` with `{ generatedAt, instruments }`.
6. Prints a report: per-exchange source/included/omitted counts (with samples of
   equities that had no Angel token) and the snapshot size.

Each instrument is:

```ts
{ exchange, exchangeType, token, symbol, tradingSymbol, name, isin?, type: "EQUITY" }
```

The generated file is large, so it is marked `// @ts-nocheck`; consumers still
see the declared `InstrumentSearchResult[]` type.

### 6.2 Registry (`instruments/registry.ts`)

Built once at module load from the snapshot:

- `instrumentKey(exchange, symbol)` → `"NSE:YESBANK"`.
- `normalize(value)` → lowercase + strip all non-alphanumerics
  (`"Yes Bank"` → `yesbank`, `"M&M"` → `mm`).
- Lookup maps by key and by `exchangeType:token`.
- `search(query, limit)`:
  - Requires ≥ 2 normalized characters.
  - Matches the normalized query as a substring of the normalized `symbol`,
    `tradingSymbol`, or `name`.
  - Ranks: exact symbol > symbol prefix > trading-symbol prefix > name prefix >
    contains; tie-break by symbol then exchange.
  - Caps results (default 20, max 50).
- `resolve(symbol, exchange?)` is NSE-first when no exchange is given.

### 6.3 Exclusions

Derivatives/options/futures, debt, ETFs, and indices are excluded. The universe
is limited to NSE/BSE cash-market equities that have an Angel One token; listed
equities without a token are reported by the sync script and not selectable.

## 7. Angel One integration (`smart-api-provider.ts`)

### 7.1 Authentication

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
`ANGELONE_TOTP_SECRET` (`angelone/totp.ts`: base32-decode + HMAC-SHA1, 30s step,
6 digits). The response yields `jwtToken` and `feedToken`.

### 7.2 Token lifecycle

- Tokens carry an expiry of **the next midnight IST** minus a 60s safety margin.
- `authenticate()` re-logs in when tokens are missing or stale.
- `request()` clears tokens and retries once on auth errors
  (`AG8002`/`AG8003`, HTTP 401, "token expired", "invalid token", "session
  expired").
- A WebSocket auth failure clears tokens so the next reconnect performs a fresh
  login.

### 7.3 Smart Stream V2

- Connects to `ANGELONE_WEBSOCKET_URL` with headers `Authorization: Bearer <jwt>`,
  `x-api-key`, `x-client-code`, `x-feed-token`.
- Subscribes with:

```json
{ "correlationID": "market-watch", "action": 1, "params": { "mode": 2, "tokenList": [{ "exchangeType": 1, "tokens": ["11915"] }] } }
```

- `action: 1` subscribes, `action: 0` unsubscribes; single-token frames are used
  for dynamic watchlist changes, and the full active set is (re)subscribed on
  open/reconnect.
- Sends the text frame `"ping"` every 10 seconds.
- Reconnects with exponential backoff `1s, 2s, 4s, 8s, 16s, 32s, 60s (cap)` and
  resets the attempt counter on a successful open.

### 7.4 Binary frame layout (little-endian)

| Offset | Field | Notes |
| --- | --- | --- |
| 0 | subscription mode | 1 LTP, 2 QUOTE, 3 SNAP_QUOTE, 4 DEPTH |
| 1 | exchange type | 1 NSE_CM, 3 BSE_CM (others unused here) |
| 2–26 | token | 25-byte null-padded ASCII |
| 27–34 | sequence number | int64 |
| 35–42 | exchange timestamp | int64 (ms) |
| 43–50 | last traded price | int64, paise (divide by 100) |
| 51–58 | last traded quantity | QUOTE+ |
| 59–66 | average traded price | QUOTE+ |
| 67–74 | volume traded for the day | QUOTE+ |
| 75– | buy/sell qty, OHLC, … | QUOTE+ |

The parser ignores control/unknown frames (mode outside 1–4) and maps the packet
token back to the instrument via the active-token map.

### 7.5 Telemetry (non-secret)

`logInfo`/`logError` emit structured JSON. Successful events:
`SmartAPI authenticated`, `SmartAPI stream connected` (with `tokens` count),
`SmartAPI first tick` (symbol), `SmartAPI stream closed` (code/reason). Errors:
`SmartAPI WebSocket error`, `SmartAPI WebSocket authentication failed`,
`SmartAPI request failed`. Credentials, TOTP, JWTs, and feed tokens are never
included.

## 8. Subscription model (`subscriptions.ts`)

`SubscriptionRegistry` maintains:

- `defaults`: the 9 always-on instruments.
- `clients`: per-WebSocket-client instrument maps.
- `counts`: global reference count per instrument key.

Transitions call `provider.subscribe(instrument)` at 0→1 and
`provider.unsubscribe(instrument)` at 1→0 (never for defaults). Disconnecting a
client releases all of its instruments. This guarantees one Angel One
subscription per instrument regardless of how many clients watch it, and that
one client's add/remove never affects another's.

## 9. WebSocket handling

`app.ts` upgrades `/ws` via `@fastify/websocket`. Each client gets a random id and
a set of instrument keys. Subscribe/unsubscribe messages accept either
`payload.instruments` (`{ exchange, symbol }`) or the legacy `payload.symbols`.
Ticks are fanned out only to sockets whose set contains the instrument key.

## 10. Market calendar (`calendar.ts`)

Session state is computed in `Asia/Kolkata`: open on weekdays 09:15–15:30 IST
excluding a configured holiday set. `getMarketStatus()` backs
`/api/market-status`, and `isMarketOpen()` gates tick forwarding.

## 11. Persistence (optional)

`apps/backend/migrations/001_market_data.sql` defines:

- `candles` (PK `symbol, exchange, interval, time`) + index on `(symbol, time DESC)`.
- `users`, `watchlists`, `watchlist_items` (per-user watchlists).
- `price_alerts`.

Migrations run at startup when PostgreSQL is enabled. Watchlists in the running
app are currently client-side (`localStorage`); the tables are provisioned for
future server-side accounts.

## 12. Frontend architecture

- `app/page.tsx` — home dashboard: initial quote load for the watchlist, live
  socket subscription, debounced universe search, add/remove watchlist, movers,
  ticker, indices, articles.
- `app/stock/[symbol]/page.tsx` — instrument detail with `?exchange=`, quote,
  range switcher, and candles.
- `lib/api.ts` — REST client and `openMarketSocket` (wraps the reconnecting
  socket, delivering raw `Tick`s).
- `lib/reconnecting-socket.ts` — browser-side WebSocket with exponential backoff,
  resubscribe-on-reconnect, and `subscribe`/`unsubscribe` of
  `{ exchange, symbol }` instruments.
- `lib/instrument-key.ts` — shared `instrumentKey`/`parseExchange` helpers.
- `components/*` — watchlist (with remove), ticker, market cards, chart, nav,
  state messages, article cards.

## 13. Security

- Angel One secrets are read only by the backend and never serialized into
  responses, the committed snapshot, or logs.
- The snapshot contains only public instrument metadata.
- The public API is read-only; CORS is permissive (`origin: true`) which is
  acceptable for public market data. Tighten it before adding user accounts.
