import { describe, expect, it } from "bun:test";
import { createFlame } from "../../src";
import { serialize } from "../../src/serialization";
import { signBody } from "../../src/security";

const SECRET = "runner-secret";

function makeRequestBody(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    invocationId: "inv-1",
    serviceId: "svc",
    methodId: "echo",
    args: serialize(["hello"]),
    timeoutMs: 1000,
    iat: Date.now(),
    exp: Date.now() + 10_000,
    ...overrides
  });
}

describe("runner server", () => {
  it("rejects invalid json", async () => {
    const runner = createFlame({ mode: "runner" });
    const server = runner.createRunnerServer({ port: 0 });

    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });

    expect(response.status).toBe(400);
    await server.stop();
  });

  it("rejects expired requests", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("svc", { echo: async (value: string) => value });
    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const body = makeRequestBody({ iat: Date.now() - 120_000, exp: Date.now() - 110_000 });
    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flame-signature": signBody(body, SECRET)
      },
      body
    });

    expect(response.status).toBe(401);
    await server.stop();
  });

  it("rejects invalid signatures", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("svc", { echo: async (value: string) => value });
    const server = runner.createRunnerServer({ port: 0, security: { secret: SECRET } });

    const body = makeRequestBody();
    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-flame-signature": "bad"
      },
      body
    });

    expect(response.status).toBe(401);
    await server.stop();
  });

  it("rejects unknown methods", async () => {
    const runner = createFlame({ mode: "runner" });
    const server = runner.createRunnerServer({ port: 0 });

    const body = makeRequestBody({ serviceId: "missing" });
    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });

    expect(response.status).toBe(404);
    await server.stop();
  });

  it("rejects oversized payloads", async () => {
    const runner = createFlame({ mode: "runner" });
    const server = runner.createRunnerServer({ port: 0, maxBodyBytes: 10 });

    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "0123456789012345"
    });

    expect(response.status).toBe(413);
    await server.stop();
  });

  it("hides error details by default", async () => {
    const runner = createFlame({ mode: "runner" });
    runner.service("svc", { boom: async () => {
      throw new Error("boom");
    } });
    const server = runner.createRunnerServer({ port: 0 });

    const body = makeRequestBody({ methodId: "boom" });
    const response = await fetch(`${server.url}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });

    const payload = (await response.json()) as { ok: boolean; error?: { details?: unknown } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.details).toBeUndefined();

    await server.stop();
  });
});
