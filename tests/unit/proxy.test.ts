import { describe, expect, it } from "bun:test";
import { createServiceProxy, getMeta, isRunnerMode } from "../../src/proxy";

describe("proxy", () => {
  it("invokes runtime with service and method ids", async () => {
    const calls: Array<{ serviceId: string; methodId: string; args: unknown[] }> = [];

    const runtimeRef = {
      current: {
        mode: "parent",
        invoke: async (serviceId: string, methodId: string, args: unknown[]) => {
          calls.push({ serviceId, methodId, args });
          return "ok";
        },
        invokeResult: async () => "ignored",
        shutdown: async () => {}
      }
    };

    const proxy = createServiceProxy(runtimeRef as any, "svc", {
      ping: { id: "ping", handler: async () => "pong" }
    });

    const result = await proxy.ping("hello");
    expect(result).toBe("ok");
    expect(calls[0]).toEqual({ serviceId: "svc", methodId: "ping", args: ["hello"] });
  });

  it("exposes meta helpers", () => {
    const runtimeRef = {
      current: {
        mode: "parent",
        invoke: async () => "ok",
        invokeResult: async () => "ok",
        shutdown: async () => {}
      }
    };

    const proxy = createServiceProxy(
      runtimeRef as any,
      "svc",
      { ping: { id: "ping", handler: async () => "pong" } },
      { timeoutMs: 5 }
    );

    const meta = getMeta(proxy.ping);
    expect(meta?.serviceId).toBe("svc");
    expect(meta?.methodId).toBe("ping");
    expect(meta?.options?.timeoutMs).toBe(5);
    expect(getMeta(123 as any)).toBeUndefined();
    expect(isRunnerMode(runtimeRef.current as any)).toBe(false);
    expect(isRunnerMode({ ...runtimeRef.current, mode: "runner" } as any)).toBe(true);
  });

  it("invokes runtime result path when configured", async () => {
    const calls: Array<{ serviceId: string; methodId: string; args: unknown[] }> = [];

    const runtimeRef = {
      current: {
        mode: "parent",
        invoke: async () => {
          throw new Error("should not use invoke");
        },
        invokeResult: async (serviceId: string, methodId: string, args: unknown[]) => {
          calls.push({ serviceId, methodId, args });
          return "ok";
        },
        shutdown: async () => {}
      }
    };

    const proxy = createServiceProxy(
      runtimeRef as any,
      "svc",
      { ping: { id: "ping", handler: async () => "pong" } },
      undefined,
      "result"
    );

    const result = await proxy.ping("hello");
    expect(result).toBe("ok");
    expect(calls[0]).toEqual({ serviceId: "svc", methodId: "ping", args: ["hello"] });
  });
});
