import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { RedisEventBus } from "./events/redis-event-bus.js";
import { RedisQuoteStore } from "./storage/redis-quote-store.js";
import { PostgresDatabase } from "./database/postgres.js";

const config = loadConfig();
const resources = await Promise.all([
  config.redisEnabled ? RedisQuoteStore.connect(config.redisUrl) : Promise.resolve(undefined),
  config.redisEnabled ? RedisEventBus.connect(config.redisUrl) : Promise.resolve(undefined),
  config.postgresEnabled ? PostgresDatabase.connect(config.databaseUrl) : Promise.resolve(undefined)
]);
const quoteStore = resources[0];
const eventBus = resources[1];
const database = resources[2];
const app = await createApp(undefined, { quoteStore, eventBus });
app.addHook("onClose", async () => { await database?.close(); });
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Backend listening on ${config.port}`);
