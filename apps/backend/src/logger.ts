export type LogContext = Record<string, unknown>;

export function logError(layer: "provider" | "websocket" | "ingestion" | "redis" | "postgres", message: string, context: LogContext = {}, error?: unknown) {
  const cause = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error === undefined ? undefined : { value: String(error) };
  console.error(JSON.stringify({ level: "error", timestamp: new Date().toISOString(), layer, message, ...context, ...(cause ? { error: cause } : {}) }));
}
