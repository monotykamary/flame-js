import { tryAsync } from "errore";
import type { PoolConfig, RunnerHandle, Backend } from "./types";
import { ConfigError, FlameError, InvokeError, NoRunnerError } from "../errors";

const POOL_INTERNALS = Symbol.for("flame.pool.internals");

export interface Pool {
  name: string;
  acquire: () => Promise<RunnerHandle | FlameError>;
  release: (runner: RunnerHandle) => Promise<void | FlameError>;
  shutdown: () => Promise<void | FlameError>;
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

interface PoolInternals {
  spawnRunner: () => Promise<RunnerHandle | FlameError>;
  getStateForTests: () => PoolState;
  setStateForTests: (update: (state: PoolState) => PoolState) => void;
}

interface Mutex {
  runExclusive: <T>(task: () => T | Promise<T>) => Promise<T>;
}

class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: Array<(value: T) => void> = [];

  constructor() {}

  offer(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }
    this.items.push(item);
  }

  poll(): T | undefined {
    return this.items.shift();
  }

  take(): Promise<T> {
    const item = this.poll();
    if (item !== undefined) {
      return Promise.resolve(item);
    }

    return new Promise<T>((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

function createMutex(): Mutex {
  let tail = Promise.resolve();
  return {
    async runExclusive<T>(task: () => T | Promise<T>): Promise<T> {
      const previous = tail;
      let release: (() => void) | undefined;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await task();
      } finally {
        release?.();
      }
    }
  };
}

function cloneState(state: PoolState): PoolState {
  return {
    runners: new Map(state.runners),
    spawning: state.spawning
  };
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

async function executeBackend<T>(
  operation: () => Promise<T | Error> | T | Error,
  message: string
): Promise<T | FlameError> {
  const result = await tryAsync({
    try: async () => operation(),
    catch: (error: Error) => new InvokeError(message, { details: error })
  });

  if (result instanceof Error) {
    return new InvokeError(message, { details: result });
  }

  return result;
}

export async function createPool(
  name: string,
  config: PoolConfig,
  backend?: Backend
): Promise<Pool | FlameError> {
  const cfg = normalizeConfig(config);

  const created = await tryAsync({
    try: async () => {
      const queue = new AsyncQueue<RunnerHandle>();
      const mutex = createMutex();
      let state: PoolState = { runners: new Map(), spawning: 0 };

      const readState = async () =>
        mutex.runExclusive(() => cloneState(state));

      const updateState = async (update: (value: PoolState) => PoolState) =>
        mutex.runExclusive(() => {
          state = update(state);
        });

      const addRunner = async (handle: RunnerHandle): Promise<void> => {
        const added = await mutex.runExclusive(() => {
          if (state.runners.has(handle.id)) {
            return false;
          }
          const next = new Map(state.runners);
          next.set(handle.id, { handle, inUse: 0, lastUsed: Date.now() });
          state = { ...state, runners: next };
          return true;
        });

        if (!added) return;

        for (let i = 0; i < cfg.maxConcurrency; i += 1) {
          queue.offer(handle);
        }
      };

      const incrementUsage = async (handle: RunnerHandle): Promise<boolean> =>
        mutex.runExclusive(() => {
          const existing = state.runners.get(handle.id);
          if (!existing) return false;
          const next = new Map(state.runners);
          next.set(handle.id, {
            ...existing,
            inUse: existing.inUse + 1,
            lastUsed: Date.now()
          });
          state = { ...state, runners: next };
          return true;
        });

      const spawnRunner = async (): Promise<RunnerHandle | FlameError> => {
        if (!backend) {
          return new ConfigError("No backend configured to spawn runners");
        }

        const shouldSpawn = await mutex.runExclusive(() => {
          const total = state.runners.size + state.spawning;
          if (total >= cfg.max) {
            return false;
          }
          state = { ...state, spawning: state.spawning + 1 };
          return true;
        });

        if (!shouldSpawn) {
          return new NoRunnerError(`Pool '${name}' has reached max runners`);
        }

        try {
          const handle = await executeBackend(
            () => backend.spawn({ poolName: name }),
            "Failed to spawn runner"
          );
          if (handle instanceof Error) return handle;
          await addRunner(handle);
          return handle;
        } finally {
          await updateState((current) => ({
            ...current,
            spawning: Math.max(0, current.spawning - 1)
          }));
        }
      };

      for (const [index, runner] of cfg.runners.entries()) {
        const handle: RunnerHandle = {
          id: runner.id ?? `static-${name}-${index}`,
          url: runner.url
        };
        await addRunner(handle);
      }

      const current = await readState();
      if (cfg.min > current.runners.size) {
        if (!backend) {
          return new ConfigError("Pool requires a backend to reach min runners");
        }
        const toSpawn = cfg.min - current.runners.size;
        for (let i = 0; i < toSpawn; i += 1) {
          const spawned = await spawnRunner();
          if (spawned instanceof Error) return spawned;
        }
      }

      const tryConsumeRunner = async (
        runner: RunnerHandle
      ): Promise<RunnerHandle | undefined> => {
        const updated = await incrementUsage(runner);
        if (!updated) return undefined;
        return runner;
      };

      const ensureCapacity = async (): Promise<void | FlameError> => {
        const snapshot = await readState();
        const canSpawn = !!backend && snapshot.runners.size + snapshot.spawning < cfg.max;
        if (snapshot.runners.size === 0 && !canSpawn) {
          return new NoRunnerError(`Pool '${name}' has no runners configured`);
        }

        if (!canSpawn) return;

        const spawned = await spawnRunner();
        if (spawned instanceof Error) return spawned;
      };

      const acquire = async (): Promise<RunnerHandle | FlameError> => {
        while (true) {
          const polled = queue.poll();
          if (polled) {
            const acquired = await tryConsumeRunner(polled);
            if (acquired) return acquired;
            continue;
          }

          const capacity = await ensureCapacity();
          if (capacity instanceof Error) return capacity;

          const handle = await queue.take();
          const acquired = await tryConsumeRunner(handle);
          if (acquired) return acquired;
        }
      };

      const release = async (runner: RunnerHandle): Promise<void | FlameError> => {
        await updateState((current) => {
          const existing = current.runners.get(runner.id);
          if (!existing) return current;
          const next = new Map(current.runners);
          next.set(runner.id, {
            ...existing,
            inUse: Math.max(0, existing.inUse - 1),
            lastUsed: Date.now()
          });
          return { ...current, runners: next };
        });

        queue.offer(runner);
      };

      const shutdown = async (): Promise<void | FlameError> => {
        if (!backend) return;

        const snapshot = await readState();
        for (const runner of snapshot.runners.values()) {
          const terminated = await executeBackend(
            () => backend.terminate(runner.handle),
            "Failed to terminate runner"
          );
          if (terminated instanceof Error) return terminated;
        }
      };

      const pool: Pool = { name, acquire, release, shutdown };
      Object.defineProperty(pool, POOL_INTERNALS, {
        value: {
          spawnRunner,
          getStateForTests: () => cloneState(state),
          setStateForTests: (update: (next: PoolState) => PoolState) => {
            state = update(cloneState(state));
          }
        } satisfies PoolInternals,
        enumerable: false
      });

      return pool;
    },
    catch: (error: Error) =>
      error instanceof FlameError
        ? error
        : new InvokeError("Failed to create pool", { details: error })
  });

  if (created instanceof Error) return created;
  return created;
}
