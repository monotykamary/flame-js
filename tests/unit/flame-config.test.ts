import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";


describe("flame config", () => {
  it("merges config on configure and supports fn", async () => {
    const flame = createFlame({
      mode: "local",
      pools: { default: { runners: [{ url: "http://runner" }] } }
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
