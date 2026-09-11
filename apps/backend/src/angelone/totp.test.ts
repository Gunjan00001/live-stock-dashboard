import { describe, expect, it } from "vitest";
import { generateTotp } from "./totp.js";

describe("generateTotp", () => {
  it("matches the RFC 6238 SHA-1 vector for 6 digits", () => {
    expect(generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });

  it("rejects an invalid base32 secret", () => {
    expect(() => generateTotp("not-base32!", 59_000)).toThrow();
  });
});
