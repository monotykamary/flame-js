import { describe, expect, it } from "bun:test";
import { createFlame, defineMethod } from "../../src";


describe("flame proxy ids", () => {
  it("keeps explicit string service ids", async () => {
    const flame = createFlame({ mode: "local" });
    const service = flame.service("billing", {
      charge: async (amount: number) => amount * 3
    });

    const result = await service.charge(3);
    expect(result).toBe(9);
    expect(flame.registry.getService("billing")).toBeDefined();
  });

  it("derives service ids from property access", async () => {
    const flame = createFlame({ mode: "local" });
    const service = flame.service.billing({
      charge: defineMethod.charge(async (_ctx, amount: number) => amount * 2)
    });

    const result = await service.charge(3);
    expect(result).toBe(6);
    expect(flame.registry.getService("billing")).toBeDefined();
    expect(flame.registry.getService("billing")?.methods.has("charge")).toBe(true);
  });

  it("derives function ids from property access", async () => {
    const flame = createFlame({ mode: "local" });
    const ping = flame.fn.ping(async () => "pong");

    const result = await ping();
    expect(result).toBe("pong");
    expect(flame.registry.getService("ping")).toBeDefined();
  });

  it("supports union-returning service proxies", async () => {
    const flame = createFlame({ mode: "local" });
    const ok = flame.serviceResult("ok", {
      ping: async () => "pong"
    });
    const fail = flame.serviceResult("fail", {
      boom: async () => {
        throw new Error("boom");
      }
    });

    const okResult = await ok.ping();
    expect(okResult instanceof Error).toBe(false);
    if (!(okResult instanceof Error)) {
      expect(okResult).toBe("pong");
    }

    const failResult = await fail.boom();
    expect(failResult instanceof Error).toBe(true);
    if (failResult instanceof Error) {
      expect(failResult.message).toContain("Local invocation failed");
    }
  });

  it("supports union-returning fn proxies", async () => {
    const flame = createFlame({ mode: "local" });
    const ping = flame.fnResult.ping(async () => "pong");
    const fail = flame.fnResult("boom", async () => {
      throw new Error("boom");
    });

    const okResult = await ping();
    expect(okResult instanceof Error).toBe(false);
    if (!(okResult instanceof Error)) {
      expect(okResult).toBe("pong");
    }

    const failResult = await fail();
    expect(failResult instanceof Error).toBe(true);
    if (failResult instanceof Error) {
      expect(failResult.message).toContain("Local invocation failed");
    }
  });

  it("returns errors as values in parent mode for result proxies", async () => {
    const flame = createFlame({
      mode: "parent",
      pools: {}
    });
    const service = flame.serviceResult("svc", {
      ping: async () => "pong"
    });

    const result = await service.ping();
    expect(result instanceof Error).toBe(true);
    if (result instanceof Error) {
      expect(result.message).toContain("Pool not configured");
    }
  });
});
