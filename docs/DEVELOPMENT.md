# Development Guide

## Prerequisites

- **Node.js 22+** (the repo is developed on Node 24)
- **pnpm 9.15** via Corepack
- **Docker** (optional, for local Redis/PostgreSQL)
- Git

Enable Corepack so the `packageManager` field is honoured:

```bash
corepack enable
pnpm --version   # 9.15.0
```

If `corepack enable` fails with `EPERM` on Windows, prefix commands with
`corepack` instead, e.g. `corepack pnpm install`.

## Install & run

```bash
corepack pnpm install
corepack pnpm dev
```

- Frontend → http://localhost:3000
- Backend → http://localhost:4000

`pnpm dev` runs each workspace's `dev` script in parallel. The backend uses the
in-memory mock provider and in-memory event bus/quote store by default, so no
external services are required for basic UI work.

### Docker-backed infrastructure

```bash
docker compose up -d
```

Then export (PowerShell examples):

```powershell
$env:REDIS_ENABLED="true";   $env:REDIS_URL="redis://localhost:6379"
$env:POSTGRES_ENABLED="true"; $env:DATABASE_URL="postgresql://market_watch:market_watch@localhost:5432/market_watch"
$env:FORCE_MARKET_OPEN="true"   # dev-only: bypass the market-hours gate
corepack pnpm dev
```

`FORCE_MARKET_OPEN` is rejected when `NODE_ENV=production`.

## Workspace scripts

| Location | Command | Purpose |
| --- | --- | --- |
| root | `dev` | Run web + backend dev servers. |
| root | `build` | Build all workspaces (recursive). |
| root | `typecheck` | Typecheck all workspaces. |
| root | `test` | Run all unit suites. |
| backend | `dev` / `build` / `start` | `tsx watch` / `tsc` / `node dist/server.js`. |
| backend | `sync:instruments` | Regenerate the equity snapshot. |
| backend | `typecheck` / `test` | `tsc --noEmit` / Vitest. |
| web | `dev` / `build` | `next dev` / `next build`. |
| web | `typecheck` / `test` | `tsc --noEmit` / Vitest. |
| shared-types | `build` / `typecheck` / `test` | Package checks. |

## Testing

Unit tests use **Vitest**:

```bash
corepack pnpm -r typecheck
corepack pnpm -r test

# A single file
corepack pnpm --filter @market-watch/backend exec vitest run src/instruments/registry.test.ts
corepack pnpm --filter @market-watch/web exec vitest run lib/reconnecting-socket.test.ts
```

End-to-end tests use **Playwright** (`apps/web/e2e`). They expect the app to be
reachable; start the backend and frontend first (or let the Playwright `webServer`
config boot them).

```bash
corepack pnpm --filter @market-watch/web exec playwright test
```

What the suites cover:

- **Backend:** config validation, calendar, catalog, provider (mock), TOTP,
  binary stream parsing, angelone instrument mapping, search registry,
  subscription ref-counting, app routes + WebSocket, token lifecycle/telemetry.
- **Web:** reconnecting socket (backoff, resubscribe, unsubscribe).
- **Shared-types:** protocol/type smoke tests.
- **E2E:** empty search state, invalid symbol, market-closed messaging, offline
  state, dark mode persistence, article rendering.

## Instrument snapshot

The searchable universe is generated, not hand-maintained:

```bash
corepack pnpm --filter @market-watch/backend sync:instruments
```

This fetches NSE `EQUITY_L.csv`, the BSE `ListofScripData` endpoint, and the
Angel One instrument master, reconciles them, writes
`apps/backend/src/instruments/instruments.generated.ts`, and prints a report
(included/omitted counts + size). Commit the regenerated file. Equities without
an Angel One token are reported, not silently dropped.

## Project conventions

- **TypeScript everywhere;** `strict` + `noUncheckedIndexedAccess`.
- **ESM** backend (`"type": "module"`), relative imports use `.js` specifiers.
- **`exchange:symbol`** is the canonical instrument identity — use
  `instrumentKey()` (backend `instruments/registry.ts`, web
  `lib/instrument-key.ts`).
- **No secrets in logs** — use `logInfo`/`logError` and never include
  credentials, TOTP, JWT, or feed tokens.
- **No mock data in production** — `MockPriceProvider` is a dev/test fallback;
  production sets `MARKET_DATA_PROVIDER=angelone`.
- Keep files focused; wire types live in `packages/shared-types`.

### Adding a REST route

Add it in `app.ts`, resolve instruments through the registry
(`resolveRegistry`) with an optional `exchange`, and return shared types. Add a
Vitest case in `app.test.ts` using `app.inject(...)`.

### Adding an instrument type

Extend the sync filter in `scripts/sync-instruments.mjs`, adjust the registry if
needed, and update `InstrumentSearchResult` in `packages/shared-types`. Keep the
universe limited to what can actually be subscribed.

## Common issues

| Problem | Cause | Fix |
| --- | --- | --- |
| `pnpm` not found | Corepack shims not installed | Use `corepack pnpm ...` or `corepack enable` as admin. |
| Type errors on `instruments.generated.ts` | Snapshot not regenerated after schema change | Re-run `sync:instruments`. |
| `node_modules` points at another project | Copied workspace | Delete `node_modules` in root + workspaces and re-install. |
| Docker build fails at `docker info` | Docker daemon not running | Start Docker Desktop. |
| Tests hang on WebSocket cases | A server was not closed | Ensure `await app.close()` in tests. |

## Commit conventions

Commits are scoped and descriptive, e.g. `feat(instruments): ...`,
`feat(angelone): ...`, `fix(...)`, `docs: ...`. Include tests with behavior
changes and run `typecheck` + `test` before pushing.
