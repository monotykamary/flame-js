import { describe, expect, it } from "bun:test";
import { createFlame, defineMethod } from "../../src";

const SECRET = "test-secret";

describe("http invocation", () => {
  it("round-trips through runner with superjson", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("echo", {
      roundTrip: defineMethod("roundTrip", async (_ctx, value: unknown) => value)
    });

    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const parent = createFlame({
      mode: "parent",
      runnerUrl: server.url,
      security: { secret: SECRET }
    });

    const client = parent.service("echo", {
      roundTrip: async (value: unknown) => value
    });

    const payload = { at: new Date("2024-01-01T00:00:00Z"), items: new Set(["a", "b"]) };
    const result = (await client.roundTrip(payload)) as typeof payload;

    expect(result.at instanceof Date).toBe(true);
    expect(Array.from(result.items)).toEqual(["a", "b"]);

    await server.stop();
  });

  it("rejects invalid signatures", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("math", {
      add: defineMethod("add", async (_ctx, a: number, b: number) => a + b)
    });

    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const parent = createFlame({
      mode: "parent",
      runnerUrl: server.url,
      security: { secret: "wrong-secret" }
    });

    const client = parent.service("math", {
      add: async (a: number, b: number) => a + b
    });

    await expect(client.add(1, 2)).rejects.toThrow();

    await server.stop();
  });
});
