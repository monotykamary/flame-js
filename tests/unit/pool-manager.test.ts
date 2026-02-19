import { describe, expect, it } from "bun:test";
import { createPoolManager } from "../../src/pool/manager";
import { InvokeError } from "../../src/errors";

function assertOk<T>(result: T): Exclude<T, Error> {
  if (result instanceof Error) {
    throw result;
  }
  return result as Exclude<T, Error>;
}

describe("pool manager", () => {
  it("creates pools from runnerUrl and caches them", async () => {
    const manager = createPoolManager({ runnerUrl: "http://runner" });

    const first = assertOk(await manager.get("default"));
    const second = assertOk(await manager.get("default"));

    expect(first).toBe(second);
    expect((await manager.shutdownAll()) instanceof Error).toBe(false);
  });

  it("uses explicit pool configs", async () => {
    const manager = createPoolManager({
      pools: {
        custom: { runners: [{ url: "http://custom" }] }
      }
    });

    const pool = assertOk(await manager.get("custom"));
    const runner = assertOk(await pool.acquire());
    expect(runner.url).toBe("http://custom");
  });

  it("returns errors when pool is missing", async () => {
    const manager = createPoolManager({ pools: {} });
    const missing = await manager.get("missing");

    expect(missing instanceof Error).toBe(true);
    if (missing instanceof Error) {
      expect(missing.message).toContain("Pool not configured");
    }
  });

  it("deduplicates concurrent pool creation requests", async () => {
    let spawnCalls = 0;
    const manager = createPoolManager({
      pools: {
        dynamic: { min: 1, max: 1 }
      },
      backend: {
        spawn: async () => {
          spawnCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { id: "runner-1", url: "http://runner" };
        },
        terminate: async () => {}
      }
    });

    const [first, second] = await Promise.all([manager.get("dynamic"), manager.get("dynamic")]);
    const firstPool = assertOk(first);
    const secondPool = assertOk(second);

    expect(firstPool).toBe(secondPool);
    expect(spawnCalls).toBe(1);
  });

  it("propagates pool creation failures", async () => {
    const manager = createPoolManager({
      pools: {
        broken: { min: 1 }
      }
    });

    const result = await manager.get("broken");
    expect(result instanceof Error).toBe(true);
    if (result instanceof Error) {
      expect(result.message).toContain("backend");
    }
  });

  it("returns shutdown errors from underlying pools", async () => {
    const manager = createPoolManager({
      pools: {
        bad: { min: 1, max: 1 }
      },
      backend: {
        spawn: async () => ({ id: "runner-1", url: "http://runner" }),
        terminate: async () => new Error("terminate failed")
      }
    });

    const pool = await manager.get("bad");
    expect(pool instanceof Error).toBe(false);

    const shutdown = await manager.shutdownAll();
    expect(shutdown instanceof Error).toBe(true);
    if (shutdown instanceof Error) {
      expect(shutdown.message).toContain("Failed to terminate runner");
    }
  });

  it("wraps unexpected thrown shutdown failures", async () => {
    const manager = createPoolManager({
      pools: {
        bad: { runners: [{ url: "http://runner" }] }
      }
    });

    const pool = assertOk(await manager.get("bad"));
    pool.shutdown = async () => {
      throw new Error("shutdown exploded");
    };

    const shutdown = await manager.shutdownAll();
    expect(shutdown).toBeInstanceOf(InvokeError);
    if (shutdown instanceof InvokeError) {
      expect(shutdown.message).toContain("Failed to shutdown pools");
    }
  });
});
