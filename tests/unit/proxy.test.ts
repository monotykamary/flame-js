import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createServiceProxy, createServiceProxyEffect, getMeta, isRunnerMode, toEffect } from "../../src/proxy";

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
        invokeEffect: (serviceId: string, methodId: string, args: unknown[]) => {
          calls.push({ serviceId, methodId, args });
          return Effect.succeed("ok");
        },
        shutdown: async () => {}
      }
    };

    const proxy = createServiceProxy(runtimeRef as any, "svc", {
      ping: { id: "ping", handler: async () => "pong" }
    });

    const result = await proxy.ping("hello");
    expect(result).toBe("ok");
    expect(calls[0]).toEqual({ serviceId: "svc", methodId: "ping", args: ["hello"] });

    const effectFn = toEffect(proxy.ping);
    const effectResult = await Effect.runPromise(effectFn("world"));
    expect(effectResult).toBe("ok");
    expect(calls[1]).toEqual({ serviceId: "svc", methodId: "ping", args: ["world"] });
  });

  it("throws on non-proxy functions", () => {
    expect(() => toEffect(async () => "nope")).toThrow();
  });

  it("exposes effect proxies and meta helpers", async () => {
    const calls: Array<{ serviceId: string; methodId: string; args: unknown[] }> = [];

    const runtimeRef = {
      current: {
        mode: "parent",
        invoke: async (serviceId: string, methodId: string, args: unknown[]) => {
          calls.push({ serviceId, methodId, args });
          return "ok";
        },
        invokeEffect: (serviceId: string, methodId: string, args: unknown[]) => {
          calls.push({ serviceId, methodId, args });
          return Effect.succeed("ok");
        },
        shutdown: async () => {}
      }
    };

    const proxy = createServiceProxyEffect(
      runtimeRef as any,
      "svc",
      { ping: { id: "ping", handler: async () => "pong" } },
      { timeoutMs: 5 }
    );

    const result = await Effect.runPromise(proxy.ping("hello"));
    expect(result).toBe("ok");
    expect(calls[0]).toEqual({ serviceId: "svc", methodId: "ping", args: ["hello"] });

    const meta = getMeta(proxy.ping);
    expect(meta?.serviceId).toBe("svc");
    expect(meta?.methodId).toBe("ping");
    expect(meta?.options?.timeoutMs).toBe(5);
    expect(getMeta(123 as any)).toBeUndefined();
    expect(isRunnerMode(runtimeRef.current as any)).toBe(false);
    expect(isRunnerMode({ ...runtimeRef.current, mode: "runner" } as any)).toBe(true);
  });
});
