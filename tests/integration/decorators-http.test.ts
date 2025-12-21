import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";

const SECRET = "decorator-secret";

function setupDecorated(flame: ReturnType<typeof createFlame>) {
  @flame.serviceDecorator("decorated", { pool: "default" })
  class Decorated {
    @flame({ id: "add" })
    async add(a: number, b: number) {
      return a + b;
    }

    async mul(a: number, b: number) {
      return a * b;
    }
  }

  return new Decorated();
}

describe("decorators over http", () => {
  it("invokes decorated methods remotely", async () => {
    const runner = createFlame({ mode: "runner" });
    setupDecorated(runner);

    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const parent = createFlame({
      mode: "parent",
      runnerUrl: server.url,
      security: { secret: SECRET }
    });

    const client = setupDecorated(parent);

    expect(await client.add(1, 2)).toBe(3);
    expect(await client.mul(2, 4)).toBe(8);

    await server.stop();
  });
});
