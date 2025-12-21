import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";


describe("runtime", () => {
  it("wraps local invocation errors", async () => {
    const flame = createFlame({ mode: "local" });
    const service = flame.service("svc", {
      boom: async () => {
        throw new Error("boom");
      }
    });

    await expect(service.boom()).rejects.toThrow("Local invocation failed");
  });
});
