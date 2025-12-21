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

  it("throws on missing methods", () => {
    const registry = createRegistry();
    registry.registerService({ id: "svc", methods: new Map() });
    expect(() => getMethod(registry, "svc", "missing")).toThrow();
  });

  it("merges methods for repeated registration", async () => {
    const registry = createRegistry();
    const one = async () => 1;
    const two = async () => 2;

    registry.registerService({
      id: "svc",
      methods: new Map([["one", { id: "one", handler: one }]])
    });

    registry.registerService({
      id: "svc",
      methods: new Map([["two", { id: "two", handler: two }]])
    });

    const oneMethod = getMethod(registry, "svc", "one");
    const twoMethod = getMethod(registry, "svc", "two");
    expect(oneMethod.handler).toBe(one);
    expect(twoMethod.handler).toBe(two);
  });

  it("rejects conflicting service options", () => {
    const registry = createRegistry();
    registry.registerService({
      id: "svc",
      methods: new Map(),
      options: { pool: "default" }
    });

    expect(() =>
      registry.registerService({
        id: "svc",
        methods: new Map(),
        options: { pool: "other" }
      })
    ).toThrow();
  });

  it("rejects conflicting method handlers", () => {
    const registry = createRegistry();
    const first = async () => "one";
    const second = async () => "two";

    registry.registerService({
      id: "svc",
      methods: new Map([["ping", { id: "ping", handler: first }]])
    });

    expect(() =>
      registry.registerService({
        id: "svc",
        methods: new Map([["ping", { id: "ping", handler: second }]])
      })
    ).toThrow();
  });

  it("lists services", () => {
    const registry = createRegistry();
    registry.registerService({ id: "svc", methods: new Map() });
    expect(registry.listServices().length).toBe(1);
  });

  it("returns services by id", () => {
    const registry = createRegistry();
    const service = { id: "svc", methods: new Map() };
    registry.registerService(service);
    expect(registry.getService("svc")).toBe(service);
    expect(registry.getService("missing")).toBeUndefined();
  });
});
