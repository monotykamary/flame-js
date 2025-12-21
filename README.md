# @flame/core

[![codecov](https://codecov.io/gh/monotykamary/flame-js/branch/main/graph/badge.svg)](https://codecov.io/gh/monotykamary/flame-js)

FLAME-style remote execution for TypeScript with Bun, Effect.ts internals, and a same-image / different-entrypoint model.

## Homage

This project is inspired by the original Elixir implementation of FLAME in the Phoenix ecosystem:
https://github.com/phoenixframework/flame

In Elixir, FLAME treats your whole app as a lambda, ships closures over the BEAM distribution,
and runs them on ephemeral nodes managed by a pool/backend. This TypeScript library adapts the
same high-level idea to a different runtime: we do not ship closures, and we invoke explicit
service/method IDs over HTTP between parent and runner processes. The architecture is different,
but the goal is similar: run targeted work on short-lived infrastructure with a same-image,
different-entrypoint deployment model.

## What is FLAME?

FLAME lets you define services and functions once, then run them locally, on a parent control plane, or inside remote runners that execute the same codebase. It favors stability and safety:

- Explicit service and method IDs (no dynamic imports or code shipping).
- Superjson for arguments/results (structured data only).
- Effect.ts for pooling, retries, and orchestration primitives.
- Same image, different entrypoint deployments.

## Best-fit use cases

FLAME shines when you want simple remote execution with stable IDs and a tight deployment story:

- Burstable compute: spawn workers for spikes, shut down when idle.
- CPU/GPU workloads: route specific methods to specialized pools.
- Multi-tenant workloads: isolate heavier work into runners without changing code.
- Deterministic API boundaries: explicit service/method IDs across refactors.
- In-process or remote toggling: switch between local and remote execution per environment.

### Not a great fit (yet)

- Multi-parent coordination or distributed leases (planned, not in v1).
- Long-running job queues with durable state.
- Dynamic code loading or uploading user-defined functions.
- Cross-language remote invocation.

## Architecture (same image, different entrypoint)

You ship one image and start it in different modes:

- **parent**: routes calls to runners via HTTP.
- **runner**: exposes an HTTP endpoint and executes registered handlers.
- **local**: in-process execution (good for tests/dev).

Mode resolution:
- `config.mode` if provided.
- `FLAME_MODE` environment variable.
- `FLAME_RUNNER=true` fallback.

## Install

```bash
npm install @flame/core
# or
pnpm add @flame/core
# or
yarn add @flame/core
# or
bun add @flame/core
```

Note: the package currently exports TypeScript source. Use Bun or a TS-aware bundler/runtime.

## Quick start

### 1) Define services (shared module)

```ts
import { flame, defineMethod } from "@flame/core";

export const Billing = flame.service("billing", {
  charge: defineMethod("charge", async (_ctx, req: { amount: number }) => {
    return { ok: true, charged: req.amount };
  })
});
```

### 2) Parent entrypoint

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

### 3) Runner entrypoint

```ts
import { flame } from "@flame/core";
import "./services";

await flame.configure({
  mode: "runner",
  security: { secret: process.env.FLAME_SECRET ?? "dev-secret" }
});

flame.createRunnerServer({
  port: 8080,
  security: { secret: process.env.FLAME_SECRET ?? "dev-secret" }
});
```

### 4) Local mode (in-process)

```ts
import { flame } from "@flame/core";
import "./services";

await flame.configure({ mode: "local" });
const result = await Billing.charge({ amount: 50 });
console.log(result);
```

## Core concepts

### Services and methods

- `flame.service("serviceId", { method: handler })` defines a service.
- `defineMethod("methodId", handler, options?)` assigns stable method IDs.
- Handlers receive `InvocationContext` first:

```ts
import { defineMethod } from "@flame/core";

const handler = defineMethod("charge", async (ctx, req: { amount: number }) => {
  if (ctx.deadline && Date.now() > ctx.deadline) throw new Error("expired");
  return { ok: true, charged: req.amount };
});
```

### Functions (single-method services)

```ts
const ping = flame.fn("ping", async () => "pong");
const result = await ping();
```

### Effect integration

`FlameService.layer` provides a scoped instance and ensures shutdown.

```ts
import { Effect } from "effect";
import { FlameService } from "@flame/core";

const program = Effect.gen(function* () {
  const flame = yield* FlameService;
  const ping = flame.fn("ping", async () => "pong");
  return yield* Effect.tryPromise(() => ping());
});

const layer = FlameService.layer({ mode: "local" });
const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
```

### Decorators (experimental)

Enable `experimentalDecorators` in `tsconfig.json`.

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
```

## Configuration

### `FlameConfig`

| Field | Type | Description |
| --- | --- | --- |
| `mode` | `"parent" \| "runner" \| "local"` | Execution mode. |
| `defaultPool` | `string` | Pool used when none is specified. |
| `pools` | `Record<string, PoolConfig>` | Pool definitions. |
| `backend` | `Backend` | Optional spawn/terminate adapter for dynamic runners. |
| `runnerUrl` | `string` | Base URL used by the parent to call runners. |
| `invokePath` | `string` | Path for runner invocations (default `/invoke`). |
| `security` | `{ secret: string }` | HMAC signing secret. |
| `requestTimeoutMs` | `number` | Default timeout for remote calls. |
| `maxBodyBytes` | `number` | Runner request body limit. |
| `exposeErrors` | `boolean` | When true, runner returns error details. |
| `logger` | `Logger` | Reserved for future logging hooks. |

### `FlameOptions` (per service/method/call)

| Field | Type | Description |
| --- | --- | --- |
| `pool` | `string` | Pool name override. |
| `timeoutMs` | `number` | Request timeout for this call. |
| `idempotencyKey` | `string` | Idempotency token passed to runners. |
| `retry.maxAttempts` | `number` | Retry count (parent side). |
| `retry.baseDelayMs` | `number` | Exponential backoff base delay. |

### `PoolConfig`

| Field | Type | Description |
| --- | --- | --- |
| `min` | `number` | Minimum runners to keep alive. |
| `max` | `number` | Max runners in the pool. |
| `maxConcurrency` | `number` | Concurrent invocations per runner. |
| `runners` | `{ id?: string, url: string }[]` | Static runners. |
| `spawnTimeoutMs` | `number` | Reserved for future spawn timeout. |

## Pooling and backends

By default, FLAME manages pools in memory. If you want dynamic runners, provide a backend:

```ts
import { Effect } from "effect";

const backend = {
  spawn: ({ poolName }: { poolName: string }) =>
    Effect.succeed({ id: `${poolName}-${Date.now()}`, url: "http://runner" }),
  terminate: () => Effect.void
};

await flame.configure({
  backend,
  pools: {
    default: { min: 0, max: 4, maxConcurrency: 2 }
  }
});
```

## Security and serialization

- Requests can be signed with an HMAC secret (`x-flame-signature` header).
- Args/results are serialized with **superjson**; closures/functions are not supported.
- `exposeErrors` controls whether runner returns details to callers.

## Same image, different entrypoint (example)

```bash
# parent
FLAME_MODE=parent RUNNER_URL=http://runner:8080 bun run src/parent.ts

# runner
FLAME_MODE=runner FLAME_SECRET=dev-secret bun run src/runner.ts
```

## Testing

```bash
bun run test
bun run test:unit
bun run test:integration
bun run test:smoke
bun run test:e2e
bun run test:coverage
```

## API surface (quick reference)

- `createFlame(config?)`, `flame`
- `flame.service`, `flame.serviceEffect`
- `flame.fn`, `flame.fnEffect`
- `flame.configure`, `flame.shutdown`
- `defineMethod`
- `flame.toEffect`
- `FlameService.layer`
- `flame.createRunnerServer`

## License

MIT. See `LICENSE`.
