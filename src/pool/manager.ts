import { Effect } from "effect";
import type { PoolConfig, Backend } from "./types";
import { createPool, type Pool } from "./pool";
import { InvokeError } from "../errors";

export interface PoolManager {
  get: (name: string) => Effect.Effect<Pool, Error>;
  shutdownAll: Effect.Effect<void, Error>;
}

export interface PoolManagerConfig {
  pools?: Record<string, PoolConfig>;
  defaultPool?: string;
  backend?: Backend;
  runnerUrl?: string;
}

function resolvePoolConfig(
  name: string,
  config: PoolManagerConfig
): PoolConfig | undefined {
  if (config.pools && config.pools[name]) {
    return config.pools[name];
  }

  if (name === "default" && config.runnerUrl) {
    return { runners: [{ url: config.runnerUrl }] };
  }

  return config.pools?.[name];
}

export function createPoolManager(config: PoolManagerConfig): PoolManager {
  const pools = new Map<string, Pool>();

  const get = Effect.fn("PoolManager.get")((name: string) =>
    Effect.gen(function* () {
      const existing = pools.get(name);
      if (existing) {
        return existing;
      }

      const poolConfig = resolvePoolConfig(name, config);
      if (!poolConfig) {
        throw new InvokeError("config_error", `Pool not configured: ${name}`);
      }

      const pool = yield* createPool(name, poolConfig, config.backend);
      pools.set(name, pool);
      return pool;
    })
  );

  const shutdownAll = Effect.fn("PoolManager.shutdownAll")(() =>
    Effect.gen(function* () {
      for (const pool of pools.values()) {
        yield* pool.shutdown;
      }
    })
  )();

  return { get, shutdownAll };
}
