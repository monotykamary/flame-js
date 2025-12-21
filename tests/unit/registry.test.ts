import { describe, expect, it } from "bun:test";
import { createRegistry, getMethod } from "../../src/registry";

describe("registry", () => {
  it("registers and resolves methods", async () => {
    const registry = createRegistry();
    const handler = async () => "ok";

    registry.registerService({
      id: "svc",
      methods: new Map([
        ["ping", { id: "ping", handler }]
      ])
    });

    const method = getMethod(registry, "svc", "ping");
    expect(method.handler).toBe(handler);
  });

  it("is idempotent for duplicate service registration", () => {
    const registry = createRegistry();
    const handler = async () => "ok";

    const service = {
      id: "svc",
      methods: new Map([
        ["ping", { id: "ping", handler }]
      ])
    };

    registry.registerService(service);
    const second = registry.registerService(service);
    expect(second).toBe(service);
  });

  it("throws on missing services", () => {
    const registry = createRegistry();
    expect(() => getMethod(registry, "missing", "method")).toThrow();
  });
});
