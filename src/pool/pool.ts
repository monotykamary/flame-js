import { Effect, Queue, Ref, Option } from "effect";
import type { PoolConfig, RunnerHandle, Backend } from "./types";
import { InvokeError } from "../errors";

export interface Pool {
  name: string;
  acquire: Effect.Effect<RunnerHandle, Error>;
  release: (runner: RunnerHandle) => Effect.Effect<void, Error>;
  shutdown: Effect.Effect<void, Error>;
}

interface RunnerState {
  handle: RunnerHandle;
  inUse: number;
  lastUsed: number;
}

interface PoolState {
  runners: Map<string, RunnerState>;
  spawning: number;
}

function normalizeConfig(config: PoolConfig) {
  return {
    min: config.min ?? 0,
    max: config.max ?? 1,
    maxConcurrency: config.maxConcurrency ?? 1,
    runners: config.runners ?? [],
    spawnTimeoutMs: config.spawnTimeoutMs
  };
}

export function createPool(
  name: string,
  config: PoolConfig,
  backend?: Backend
): Effect.Effect<Pool, Error> {
  const cfg = normalizeConfig(config);

  return Effect.gen(function* (_) {
    const queue = yield* _(Queue.unbounded<RunnerHandle>());
    const stateRef = yield* _(Ref.make<PoolState>({ runners: new Map(), spawning: 0 }));

    const addRunner = (handle: RunnerHandle) =>
      Effect.gen(function* (__): Generator<any, void, any> {
        const added = yield* __(
          Ref.modify(stateRef, (state) => {
            if (state.runners.has(handle.id)) {
              return [false, state] as const;
            }
            const next = new Map(state.runners);
            next.set(handle.id, { handle, inUse: 0, lastUsed: Date.now() });
            return [true, { ...state, runners: next }];
          })
        );

        if (added) {
          for (let i = 0; i < cfg.maxConcurrency; i += 1) {
            yield* __(Queue.offer(queue, handle));
          }
        }
      });

    const spawnRunner = Effect.gen(function* (__): Generator<any, RunnerHandle, any> {
      if (!backend) {
        throw new InvokeError("config_error", "No backend configured to spawn runners");
      }

      const shouldSpawn = yield* __(
        Ref.modify(stateRef, (state) => {
          const total = state.runners.size + state.spawning;
          if (total >= cfg.max) {
            return [false, state] as const;
          }
          return [true, { ...state, spawning: state.spawning + 1 }];
        })
      );

      if (!shouldSpawn) {
        throw new InvokeError("no_runner", `Pool '${name}' has reached max runners`);
      }

      const handle = yield* __(
        backend.spawn({ poolName: name }).pipe(
          Effect.mapError((error) =>
            new InvokeError("invoke_error", "Failed to spawn runner", { details: error })
          ),
          Effect.ensuring(
            Ref.update(stateRef, (state) => ({ ...state, spawning: Math.max(0, state.spawning - 1) }))
          )
        )
      );

      yield* __(addRunner(handle));
      return handle;
    });

    // Seed static runners
    for (const [index, runner] of cfg.runners.entries()) {
      const handle: RunnerHandle = {
        id: runner.id ?? `static-${name}-${index}`,
        url: runner.url
      };
      yield* _(addRunner(handle));
    }

    const runnerCount = (yield* _(Ref.get(stateRef))).runners.size;
    if (cfg.min > runnerCount) {
      if (!backend) {
        throw new InvokeError("config_error", "Pool requires a backend to reach min runners");
      }
      const toSpawn = cfg.min - runnerCount;
      for (let i = 0; i < toSpawn; i += 1) {
        yield* _(spawnRunner);
      }
    }

    const acquire = Effect.gen(function* (__): Generator<any, RunnerHandle, any> {
      const poll = yield* __(Queue.poll(queue));
      if (Option.isSome(poll)) {
        const handle = poll.value;
        const updated = yield* __(
          Ref.modify(stateRef, (state) => {
            const existing = state.runners.get(handle.id);
            if (!existing) {
              return [false, state] as const;
            }
            const next = new Map(state.runners);
            next.set(handle.id, { ...existing, inUse: existing.inUse + 1, lastUsed: Date.now() });
            return [true, { ...state, runners: next }];
          })
        );

        if (!updated) {
          return yield* __(acquire);
        }
        return handle;
      }

      const state = yield* __(Ref.get(stateRef));
      const canSpawn = !!backend && state.runners.size + state.spawning < cfg.max;

      if (state.runners.size === 0 && !canSpawn) {
        throw new InvokeError("no_runner", `Pool '${name}' has no runners configured`);
      }

      if (canSpawn) {
        yield* __(spawnRunner);
      }

      const handle = yield* __(Queue.take(queue));
      const updated = yield* __(
        Ref.modify(stateRef, (current) => {
          const existing = current.runners.get(handle.id);
          if (!existing) {
            return [false, current] as const;
          }
          const next = new Map(current.runners);
          next.set(handle.id, { ...existing, inUse: existing.inUse + 1, lastUsed: Date.now() });
          return [true, { ...current, runners: next }];
        })
      );
      if (!updated) {
        return yield* __(acquire);
      }
      return handle;
    }) as Effect.Effect<RunnerHandle, Error>;

    const release = (runner: RunnerHandle) =>
      Effect.gen(function* (__): Generator<any, void, any> {
        yield* __(
          Ref.update(stateRef, (state) => {
            const existing = state.runners.get(runner.id);
            if (!existing) return state;
            const next = new Map(state.runners);
            next.set(runner.id, {
              ...existing,
              inUse: Math.max(0, existing.inUse - 1),
              lastUsed: Date.now()
            });
            return { ...state, runners: next };
          })
        );
        yield* __(Queue.offer(queue, runner));
      }) as Effect.Effect<void, Error>;

    const shutdown = Effect.gen(function* (__): Generator<any, void, any> {
      const state = yield* __(Ref.get(stateRef));
      if (backend) {
        for (const runner of state.runners.values()) {
          yield* __(
            backend.terminate(runner.handle).pipe(
              Effect.catchAll((error) =>
                Effect.fail(
                  new InvokeError("invoke_error", "Failed to terminate runner", { details: error })
                )
              )
            )
          );
        }
      }
    }) as Effect.Effect<void, Error>;

    return { name, acquire, release, shutdown };
  }) as Effect.Effect<Pool, Error>;
}
