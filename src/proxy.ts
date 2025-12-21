import type { Effect } from "effect";
import type { FlameOptions } from "./types";
import type { MethodDefinition } from "./registry";
import type { FlameRuntime, RuntimeRef } from "./runtime";

export const FLAME_META = Symbol.for("flame.meta");

export interface FlameMeta {
  serviceId: string;
  methodId: string;
  options?: FlameOptions;
  runtimeRef: RuntimeRef;
}

export type PromiseInvoker<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;
export type EffectInvoker<Args extends unknown[], Result, Err> = (...args: Args) => Effect.Effect<Result, Err>;

export function getMeta(fn: unknown): FlameMeta | undefined {
  if (typeof fn !== "function") return undefined;
  return (fn as { [FLAME_META]?: FlameMeta })[FLAME_META];
}

function attachMeta<T extends Function>(fn: T, meta: FlameMeta): T {
  Object.defineProperty(fn, FLAME_META, {
    value: meta,
    enumerable: false,
    configurable: false
  });
  return fn;
}

function mergeOptions(service?: FlameOptions, method?: FlameOptions): FlameOptions | undefined {
  if (!service && !method) return undefined;
  return { ...service, ...method };
}

export function createServiceProxy(
  runtimeRef: RuntimeRef,
  serviceId: string,
  methods: Record<string, MethodDefinition>,
  serviceOptions?: FlameOptions
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const proxy: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const [prop, method] of Object.entries(methods)) {
    const options = mergeOptions(serviceOptions, method.options);
    const invoke = (...args: unknown[]) => runtimeRef.current.invoke(serviceId, method.id, args, options);
    attachMeta(invoke, { serviceId, methodId: method.id, options, runtimeRef });
    proxy[prop] = invoke;
  }

  return proxy;
}

export function createServiceProxyEffect(
  runtimeRef: RuntimeRef,
  serviceId: string,
  methods: Record<string, MethodDefinition>,
  serviceOptions?: FlameOptions
): Record<string, (...args: unknown[]) => Effect.Effect<unknown, unknown>> {
  const proxy: Record<string, (...args: unknown[]) => Effect.Effect<unknown, unknown>> = {};

  for (const [prop, method] of Object.entries(methods)) {
    const options = mergeOptions(serviceOptions, method.options);
    const invoke = (...args: unknown[]) => runtimeRef.current.invokeEffect(serviceId, method.id, args, options);
    attachMeta(invoke, { serviceId, methodId: method.id, options, runtimeRef });
    proxy[prop] = invoke;
  }

  return proxy;
}

export function toEffect<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>
): (...args: Args) => Effect.Effect<Result, Error> {
  const meta = getMeta(fn);
  if (!meta) {
    throw new Error("Function is not a FLAME proxy. Use flame.fn/service to create one.");
  }
  return (...args: Args) => meta.runtimeRef.current.invokeEffect(meta.serviceId, meta.methodId, args, meta.options);
}

export function isRunnerMode(runtime: FlameRuntime): boolean {
  return runtime.mode !== "parent";
}
