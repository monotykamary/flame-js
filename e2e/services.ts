import { flame, defineMethod } from "../src";

const RETRY = { maxAttempts: 10, baseDelayMs: 200 };

export const MathService = flame.service("math", {
  add: defineMethod("add", async (_ctx, a: number, b: number) => a + b, { retry: RETRY })
});
