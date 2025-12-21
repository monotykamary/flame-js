import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { createFlame, flameService } from "../../src";


describe("decorators", () => {
  it("wraps class methods in local mode", async () => {
    const flame = createFlame({ mode: "local" });

    @flame.serviceDecorator("math")
    class MathService {
      @flame("add")
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

    const effect = flame.toEffect(Utils.ping);
    const result = await Effect.runPromise(effect());
    expect(result).toBe("pong");
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

  it("supports class decorator options and defaults", async () => {
    const flame = createFlame({ mode: "local" });

    @flame.serviceDecorator({ id: "opts", pool: "default" })
    class OptionsService {
      async ping() {
        return "pong";
      }
    }

    const service = new OptionsService();
    expect(await service.ping()).toBe("pong");

    @flame.serviceDecorator()
    class DefaultNamedService {
      async ok() {
        return "ok";
      }
    }

    const defaultService = new DefaultNamedService();
    expect(await defaultService.ok()).toBe("ok");
    expect(flame.registry.getService("DefaultNamedService")).toBeDefined();
  });

  it("supports service factories", async () => {
    const flame = createFlame({ mode: "local" });
    let calls = 0;

    @flame.serviceDecorator({ id: "factory", factory: () => ({ value: 7, calls: ++calls }) })
    class FactoryService {
      value = 1;
      calls = 0;

      async ping() {
        return { value: this.value, calls: this.calls };
      }
    }
    void FactoryService;

    const service = flame.registry.getService("factory");
    const handler = service?.methods.get("ping")?.handler;
    expect(handler).toBeDefined();

    const result = await handler!({} as any);
    expect(result).toEqual({ value: 7, calls: 1 });
  });

  it("throws when decorating non-methods", () => {
    const flame = createFlame({ mode: "local" });
    const decorator = flame();

    expect(() =>
      decorator({}, "value", { value: 123 } as unknown as PropertyDescriptor)
    ).toThrow();
  });

  it("throws when service id cannot be resolved", async () => {
    const flame = createFlame({ mode: "local" });

    @flame.serviceDecorator()
    class UnnamedService {
      @flame()
      async ping() {
        return "pong";
      }
    }

    Object.defineProperty(UnnamedService, "name", { value: "" });

    const instance = new UnnamedService();
    await expect(instance.ping()).rejects.toThrow();
  });

  it("exposes flameService from the default instance", () => {
    const decorator = flameService("global-service");
    expect(typeof decorator).toBe("function");
  });
});
