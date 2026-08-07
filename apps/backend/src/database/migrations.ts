import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../migrations/001_market_data.sql");

export async function runMigrations(pool: Pool) {
  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
  const result = await pool.query<{ installed: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS installed");
  if (result.rows[0]?.installed) await pool.query("SELECT create_hypertable('candles', 'time', if_not_exists => TRUE)");
}
