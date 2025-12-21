import { Effect, Schedule } from "effect";
import type { FlameConfig, FlameOptions, Mode } from "./types";
import type { FlameRegistry } from "./registry";
import { createPoolManager, type PoolManagerConfig } from "./pool/manager";
import { invokeLocal, invokeRemote } from "./invoke";
import { InvokeError } from "./errors";

export interface FlameRuntime {
  mode: Mode;
  invoke: <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ) => Promise<ReturnType>;
  invokeEffect: <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ) => Effect.Effect<ReturnType, Error>;
  shutdown: () => Promise<void>;
}

export interface RuntimeRef {
  current: FlameRuntime;
}

function resolveMode(config: FlameConfig): Mode {
  if (config.mode) return config.mode;
  const envMode = process.env.FLAME_MODE as Mode | undefined;
  if (envMode) return envMode;
  if (process.env.FLAME_RUNNER === "true") return "runner";
  return "parent";
}

function buildRetrySchedule(retry?: FlameOptions["retry"]) {
  const maxAttempts = retry?.maxAttempts ?? 1;
  if (maxAttempts <= 1) return null;
  const baseDelay = retry?.baseDelayMs ?? 250;
  return Schedule.intersect(
    Schedule.exponential(baseDelay),
    Schedule.recurs(maxAttempts - 1)
  );
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

  const invokeEffect = Effect.fn("FlameRuntime.invokeEffect")(
    <ReturnType>(
      serviceId: string,
      methodId: string,
      args: unknown[],
      options?: FlameOptions
    ) => {
      if (mode !== "parent") {
        return Effect.tryPromise({
          try: () => invokeLocal<ReturnType>(registry, serviceId, methodId, args, options),
          catch: (error) =>
            error instanceof InvokeError
              ? error
              : new InvokeError("invoke_error", "Local invocation failed", { details: error })
        });
      }

      const poolName = options?.pool ?? config.defaultPool ?? "default";

      const effect = Effect.gen(function* (_) {
        const pool = yield* _(poolManager.get(poolName));
        const runner = yield* _(pool.acquire);

        const call = Effect.tryPromise({
          try: () => invokeRemote<ReturnType>(runner, serviceId, methodId, args, options, config),
          catch: (error) =>
            error instanceof InvokeError
              ? error
              : new InvokeError("invoke_error", "Remote invocation failed", { details: error })
        });

        const withRelease = call.pipe(Effect.ensuring(pool.release(runner).pipe(Effect.ignore)));
        return yield* _(withRelease);
      });

      const schedule = buildRetrySchedule(options?.retry);
      return schedule ? Effect.retry(effect, schedule) : effect;
    }
  );

  const invoke = <ReturnType>(
    serviceId: string,
    methodId: string,
    args: unknown[],
    options?: FlameOptions
  ) => Effect.runPromise(invokeEffect<ReturnType>(serviceId, methodId, args, options));

  const shutdown = async () => {
    await Effect.runPromise(poolManager.shutdownAll);
  };

  return { mode, invoke, invokeEffect, shutdown };
}
