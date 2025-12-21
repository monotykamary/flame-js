import { flame, defineMethod, flameService } from "../src";

const RETRY = { maxAttempts: 5, baseDelayMs: 100 };

export const MathService = flame.service("math", {
  add: defineMethod("add", async (_ctx, a: number, b: number) => a + b, { retry: RETRY }),
  sub: async (a: number, b: number) => a - b
});

export const addFn = flame.fn("math.add", async (a: number, b: number) => a + b, { pool: "gpu" });

@flameService("decorated", { pool: "default" })
export class DecoratedService {
  @flame({ id: "add", pool: "gpu" })
  async add(a: number, b: number) {
    return a + b;
  }

  async mul(a: number, b: number) {
    return a * b;
  }
}

export const decorated = new DecoratedService();

export class StaticUtils {
  @flame({ serviceId: "utils", id: "ping" })
  static async ping() {
    return "pong";
  }
}
