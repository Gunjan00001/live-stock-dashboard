import type { Tick } from "@market-watch/shared-types";

export type TickHandler = (tick: Tick) => void | Promise<void>;

export interface EventBus {
  publish(symbol: string, tick: Tick): Promise<void>;
  subscribe(symbol: string, handler: TickHandler): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
