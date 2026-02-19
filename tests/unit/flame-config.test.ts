import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";


describe("flame config", () => {
  it("merges config on configure and supports fn", async () => {
    const backend = {
      spawn: async () => ({ id: "runner-1", url: "http://runner" }),
      terminate: async () => {}
    };

    const flame = createFlame({
      mode: "local",
      defaultPool: "default",
      pools: { default: { runners: [{ url: "http://runner" }] } },
      backend
    });

    await flame.configure({
      pools: { extra: { runners: [{ url: "http://runner" }] } }
    });

    const fn = flame.fn("adder", async (value: number) => value + 1);
    const result = await fn(2);
    expect(result).toBe(3);

    await flame.shutdown();
  });
});
