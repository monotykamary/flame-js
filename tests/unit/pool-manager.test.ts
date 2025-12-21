import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createPoolManager } from "../../src/pool/manager";


describe("pool manager", () => {
  it("creates pools from runnerUrl and caches them", async () => {
    const manager = createPoolManager({ runnerUrl: "http://runner" });

    const first = await Effect.runPromise(manager.get("default"));
    const second = await Effect.runPromise(manager.get("default"));

    expect(first).toBe(second);
    await Effect.runPromise(manager.shutdownAll);
  });

  it("uses explicit pool configs", async () => {
    const manager = createPoolManager({
      pools: {
        custom: { runners: [{ url: "http://custom" }] }
      }
    });

    const pool = await Effect.runPromise(manager.get("custom"));
    const runner = await Effect.runPromise(pool.acquire);
    expect(runner.url).toBe("http://custom");
  });

  it("throws when pool is missing", async () => {
    const manager = createPoolManager({ pools: {} });
    await expect(Effect.runPromise(manager.get("missing"))).rejects.toThrow();
  });
});
