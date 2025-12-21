import type { Effect } from "effect";
import type { FlameConfig, FlameOptions } from "./types";
import { createRegistry } from "./registry";
import { normalizeMethods, registerService, defineMethod, type FlameMethod } from "./define";
import { createRuntime, type FlameRuntime, type RuntimeRef } from "./runtime";
import {
  createServiceProxy,
  createServiceProxyEffect,
  toEffect as toEffectFn
} from "./proxy";
import { createRunnerServer, type RunnerServer, type RunnerServerOptions } from "./runner/server";

type MethodInput = FlameMethod<any[], any> | ((...args: any[]) => Promise<any> | any);
type MethodProxy<M> = M extends FlameMethod<infer Args, infer Result>
  ? (...args: Args) => Promise<Result>
  : M extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Promise<Result>
    : never;
type MethodEffectProxy<M> = M extends FlameMethod<infer Args, infer Result>
  ? (...args: Args) => Effect.Effect<Result, Error>
  : M extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Effect.Effect<Result, Error>
    : never;

export interface FlameInstance {
  registry: ReturnType<typeof createRegistry>;
  configure: (config: FlameConfig) => Promise<void>;
  shutdown: () => Promise<void>;
  service: <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ) => { [K in keyof T]: MethodProxy<T[K]> };
  serviceEffect: <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ) => { [K in keyof T]: MethodEffectProxy<T[K]> };
  fn: <T extends (...args: any[]) => Promise<any>>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ) => T;
  fnEffect: <T extends (...args: any[]) => Promise<any>>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ) => (...args: Parameters<T>) => any;
  toEffect: typeof toEffectFn;
  defineMethod: typeof defineMethod;
  createRunnerServer: (options?: Omit<RunnerServerOptions, "registry">) => RunnerServer;
}

function mergeConfig(base: FlameConfig, next: FlameConfig): FlameConfig {
  return {
    ...base,
    ...next,
    pools: {
      ...base.pools,
      ...next.pools
    }
  };
}

export function createFlame(initialConfig: FlameConfig = {}): FlameInstance {
  const registry = createRegistry();
  let currentConfig = initialConfig;
  let runtime: FlameRuntime = createRuntime(currentConfig, registry);
  const runtimeRef: RuntimeRef = { current: runtime };

  const configure = async (config: FlameConfig) => {
    currentConfig = mergeConfig(currentConfig, config);
    await runtime.shutdown();
    runtime = createRuntime(currentConfig, registry);
    runtimeRef.current = runtime;
  };

  const shutdown = async () => {
    await runtime.shutdown();
  };

  const service = <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ): { [K in keyof T]: MethodProxy<T[K]> } => {
    const normalized = normalizeMethods(methods as Record<string, any>);
    registerService(registry, serviceId, normalized.byId, options);
    return createServiceProxy(runtimeRef, serviceId, normalized.byProperty, options) as {
      [K in keyof T]: MethodProxy<T[K]>;
    };
  };

  const serviceEffect = <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ) => {
    const normalized = normalizeMethods(methods as Record<string, any>);
    registerService(registry, serviceId, normalized.byId, options);
    return createServiceProxyEffect(runtimeRef, serviceId, normalized.byProperty, options) as {
      [K in keyof T]: MethodEffectProxy<T[K]>;
    };
  };

  const fn = <T extends (...args: any[]) => Promise<any> | any>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ): T => {
    const normalized = normalizeMethods({ default: handler } as Record<string, any>);
    registerService(registry, functionId, normalized.byId, options);
    const proxy = createServiceProxy(runtimeRef, functionId, normalized.byProperty, options);
    return proxy.default as T;
  };

  const fnEffect = <T extends (...args: any[]) => Promise<any> | any>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ) => {
    const normalized = normalizeMethods({ default: handler } as Record<string, any>);
    registerService(registry, functionId, normalized.byId, options);
    const proxy = createServiceProxyEffect(runtimeRef, functionId, normalized.byProperty, options);
    return proxy.default as (...args: Parameters<T>) => any;
  };

  const createRunner = (options?: Omit<RunnerServerOptions, "registry">) =>
    createRunnerServer({
      registry,
      invokePath: options?.invokePath ?? currentConfig.invokePath,
      maxBodyBytes: options?.maxBodyBytes ?? currentConfig.maxBodyBytes,
      exposeErrors: options?.exposeErrors ?? currentConfig.exposeErrors,
      security: options?.security ?? currentConfig.security,
      port: options?.port,
      hostname: options?.hostname
    });

  return {
    registry,
    configure,
    shutdown,
    service,
    serviceEffect,
    fn,
    fnEffect,
    toEffect: toEffectFn,
    defineMethod,
    createRunnerServer: createRunner
  };
}

export const flame = createFlame();
