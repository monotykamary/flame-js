import type { Effect } from "effect";

export interface RunnerTarget {
  id?: string;
  url: string;
}

export interface RunnerHandle {
  id: string;
  url: string;
}

export interface PoolConfig {
  min?: number;
  max?: number;
  maxConcurrency?: number;
  runners?: RunnerTarget[];
  spawnTimeoutMs?: number;
}

export interface SpawnOptions {
  poolName: string;
}

export interface Backend {
  spawn: (options: SpawnOptions) => Effect.Effect<RunnerHandle, Error>;
  terminate: (runner: RunnerHandle) => Effect.Effect<void, Error>;
  healthCheck?: (runner: RunnerHandle) => Effect.Effect<boolean, Error>;
}
