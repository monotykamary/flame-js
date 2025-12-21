import { Context, Effect, Layer } from "effect";
import type { FlameConfig } from "./types";
import { createFlame, type FlameInstance } from "./flame";

export class FlameService extends Context.Tag("@flame/Flame")<
  FlameService,
  FlameInstance
>() {
  constructor() {
    super();
  }

  static layer(config: FlameConfig = {}) {
    return Layer.scoped(
      FlameService,
      Effect.acquireRelease(
        Effect.sync(() => createFlame(config)),
        (flame) => Effect.tryPromise(() => flame.shutdown()).pipe(Effect.ignore)
      )
    );
  }
}
