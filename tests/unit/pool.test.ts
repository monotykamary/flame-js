import { describe, expect, it } from "bun:test";
import { createPool } from "../../src/pool/pool";
import { ConfigError } from "../../src/errors";

function assertOk<T>(result: T): Exclude<T, Error> {
  if (result instanceof Error) {
    throw result;
  }
  return result as Exclude<T, Error>;
}

describe("pool", () => {
  it("acquires from static runners", async () => {
    const pool = assertOk(
      await createPool("default", { runners: [{ url: "http://runner" }], maxConcurrency: 1 })
    );

    const runner = assertOk(await pool.acquire());
    expect(runner.url).toBe("http://runner");

    expect((await pool.release(runner)) instanceof Error).toBe(false);
  });

  it("returns no_runner errors when no runners are available", async () => {
    const pool = assertOk(await createPool("empty", { max: 0 }));
    const acquired = await pool.acquire();

    expect(acquired instanceof Error).toBe(true);
    if (acquired instanceof Error) {
      expect(acquired.message).toContain("has no runners");
    }
  });

  it("fails spawnRunner without a backend", async () => {
    const pool = assertOk(await createPool("no-backend", { max: 1 }));
    const internals = (pool as any)[Symbol.for("flame.pool.internals")];

    const spawned = await internals.spawnRunner();
    expect(spawned instanceof Error).toBe(true);
    if (spawned instanceof Error) {
      expect(spawned.message).toContain("No backend configured");
    }
  });

  it("fails spawnRunner when max runners are reached", async () => {
    const backend = {
      spawn: async () => ({ id: "runner-1", url: "http://spawned" }),
      terminate: async () => {}
    };
    const pool = assertOk(await createPool("maxed", { max: 1 }, backend));
    const internals = (pool as any)[Symbol.for("flame.pool.internals")];

    internals.setStateForTests((state: any) => ({ ...state, spawning: 1 }));
    const snapshot = internals.getStateForTests();
    expect(snapshot.spawning).toBe(1);

    const spawned = await internals.spawnRunner();
    expect(spawned instanceof Error).toBe(true);
    if (spawned instanceof Error) {
      expect(spawned.message).toContain("reached max runners");
    }
  });

  it("ignores duplicate static runner ids", async () => {
    const pool = assertOk(
      await createPool("dupe", {
        runners: [
          { id: "runner-1", url: "http://runner" },
          { id: "runner-1", url: "http://runner" }
        ],
        maxConcurrency: 1
      })
    );

    const runner = assertOk(await pool.acquire());
    expect(runner.id).toBe("runner-1");
    expect((await pool.release(runner)) instanceof Error).toBe(false);
  });

  it("skips stale queue entries from releases", async () => {
    const pool = assertOk(
      await createPool("stale", {
        runners: [{ id: "runner-1", url: "http://runner" }],
        maxConcurrency: 1
      })
    );

    const runner = assertOk(await pool.acquire());

    expect((await pool.release({ id: "fake", url: "http://fake" })) instanceof Error).toBe(false);
    expect((await pool.release(runner)) instanceof Error).toBe(false);

    const acquired = assertOk(await pool.acquire());
    expect(acquired.id).toBe("runner-1");
    expect((await pool.release(acquired)) instanceof Error).toBe(false);
  });

  it("skips stale queue entries while waiting", async () => {
    const pool = assertOk(
      await createPool("stale-wait", {
        runners: [{ id: "runner-1", url: "http://runner" }],
        maxConcurrency: 1
      })
    );

    const runner = assertOk(await pool.acquire());

    const acquirePromise = pool.acquire();
    setTimeout(() => {
      void pool.release({ id: "fake", url: "http://fake" });
      setTimeout(() => {
        void pool.release(runner);
      }, 5);
    }, 5);

    const acquired = await Promise.race([
      acquirePromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 200))
    ]);
    expect(acquired instanceof Error).toBe(false);
    if (!(acquired instanceof Error)) {
      expect(acquired.id).toBe("runner-1");
      expect((await pool.release(acquired)) instanceof Error).toBe(false);
    }
  });

  it("spawns runners to satisfy min and terminates on shutdown", async () => {
    let spawned = 0;
    let terminated = 0;

    const backend = {
      spawn: async () => ({ id: `runner-${++spawned}`, url: "http://spawned" }),
      terminate: async () => {
        terminated += 1;
      }
    };

    const pool = assertOk(await createPool("min", { min: 1, max: 1, maxConcurrency: 1 }, backend));

    const runner = assertOk(await pool.acquire());
    expect(runner.id).toBe("runner-1");

    expect((await pool.release(runner)) instanceof Error).toBe(false);
    expect((await pool.shutdown()) instanceof Error).toBe(false);
    expect(spawned).toBe(1);
    expect(terminated).toBe(1);
  });

  it("spawns on demand when queue is empty", async () => {
    const backend = {
      spawn: async () => ({ id: "runner-once", url: "http://spawned" }),
      terminate: async () => {}
    };

    const pool = assertOk(await createPool("dynamic", { min: 0, max: 1, maxConcurrency: 1 }, backend));

    const runner = assertOk(await pool.acquire());
    expect(runner.id).toBe("runner-once");
    expect((await pool.release(runner)) instanceof Error).toBe(false);
  });

  it("fails when backend spawning returns an error value", async () => {
    const backend = {
      spawn: async () => new Error("boom"),
      terminate: async () => {}
    };

    const pool = assertOk(await createPool("spawn-error", { max: 1 }, backend));
    const acquired = await pool.acquire();
    expect(acquired instanceof Error).toBe(true);
    if (acquired instanceof Error) {
      expect(acquired.message).toContain("Failed to spawn runner");
    }
  });

  it("fails when backend spawning throws", async () => {
    const backend = {
      spawn: async () => {
        throw new Error("boom");
      },
      terminate: async () => {}
    };

    const pool = assertOk(await createPool("spawn-throw", { max: 1 }, backend));
    const acquired = await pool.acquire();
    expect(acquired instanceof Error).toBe(true);
    if (acquired instanceof Error) {
      expect(acquired.message).toContain("Failed to spawn runner");
    }
  });

  it("wraps termination failures", async () => {
    const backend = {
      spawn: async () => ({ id: "runner-1", url: "http://spawned" }),
      terminate: async () => new Error("boom")
    };

    const pool = assertOk(await createPool("terminate-error", { min: 1, max: 1 }, backend));
    const shutdown = await pool.shutdown();

    expect(shutdown instanceof Error).toBe(true);
    if (shutdown instanceof Error) {
      expect(shutdown.message).toContain("Failed to terminate runner");
    }
  });

  it("wraps thrown termination failures", async () => {
    const backend = {
      spawn: async () => ({ id: "runner-1", url: "http://spawned" }),
      terminate: async () => {
        throw new Error("boom");
      }
    };

    const pool = assertOk(await createPool("terminate-throw", { min: 1, max: 1 }, backend));
    const shutdown = await pool.shutdown();

    expect(shutdown instanceof Error).toBe(true);
    if (shutdown instanceof Error) {
      expect(shutdown.message).toContain("Failed to terminate runner");
    }
  });

  it("rejects min configuration without backend", async () => {
    const created = await createPool("bad", { min: 1 });
    expect(created instanceof Error).toBe(true);
  });

  it("handles thrown invoke errors during pool creation", async () => {
    const created = await createPool("thrown", {
      max: 1,
      runners: {
        entries: () => {
          throw new ConfigError("entries exploded");
        }
      } as any
    });

    expect(created instanceof Error).toBe(true);
    if (created instanceof Error) {
      expect(created.message).toContain("entries exploded");
      expect(created).toBeInstanceOf(ConfigError);
      if (created instanceof ConfigError) {
        expect(created.code).toBe("config_error");
      }
    }
  });
});
