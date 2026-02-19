import { randomUUID } from "crypto";
import { tryFn } from "errore";
import { deserialize, serialize } from "./serialization";
import { FlameError, InvokeError, RemoteError, TimeoutError, TransportError } from "./errors";
import { signBody } from "./security";
import type { FlameConfig, FlameOptions, InvocationRequest, InvocationResponse, InvocationContext } from "./types";
import type { FlameRegistry } from "./registry";
import { getMethod } from "./registry";
import type { RunnerHandle } from "./pool/types";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

type InvokeErrorOptions = { details?: unknown; retryable?: boolean };

function toInvokeErrorOptions(source: InvokeErrorOptions): InvokeErrorOptions {
  return {
    ...(source.details !== undefined ? { details: source.details } : {}),
    ...(source.retryable !== undefined ? { retryable: source.retryable } : {})
  };
}

function mapRemoteInvokeError(error: unknown): FlameError {
  if (error instanceof FlameError) {
    return error;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new TimeoutError("Invocation timed out", { retryable: true });
  }

  return new TransportError("Failed to invoke runner", {
    details: error,
    retryable: true
  });
}

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
      throw new TransportError(`Runner responded with ${response.status}`);
    }

    const text = await response.text();
    const payload = tryFn({
      try: () => JSON.parse(text) as InvocationResponse,
      catch: (error: Error) =>
        new InvokeError("Failed to parse runner response", { details: error })
    });
    if (payload instanceof Error) {
      throw payload;
    }

    if (!payload.ok) {
      throw new RemoteError(payload.error.message, toInvokeErrorOptions(payload.error));
    }

    return deserialize<Result>(payload.result);
  } catch (error) {
    throw mapRemoteInvokeError(error);
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
  if (!timeoutMs) {
    return (await run) as Result;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new TimeoutError("Invocation timed out", { retryable: true }));
      }, timeoutMs);
    });

    return (await Promise.race([run, timeoutPromise])) as Result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
