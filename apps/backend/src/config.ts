export interface AngelOneConfig {
  apiKey: string;
  clientCode: string;
  password: string;
  totpSecret: string;
  macAddress: string;
  clientLocalIp: string;
  clientPublicIp: string;
  baseUrl: string;
  websocketUrl: string;
  subscriptionMode: 1 | 2 | 3;
}

export interface BackendConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  redisUrl: string;
  databaseUrl: string;
  redisEnabled: boolean;
  postgresEnabled: boolean;
  forceMarketOpen: boolean;
  marketDataProvider: "mock" | "angelone";
  angelone?: AngelOneConfig;
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

function required(name: string, value: string | undefined, provider: string) {
  if (!value) throw new Error(`${name} is required when MARKET_DATA_PROVIDER=${provider}`);
  return value;
}

function subscriptionMode(value: string | undefined): 1 | 2 | 3 {
  if (value === undefined) return 2;
  const mode = Number(value);
  if (mode !== 1 && mode !== 2 && mode !== 3) throw new Error("ANGELONE_SUBSCRIPTION_MODE must be 1, 2, or 3");
  return mode;
}

export function loadConfig(env = process.env): BackendConfig {
  const nodeEnv = (env.NODE_ENV ?? "development") as BackendConfig["nodeEnv"];
  if (!["development", "test", "production"].includes(nodeEnv)) throw new Error("NODE_ENV must be development, test, or production");
  const redisEnabled = booleanEnv("REDIS_ENABLED", env.REDIS_URL !== undefined, env);
  const postgresEnabled = booleanEnv("POSTGRES_ENABLED", env.DATABASE_URL !== undefined, env);
  const forceMarketOpen = booleanEnv("FORCE_MARKET_OPEN", false, env);
  if (nodeEnv === "production" && forceMarketOpen) throw new Error("FORCE_MARKET_OPEN is not allowed in production");
  const provider = env.MARKET_DATA_PROVIDER ?? "mock";
  if (provider !== "mock" && provider !== "angelone") throw new Error("MARKET_DATA_PROVIDER must be mock or angelone");
  const angelone: AngelOneConfig | undefined = provider === "angelone" ? {
    apiKey: required("ANGELONE_API_KEY", env.ANGELONE_API_KEY, provider),
    clientCode: required("ANGELONE_CLIENT_CODE", env.ANGELONE_CLIENT_CODE, provider),
    password: required("ANGELONE_PASSWORD", env.ANGELONE_PASSWORD, provider),
    totpSecret: required("ANGELONE_TOTP_SECRET", env.ANGELONE_TOTP_SECRET, provider),
    macAddress: required("ANGELONE_MAC_ADDRESS", env.ANGELONE_MAC_ADDRESS, provider),
    clientLocalIp: required("ANGELONE_CLIENT_LOCAL_IP", env.ANGELONE_CLIENT_LOCAL_IP, provider),
    clientPublicIp: required("ANGELONE_CLIENT_PUBLIC_IP", env.ANGELONE_CLIENT_PUBLIC_IP, provider),
    baseUrl: env.ANGELONE_BASE_URL ?? "https://apiconnect.angelone.in",
    websocketUrl: env.ANGELONE_WEBSOCKET_URL ?? "wss://smartapisocket.angelone.in/smart-stream",
    subscriptionMode: subscriptionMode(env.ANGELONE_SUBSCRIPTION_MODE)
  } : undefined;
  return { nodeEnv, port: Number(env.PORT ?? 4000), redisUrl: requiredUrl("REDIS_URL", env.REDIS_URL, redisEnabled), databaseUrl: requiredUrl("DATABASE_URL", env.DATABASE_URL, postgresEnabled), redisEnabled, postgresEnabled, forceMarketOpen, marketDataProvider: provider, angelone };
}
