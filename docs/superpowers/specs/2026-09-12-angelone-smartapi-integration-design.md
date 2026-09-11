# Angel One SmartAPI Integration — Design

Date: 2026-09-12
Status: Approved (pending implementation)

## Summary

Replace the backend's in-memory market-data source with Angel One SmartAPI for
the production path, while keeping the existing REST and WebSocket contracts to
the frontend unchanged. Angel One credentials live only on the backend.

## Goals

- Authenticate to Angel One server-side and obtain the JWT and feed tokens.
- Stream real-time ticks from Angel One Smart Stream V2 (`wss://smartapisocket.angelone.in/smart-stream`).
- Normalize Angel One ticks into the existing `Tick` shape.
- Broadcast through the existing backend `/ws` connection (no frontend contract change).
- Keep the frontend `ReconnectingWebSocket` behavior; add backend-side reconnect to Angel One.
- Provide tests for auth failure, WebSocket failure/reconnect, subscription, and tick normalization.

## Non-goals

- No changes to `apps/web` behavior or its `/ws` message contract.
- No mock/demo data added.
- No order/trading APIs (market data only).
- No changes to the event-bus/quote-store architecture.

## Current architecture and integration seam

- `apps/backend/src/provider.ts` defines `PriceProvider` (`getQuote`, `getHistorical`, `subscribeTicks`).
- `apps/backend/src/app.ts:39` consumes `provider.subscribeTicks(symbols, onTick)` and fans ticks out to the `EventBus` → `QuoteStore` → `/ws` clients and REST reads. Unchanged.
- `apps/backend/src/server.ts:16` currently calls `createApp(undefined, …)`, which selects the default `MockPriceProvider`. This is the only selection point to change.
- `apps/backend/src/smart-api-provider.ts` contains a partial `SmartAPIPriceProvider` (auth + REST quote/historical + a WS loop) that is not wired in and has correctness gaps.

## Configuration (server-side only)

Required when `MARKET_DATA_PROVIDER=angelone`:

| Variable | Purpose |
| --- | --- |
| `MARKET_DATA_PROVIDER` | `angelone` enables the SmartAPI provider; anything else keeps `MockPriceProvider`. |
| `ANGELONE_API_KEY` | SmartAPI API key (`X-PrivateKey`). |
| `ANGELONE_CLIENT_CODE` | Angel One client code. |
| `ANGELONE_PASSWORD` | Account MPIN/PIN (sent as `password`). |
| `ANGELONE_TOTP_SECRET` | Base32 TOTP secret (from the TOTP QR), used to generate the 6-digit code. |

Optional with defaults: `ANGELONE_MAC_ADDRESS` (`X-MACAddress`),
`ANGELONE_CLIENT_LOCAL_IP` (`X-ClientLocalIP`), `ANGELONE_CLIENT_PUBLIC_IP`
(`X-ClientPublicIP`) — placeholder defaults, only needed if the Angel One app
requires them; `ANGELONE_BASE_URL` (`https://apiconnect.angelone.in`),
`ANGELONE_WEBSOCKET_URL` (`wss://smartapisocket.angelone.in/smart-stream`),
`ANGELONE_SUBSCRIPTION_MODE` (`2` = QUOTE).

None of these are exposed via `NEXT_PUBLIC_*` or the browser.

## Authentication

- `POST {ANGELONE_BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`.
- Headers: `Content-Type`, `Accept`, `X-UserType: USER`, `X-SourceID: WEB`,
  `X-ClientLocalIP`, `X-ClientPublicIP`, `X-MACAddress`, `X-PrivateKey`.
- Body: `{ clientcode, password, totp }`.
- Generate `totp` server-side from `ANGELONE_TOTP_SECRET` (HMAC-SHA1, 30s step,
  6 digits) using a small `node:crypto` helper — no new dependency.
- Parse `data.jwtToken` / `data.feedToken`. Sessions last until midnight IST; on
  an auth/expiry error, re-authenticate and retry once.

## Instrument token mapping

The 9 catalog instruments map to `{ symbolToken, exchangeType }`.

- Source of truth: Angel One's official instrument master
  `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`.
- A repo seed script resolves each catalog symbol to its token/segment and writes
  a committed static map (`angelone-instruments.json`). Tokens are never guessed.
- `exchangeType`: NSE cash/index `1`, BSE cash/index `3`.
- `ANGELONE_SYMBOL_TOKENS` may override entries at deploy time.

## Real-time feed — Smart Stream V2

- Connect to `ANGELONE_WEBSOCKET_URL` with headers `Authorization: Bearer <jwt>`,
  `x-api-key`, `x-client-code`, `x-feed-token`.
- Subscribe: `{ correlationID, action: 1, params: { mode: 2, tokenList: [{ exchangeType, tokens: [...] }] } }`.
- Heartbeat: send the text frame `"ping"` every 10s.
- Binary frame (little-endian): mode@0, exchangeType@1, token@2–27 (null-padded
  ASCII), sequence@27, exchangeTimestamp@35, LTP@43 (int64, paise). In QUOTE mode
  additionally: lastTradedQty@51, avgPrice@59, volume@67, buyQty@75, sellQty@83,
  open@91, high@99, low@107, close@115.
- **Map the token inside each packet to its catalog symbol** (the current code
  incorrectly attributes every packet to the first symbol).
- Ignore control/unknown frames (mode 0) without throwing.

## Tick normalization

Angel One packet → existing `Tick`:

- `symbol` from token map
- `exchange` `"NSE" | "BSE"` from catalog
- `timestamp` from `exchangeTimestamp` (ms epoch)
- `price` = LTP / 100
- `volume` = volume traded for the day

The `EventBus`/`QuoteStore`/`/ws` path is untouched, so the frontend receives the
same message shape.

## Reconnect and heartbeat

- Provider owns a reconnect loop: exponential backoff `1s → 2s → 4s → 8s → 16s → 32s → 60s` (cap), reset on successful open.
- Re-subscribe to all catalog tokens on every open.
- 10s heartbeat `"ping"`.
- This is independent of the frontend `ReconnectingWebSocket`, which remains as
  the browser-side recovery for the backend `/ws` connection.

## Provider selection and wiring

- `server.ts` builds the provider from config: `angelone` → `SmartAPIPriceProvider`,
  otherwise `MockPriceProvider` (test/local fallback).
- `app.ts`, `shared-types`, and the web app are unchanged.

## Static-IP requirement (verified)

Angel One's official guidance: a whitelisted static IP is mandatory **only for
Order and GTT APIs** (SEBI algorithmic-trading rules). For APIs other than Orders
& GTT, a static IP is not mandatory. This integration uses login, REST market
data, and the WebSocket feed only — no order/GTT APIs — so no static IP, Render
Dedicated IP, or proxy is required.

`ANGELONE_CLIENT_LOCAL_IP`, `ANGELONE_CLIENT_PUBLIC_IP`, and `ANGELONE_MAC_ADDRESS`
remain supported as optional server-side header overrides with placeholder
defaults; they are only needed if an Angel One app specifically requires them.

## Security

- Credentials, TOTP secret, JWT, and feed token never leave the backend.
- Logs never include tokens or the TOTP secret.

## Testing

- Auth failure: invalid login response → provider rejects; no secret in logs.
- Subscription: open event produces the correct `mode`/`exchangeType`/`tokens` payload.
- Normalization: QUOTE binary fixture → correct symbol/token/price/volume; LTP fixture; malformed frame ignored.
- Reconnect: forced drop → backoff schedule → re-subscribe on reopen.
- Token map: NSE equity and BSE index resolve from the committed map.
- Existing suite (backend + web + shared-types) stays green.

## Rollout

1. Ship code with `MARKET_DATA_PROVIDER` unset (mock) so nothing changes by default.
2. Set Angel One env vars on Render and switch `MARKET_DATA_PROVIDER=angelone`.
3. Verify `/api/market-status`, `/api/quote/RELIANCE`, and `/ws` ticks during market hours.

## Out of scope

- Frontend changes, trading/order APIs, historical-candle storage changes, and
  unrelated refactors.
