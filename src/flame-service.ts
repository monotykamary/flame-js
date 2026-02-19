import type { FlameConfig } from "./types";
import { createFlame, type FlameInstance } from "./flame";

export type ManagedFlame = FlameInstance & AsyncDisposable;

function attachAsyncDispose(flame: FlameInstance): ManagedFlame {
  const managed = flame as ManagedFlame;

  if (Symbol.asyncDispose in managed) return managed;

  Object.defineProperty(managed, Symbol.asyncDispose, {
    enumerable: false,
    configurable: true,
    value: async () => {
      try {
        await flame.shutdown();
      } catch {
        // Best effort cleanup.
      }
    }
  });

  return managed;
}

export class FlameService {
  constructor() {}

  static create(config: FlameConfig = {}): ManagedFlame {
    return attachAsyncDispose(createFlame(config));
  }

  static async using<Result>(
    work: (flame: FlameInstance) => Promise<Result> | Result,
    config: FlameConfig = {}
  ): Promise<Result> {
    await using flame = FlameService.create(config);
    return await Promise.resolve(work(flame));
  }
}
