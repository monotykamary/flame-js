import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";

const SECRET = "path-secret";

describe("invoke path", () => {
  it("honors custom invoke paths", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("svc", { echo: async (value: string) => value });
    const server = runner.createRunnerServer({ port: 0, invokePath: "/flame", security: { secret: SECRET } });

    const parent = createFlame({
      mode: "parent",
      runnerUrl: server.url,
      invokePath: "/flame",
      security: { secret: SECRET }
    });

    const client = parent.service("svc", { echo: async (value: string) => value });
    expect(await client.echo("hello")).toBe("hello");

    await server.stop();
  });
});
