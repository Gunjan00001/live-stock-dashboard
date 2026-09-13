import { describe, expect, it, vi } from "vitest";
import type { ProviderInstrument } from "./provider.js";
import { SubscriptionRegistry, keyOf } from "./subscriptions.js";

const tcs: ProviderInstrument = { exchange: "NSE", exchangeType: 1, token: "11536", symbol: "TCS" };
const yesBank: ProviderInstrument = { exchange: "NSE", exchangeType: 1, token: "11915", symbol: "YESBANK" };
const yesBankBse: ProviderInstrument = { exchange: "BSE", exchangeType: 3, token: "532648", symbol: "YESBANK" };

function setup(defaults: ProviderInstrument[] = [tcs]) {
  const onActivate = vi.fn();
  const onDeactivate = vi.fn();
  return { registry: new SubscriptionRegistry(defaults, { onActivate, onDeactivate }), onActivate, onDeactivate };
}

describe("SubscriptionRegistry", () => {
  it("subscribes once for multiple clients and unsubscribes at zero", () => {
    const { registry, onActivate, onDeactivate } = setup();
    registry.add("A", yesBank);
    registry.add("B", yesBank);
    expect(onActivate).toHaveBeenCalledTimes(1);
    registry.remove("A", yesBank);
    expect(onDeactivate).not.toHaveBeenCalled();
    registry.remove("B", yesBank);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate adds from the same client", () => {
    const { registry, onActivate } = setup();
    registry.add("A", yesBank);
    registry.add("A", yesBank);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(registry.activeCount(keyOf(yesBank))).toBe(1);
  });

  it("keeps defaults always active and never deactivates them", () => {
    const { registry, onActivate, onDeactivate } = setup([tcs]);
    registry.add("A", tcs);
    expect(onActivate).not.toHaveBeenCalled();
    registry.remove("A", tcs);
    expect(onDeactivate).not.toHaveBeenCalled();
    expect(registry.isActive(keyOf(tcs))).toBe(true);
    expect(registry.activeCount(keyOf(tcs))).toBe(1);
  });

  it("keeps NSE and BSE listings of the same symbol independent", () => {
    const { registry, onActivate, onDeactivate } = setup();
    registry.add("A", yesBank);
    registry.add("A", yesBankBse);
    expect(onActivate).toHaveBeenCalledTimes(2);
    registry.remove("A", yesBank);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    expect(onDeactivate).toHaveBeenCalledWith(yesBank);
    expect(registry.isActive(keyOf(yesBankBse))).toBe(true);
  });

  it("removes every instrument for a disconnected client", () => {
    const { registry, onDeactivate } = setup();
    registry.add("A", yesBank);
    registry.add("A", yesBankBse);
    registry.removeClient("A");
    expect(onDeactivate).toHaveBeenCalledTimes(2);
    expect(registry.clientCount()).toBe(0);
  });
});
