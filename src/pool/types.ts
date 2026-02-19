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

export type BackendResult<T> = Promise<T | Error> | T | Error;

export interface Backend {
  spawn: (options: SpawnOptions) => BackendResult<RunnerHandle>;
  terminate: (runner: RunnerHandle) => BackendResult<void>;
  healthCheck?: (runner: RunnerHandle) => BackendResult<boolean>;
}
