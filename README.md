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
