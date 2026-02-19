# @monotykamary/flame

[![codecov](https://codecov.io/gh/monotykamary/flame-js/branch/main/graph/badge.svg)](https://codecov.io/gh/monotykamary/flame-js)

FLAME-style remote execution for TypeScript with Bun, native union-style async error values, and a same-image / different-entrypoint model.

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
- Promise-first runtime internals with native `T | Error` flows.
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
npm install @monotykamary/flame
# or
pnpm add @monotykamary/flame
# or
yarn add @monotykamary/flame
# or
bun add @monotykamary/flame
```

Note: the package currently exports TypeScript source. Use Bun or a TS-aware bundler/runtime.

## Quick start

### 1) Define services (shared module)

```ts
import { flame, defineMethod } from "@monotykamary/flame";

export const Billing = flame.service.billing({
  charge: defineMethod.charge(async (_ctx, req: { amount: number }) => {
    return { ok: true, charged: req.amount };
  })
});
```

### 2) Parent entrypoint

```ts
import { flame } from "@monotykamary/flame";
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
import { flame } from "@monotykamary/flame";
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
import { flame } from "@monotykamary/flame";
import "./services";

await flame.configure({ mode: "local" });
const result = await Billing.charge({ amount: 50 });
console.log(result);
```

## Core concepts

### Services and methods

- `flame.service.<serviceId>({ method: handler })` defines a service (or use `flame.service("serviceId", ...)`).
- `defineMethod.<methodId>(handler, options?)` assigns method IDs (or use `defineMethod("methodId", ...)`).
- Handlers receive `InvocationContext` first:

```ts
import { defineMethod } from "@monotykamary/flame";

const handler = defineMethod.charge(async (ctx, req: { amount: number }) => {
  if (ctx.deadline && Date.now() > ctx.deadline) throw new Error("expired");
  return { ok: true, charged: req.amount };
});
```

### Functions (single-method services)

```ts
const ping = flame.fn.ping(async () => "pong");
const result = await ping();
```

### Error handling

FLAME supports both styles:
- Union APIs: `flame.serviceResult` and `flame.fnResult` (errors returned as values).
- Throwing APIs: `flame.service` and `flame.fn`.

Union style (errore-like early returns):

```ts
import { FlameError, NoRunnerError, TimeoutError, flame } from "@monotykamary/flame";

const add = flame.fnResult("add", async (a: number, b: number) => a + b);
const result = await add(2, 3);

if (result instanceof TimeoutError) {
  console.error("timed out");
  return;
}
if (result instanceof NoRunnerError) {
  console.error("no runner available");
  return;
}
if (result instanceof FlameError) {
  console.error(result);
  return;
}

console.log(result); // 5
```

Internally, FLAME errors are tagged classes (built with `errore.createTaggedError`) and still expose `code`, `details`, and `retryable` for transport/logging.

Throwing style is still available when you prefer exceptions:

```ts
import { flame } from "@monotykamary/flame";

const add = flame.fn("add", async (a: number, b: number) => a + b);

try {
  const result = await add(2, 3);
  console.log(result); // 5
} catch (error) {
  console.error(error);
}
```

`AsyncDisposableStack` is used internally where it improves cleanup clarity (for example runner release in parent mode). For a single resource, `await using` remains the simplest pattern.

`FlameService.create` supports `await using` lifecycle management:

```ts
import { FlameService } from "@monotykamary/flame";

await (async () => {
  await using flame = FlameService.create({ mode: "local" });
  const ping = flame.fn.ping(async () => "pong");
  console.log(await ping());
})();
```

`FlameService.using` is a convenience wrapper around the same lifecycle behavior:

```ts
import { FlameService } from "@monotykamary/flame";

const result = await FlameService.using(async (flame) => {
  const ping = flame.fn.ping(async () => "pong");
  return ping();
}, { mode: "local" });
```

### Runtime structure (internal graph)

```text
                         ┌──────────────────────────────┐
                         │           flame.ts           │
                         │  - service / fn              │
                         └───────────────┬──────────────┘
                                         │
                                         │ returns Promise-based proxies
                                         v
                         ┌──────────────────────────────┐
                         │          proxy.ts            │
                         │  - createServiceProxy        │
                         └───────────────┬──────────────┘
                                         │
                                         │ delegates to runtimeRef
                                         v
                         ┌──────────────────────────────┐
                         │         runtime.ts           │
                         │  - invokeResult (union path) │
                         │  - invoke (throwing boundary)│
                         └───────────────┬──────────────┘
                                         │
                                         │ uses PoolManager + Pool
                                         v
   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │      pool/manager.ts         │   │        pool/pool.ts          │
   │  - get(name) -> Promise      │   │  - acquire/release/shutdown  │
   │  - shutdownAll -> Promise    │   │  - async queue + mutex state │
   └───────────────┬──────────────┘   └───────────────┬──────────────┘
                   │                                  │
                   └──────────────┬───────────────────┘
                                  │
                                  │ spawns/terminates runners
                                  v
                         ┌──────────────────────────────┐
                         │    backend (config-driven)   │
                         │  - spawn/terminate/health    │
                         └──────────────────────────────┘
```

### Decorators (experimental)

Enable `experimentalDecorators` in `tsconfig.json`.

```ts
import { flame, flameService } from "@monotykamary/flame";

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
const backend = {
  spawn: async ({ poolName }: { poolName: string }) => ({
    id: `${poolName}-${Date.now()}`,
    url: "http://runner"
  }),
  terminate: async () => {}
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
- `flame.service`
- `flame.fn`
- `flame.configure`, `flame.shutdown`
- `defineMethod`
- `FlameService.create`, `FlameService.using`
- `flame.createRunnerServer`

## License

MIT. See `LICENSE`.
