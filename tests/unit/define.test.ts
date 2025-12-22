import { describe, expect, it } from "bun:test";
import { defineMethod, normalizeMethods, registerService } from "../../src/define";
import { createRegistry } from "../../src/registry";


describe("defineMethod", () => {
  it("derives method ids from property access", async () => {
    const method = defineMethod.charge(async (_ctx, amount: number) => amount + 1);
    const normalized = normalizeMethods({ charge: method });

    expect(normalized.byId.has("charge")).toBe(true);
    expect(normalized.byProperty.charge.id).toBe("charge");

    const ctx = { invocationId: "1", deadline: null, signal: new AbortController().signal };
    const result = await normalized.byProperty.charge.handler(ctx, 2);
    expect(result).toBe(3);
  });

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

  it("registers service options", () => {
    const registry = createRegistry();
    const method = defineMethod("ping", async () => "pong");
    const normalized = normalizeMethods({ ping: method });

    registerService(registry, "svc", normalized.byId, { pool: "default" });
    const service = registry.getService("svc");
    expect(service?.options?.pool).toBe("default");
  });
});
