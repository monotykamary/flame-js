import { describe, expect, it } from "bun:test";
import { signBody, verifySignature, validateWindow } from "../../src/security";


describe("security", () => {
  it("signs and verifies bodies", () => {
    const body = "payload";
    const secret = "secret";
    const signature = signBody(body, secret);

    expect(verifySignature(body, signature, secret)).toBe(true);
    expect(verifySignature(body, "deadbeef", secret)).toBe(false);
    expect(verifySignature(body, signature, undefined as unknown as string)).toBe(false);
  });

  it("validates time windows", () => {
    const now = Date.now();
    expect(validateWindow(now - 1000, now + 1000, 5000)).toBe(true);
    expect(validateWindow(now + 10_000, now + 20_000, 1000)).toBe(false);
    expect(validateWindow(now - 20_000, now - 10_000, 1000)).toBe(false);
  });
});
