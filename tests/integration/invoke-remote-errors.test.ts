import { describe, expect, it } from "bun:test";
import { invokeRemote } from "../../src/invoke";
import { InvokeError } from "../../src/errors";

function startServer(handler: () => Response | Promise<Response>) {
  const server = Bun.serve({
    port: 0,
    fetch: () => handler()
  });
  const port = typeof server.port === "number" ? server.port : 0;
  return {
    url: `http://localhost:${port}`,
    stop: () => server.stop()
  };
}

describe("invokeRemote errors", () => {
  it("fails on invalid JSON responses", async () => {
    const server = startServer(() => new Response("not-json"));

    await expect(
      invokeRemote(
        { id: "runner", url: server.url },
        "svc",
        "method",
        [],
        undefined,
        {}
      )
    ).rejects.toThrow(InvokeError);

    server.stop();
  });

  it("fails on non-ok responses", async () => {
    const server = startServer(() => new Response("boom", { status: 500 }));

    await expect(
      invokeRemote(
        { id: "runner", url: server.url },
        "svc",
        "method",
        [],
        undefined,
        {}
      )
    ).rejects.toMatchObject({ code: "transport_error" });

    server.stop();
  });

  it("fails on invalid serialized payloads", async () => {
    const server = startServer(() =>
      Response.json({ ok: true, result: "not-json" })
    );

    await expect(
      invokeRemote(
        { id: "runner", url: server.url },
        "svc",
        "method",
        [],
        undefined,
        {}
      )
    ).rejects.toThrow(InvokeError);

    server.stop();
  });

  it("surfaces remote error payloads", async () => {
    const server = startServer(() =>
      Response.json({
        ok: false,
        error: { message: "nope", details: { reason: "bad" }, retryable: true }
      })
    );

    await expect(
      invokeRemote(
        { id: "runner", url: server.url },
        "svc",
        "method",
        [],
        undefined,
        {}
      )
    ).rejects.toMatchObject({ code: "remote_error", retryable: true });

    server.stop();
  });

  it("wraps unexpected fetch errors", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = () => {
      throw "boom";
    };

    try {
      await expect(
        invokeRemote(
          { id: "runner", url: "http://localhost:0" },
          "svc",
          "method",
          [],
          undefined,
          {}
        )
      ).rejects.toMatchObject({ code: "transport_error" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("times out slow responses", async () => {
    const server = startServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return Response.json({ ok: true, result: "{}" });
    });

    await expect(
      invokeRemote(
        { id: "runner", url: server.url },
        "svc",
        "method",
        [],
        { timeoutMs: 5 },
        {}
      )
    ).rejects.toThrow(InvokeError);

    server.stop();
  });
});
