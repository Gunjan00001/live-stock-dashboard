export type LogContext = Record<string, unknown>;
export type LogLayer = "provider" | "websocket" | "ingestion" | "redis" | "postgres";

export function logInfo(layer: LogLayer, message: string, context: LogContext = {}) {
  console.log(JSON.stringify({ level: "info", timestamp: new Date().toISOString(), layer, message, ...context }));
}

export function logError(layer: LogLayer, message: string, context: LogContext = {}, error?: unknown) {
  const cause = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error === undefined ? undefined : { value: String(error) };
  console.error(JSON.stringify({ level: "error", timestamp: new Date().toISOString(), layer, message, ...context, ...(cause ? { error: cause } : {}) }));
}
