# Market Watch

Read-only NSE/BSE market tracker built with a TypeScript monorepo.

## Run locally

```bash
npx pnpm@9.15.0 install
$env:FORCE_MARKET_OPEN="true"
npx pnpm@9.15.0 dev
```

Open `http://localhost:3000`. The backend runs on `http://localhost:4000`.

`FORCE_MARKET_OPEN=true` is a development-only ingestion override. It bypasses the tick gate without changing the IST calendar logic. The backend rejects it when `NODE_ENV=production`.

## Checks

```bash
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 test
npx pnpm@9.15.0 build
```

## Docker-backed infrastructure

Start Redis and PostgreSQL from the project root:

```powershell
docker compose up -d
$env:REDIS_ENABLED="true"
$env:REDIS_URL="redis://localhost:6379"
$env:POSTGRES_ENABLED="true"
$env:DATABASE_URL="postgresql://market_watch:market_watch@localhost:5432/market_watch"
$env:FORCE_MARKET_OPEN="true"
npx pnpm@9.15.0 dev
```

The backend validates enabled connection URLs at startup, runs the candle migration against PostgreSQL, and uses Redis for quote snapshots and per-symbol tick channels. The mock provider remains active.

Stop the services with:

```powershell
docker compose down
```

The first slice remains available with `REDIS_ENABLED=false` and `POSTGRES_ENABLED=false` for in-memory development and unit tests.

## Deploy

The app is split across two platforms: the Next.js frontend on Vercel, and the
Fastify backend on a host that supports long-lived servers and WebSockets
(Render, Railway, Fly.io, or any Docker host). Vercel Functions cannot run the
backend — it calls `app.listen` and keeps WebSocket connections open, which is
why deploying `apps/backend` to Vercel crashes with `FUNCTION_INVOCATION_FAILED`.

### Backend (Render / Docker)

The repository ships a `Dockerfile` and a `render.yaml` blueprint.

On Render:
1. New → Blueprint → connect this repository. Render reads `render.yaml`.
2. Wait for the service to go live and copy its URL, e.g. `https://live-stock-dashboard-backend.onrender.com`.
3. The health check is `/api/market-status`.

On any other Docker host:
```bash
docker build -t market-watch-backend .
docker run -p 4000:4000 -e NODE_ENV=production -e REDIS_ENABLED=false -e POSTGRES_ENABLED=false market-watch-backend
```

The default in-memory mode keeps prices on the single instance. To persist
snapshots and candles, set `REDIS_ENABLED=true` / `REDIS_URL` and
`POSTGRES_ENABLED=true` / `DATABASE_URL` to managed services. `FORCE_MARKET_OPEN`
is rejected when `NODE_ENV=production`, so live ticks only stream during IST
market hours.

### Frontend (Vercel)

1. Import this repository at vercel.com/new.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and installs the
   pnpm workspace from the repository root.
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = backend URL, e.g. `https://live-stock-dashboard-backend.onrender.com`
   - `NEXT_PUBLIC_WS_URL` = backend WebSocket URL, e.g. `wss://live-stock-dashboard-backend.onrender.com/ws`
4. Deploy.

If you already created a Vercel project with Root Directory `apps/backend`, change
it to `apps/web` (or delete it and create a new project). The backend must not be
deployed to Vercel.

### Live market data (Angel One SmartAPI)

By default the backend uses an in-memory mock provider. Set
`MARKET_DATA_PROVIDER=angelone` to stream real NSE/BSE data via Angel One
SmartAPI WebSocket 2.0. All Angel One settings are **server-side only** — never
give them a `NEXT_PUBLIC_` prefix.

Required environment variables when `MARKET_DATA_PROVIDER=angelone` (set on Render):

- `MARKET_DATA_PROVIDER=angelone`
- `ANGELONE_API_KEY` — SmartAPI API key
- `ANGELONE_CLIENT_CODE`
- `ANGELONE_PASSWORD` — account MPIN
- `ANGELONE_TOTP_SECRET` — base32 TOTP secret (from the authenticator QR code)

Optional login headers: `ANGELONE_MAC_ADDRESS`, `ANGELONE_CLIENT_LOCAL_IP`,
`ANGELONE_CLIENT_PUBLIC_IP`. Per Angel One's official guidance, a whitelisted
static IP is mandatory **only for Order and GTT APIs**; login, REST market data,
and the WebSocket feed work without one, so no static IP or proxy is needed for
this integration. These headers default to placeholder values and only need real
values if your Angel One app requires them.

Optional: `ANGELONE_BASE_URL`, `ANGELONE_WEBSOCKET_URL`, `ANGELONE_SUBSCRIPTION_MODE`
(1 LTP / 2 QUOTE / 3 SNAP_QUOTE; default 2).

Instrument tokens are generated from Angel One's official instrument master:

```bash
node apps/backend/scripts/resolve-angelone-tokens.mjs
```

This writes `apps/backend/src/angelone/instruments.generated.ts`. Re-run it when
tokens change.
