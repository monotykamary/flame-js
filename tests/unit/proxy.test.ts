import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createServiceProxy, toEffect } from "../../src/proxy";


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
});
