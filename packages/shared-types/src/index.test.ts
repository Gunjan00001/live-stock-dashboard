import { describe, expect, it } from "vitest";
import type { ServerWsMessage } from "./index.js";

describe("websocket contracts", () => {
  it("requires the protocol version discriminator", () => {
    const message: ServerWsMessage = { version: 1, type: "status", payload: { open: false, session: "CLOSED", timestamp: new Date().toISOString() } };
    expect(message.version).toBe(1);
  });
});
