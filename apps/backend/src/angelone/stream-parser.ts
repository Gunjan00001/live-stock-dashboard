export interface ParsedFrame {
  token: string;
  exchangeType: number;
  mode: number;
  timestamp: number;
  price: number;
  volume: number;
}

export function parseStreamFrame(data: Buffer): ParsedFrame | undefined {
  if (data.length < 51) return undefined;
  const mode = data.readUInt8(0);
  if (mode < 1 || mode > 4) return undefined;
  const exchangeType = data.readUInt8(1);
  const token = data.subarray(2, 27).toString("ascii").replace(/\0.*$/, "").trim();
  const timestamp = Number(data.readBigInt64LE(35));
  const price = Number(data.readBigInt64LE(43)) / 100;
  if (mode === 1 || data.length < 75) return { token, exchangeType, mode, timestamp, price, volume: 0 };
  const volume = Number(data.readBigInt64LE(67));
  return { token, exchangeType, mode, timestamp, price, volume };
}
