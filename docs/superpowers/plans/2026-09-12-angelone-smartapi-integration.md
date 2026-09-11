# Angel One SmartAPI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream real Angel One SmartAPI market data through the existing backend `/ws` and REST contracts, with credentials kept server-side.

**Architecture:** A config-selected `SmartAPIPriceProvider` implements the existing `PriceProvider` interface. It authenticates with `loginByPassword`, connects to Smart Stream V2 with heartbeat + exponential-backoff reconnect, parses binary frames and maps tokens to catalog symbols, and emits the existing `Tick` shape. `app.ts`, the event bus, the quote store, and the web app are untouched.

**Tech Stack:** Node 22, TypeScript (ESM), Fastify, `ws`, Vitest, `node:crypto`.

## Global Constraints

- All Angel One credentials/config are server-side env only; never in `NEXT_PUBLIC_*`.
- Keep exactly 9 instruments: RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, HINDUNILVR, SBIN, NIFTY50, SENSEX.
- WebSocket subscription mode = 2 (QUOTE).
- Reconnect backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s cap.
- Heartbeat: send `"ping"` every 10s.
- `MockPriceProvider` stays as local/test fallback; Angel One only when `MARKET_DATA_PROVIDER=angelone`.
- Instrument tokens come from Angel One's official instrument master; never guessed.
- No frontend changes; no mock/demo data; no unrelated refactors.

---

### Task 1: TOTP generator

**Files:**
- Create: `apps/backend/src/angelone/totp.ts`
- Test: `apps/backend/src/angelone/totp.test.ts`

**Interfaces:**
- Produces: `generateTotp(secret: string, now?: number, digits?: number, step?: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { generateTotp } from "./totp.js";

describe("generateTotp", () => {
  it("matches the RFC 6238 SHA-1 vector for 6 digits", () => {
    // base32 of "12345678901234567890"
    expect(generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });

  it("rejects an invalid base32 secret", () => {
    expect(() => generateTotp("not-base32!", 59_000)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/angelone/totp.test.ts`
Expected: FAIL — cannot find module `./totp.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character in TOTP secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, now = Date.now(), digits = 6, step = 30): string {
  const counter = Math.floor(now / 1000 / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/angelone/totp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/angelone/totp.ts apps/backend/src/angelone/totp.test.ts
git commit -m "feat(angelone): add TOTP generator"
```

---

### Task 2: Binary stream frame parser

**Files:**
- Create: `apps/backend/src/angelone/stream-parser.ts`
- Test: `apps/backend/src/angelone/stream-parser.test.ts`

**Interfaces:**
- Produces:
  - `interface ParsedFrame { token: string; exchangeType: number; mode: number; timestamp: number; price: number; volume: number }`
  - `parseStreamFrame(data: Buffer): ParsedFrame | undefined`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseStreamFrame } from "./stream-parser.js";

function quoteFrame(token: string, ltpPaise: number, volume: number): Buffer {
  const buffer = Buffer.alloc(123);
  buffer.writeUInt8(2, 0);       // QUOTE mode
  buffer.writeUInt8(1, 1);       // NSE_CM
  buffer.write(token, 2, "ascii");
  buffer.writeBigInt64LE(1n, 27);            // sequence
  buffer.writeBigInt64LE(1_700_000_000_000n, 35); // timestamp
  buffer.writeBigInt64LE(BigInt(ltpPaise), 43);
  buffer.writeBigInt64LE(50n, 51);           // last traded qty
  buffer.writeBigInt64LE(0n, 59);            // avg
  buffer.writeBigInt64LE(BigInt(volume), 67);
  return buffer;
}

describe("parseStreamFrame", () => {
  it("parses a QUOTE frame and normalizes price from paise", () => {
    const frame = parseStreamFrame(quoteFrame("2885", 142_083, 1_234_000));
    expect(frame).toMatchObject({ token: "2885", exchangeType: 1, mode: 2, timestamp: 1_700_000_000_000, price: 1420.83, volume: 1_234_000 });
  });

  it("returns undefined for control/unknown frames", () => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(0, 0);
    expect(parseStreamFrame(buffer)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/angelone/stream-parser.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface ParsedFrame {
  token: string;
  exchangeType: number;
  mode: number;
  timestamp: number;
  price: number;
  volume: number;
}

export function parseStreamFrame(data: Buffer): ParsedFrame | undefined {
  if (data.length < 51) return undefined;
  const mode = data.readUInt8(0);
  if (mode < 1 || mode > 4) return undefined;
  const exchangeType = data.readUInt8(1);
  const token = data.subarray(2, 27).toString("ascii").replace(/\0.*$/, "").trim();
  const timestamp = Number(data.readBigInt64LE(35));
  const price = Number(data.readBigInt64LE(43)) / 100;
  if (data.length < 75 || mode === 1) return { token, exchangeType, mode, timestamp, price, volume: 0 };
  const volume = Number(data.readBigInt64LE(67));
  return { token, exchangeType, mode, timestamp, price, volume };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/angelone/stream-parser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/angelone/stream-parser.ts apps/backend/src/angelone/stream-parser.test.ts
git commit -m "feat(angelone): parse Smart Stream V2 binary frames"
```

---

### Task 3: Instrument token map from the official master

**Files:**
- Create: `apps/backend/src/angelone/instruments.generated.ts`
- Create: `apps/backend/src/angelone/instruments.ts`
- Create: `apps/backend/scripts/resolve-angelone-tokens.mjs`
- Test: `apps/backend/src/angelone/instruments.test.ts`

**Interfaces:**
- Consumes: catalog symbols from `../../catalog.js`.
- Produces:
  - `interface AngelInstrument { token: string; exchangeType: number; exchange: "NSE" | "BSE" }`
  - `angelInstruments: Record<string, AngelInstrument>` (committed, generated)
  - `resolveAngelInstruments(overrides?: Record<string, Partial<AngelInstrument>>): Record<string, AngelInstrument>`
  - `tokenToSymbol(instruments: Record<string, AngelInstrument>): Record<string, string>`

- [ ] **Step 1: Write the seed script**

`apps/backend/scripts/resolve-angelone-tokens.mjs`:
```js
import { writeFileSync } from "node:fs";

const MASTER = process.env.ANGELONE_MASTER_URL ?? "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const WANTED = {
  RELIANCE: { symbol: "RELIANCE-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  TCS: { symbol: "TCS-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  HDFCBANK: { symbol: "HDFCBANK-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  INFY: { symbol: "INFY-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  ICICIBANK: { symbol: "ICICIBANK-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  HINDUNILVR: { symbol: "HINDUNILVR-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  SBIN: { symbol: "SBIN-EQ", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  NIFTY50: { symbol: "Nifty 50", exch: "NSE", exchangeType: 1, exchange: "NSE" },
  SENSEX: { symbol: "SENSEX", exch: "BSE", exchangeType: 3, exchange: "BSE" }
};

const response = await fetch(MASTER);
if (!response.ok) throw new Error(`Instrument master ${response.status}`);
const rows = await response.json();
const out = {};
for (const [catalog, spec] of Object.entries(WANTED)) {
  const row = rows.find((r) => r.exch_seg === spec.exch && r.symbol === spec.symbol);
  if (!row) throw new Error(`Token not found for ${catalog} (${spec.symbol})`);
  out[catalog] = { token: String(row.token), exchangeType: spec.exchangeType, exchange: spec.exchange };
}
const body = `// GENERATED by scripts/resolve-angelone-tokens.mjs — do not edit by hand.\nimport type { AngelInstrument } from "./instruments.js";\n\nexport const angelInstruments: Record<string, AngelInstrument> = ${JSON.stringify(out, null, 2)};\n`;
writeFileSync(new URL("../src/angelone/instruments.generated.ts", import.meta.url), body);
console.log(`Wrote ${Object.keys(out).length} instruments`);
```

- [ ] **Step 2: Run the seed script**

Run: `node apps/backend/scripts/resolve-angelone-tokens.mjs`
Expected: `Wrote 9 instruments` and `instruments.generated.ts` contains non-empty tokens (NIFTY50 = `99926000`).

- [ ] **Step 3: Write the loader test**

```ts
import { describe, expect, it } from "vitest";
import { instruments } from "../catalog.js";
import { angelInstruments, resolveAngelInstruments, tokenToSymbol } from "./instruments.js";

describe("angel instruments", () => {
  it("maps every catalog symbol", () => {
    for (const instrument of instruments) expect(angelInstruments[instrument.symbol]).toBeDefined();
  });

  it("applies overrides", () => {
    const resolved = resolveAngelInstruments({ TCS: { token: "999" } });
    expect(resolved.TCS.token).toBe("999");
    expect(resolved.RELIANCE.token).toBe(angelInstruments.RELIANCE!.token);
  });

  it("builds a reverse token map", () => {
    expect(tokenToSymbol(angelInstruments)[angelInstruments.RELIANCE!.token]).toBe("RELIANCE");
  });
});
```

- [ ] **Step 4: Write the loader implementation**

```ts
import { instruments } from "../catalog.js";
import { angelInstruments as generated } from "./instruments.generated.js";

export interface AngelInstrument {
  token: string;
  exchangeType: number;
  exchange: "NSE" | "BSE";
}

export const angelInstruments: Record<string, AngelInstrument> = generated;

export function resolveAngelInstruments(overrides: Record<string, Partial<AngelInstrument>> = {}) {
  const resolved: Record<string, AngelInstrument> = {};
  for (const instrument of instruments) {
    const base = generated[instrument.symbol];
    if (!base) throw new Error(`Missing Angel One token for ${instrument.symbol}`);
    resolved[instrument.symbol] = { ...base, ...overrides[instrument.symbol] };
  }
  return resolved;
}

export function tokenToSymbol(instruments: Record<string, AngelInstrument>) {
  const map: Record<string, string> = {};
  for (const [symbol, value] of Object.entries(instruments)) map[value.token] = symbol;
  return map;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/angelone/instruments.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/angelone/instruments.ts apps/backend/src/angelone/instruments.generated.ts apps/backend/src/angelone/instruments.test.ts apps/backend/scripts/resolve-angelone-tokens.mjs
git commit -m "feat(angelone): resolve instrument tokens from the official master"
```

---

### Task 4: Config for Angel One and provider selection

**Files:**
- Modify: `apps/backend/src/config.ts`
- Modify: `apps/backend/src/config.test.ts`
- Modify: `apps/backend/.env.example` (or root `.env.example` if that is the canonical one — verify first)

**Interfaces:**
- Produces: `BackendConfig` gains `marketDataProvider: "mock" | "angelone"` and `angelone?: AngelOneConfig` where
  `AngelOneConfig = { apiKey, clientCode, password, totpSecret, macAddress, clientLocalIp, clientPublicIp, baseUrl, websocketUrl, subscriptionMode }`.

- [ ] **Step 1: Write failing tests**

```ts
it("selects the angelone provider and requires its settings when enabled", () => {
  const config = loadConfig({ MARKET_DATA_PROVIDER: "angelone", ANGELONE_API_KEY: "k", ANGELONE_CLIENT_CODE: "c", ANGELONE_PASSWORD: "p", ANGELONE_TOTP_SECRET: "s", ANGELONE_MAC_ADDRESS: "m", ANGELONE_CLIENT_LOCAL_IP: "1.1.1.1", ANGELONE_CLIENT_PUBLIC_IP: "2.2.2.2" });
  expect(config.marketDataProvider).toBe("angelone");
  expect(config.angelone).toMatchObject({ apiKey: "k", clientCode: "c", subscriptionMode: 2 });
});

it("throws when angelone is selected without credentials", () => {
  expect(() => loadConfig({ MARKET_DATA_PROVIDER: "angelone" })).toThrow(/ANGELONE_/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `BackendConfig`:
```ts
marketDataProvider: "mock" | "angelone";
angelone?: {
  apiKey: string; clientCode: string; password: string; totpSecret: string;
  macAddress: string; clientLocalIp: string; clientPublicIp: string;
  baseUrl: string; websocketUrl: string; subscriptionMode: 1 | 2 | 3;
};
```
In `loadConfig`, read `MARKET_DATA_PROVIDER` (default `"mock"`). When `"angelone"`, require the seven required `ANGELONE_*` vars via a `required(name, value)` helper and build `angelone` with defaults:
`baseUrl ?? "https://apiconnect.angelone.in"`, `websocketUrl ?? "wss://smartapisocket.angelone.in/smart-stream"`, `subscriptionMode ?? 2`.

- [ ] **Step 4: Add the new variables to `.env.example`** (server-side only; no `NEXT_PUBLIC_*`).

- [ ] **Step 5: Run tests**

Run: `corepack pnpm --filter @market-watch/backend exec vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/config.ts apps/backend/src/config.test.ts .env.example
git commit -m "feat(angelone): add server-side provider config"
```

---

### Task 5: Rewrite `SmartAPIPriceProvider`

**Files:**
- Modify: `apps/backend/src/smart-api-provider.ts`
- Modify: `apps/backend/src/smart-api-provider.test.ts`

**Interfaces:**
- Consumes: `generateTotp`, `parseStreamFrame`, `resolveAngelInstruments`, `tokenToSymbol`, `AngelOneConfig`, `PriceProvider`.
- Produces: `SmartAPIPriceProvider` with `subscribeTicks(symbols, onTick)` that heartbeats, reconnects with backoff, and re-subscribes.

- [ ] **Step 1: Extend tests** — auth failure, subscribe payload, reconnect + resubscribe:

```ts
it("fails loudly when authentication is rejected", async () => {
  const provider = new SmartAPIPriceProvider(config, { request: async () => ({ status: false, message: "Invalid totp" }) as any });
  await expect(provider.subscribeTicks(["TCS"], () => {}) as any);
});

it("subscribes with mode 2 and the instrument token, then resubscribes after a drop", async () => {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  const provider = new SmartAPIPriceProvider(config, httpOk, () => { const s = new FakeSocket(); sockets.push(s); return s; });
  const ticks: Tick[] = [];
  provider.subscribeTicks(["TCS"], (t) => ticks.push(t));
  await vi.runOnlyPendingTimersAsync();
  sockets[0]!.open();
  expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({ action: 1, params: { mode: 2, tokenList: [{ exchangeType: 1, tokens: ["11536"] }] } });
  sockets[0]!.drop();
  await vi.advanceTimersByTimeAsync(1000);
  sockets[1]!.open();
  expect(sockets[1]!.sent.some((m) => m.includes("11536"))).toBe(true);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify failure** — `vitest run src/smart-api-provider.test.ts`.

- [ ] **Step 3: Implement** with:
  - `authenticate()` using `generateTotp(config.totpSecret)` and the full header set; caches `jwtToken`/`feedToken`; retries once on 401.
  - `getQuote` / `getHistorical` unchanged in behavior (keep `mapQuoteResponse`, `mapCandleRows`).
  - `subscribeTicks`: build `{ resolveAngelInstruments(overrides), tokenToSymbol }`; connect with headers; on `open` send one subscribe per `exchangeType` group, start 10s `"ping"`; on `message` use `parseStreamFrame` → map token→symbol → `onTick`; on `error`/`close` clear heartbeat and schedule `min(60000, 1000 * 2 ** attempt)`; reset `attempt` on open. Return a closer that clears timers and closes the socket.
  - Remove the old `decodeBinaryTick` and the "first symbol" attribution.

- [ ] **Step 4: Run tests** — `vitest run src/smart-api-provider.test.ts` (existing + new pass).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/smart-api-provider.ts apps/backend/src/smart-api-provider.test.ts
git commit -m "feat(angelone): harden provider auth, streaming, heartbeat, reconnect"
```

---

### Task 6: Wire provider selection into the server

**Files:**
- Modify: `apps/backend/src/server.ts`

**Interfaces:**
- Consumes: `loadConfig().marketDataProvider` / `.angelone`, `SmartAPIPriceProvider`, `MockPriceProvider`.

- [ ] **Step 1: Implement selection**

```ts
const provider = config.marketDataProvider === "angelone" && config.angelone ? new SmartAPIPriceProvider(config.angelone) : undefined;
const app = await createApp(provider, { quoteStore, eventBus });
```
Log the selected provider (name only, no secrets).

- [ ] **Step 2: Typecheck + build + full backend test**

Run: `corepack pnpm --filter @market-watch/backend build && corepack pnpm --filter @market-watch/backend test`
Expected: PASS.

- [ ] **Step 3: Local smoke test with mock (unchanged behavior)**

Run the built server with `MARKET_DATA_PROVIDER` unset and hit `/api/market-status`.
Expected: `200`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/server.ts
git commit -m "feat(angelone): select provider from configuration"
```

---

### Task 7: Docs and full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document env vars and note that a static IP is not required for market data** (Angel One mandates it only for Order/GTT APIs; the login, REST market data, and WebSocket paths work without one).

- [ ] **Step 2: Full verification**

Run: `corepack pnpm -r typecheck && corepack pnpm -r test`
Expected: PASS (backend + web + shared-types).

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: Angel One SmartAPI configuration and Render IP requirement"
git push origin master
```

---

## Self-Review

- Spec coverage: auth (Task 5), TOTP (Task 1), tokens from master (Task 3), WS V2 QUOTE + heartbeat + reconnect (Tasks 2, 5), normalization token→symbol (Tasks 2, 5), config/selection (Tasks 4, 6), security (server-side env only, Tasks 4, 6), tests (Tasks 1–5).
- Placeholder scan: no TBD/TODO; each code step shows code.
- Type consistency: `AngelInstrument`, `ParsedFrame`, `generateTotp`, `resolveAngelInstruments`, `tokenToSymbol`, and `AngelOneConfig` names are consistent across tasks.
