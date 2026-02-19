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

  it("throws when parent mode cannot resolve a configured pool", async () => {
    const flame = createFlame({
      mode: "parent",
      pools: {}
    });
    const service = flame.service("svc", {
      ping: async () => "pong"
    });

    await expect(service.ping()).rejects.toThrow("Pool not configured");
  });

  it("throws when a pool cannot acquire a runner", async () => {
    const flame = createFlame({
      mode: "parent",
      pools: {
        default: { max: 0 }
      }
    });
    const service = flame.service("svc", {
      ping: async () => "pong"
    });

    await expect(service.ping()).rejects.toThrow("has no runners configured");
  });

  it("exhausts retries and surfaces final invocation error", async () => {
    const flame = createFlame({
      mode: "parent",
      pools: {
        default: {
          runners: [{ url: "http://127.0.0.1:1" }]
        }
      },
      requestTimeoutMs: 10
    });
    const service = flame.service("svc", {
      ping: async () => "pong"
    }, {
      retry: {
        maxAttempts: 2,
        baseDelayMs: 1
      }
    });

    await expect(service.ping()).rejects.toThrow();
  });

  it("handles invalid retry policies defensively", async () => {
    const flame = createFlame({
      mode: "parent"
    });
    const service = flame.service("svc", {
      ping: async () => "pong"
    }, {
      retry: {
        maxAttempts: Number.NaN,
        baseDelayMs: 1
      }
    });

    await expect(service.ping()).rejects.toThrow("Retry policy reached an unexpected state");
  });

  it("throws shutdown errors from pool manager", async () => {
    const flame = createFlame({
      mode: "parent",
      pools: {
        default: { min: 1, max: 1 }
      },
      backend: {
        spawn: async () => ({ id: "runner-1", url: "http://127.0.0.1:1" }),
        terminate: async () => new Error("terminate boom")
      }
    });

    const service = flame.service("svc", {
      ping: async () => "pong"
    });
    await expect(service.ping()).rejects.toThrow();

    await expect(flame.shutdown()).rejects.toThrow("Failed to terminate runner");
  });
});
