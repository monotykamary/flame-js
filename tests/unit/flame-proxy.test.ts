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
});
