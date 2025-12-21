import { describe, expect, it } from "bun:test";
import { createFlame, defineMethod } from "../../src";

const SECRET = "retry-secret";

describe("retry", () => {
  it("retries failed invocations", async () => {
    const runner = createFlame({ mode: "runner" });
    let attempts = 0;

    runner.service("svc", {
      flaky: defineMethod("flaky", async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("boom");
        }
        return "ok";
      })
    });

    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const parent = createFlame({
      mode: "parent",
      runnerUrl: server.url,
      security: { secret: SECRET }
    });

    const client = parent.service("svc", {
      flaky: defineMethod("flaky", async () => "ok", { retry: { maxAttempts: 2, baseDelayMs: 10 } })
    });

    const result = await client.flaky();
    expect(result).toBe("ok");

    await server.stop();
  });
});
