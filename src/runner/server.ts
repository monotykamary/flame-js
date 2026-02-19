import type { FlameRegistry } from "../registry";
import type { FlameConfig, InvocationRequest, InvocationResponse, InvocationContext } from "../types";
import { deserialize, serialize } from "../serialization";
import { FlameError, SerializationError, TimeoutError } from "../errors";
import { validateWindow, verifySignature } from "../security";
import { getMethod } from "../registry";

export interface RunnerServerOptions {
  registry: FlameRegistry;
  port?: number;
  hostname?: string;
  invokePath?: string;
  maxBodyBytes?: number;
  security?: FlameConfig["security"];
  exposeErrors?: boolean;
}

export interface RunnerServer {
  port: number;
  hostname: string;
  url: string;
  stop: () => Promise<void>;
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1MB

export function createRunnerServer(options: RunnerServerOptions): RunnerServer {
  const port = options.port ?? 0;
  const hostname = options.hostname ?? "0.0.0.0";
  const invokePath = options.invokePath ?? "/invoke";
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method !== "POST" || url.pathname !== invokePath) {
        return new Response("Not found", { status: 404 });
      }

      const bodyBuffer = await req.arrayBuffer();
      if (bodyBuffer.byteLength > maxBodyBytes) {
        return new Response("Payload too large", { status: 413 });
      }
      const body = new TextDecoder().decode(bodyBuffer);

      if (options.security?.secret) {
        const signature = req.headers.get("x-flame-signature");
        if (!signature || !verifySignature(body, signature, options.security.secret)) {
          return new Response("Invalid signature", { status: 401 });
        }
      }

      let payload: InvocationRequest;
      try {
        payload = JSON.parse(body) as InvocationRequest;
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      if (!validateWindow(payload.iat, payload.exp, options.security?.maxSkewMs)) {
        return new Response("Request expired", { status: 401 });
      }

      let args: unknown[];
      try {
        args = deserialize<unknown[]>(payload.args);
      } catch (error) {
        const serializationError = new SerializationError("Failed to deserialize arguments", { details: error });
        const details = options.exposeErrors ? serializationError.details : undefined;
        return Response.json({
          ok: false,
          error: {
            code: serializationError.code,
            message: serializationError.message,
            ...(details !== undefined ? { details } : {}),
            retryable: false
          }
        } satisfies InvocationResponse);
      }

      let method;
      try {
        method = getMethod(options.registry, payload.serviceId, payload.methodId);
      } catch (error) {
        return new Response("Not found", { status: 404 });
      }

      const timeoutMs = payload.timeoutMs;
      const controller = new AbortController();
      const deadline = timeoutMs ? Date.now() + timeoutMs : null;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const context: InvocationContext = {
        invocationId: payload.invocationId,
        deadline,
        signal: controller.signal,
        ...(payload.trace ? { trace: payload.trace } : {})
      };

      try {
        const run = Promise.resolve(method.handler(context, ...args));

        const timeoutPromise = timeoutMs
          ? new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                controller.abort();
                reject(new TimeoutError("Invocation timed out"));
              }, timeoutMs);
            })
          : null;

        const result = timeoutPromise ? await Promise.race([run, timeoutPromise]) : await run;

        return Response.json({ ok: true, result: serialize(result) } satisfies InvocationResponse);
      } catch (error) {
        const flameError = error instanceof FlameError ? error : undefined;
        const details = options.exposeErrors
          ? error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error
          : undefined;

        const response: InvocationResponse = {
          ok: false,
          error: {
            code: flameError?.code ?? "handler_error",
            message:
              error instanceof Error
                ? error.message
                : "Handler threw an error",
            ...(details !== undefined ? { details } : {}),
            ...(flameError?.retryable !== undefined
              ? { retryable: flameError.retryable }
              : {})
          }
        };
        return Response.json(response);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }
  });

  const actualPort = typeof server.port === "number" ? server.port : port;
  const actualHost = server.hostname ?? hostname;

  return {
    port: actualPort,
    hostname: actualHost,
    url: `http://${actualHost}:${actualPort}`,
    stop: async () => {
      server.stop();
    }
  };
}
