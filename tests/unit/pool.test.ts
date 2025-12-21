import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
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
});
