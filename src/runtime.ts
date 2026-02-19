import { tryAsync } from "errore";
import type { FlameConfig, FlameOptions, Mode } from "./types";
import type { FlameRegistry } from "./registry";
import { createPoolManager, type PoolManagerConfig } from "./pool/manager";
import { invokeLocal, invokeRemote } from "./invoke";
import { FlameError, InvokeError } from "./errors";

export interface FlameRuntime {
  mode: Mode;
  invokeResult: <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ) => Promise<ReturnType | FlameError>;
  invoke: <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ) => Promise<ReturnType>;
  shutdown: () => Promise<void>;
}

export interface RuntimeRef {
  current: FlameRuntime;
}

interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
}

function wrapInvokeError(message: string, error: Error): FlameError {
  if (error instanceof FlameError) {
    return error;
  }
  return new InvokeError(message, { details: error });
}

function resolveMode(config: FlameConfig): Mode {
  if (config.mode) return config.mode;
  const envMode = process.env.FLAME_MODE as Mode | undefined;
  if (envMode) return envMode;
  if (process.env.FLAME_RUNNER === "true") return "runner";
  return "parent";
}

function buildRetryPolicy(retry?: FlameOptions["retry"]): RetryPolicy | null {
  const maxAttempts = retry?.maxAttempts ?? 1;
  if (maxAttempts <= 1) return null;
  return {
    maxAttempts,
    baseDelayMs: retry?.baseDelayMs ?? 250
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  task: () => Promise<T | FlameError>,
  policy: RetryPolicy | null
): Promise<T | FlameError> {
  if (!policy) return task();

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const result = await task();
    if (!(result instanceof Error)) return result;
    if (attempt === policy.maxAttempts) return result;

    const delayMs = policy.baseDelayMs * Math.pow(2, attempt - 1);
    await sleep(delayMs);
  }

  return new InvokeError("Retry policy reached an unexpected state");
}

export function createRuntime(config: FlameConfig, registry: FlameRegistry): FlameRuntime {
  const mode = resolveMode(config);
  const poolManagerConfig: PoolManagerConfig = {};
  if (config.pools !== undefined) {
    poolManagerConfig.pools = config.pools;
  }
  if (config.defaultPool !== undefined) {
    poolManagerConfig.defaultPool = config.defaultPool;
  }
  if (config.backend !== undefined) {
    poolManagerConfig.backend = config.backend;
  }
  if (config.runnerUrl !== undefined) {
    poolManagerConfig.runnerUrl = config.runnerUrl;
  }
  const poolManager = createPoolManager(poolManagerConfig);

  const invokeWithResult = async <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ): Promise<ReturnType | FlameError> => {
    if (mode !== "parent") {
      return tryAsync({
        try: () => invokeLocal<ReturnType>(registry, serviceId, methodId, args, options),
        catch: (error: Error) => wrapInvokeError("Local invocation failed", error)
      });
    }

    const poolName = options?.pool ?? config.defaultPool ?? "default";
    const policy = buildRetryPolicy(options?.retry);

    return withRetry(async () => {
      const pool = await poolManager.get(poolName);
      if (pool instanceof Error) {
        return pool;
      }

      const runner = await pool.acquire();
      if (runner instanceof Error) {
        return runner;
      }

      await using cleanup = new AsyncDisposableStack();
      cleanup.defer(async () => {
        const release = await tryAsync(() => pool.release(runner));
        if (release instanceof Error) {
          // Best effort cleanup; invocation outcome should still win.
        }
      });

      return await tryAsync({
        try: () => invokeRemote<ReturnType>(runner, serviceId, methodId, args, options, config),
        catch: (error: Error) => wrapInvokeError("Remote invocation failed", error)
      });
    }, policy);
  };

  const invokeResult = async <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ): Promise<ReturnType | FlameError> => {
    return invokeWithResult<ReturnType>(serviceId, methodId, args, options);
  };

  const invoke = async <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ): Promise<ReturnType> => {
    const result = await invokeResult<ReturnType>(serviceId, methodId, args, options);
    if (!(result instanceof Error)) return result;
    throw result;
  };

  const shutdown = async () => {
    const result = await poolManager.shutdownAll();
    if (!(result instanceof Error)) return;
    throw result;
  };

  return { mode, invokeResult, invoke, shutdown };
}
