import { describe, expect, it } from "bun:test";
import { defineMethod, normalizeMethods } from "../../src/define";


describe("defineMethod", () => {
  it("keeps explicit method ids", async () => {
    const method = defineMethod("charge.v1", async (_ctx, amount: number) => amount * 2);
    const normalized = normalizeMethods({ charge: method, ping: async () => "pong" });

    expect(normalized.byId.has("charge.v1")).toBe(true);
    expect(normalized.byProperty.charge.id).toBe("charge.v1");
    expect(normalized.byProperty.ping.id).toBe("ping");

    const ctx = { invocationId: "1", deadline: null, signal: new AbortController().signal };
    const result = await normalized.byProperty.charge.handler(ctx, 2);
    expect(result).toBe(4);
  });
});
