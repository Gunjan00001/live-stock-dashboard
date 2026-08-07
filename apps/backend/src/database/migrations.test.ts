import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { runMigrations } from "./migrations.js";

describe("market data migration", () => {
  it("contains the candle and reserved future tables", async () => {
    const sql = await readFile(resolve(process.cwd(), "migrations/001_market_data.sql"), "utf8");
    for (const table of ["candles", "users", "watchlists", "watchlist_items", "price_alerts"]) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(sql).toContain("PRIMARY KEY (symbol, exchange, interval, time)");
  });

  it.skipIf(!process.env.DATABASE_TEST_URL)("creates the schema on plain PostgreSQL", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_TEST_URL });
    await runMigrations(pool);
    const result = await pool.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)", [["candles", "users", "watchlists", "watchlist_items", "price_alerts"]]);
    expect(result.rows.map((row) => row.table_name).sort()).toEqual(["candles", "price_alerts", "users", "watchlist_items", "watchlists"]);
    await pool.end();
  });
});
