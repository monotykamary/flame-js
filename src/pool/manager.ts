import { tryAsync } from "errore";
import type { PoolConfig, Backend } from "./types";
import { createPool, type Pool } from "./pool";
import { ConfigError, FlameError, InvokeError } from "../errors";

export interface PoolManager {
  get: (name: string) => Promise<Pool | FlameError>;
  shutdownAll: () => Promise<void | FlameError>;
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
  const creating = new Map<string, Promise<Pool | FlameError>>();

  const get = async (name: string): Promise<Pool | FlameError> => {
    const existing = pools.get(name);
    if (existing) return existing;

    const inFlight = creating.get(name);
    if (inFlight) return inFlight;

    const poolConfig = resolvePoolConfig(name, config);
    if (!poolConfig) {
      return new ConfigError(`Pool not configured: ${name}`);
    }

    const creation = createPool(name, poolConfig, config.backend).then((pool) => {
      if (pool instanceof Error) {
        return pool;
      }
      pools.set(name, pool);
      return pool;
    });

    creating.set(name, creation);
    try {
      return await creation;
    } finally {
      creating.delete(name);
    }
  };

  const shutdownAll = async (): Promise<void | FlameError> => {
    const result = await tryAsync({
      try: async () => {
        for (const pool of pools.values()) {
          const shutdown = await pool.shutdown();
          if (shutdown instanceof Error) {
            return shutdown;
          }
        }
      },
      catch: (error: Error) => new InvokeError("Failed to shutdown pools", { details: error })
    });

    if (result instanceof Error) {
      return result;
    }

    pools.clear();
  };

  return { get, shutdownAll };
}
