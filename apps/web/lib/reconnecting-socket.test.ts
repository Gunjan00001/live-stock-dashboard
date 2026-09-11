import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectingWebSocket, type SocketLike } from "./reconnecting-socket";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  emitMessage(data: unknown) { this.onmessage?.({ data }); }
  fail() { this.readyState = 3; this.onerror?.(); this.onclose?.(); }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const createSocket = (_url: string) => { const socket = new FakeSocket(); sockets.push(socket); return socket; };
  return { sockets, createSocket };
}

describe("ReconnectingWebSocket", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reconnects with exponential backoff after the socket drops", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { baseDelayMs: 1000, factor: 2, maxDelayMs: 30000, createSocket });
    expect(sockets).toHaveLength(1);

    sockets[0].fail();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1].fail();
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2].fail();
    vi.advanceTimersByTime(3999);
    expect(sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(4);

    client.close();
  });

  it("caps the reconnect delay at maxDelayMs", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { baseDelayMs: 1000, factor: 4, maxDelayMs: 3000, createSocket });

    sockets[0].fail();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    sockets[1].fail();
    vi.advanceTimersByTime(2999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    client.close();
  });

  it("resets the backoff after a successful reconnection", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { baseDelayMs: 1000, factor: 2, maxDelayMs: 30000, createSocket });

    sockets[0].fail();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);

    sockets[1].open();
    sockets[1].fail();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(3);

    client.close();
  });

  it("re-subscribes to tracked symbols after reconnecting", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { baseDelayMs: 1000, factor: 2, maxDelayMs: 30000, createSocket });
    client.subscribe(["TCS", "RELIANCE"]);
    expect(sockets[0].sent).toHaveLength(0);

    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0]!)).toMatchObject({ version: 1, type: "subscribe", payload: { symbols: ["TCS", "RELIANCE"] } });

    sockets[0].fail();
    vi.advanceTimersByTime(1000);
    sockets[1].open();
    expect(sockets[1].sent).toHaveLength(1);
    expect(JSON.parse(sockets[1].sent[0]!)).toMatchObject({ version: 1, type: "subscribe", payload: { symbols: ["TCS", "RELIANCE"] } });

    client.close();
  });

  it("stops reconnecting after close()", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { baseDelayMs: 1000, factor: 2, maxDelayMs: 30000, createSocket });
    sockets[0].fail();
    client.close();
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(1);
  });

  it("sends a subscription immediately when the socket is already open", () => {
    const { sockets, createSocket } = harness();
    const client = new ReconnectingWebSocket("ws://test/ws", { createSocket });
    sockets[0].open();
    client.subscribe(["INFY"]);
    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0]!)).toMatchObject({ type: "subscribe", payload: { symbols: ["INFY"] } });
    client.close();
  });

  it("invokes onOpen, onClose and forwards messages", () => {
    const { sockets, createSocket } = harness();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onMessage = vi.fn();
    const client = new ReconnectingWebSocket("ws://test/ws", { onOpen, onClose, onMessage, createSocket });

    sockets[0].open();
    expect(onOpen).toHaveBeenCalledTimes(1);

    sockets[0].emitMessage('{"version":1}');
    expect(onMessage).toHaveBeenCalledWith('{"version":1}');

    sockets[0].fail();
    expect(onClose).toHaveBeenCalledTimes(1);

    client.close();
  });
});
