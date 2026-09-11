import { describe, expect, it } from "vitest";
import { parseStreamFrame } from "./stream-parser.js";

function quoteFrame(token: string, ltpPaise: number, volume: number): Buffer {
  const buffer = Buffer.alloc(123);
  buffer.writeUInt8(2, 0);
  buffer.writeUInt8(1, 1);
  buffer.write(token, 2, "ascii");
  buffer.writeBigInt64LE(1n, 27);
  buffer.writeBigInt64LE(1_700_000_000_000n, 35);
  buffer.writeBigInt64LE(BigInt(ltpPaise), 43);
  buffer.writeBigInt64LE(50n, 51);
  buffer.writeBigInt64LE(0n, 59);
  buffer.writeBigInt64LE(BigInt(volume), 67);
  return buffer;
}

describe("parseStreamFrame", () => {
  it("parses a QUOTE frame and normalizes price from paise", () => {
    const frame = parseStreamFrame(quoteFrame("2885", 142_083, 1_234_000));
    expect(frame).toMatchObject({ token: "2885", exchangeType: 1, mode: 2, timestamp: 1_700_000_000_000, price: 1420.83, volume: 1_234_000 });
  });

  it("returns undefined for control/unknown frames", () => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(0, 0);
    expect(parseStreamFrame(buffer)).toBeUndefined();
  });

  it("handles an LTP frame without volume", () => {
    const buffer = Buffer.alloc(51);
    buffer.writeUInt8(1, 0);
    buffer.writeUInt8(1, 1);
    buffer.write("2885", 2, "ascii");
    buffer.writeBigInt64LE(1_700_000_000_000n, 35);
    buffer.writeBigInt64LE(142_083n, 43);
    expect(parseStreamFrame(buffer)).toMatchObject({ token: "2885", mode: 1, price: 1420.83, volume: 0 });
  });
});
