import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";

describe("local mode", () => {
  it("runs handlers in-process", async () => {
    const flame = createFlame({ mode: "local" });
    const math = flame.service("math", {
      add: async (a: number, b: number) => a + b
    });

    const result = await math.add(2, 3);
    expect(result).toBe(5);
  });
});
