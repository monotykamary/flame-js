import { describe, expect, it } from "bun:test";
import { buildInvocationRequest, invokeLocal } from "../../src/invoke";
import { createRegistry } from "../../src/registry";
import { InvokeError } from "../../src/errors";


describe("invoke", () => {
  it("builds signed requests", () => {
    const config = { security: { secret: "secret" }, requestTimeoutMs: 5000 };
    const { headers, body } = buildInvocationRequest(
      "svc",
      "method",
      [1, 2],
      { timeoutMs: 1000 },
      config
    );

    expect(headers["x-flame-signature"]).toBeDefined();
    const parsed = JSON.parse(body) as { timeoutMs?: number };
    expect(parsed.timeoutMs).toBe(1000);
  });

  it("times out local invocations", async () => {
    const registry = createRegistry();
    registry.registerService({
      id: "svc",
      methods: new Map([
        [
          "slow",
          {
            id: "slow",
            handler: async () => {
              await new Promise((resolve) => setTimeout(resolve, 50));
              return "ok";
            }
          }
        ]
      ])
    });

    await expect(invokeLocal(registry, "svc", "slow", [], { timeoutMs: 10 })).rejects.toThrow(
      InvokeError
    );
  });
});
