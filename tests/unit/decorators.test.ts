import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createFlame } from "../../src";


describe("decorators", () => {
  it("wraps class methods in local mode", async () => {
    const flame = createFlame({ mode: "local" });

    @flame.serviceDecorator("math")
    class MathService {
      @flame({ id: "add" })
      async add(a: number, b: number) {
        return a + b;
      }

      async mul(a: number, b: number) {
        return a * b;
      }
    }

    const service = new MathService();
    expect(await service.add(2, 3)).toBe(5);
    expect(await service.mul(2, 3)).toBe(6);

    const registryService = flame.registry.getService("math");
    expect(registryService).toBeDefined();
    expect(registryService?.methods.has("add")).toBe(true);
    expect(registryService?.methods.has("mul")).toBe(true);
  });

  it("supports method-only decorators with explicit service id", async () => {
    const flame = createFlame({ mode: "local" });

    class Utils {
      @flame({ serviceId: "utils", id: "ping" })
      static async ping() {
        return "pong";
      }
    }

    expect(await Utils.ping()).toBe("pong");
    expect(flame.registry.getService("utils")).toBeDefined();
  });

  it("exposes effect conversions for decorated methods", async () => {
    const flame = createFlame({ mode: "local" });

    @flame.serviceDecorator("calc")
    class Calc {
      @flame({ id: "square" })
      async square(value: number) {
        return value * value;
      }
    }

    const calc = new Calc();
    const effect = flame.toEffect(calc.square);
    const result = await Effect.runPromise(effect(4));
    expect(result).toBe(16);
  });
});
