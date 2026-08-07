import { Pool } from "pg";
import type { Candle } from "@market-watch/shared-types";
import { runMigrations } from "./migrations.js";

export class PostgresDatabase {
  private constructor(private readonly pool: Pool) {}

  static async connect(url: string) {
    const pool = new Pool({ connectionString: url });
    const database = new PostgresDatabase(pool);
    await pool.query("SELECT 1");
    await runMigrations(pool);
    return database;
  }

  async saveCandles(symbol: string, exchange: string, interval: string, candles: Candle[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const candle of candles) await client.query("INSERT INTO candles (symbol, exchange, interval, time, open, high, low, close, volume) VALUES ($1, $2, $3, to_timestamp($4), $5, $6, $7, $8, $9) ON CONFLICT (symbol, exchange, interval, time) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume", [symbol, exchange, interval, candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async close() { await this.pool.end(); }
}
