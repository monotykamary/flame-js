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

## Notes
- Args/results are serialized with superjson; closures are not shipped.
- If you need retries, set `retry` on `defineMethod` or service options.
- The default pool is in-memory; plug in a backend for external orchestration later.
