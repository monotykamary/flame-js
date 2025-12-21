import { describe, expect, it } from "bun:test";
import { Effect, Ref } from "effect";
import { createPool } from "../../src/pool/pool";


describe("pool", () => {
  it("acquires from static runners", async () => {
    const pool = await Effect.runPromise(
      createPool("default", { runners: [{ url: "http://runner" }], maxConcurrency: 1 })
    );

    const runner = await Effect.runPromise(pool.acquire);
    expect(runner.url).toBe("http://runner");

    await Effect.runPromise(pool.release(runner));
  });

  it("errors when no runners are available", async () => {
    const pool = await Effect.runPromise(createPool("empty", { max: 0 }));

    await expect(Effect.runPromise(pool.acquire)).rejects.toThrow();
  });

  it("fails spawnRunner without a backend", async () => {
    const pool = await Effect.runPromise(createPool("no-backend", { max: 1 }));
    const internals = (pool as any)[Symbol.for("flame.pool.internals")];

    await expect(Effect.runPromise(internals.spawnRunner())).rejects.toThrow(
      "No backend configured"
    );
  });

  it("fails spawnRunner when max runners are reached", async () => {
    const backend = {
      spawn: () => Effect.succeed({ id: "runner-1", url: "http://spawned" }),
      terminate: () => Effect.void
    };
    const pool = await Effect.runPromise(createPool("maxed", { max: 1 }, backend));
    const internals = (pool as any)[Symbol.for("flame.pool.internals")];

    await Effect.runPromise(
      Ref.update(internals.stateRef, (state: any) => ({ ...state, spawning: 1 }))
    );

    await expect(Effect.runPromise(internals.spawnRunner())).rejects.toThrow(
      "reached max runners"
    );
  });

  it("ignores duplicate static runner ids", async () => {
    const pool = await Effect.runPromise(
      createPool("dupe", {
        runners: [
          { id: "runner-1", url: "http://runner" },
          { id: "runner-1", url: "http://runner" }
        ],
        maxConcurrency: 1
      })
    );

    const runner = await Effect.runPromise(pool.acquire);
    expect(runner.id).toBe("runner-1");
    await Effect.runPromise(pool.release(runner));
  });

  it("skips stale queue entries from releases", async () => {
    const pool = await Effect.runPromise(
      createPool("stale", {
        runners: [{ id: "runner-1", url: "http://runner" }],
        maxConcurrency: 1
      })
    );

    const runner = await Effect.runPromise(pool.acquire);

    await Effect.runPromise(pool.release({ id: "fake", url: "http://fake" }));
    await Effect.runPromise(pool.release(runner));

    const acquired = await Effect.runPromise(pool.acquire);
    expect(acquired.id).toBe("runner-1");
    await Effect.runPromise(pool.release(acquired));
  });

  it("skips stale queue entries while waiting", async () => {
    const pool = await Effect.runPromise(
      createPool("stale-wait", {
        runners: [{ id: "runner-1", url: "http://runner" }],
        maxConcurrency: 1
      })
    );

    const runner = await Effect.runPromise(pool.acquire);

    const acquirePromise = Effect.runPromise(pool.acquire);
    setTimeout(() => {
      void Effect.runPromise(pool.release({ id: "fake", url: "http://fake" }));
      setTimeout(() => {
        void Effect.runPromise(pool.release(runner));
      }, 5);
    }, 5);

    const acquired = await Promise.race([
      acquirePromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 200))
    ]);
    expect(acquired.id).toBe("runner-1");
    await Effect.runPromise(pool.release(acquired));
  });

  it("spawns runners to satisfy min and terminates on shutdown", async () => {
    let spawned = 0;
    let terminated = 0;

    const backend = {
      spawn: () =>
        Effect.succeed({ id: `runner-${++spawned}`, url: "http://spawned" }),
      terminate: () => {
        terminated += 1;
        return Effect.void;
      }
    };

    const pool = await Effect.runPromise(
      createPool("min", { min: 1, max: 1, maxConcurrency: 1 }, backend)
    );

    const runner = await Effect.runPromise(pool.acquire);
    expect(runner.id).toBe("runner-1");

    await Effect.runPromise(pool.release(runner));
    await Effect.runPromise(pool.shutdown);
    expect(spawned).toBe(1);
    expect(terminated).toBe(1);
  });

  it("spawns on demand when queue is empty", async () => {
    const backend = {
      spawn: () => Effect.succeed({ id: "runner-once", url: "http://spawned" }),
      terminate: () => Effect.void
    };

    const pool = await Effect.runPromise(
      createPool("dynamic", { min: 0, max: 1, maxConcurrency: 1 }, backend)
    );

    const runner = await Effect.runPromise(pool.acquire);
    expect(runner.id).toBe("runner-once");
    await Effect.runPromise(pool.release(runner));
  });

  it("fails when spawning runners fails", async () => {
    const backend = {
      spawn: () => Effect.fail(new Error("boom")),
      terminate: () => Effect.void
    };

    const pool = await Effect.runPromise(createPool("spawn-error", { max: 1 }, backend));
    await expect(Effect.runPromise(pool.acquire)).rejects.toThrow("Failed to spawn runner");
  });

  it("wraps termination failures", async () => {
    const backend = {
      spawn: () => Effect.succeed({ id: "runner-1", url: "http://spawned" }),
      terminate: () => Effect.fail(new Error("boom"))
    };

    const pool = await Effect.runPromise(
      createPool("terminate-error", { min: 1, max: 1 }, backend)
    );

    await expect(Effect.runPromise(pool.shutdown)).rejects.toThrow("Failed to terminate runner");
  });

  it("rejects min configuration without backend", async () => {
    await expect(Effect.runPromise(createPool("bad", { min: 1 }))).rejects.toThrow();
  });
});
