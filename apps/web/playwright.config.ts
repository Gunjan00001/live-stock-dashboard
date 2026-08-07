import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000", headless: true },
  webServer: [
    { command: "node dist/server.js", cwd: "../backend", url: "http://localhost:4000/api/market-status", reuseExistingServer: false, env: { ...process.env, REDIS_ENABLED: "false", POSTGRES_ENABLED: "false", FORCE_MARKET_OPEN: "false" } },
    { command: "npx next dev", cwd: ".", port: 3000, reuseExistingServer: false }
  ]
});
