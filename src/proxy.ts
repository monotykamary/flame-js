import type { FlameOptions } from "./types";
import type { MethodDefinition } from "./registry";
import type { FlameRuntime, RuntimeRef } from "./runtime";

export const FLAME_META = Symbol.for("flame.meta");

export interface FlameMeta {
  serviceId: string;
  methodId: string;
  options: FlameOptions | undefined;
  runtimeRef: RuntimeRef;
}

export type PromiseInvoker<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;
export type ProxyInvocationStyle = "throw" | "result";

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
  serviceOptions?: FlameOptions,
  invocationStyle: ProxyInvocationStyle = "throw"
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const proxy: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const [prop, method] of Object.entries(methods)) {
    const options = mergeOptions(serviceOptions, method.options);
    const invoke = (...args: unknown[]) =>
      invocationStyle === "result"
        ? runtimeRef.current.invokeResult(serviceId, method.id, args, options)
        : runtimeRef.current.invoke(serviceId, method.id, args, options);
    attachMeta(invoke, { serviceId, methodId: method.id, options, runtimeRef });
    proxy[prop] = invoke;
  }

  return proxy;
}

export function isRunnerMode(runtime: FlameRuntime): boolean {
  return runtime.mode !== "parent";
}
