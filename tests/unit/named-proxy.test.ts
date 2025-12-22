import { describe, expect, it } from "bun:test";
import { createNamedProxy } from "../../src/named-proxy";


describe("named proxy", () => {
  it("routes string property access to the id argument", () => {
    const base = (id: string, value: number) => `${id}:${value}`;
    const proxy = createNamedProxy(base);

    expect(proxy.charge(2)).toBe("charge:2");
  });

  it("preserves symbol access on the original function", () => {
    const base = (id: string) => id;
    const proxy = createNamedProxy(base);
    const key = Symbol("meta");

    (proxy as any)[key] = 123;
    expect((proxy as any)[key]).toBe(123);
  });
});
