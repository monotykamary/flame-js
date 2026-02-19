import { describe, expect, it } from "bun:test";
import { FlameService } from "../../src/flame-service";

describe("flame service", () => {
  it("supports await using for lifecycle management", async () => {
    let shutdownCalled = false;

    await (async () => {
      await using flame = FlameService.create({ mode: "local" });
      const originalShutdown = flame.shutdown.bind(flame);
      flame.shutdown = async () => {
        shutdownCalled = true;
        await originalShutdown();
      };

      const ping = flame.fn("ping", async () => "pong");
      expect(await ping()).toBe("pong");
    })();

    expect(shutdownCalled).toBe(true);
  });

  it("swallows dispose failures in await using", async () => {
    await expect((async () => {
      await using flame = FlameService.create({ mode: "local" });
      flame.shutdown = async () => {
        throw new Error("boom");
      };
      return "ok";
    })()).resolves.toBe("ok");
  });

  it("provides a managed flame instance with using", async () => {
    let shutdownCalled = false;

    const result = await FlameService.using(async (flame) => {
      const originalShutdown = flame.shutdown.bind(flame);
      flame.shutdown = async () => {
        shutdownCalled = true;
        await originalShutdown();
      };

      const ping = flame.fn("ping", async () => "pong");
      return ping();
    }, { mode: "local" });

    expect(result).toBe("pong");
    expect(shutdownCalled).toBe(true);
  });

  it("swallows shutdown failures", async () => {
    let shutdownCalled = false;

    const result = await FlameService.using(async (flame) => {
      flame.shutdown = async () => {
        shutdownCalled = true;
        throw new Error("boom");
      };
      return "ok";
    }, { mode: "local" });

    expect(result).toBe("ok");
    expect(shutdownCalled).toBe(true);
  });

  it("preserves work failures", async () => {
    await expect(
      FlameService.using(async () => {
        throw new Error("work failed");
      }, { mode: "local" })
    ).rejects.toThrow("work failed");
  });

  it("creates standalone flame instances", async () => {
    const flame = FlameService.create({ mode: "local" });
    const ping = flame.fn("ping", async () => "pong");

    expect(await ping()).toBe("pong");
    await flame.shutdown();
  });

  it("constructs the FlameService class", () => {
    expect(() => {
      new (FlameService as unknown as { new (): unknown })();
    }).not.toThrow();
  });
});
