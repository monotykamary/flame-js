import { randomUUID } from "crypto";
import { deserialize, serialize } from "./serialization";
import { FlameError, InvokeError } from "./errors";
import { signBody } from "./security";
import type { FlameConfig, FlameOptions, InvocationRequest, InvocationResponse, InvocationContext } from "./types";
import type { FlameRegistry } from "./registry";
import { getMethod } from "./registry";
import type { RunnerHandle } from "./pool/types";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export function buildInvocationRequest(
  serviceId: string,
  methodId: string,
  args: unknown[],
  options: FlameOptions | undefined,
  config: FlameConfig
): { body: string; headers: Record<string, string>; timeoutMs?: number } {
  const timeoutMs = options?.timeoutMs ?? config.requestTimeoutMs;
  const now = Date.now();
  const expiryWindow = timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const payload: InvocationRequest = {
    invocationId: randomUUID(),
    serviceId,
    methodId,
    args: serialize(args),
    iat: now,
    exp: now + expiryWindow,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(options?.idempotencyKey !== undefined
      ? { idempotencyKey: options.idempotencyKey }
      : {})
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (config.security?.secret) {
    headers["x-flame-signature"] = signBody(body, config.security.secret);
  }

  const result: { body: string; headers: Record<string, string>; timeoutMs?: number } = {
    body,
    headers
  };
  if (timeoutMs !== undefined) {
    result.timeoutMs = timeoutMs;
  }
  return result;
}

export async function invokeRemote<Result>(
  runner: RunnerHandle,
  serviceId: string,
  methodId: string,
  args: unknown[],
  options: FlameOptions | undefined,
  config: FlameConfig
): Promise<Result> {
  const { body, headers, timeoutMs } = buildInvocationRequest(serviceId, methodId, args, options, config);
  const controller = new AbortController();
  const timeoutId = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const path = config.invokePath ?? "/invoke";
    const response = await fetch(`${runner.url}${path}`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new InvokeError("transport_error", `Runner responded with ${response.status}`);
    }

    const text = await response.text();
    let payload: InvocationResponse;
    try {
      payload = JSON.parse(text) as InvocationResponse;
    } catch (error) {
      throw new InvokeError("invoke_error", "Failed to parse runner response", { details: error });
    }

    if (!payload.ok) {
      const errorOptions: { details?: unknown; retryable?: boolean } = {};
      if (payload.error.details !== undefined) {
        errorOptions.details = payload.error.details;
      }
      if (payload.error.retryable !== undefined) {
        errorOptions.retryable = payload.error.retryable;
      }
      throw new InvokeError("remote_error", payload.error.message, errorOptions);
    }

    return deserialize<Result>(payload.result);
  } catch (error) {
    if (error instanceof InvokeError) {
      throw error;
    }
    if (error instanceof FlameError) {
      const errorOptions: { details?: unknown; retryable?: boolean } = {};
      if (error.details !== undefined) {
        errorOptions.details = error.details;
      }
      if (error.retryable !== undefined) {
        errorOptions.retryable = error.retryable;
      }
      throw new InvokeError(error.code, error.message, errorOptions);
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new InvokeError("timeout", "Invocation timed out", { retryable: true });
    }
    throw new InvokeError("transport_error", "Failed to invoke runner", { details: error, retryable: true });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function invokeLocal<Result>(
  registry: FlameRegistry,
  serviceId: string,
  methodId: string,
  args: unknown[],
  options?: FlameOptions
): Promise<Result> {
  const method = getMethod(registry, serviceId, methodId);
  const timeoutMs = options?.timeoutMs;
  const controller = new AbortController();
  const deadline = timeoutMs ? Date.now() + timeoutMs : null;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const context: InvocationContext = {
    invocationId: randomUUID(),
    deadline,
    signal: controller.signal
  };

  const run = Promise.resolve(method.handler(context, ...args));

  try {
    if (!timeoutMs) {
      return (await run) as Result;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new InvokeError("timeout", "Invocation timed out", { retryable: true }));
      }, timeoutMs);
    });

    return (await Promise.race([run, timeoutPromise])) as Result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
