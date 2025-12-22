import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createFlame } from "../../src";


describe("effect wrappers", () => {
  it("exposes serviceEffect", async () => {
    const flame = createFlame({ mode: "local" });
    const service = flame.serviceEffect("svc", {
      add: async (a: number, b: number) => a + b
    });

    const result = await Effect.runPromise(service.add(2, 5));
    expect(result).toBe(7);
  });

  it("exposes fnEffect", async () => {
    const flame = createFlame({ mode: "local" });
    const fn = flame.fnEffect("fn", async (value: number) => value * 3);

    const result = await Effect.runPromise(fn(3));
    expect(result).toBe(9);
  });

  it("supports proxy ids for serviceEffect and fnEffect", async () => {
    const flame = createFlame({ mode: "local" });
    const service = flame.serviceEffect.math({
      add: async (a: number, b: number) => a + b
    });
    const fn = flame.fnEffect.ping(async () => "pong");

    const sum = await Effect.runPromise(service.add(1, 4));
    const pong = await Effect.runPromise(fn());

    expect(sum).toBe(5);
    expect(pong).toBe("pong");
    expect(flame.registry.getService("math")).toBeDefined();
    expect(flame.registry.getService("ping")).toBeDefined();
  });
});
