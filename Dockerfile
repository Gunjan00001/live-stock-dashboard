FROM node:22-alpine

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @market-watch/backend...

COPY packages/shared-types packages/shared-types
COPY apps/backend apps/backend

RUN pnpm --filter @market-watch/backend build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

WORKDIR /app/apps/backend
CMD ["node", "dist/server.js"]
