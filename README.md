# Flame (TypeScript)

FLAME-style remote execution for TypeScript with Bun, Effect.ts internals, and a same-image / different-entrypoint model.

## Highlights
- Explicit, build-stable service and method IDs.
- No dynamic imports from request bodies.
- Effect.ts used internally for pooling and retries.
- Superjson serialization for args/results.

## Usage

```ts
import { flame, defineMethod } from "@flame/core";

export const Billing = flame.service("billing", {
  charge: defineMethod("charge", async (_ctx, req: { amount: number }) => {
    return { ok: true, charged: req.amount };
  })
});
```

### Parent entrypoint

```ts
import { flame } from "@flame/core";
import "./services";

await flame.configure({
  mode: "parent",
  runnerUrl: process.env.RUNNER_URL,
  security: { secret: process.env.FLAME_SECRET ?? "dev-secret" }
});

const result = await Billing.charge({ amount: 50 });
console.log(result);
```

### Runner entrypoint

```ts
import { flame } from "@flame/core";
import "./services";

await flame.configure({
  mode: "runner",
  security: { secret: process.env.FLAME_SECRET ?? "dev-secret" }
});

flame.createRunnerServer({ port: 8080, security: { secret: process.env.FLAME_SECRET ?? "dev-secret" } });
```

### Decorators

Decorators use TypeScript's experimental decorators. Ensure `experimentalDecorators` is enabled in `tsconfig.json`.

```ts
import { flame, flameService } from "@flame/core";

@flameService("billing", { pool: "default" })
class BillingService {
  @flame({ id: "charge", pool: "gpu" })
  async charge(amount: number) {
    return { ok: true, charged: amount };
  }

  async refund(amount: number) {
    return { ok: true, refunded: amount };
  }
}

const service = new BillingService();
await service.charge(50);
await service.refund(10);
```

### Effect integration

Use `FlameService.layer` to wire FLAME into Effect services and ensure shutdown happens automatically.

```ts
import { Effect } from "effect";
import { FlameService } from "@flame/core";

const program = Effect.gen(function* () {
  const flame = yield* FlameService;
  const ping = flame.fn("ping", async () => "pong");
  return yield* Effect.tryPromise({
    try: () => ping(),
    catch: (error) => (error instanceof Error ? error : new Error(String(error)))
  });
});

const layer = FlameService.layer({ mode: "local" });
const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
console.log(result);
```

## Notes
- Args/results are serialized with superjson; closures are not shipped.
- If you need retries, set `retry` on `defineMethod` or service options.
- The default pool is in-memory; plug in a backend for external orchestration later.
