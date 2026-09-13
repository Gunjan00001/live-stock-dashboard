import { describe, expect, it } from "vitest";
import type { ClientWsMessage, ServerWsMessage } from "./index.js";

describe("websocket contracts", () => {
  it("requires the protocol version discriminator", () => {
    const message: ServerWsMessage = { version: 1, type: "status", payload: { open: false, session: "CLOSED", timestamp: new Date().toISOString() } };
    expect(message.version).toBe(1);
  });

  it("supports instrument subscriptions and acks", () => {
    const message: ClientWsMessage = { version: 1, type: "subscribe", payload: { instruments: [{ exchange: "NSE", symbol: "YESBANK" }] } };
    expect(message.payload.instruments?.[0]?.exchange).toBe("NSE");
    const ack: ServerWsMessage = { version: 1, type: "subscribed", payload: { instruments: [{ exchange: "BSE", symbol: "YESBANK" }] } };
    expect(ack.type).toBe("subscribed");
  });
});
