import type { ProviderInstrument } from "./provider.js";

export type SubscriptionHandler = (instrument: ProviderInstrument) => void;

export interface SubscriptionHandlers {
  onActivate: SubscriptionHandler;
  onDeactivate: SubscriptionHandler;
}

export function keyOf(instrument: ProviderInstrument) { return `${instrument.exchange}:${instrument.symbol.toUpperCase()}`; }

export class SubscriptionRegistry {
  private readonly defaults = new Set<string>();
  private readonly clients = new Map<string, Map<string, ProviderInstrument>>();
  private readonly counts = new Map<string, number>();

  constructor(defaults: ProviderInstrument[], private readonly handlers: SubscriptionHandlers) {
    for (const instrument of defaults) this.defaults.add(keyOf(instrument));
  }

  add(clientId: string, instrument: ProviderInstrument) {
    const key = keyOf(instrument);
    const instruments = this.clients.get(clientId) ?? new Map<string, ProviderInstrument>();
    if (instruments.has(key)) return;
    instruments.set(key, instrument);
    this.clients.set(clientId, instruments);
    const count = this.counts.get(key) ?? 0;
    this.counts.set(key, count + 1);
    if (count === 0 && !this.defaults.has(key)) this.handlers.onActivate(instrument);
  }

  remove(clientId: string, instrument: ProviderInstrument) {
    const key = keyOf(instrument);
    const instruments = this.clients.get(clientId);
    if (!instruments || !instruments.has(key)) return;
    instruments.delete(key);
    if (!instruments.size) this.clients.delete(clientId);
    const count = (this.counts.get(key) ?? 0) - 1;
    if (count > 0) { this.counts.set(key, count); return; }
    this.counts.delete(key);
    if (!this.defaults.has(key)) this.handlers.onDeactivate(instrument);
  }

  removeClient(clientId: string) {
    const instruments = this.clients.get(clientId);
    if (!instruments) return;
    for (const instrument of [...instruments.values()]) this.remove(clientId, instrument);
  }

  isActive(key: string) { return this.defaults.has(key) || this.counts.has(key); }

  activeCount(key: string) { return (this.defaults.has(key) ? 1 : 0) + (this.counts.get(key) ?? 0); }

  clientCount() { return this.clients.size; }
}
