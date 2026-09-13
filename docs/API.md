# API Reference

The backend exposes a read-only REST API and a WebSocket for live ticks. All
payloads are JSON. Base URL is the backend origin (`NEXT_PUBLIC_API_URL`), e.g.
`https://live-stock-dashboard-backend.onrender.com`.

- Content type: `application/json`
- CORS: enabled for all origins (read-only public data)
- Errors: HTTP status + `{ "error": "..." }` for the REST routes, or a JSON body
  from the provider path

---

## REST

### `GET /api/instruments/search`

Search the NSE/BSE cash-equity universe.

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | – | Symbol or company name. Queries shorter than 2 characters return `[]`. |
| `limit` | number | `20` | Clamped to 1–50. |

Matching is case-insensitive and punctuation/space-insensitive
(`"yes bank"`, `"YESBANK"`, and `"Yes Bank"` all match). Both exchanges are
returned separately when a name is dual-listed.

**Request**

```bash
curl "http://localhost:4000/api/instruments/search?q=yes%20bank"
```

**Response `200`**

```json
{
  "query": "yes bank",
  "results": [
    { "exchange": "NSE", "exchangeType": 1, "token": "11915", "symbol": "YESBANK", "tradingSymbol": "YESBANK-EQ", "name": "Yes Bank Limited", "isin": "INE528G01035", "type": "EQUITY" },
    { "exchange": "BSE", "exchangeType": 3, "token": "532648", "symbol": "YESBANK", "tradingSymbol": "YESBANK", "name": "Yes Bank Ltd.", "isin": "INE528G01035", "type": "EQUITY" }
  ]
}
```

Another example — full company name:

```bash
curl "http://localhost:4000/api/instruments/search?q=reliance%20industries"
# → RELIANCE (NSE token 2885) and RELIANCE (BSE token 500325)
```

`InstrumentSearchResult` fields:

| Field | Type | Notes |
| --- | --- | --- |
| `exchange` | `"NSE" \| "BSE"` | |
| `exchangeType` | number | `1` = NSE_CM, `3` = BSE_CM |
| `token` | string | Angel One symbol token |
| `symbol` | string | Base symbol (e.g. `YESBANK`) |
| `tradingSymbol` | string | Angel One trading symbol (e.g. `YESBANK-EQ`) |
| `name` | string | Company name |
| `isin` | string? | ISIN when available |
| `type` | `"EQUITY"` | |

---

### `GET /api/search`

Legacy alias retained for backward compatibility. Returns the older
`SearchResult[]` shape.

```bash
curl "http://localhost:4000/api/search?q=reliance"
```

```json
[ { "symbol": "RELIANCE", "exchange": "NSE", "type": "EQUITY", "name": "Reliance Industries Limited" } ]
```

---

### `GET /api/quote/:symbol`

Latest quote for an instrument.

| Query | Type | Notes |
| --- | --- | --- |
| `exchange` | `NSE` \| `BSE` | Optional. Default: the default-watchlist exchange if `symbol` is a default, otherwise NSE if present, otherwise BSE. |

```bash
curl "http://localhost:4000/api/quote/RELIANCE"
curl "http://localhost:4000/api/quote/YESBANK?exchange=BSE"
```

**Response `200`**

```json
{
  "symbol": "RELIANCE",
  "exchange": "NSE",
  "timestamp": "2026-09-14T04:00:00.000Z",
  "price": 1257.5,
  "open": 1267,
  "high": 1267.4,
  "low": 1253,
  "previousClose": 1274,
  "change": -16.5,
  "changePercent": -1.3,
  "volume": 8777736,
  "dayHigh": 1267.4,
  "dayLow": 1253,
  "week52High": 1611.8,
  "week52Low": 1249.8
}
```

**Response `404`**

```json
{ "error": "Symbol not found" }
```

---

### `GET /api/historical/:symbol`

Historical candles.

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `range` | `1D` \| `1W` \| `1M` \| `1Y` | `1D` | Invalid values → `400`. |
| `exchange` | `NSE` \| `BSE` | resolved | Same resolution as `/api/quote`. |

```bash
curl "http://localhost:4000/api/historical/TCS?range=1M"
```

**Response `200`** — `Candle[]`:

```json
[ { "time": 1757001600, "open": 2185.5, "high": 2232.6, "low": 2185.5, "close": 2200.8, "volume": 2634124 } ]
```

`time` is epoch seconds.

**Response `400`**

```json
{ "error": "Invalid range" }
```

---

### `GET /api/market-status`

Current NSE/BSE session state from the IST calendar.

```json
{ "open": false, "session": "CLOSED", "timestamp": "2026-09-13T10:13:44.495Z" }
```

`session` is `PRE_OPEN` \| `OPEN` \| `CLOSED`; `nextOpen` may be present when a
future open is known.

---

## WebSocket

Connect to `GET /ws` (upgrade). Use `wss://` in production
(`NEXT_PUBLIC_WS_URL`).

### Client → server

Both forms are accepted. The exchange-qualified form is preferred because it is
unambiguous for dual-listed symbols.

```jsonc
// Preferred
{ "version": 1, "type": "subscribe",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
{ "version": 1, "type": "unsubscribe", "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }

// Legacy (resolved NSE-first / via defaults)
{ "version": 1, "type": "subscribe",   "payload": { "symbols": ["TCS"] } }
{ "version": 1, "type": "unsubscribe", "payload": { "symbols": ["TCS"] } }
```

At least one of `symbols` or `instruments` must be present and non-empty.

### Server → client

```jsonc
// Acknowledgement echoing the same form that was sent
{ "version": 1, "type": "subscribed",   "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }
{ "version": 1, "type": "subscribed",   "payload": { "symbols": ["TCS"] } }
{ "version": 1, "type": "unsubscribed", "payload": { "instruments": [{ "exchange": "NSE", "symbol": "YESBANK" }] } }

// Live tick (shape unchanged)
{
  "version": 1,
  "type": "tick",
  "payload": {
    "tick": { "symbol": "YESBANK", "exchange": "NSE", "timestamp": "2026-09-14T04:00:12.345Z", "price": 21.35, "volume": 1023400 }
  }
}

// Application error
{ "version": 1, "type": "error", "payload": { "message": "No instruments requested" } }
```

`type: "status"` messages carry a `MarketStatus` payload when emitted.

### Notes

- Ticks are only pushed during market hours (`Mon–Fri 09:15–15:30 IST`).
- Always key instruments by `exchange` + `symbol`, never by `symbol` alone.
- The server tracks subscriptions per socket and reference-counts Angel One
  subscriptions globally, so duplicate subscriptions across clients are free.

## Type reference

```ts
type Exchange = "NSE" | "BSE";
type HistoricalRange = "1D" | "1W" | "1M" | "1Y";

interface Tick { symbol: string; exchange: Exchange; timestamp: string; price: number; volume: number; }

interface Quote {
  symbol: string; exchange: Exchange; timestamp: string; price: number;
  open: number; high: number; low: number; previousClose: number;
  change: number; changePercent: number; volume: number;
  dayHigh: number; dayLow: number; week52High: number; week52Low: number;
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

interface InstrumentSearchResult {
  exchange: Exchange; exchangeType: number; token: string; symbol: string;
  tradingSymbol: string; name: string; isin?: string; type: "EQUITY";
}

interface WsSubscriptionPayload { symbols?: string[]; instruments?: { exchange: Exchange; symbol: string }[]; }
```

Types are defined in `packages/shared-types/src/index.ts`.
