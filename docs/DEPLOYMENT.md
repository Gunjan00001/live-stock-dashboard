# Deployment Guide

Market Watch ships as two deployments:

| Tier | Platform | Why |
| --- | --- | --- |
| Frontend (`apps/web`) | **Vercel** | Static/Next.js hosting and CDN. |
| Backend (`apps/backend`) | **Render** (Docker) or any persistent Docker host | It runs a long-lived HTTP + WebSocket server and holds provider connections. |

> Vercel serverless functions cannot host this backend: it calls `app.listen`,
> keeps WebSocket connections open, and holds an Angel One feed session.

---

## 1. What you need

- GitHub repository access.
- A Render account (Blueprint/`render.yaml` supported) or another Docker host.
- A Vercel account.
- Angel One SmartAPI credentials (for live production data):
  `API key`, `client code`, `MPIN`, and the base32 `TOTP secret`.

## 2. Backend on Render (Blueprint)

The repository includes `render.yaml`:

```yaml
services:
  - type: web
    name: live-stock-dashboard-backend
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /api/market-status
    envVars:
      - key: NODE_ENV
        value: production
      - key: REDIS_ENABLED
        value: "false"
      - key: POSTGRES_ENABLED
        value: "false"
```

Steps:

1. Render Dashboard → **New +** → **Blueprint**.
2. Connect the repository and branch (`master`). Render reads `render.yaml`.
3. Apply. Render builds `Dockerfile` and starts `node dist/server.js`.
4. Wait for **Live**, then copy the service URL, e.g.
   `https://live-stock-dashboard-backend.onrender.com`.
5. Verify: `GET https://<backend>/api/market-status` returns `200`.

Do **not** set `PORT` in the Render dashboard; Render injects `PORT` and the app
reads it (`config.ts`).

### Environment variables (Render)

Minimum for the mock provider (no live data):

```
NODE_ENV=production
REDIS_ENABLED=false
POSTGRES_ENABLED=false
```

Live Angel One data:

```
MARKET_DATA_PROVIDER=angelone
ANGELONE_API_KEY=...
ANGELONE_CLIENT_CODE=...
ANGELONE_PASSWORD=...          # account MPIN
ANGELONE_TOTP_SECRET=...       # base32 secret from the authenticator QR
```

Optional (only if your Angel One app requires them):

```
ANGELONE_MAC_ADDRESS=...
ANGELONE_CLIENT_LOCAL_IP=...
ANGELONE_CLIENT_PUBLIC_IP=...
ANGELONE_BASE_URL=https://apiconnect.angelone.in
ANGELONE_WEBSOCKET_URL=wss://smartapisocket.angelone.in/smart-stream
ANGELONE_SUBSCRIPTION_MODE=2
```

Do **not** set `FORCE_MARKET_OPEN` in production; it is rejected at startup.

When any required `ANGELONE_*` variable is missing with
`MARKET_DATA_PROVIDER=angelone`, the process fails fast with a clear error.

### Optional Redis / PostgreSQL

For horizontally consistent state and candle storage, provision managed Redis
and PostgreSQL and set:

```
REDIS_ENABLED=true
REDIS_URL=rediss://...
POSTGRES_ENABLED=true
DATABASE_URL=postgresql://...
```

Migrations run automatically at startup when PostgreSQL is enabled.

## 3. Backend on any Docker host

```bash
docker build -t market-watch-backend .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e REDIS_ENABLED=false -e POSTGRES_ENABLED=false \
  -e MARKET_DATA_PROVIDER=angelone \
  -e ANGELONE_API_KEY=... -e ANGELONE_CLIENT_CODE=... \
  -e ANGELONE_PASSWORD=... -e ANGELONE_TOTP_SECRET=... \
  market-watch-backend
```

The image installs only the backend + shared-types workspace dependencies, builds
with `tsc`, and runs `node dist/server.js` as `WORKDIR /app/apps/backend`.

## 4. Frontend on Vercel

1. Import the repository at vercel.com/new.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and installs the
   pnpm workspace from the repository root.
3. Add environment variables (Production):
   - `NEXT_PUBLIC_API_URL` = `https://<backend-host>`
   - `NEXT_PUBLIC_WS_URL` = `wss://<backend-host>/ws`
4. Deploy.

`NEXT_PUBLIC_*` values are inlined at build time, so a **rebuild** is required
after changing them. If the build cannot see the workspace package, enable
"Include source files outside of the Root Directory in the Build Step".

> If you reused an older Vercel project whose Root Directory is `apps/backend`,
> change it to `apps/web`. The backend must not be deployed to Vercel.

## 5. Angel One credentials & the static-IP question

All Angel One settings are **server-side only** — never create `NEXT_PUBLIC_`
variants.

Per Angel One's official guidance, a whitelisted static IP is mandatory **only
for Order and GTT APIs**. This project uses login, REST market data, and the
WebSocket feed only, so **no static IP, Render Dedicated IP, or proxy is
required**. `ANGELONE_MAC_ADDRESS`, `ANGELONE_CLIENT_LOCAL_IP`, and
`ANGELONE_CLIENT_PUBLIC_IP` are optional login headers that default to
placeholder values.

If you later add order/GTT APIs, you must route outbound traffic through a
registered static IP and allowlist it in the Angel One portal.

## 6. Instrument snapshot cadence

The searchable universe is a committed snapshot generated from NSE/BSE
authoritative lists joined to the Angel One master. Regenerate it when listings
change (e.g. daily or weekly) and commit the result:

```bash
corepack pnpm --filter @market-watch/backend sync:instruments
git add apps/backend/src/instruments/instruments.generated.ts
git commit -m "chore: refresh instrument snapshot"
git push
```

The script prints included/omitted counts and the snapshot size. Render has no
cron on the free plan; a scheduled GitHub Action could automate this later.

## 7. Verifying a deployment

```bash
# Market calendar
curl https://<backend>/api/market-status

# Real quote (from Angel One when MARKET_DATA_PROVIDER=angelone)
curl "https://<backend>/api/quote/RELIANCE"

# Universe search
curl "https://<backend>/api/instruments/search?q=yes%20bank"

# WebSocket (expect a "subscribed" ack, then ticks during market hours)
# wss://<backend>/ws  →  {"version":1,"type":"subscribe","payload":{"instruments":[{"exchange":"NSE","symbol":"YESBANK"}]}}
```

Expected backend logs (no secrets): `Backend listening on <port> (market data:
angelone)`, `SmartAPI authenticated`, `SmartAPI stream connected`, and
`SmartAPI first tick` during market hours.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Backend crashes with `ANGELONE_... is required` | Enabled `angelone` without credentials | Set the four required variables or unset `MARKET_DATA_PROVIDER`. |
| `FORCE_MARKET_OPEN is not allowed in production` | Override set with `NODE_ENV=production` | Remove `FORCE_MARKET_OPEN`. |
| No live ticks | Market closed, or auth/stream failure | Check logs; ticks flow only 09:15–15:30 IST. |
| `SmartAPI WebSocket authentication failed` | Bad/expired credentials or TOTP secret | Verify `ANGELONE_TOTP_SECRET` is the base32 secret from the QR (not the API key). |
| Frontend shows "Backend offline" | Wrong `NEXT_PUBLIC_WS_URL`, or backend asleep | Use `wss://`; Render free instances cold-start. |
| CORS errors | Backend URL misconfigured | Confirm `NEXT_PUBLIC_API_URL` points at the backend origin. |

## 9. Rollback

Both platforms support instant rollback to a previous deployment in their
dashboards. The backend is stateless with respect to market data (in-memory or
Redis), so rolling back is safe; committed snapshots are versioned in git.
