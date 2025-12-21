import { describe, expect, it } from "bun:test";
import { serialize, deserialize } from "../../src/serialization";


describe("serialization", () => {
  it("round-trips with superjson", () => {
    const payload = { when: new Date("2024-02-01T00:00:00Z"), items: new Set([1, 2]) };
    const encoded = serialize(payload);
    const decoded = deserialize<typeof payload>(encoded);

    expect(decoded.when instanceof Date).toBe(true);
    expect(Array.from(decoded.items)).toEqual([1, 2]);
  });

  it("fails on unserializable values", () => {
    const value: Record<string, unknown> = {};
    Object.defineProperty(value, "boom", {
      enumerable: true,
      get() {
        throw new Error("boom");
      }
    });
    expect(() => serialize(value)).toThrow();
  });

  it("fails on invalid payloads", () => {
    expect(() => deserialize("not-json")).toThrow();
  });
});
