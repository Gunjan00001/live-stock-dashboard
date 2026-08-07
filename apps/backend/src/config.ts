export interface BackendConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  redisUrl: string;
  databaseUrl: string;
  redisEnabled: boolean;
  postgresEnabled: boolean;
  forceMarketOpen: boolean;
}

function booleanEnv(name: string, fallback: boolean, env: NodeJS.ProcessEnv) {
  const value = env[name];
  if (value === undefined) return fallback;
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}

function requiredUrl(name: string, value: string | undefined, enabled: boolean) {
  if (!enabled) return value ?? "";
  if (!value) throw new Error(`${name} is required when its adapter is enabled`);
  try { new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  return value;
}

export function loadConfig(env = process.env): BackendConfig {
  const nodeEnv = (env.NODE_ENV ?? "development") as BackendConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) throw new Error("NODE_ENV must be development, test, or production");
  const redisEnabled = booleanEnv("REDIS_ENABLED", env.REDIS_URL !== undefined, env);
  const postgresEnabled = booleanEnv("POSTGRES_ENABLED", env.DATABASE_URL !== undefined, env);
  const forceMarketOpen = booleanEnv("FORCE_MARKET_OPEN", false, env);
  if (nodeEnv === "production" && forceMarketOpen) throw new Error("FORCE_MARKET_OPEN is not allowed in production");
  return { nodeEnv, port: Number(env.PORT ?? 4000), redisUrl: requiredUrl("REDIS_URL", env.REDIS_URL, redisEnabled), databaseUrl: requiredUrl("DATABASE_URL", env.DATABASE_URL, postgresEnabled), redisEnabled, postgresEnabled, forceMarketOpen };
}
