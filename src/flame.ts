import type { FlameConfig, FlameOptions } from "./types";
import { createRegistry } from "./registry";
import { normalizeMethods, registerService, defineMethod, type FlameMethod } from "./define";
import { createRuntime, type FlameRuntime, type RuntimeRef } from "./runtime";
import { createServiceProxy } from "./proxy";
import { createRunnerServer, type RunnerServer, type RunnerServerOptions } from "./runner/server";
import type { FlameError } from "./errors";
import {
  createDecorators,
  type FlameMethodDecorator,
  type FlameMethodDecoratorOptions,
  type FlameServiceDecorator
} from "./decorators";
import { createNamedProxy } from "./named-proxy";

type FunctionHandler = (...args: any[]) => Promise<any> | any;
type MethodInput = FlameMethod<any[], any> | FunctionHandler;
type MethodProxy<M> = M extends FlameMethod<infer Args, infer Result>
  ? (...args: Args) => Promise<Result>
  : M extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Promise<Result>
    : never;
type MethodResultProxy<M> = M extends FlameMethod<infer Args, infer Result>
  ? (...args: Args) => Promise<Result | FlameError>
  : M extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Promise<Result | FlameError>
    : M extends (...args: infer Args) => infer Result
      ? (...args: Args) => Promise<Result | FlameError>
      : never;
type FnThrowOptions = FlameOptions & { errors: "throw" };
type FnReturnOptions = FlameOptions & { errors?: "return" };
type FnThrowProxy<T extends FunctionHandler> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
type FnResultProxy<T extends FunctionHandler> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>> | FlameError>;

export type FlameDecorator = FlameMethodDecorator;

export interface FlameInstance extends FlameDecorator {
  registry: ReturnType<typeof createRegistry>;
  configure: (config: FlameConfig) => Promise<void>;
  shutdown: () => Promise<void>;
  service: ServiceFactory;
  fn: FnFactory;
  serviceResult: ServiceResultFactory;
  fnResult: FnResultFactory;
  defineMethod: typeof defineMethod;
  serviceDecorator: FlameServiceDecorator;
  createRunnerServer: (options?: Omit<RunnerServerOptions, "registry">) => RunnerServer;
}

type ServiceFactory = {
  <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ): { [K in keyof T]: MethodProxy<T[K]> };
  [key: string]: <T extends Record<string, MethodInput>>(
    methods: T,
    options?: FlameOptions
  ) => { [K in keyof T]: MethodProxy<T[K]> };
};

type FnFactory = {
  <T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options: FnThrowOptions
  ): FnThrowProxy<T>;
  <T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options?: FnReturnOptions
  ): FnResultProxy<T>;
  [key: string]: {
    <T extends FunctionHandler>(
      handler: T,
      options: FnThrowOptions
    ): FnThrowProxy<T>;
    <T extends FunctionHandler>(
      handler: T,
      options?: FnReturnOptions
    ): FnResultProxy<T>;
  };
};

type ServiceResultFactory = {
  <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ): { [K in keyof T]: MethodResultProxy<T[K]> };
  [key: string]: <T extends Record<string, MethodInput>>(
    methods: T,
    options?: FlameOptions
  ) => { [K in keyof T]: MethodResultProxy<T[K]> };
};

type FnResultFactory = {
  <T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ): FnResultProxy<T>;
  [key: string]: <T extends FunctionHandler>(
    handler: T,
    options?: FlameOptions
  ) => FnResultProxy<T>;
};

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
  const decorators = createDecorators(runtimeRef, registry);

  const configure = async (config: FlameConfig) => {
    currentConfig = mergeConfig(currentConfig, config);
    await runtime.shutdown();
    runtime = createRuntime(currentConfig, registry);
    runtimeRef.current = runtime;
  };

  const shutdown = async () => {
    await runtime.shutdown();
  };

  const serviceImpl = <T extends Record<string, MethodInput>>(
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

  const service = createNamedProxy(serviceImpl) as ServiceFactory;

  const serviceResultImpl = <T extends Record<string, MethodInput>>(
    serviceId: string,
    methods: T,
    options?: FlameOptions
  ): { [K in keyof T]: MethodResultProxy<T[K]> } => {
    const normalized = normalizeMethods(methods as Record<string, any>);
    registerService(registry, serviceId, normalized.byId, options);
    return createServiceProxy(runtimeRef, serviceId, normalized.byProperty, options, "result") as {
      [K in keyof T]: MethodResultProxy<T[K]>;
    };
  };

  const serviceResult = createNamedProxy(serviceResultImpl) as ServiceResultFactory;

  function fnImpl<T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options: FnThrowOptions
  ): FnThrowProxy<T>;
  function fnImpl<T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options?: FnReturnOptions
  ): FnResultProxy<T>;
  function fnImpl<T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ): FnThrowProxy<T> | FnResultProxy<T> {
    const normalized = normalizeMethods({ default: handler } as Record<string, any>);
    registerService(registry, functionId, normalized.byId, options);
    const invocationStyle = options?.errors === "throw" ? "throw" : "result";
    const proxy = createServiceProxy(
      runtimeRef,
      functionId,
      normalized.byProperty,
      options,
      invocationStyle
    );
    if (invocationStyle === "throw") {
      return proxy.default as FnThrowProxy<T>;
    }
    return proxy.default as FnResultProxy<T>;
  }

  const fn = createNamedProxy(fnImpl) as FnFactory;

  const fnResultImpl = <T extends FunctionHandler>(
    functionId: string,
    handler: T,
    options?: FlameOptions
  ): FnResultProxy<T> => {
    const resultOptions: FnReturnOptions = {
      ...options,
      errors: "return"
    };
    return fnImpl(functionId, handler, resultOptions);
  };

  const fnResult = createNamedProxy(fnResultImpl) as FnResultFactory;

  const createRunner = (options?: Omit<RunnerServerOptions, "registry">) => {
    const runnerOptions: RunnerServerOptions = { registry };
    const invokePath = options?.invokePath ?? currentConfig.invokePath;
    if (invokePath !== undefined) {
      runnerOptions.invokePath = invokePath;
    }
    const maxBodyBytes = options?.maxBodyBytes ?? currentConfig.maxBodyBytes;
    if (maxBodyBytes !== undefined) {
      runnerOptions.maxBodyBytes = maxBodyBytes;
    }
    const exposeErrors = options?.exposeErrors ?? currentConfig.exposeErrors;
    if (exposeErrors !== undefined) {
      runnerOptions.exposeErrors = exposeErrors;
    }
    const security = options?.security ?? currentConfig.security;
    if (security !== undefined) {
      runnerOptions.security = security;
    }
    if (options?.port !== undefined) {
      runnerOptions.port = options.port;
    }
    if (options?.hostname !== undefined) {
      runnerOptions.hostname = options.hostname;
    }
    return createRunnerServer(runnerOptions);
  };

  const flame = ((options?: FlameMethodDecoratorOptions | string) =>
    decorators.method(options)) as FlameInstance;

  flame.registry = registry;
  flame.configure = configure;
  flame.shutdown = shutdown;
  flame.service = service;
  flame.fn = fn;
  flame.serviceResult = serviceResult;
  flame.fnResult = fnResult;
  flame.defineMethod = defineMethod;
  flame.serviceDecorator = decorators.service;
  flame.createRunnerServer = createRunner;

  return flame;
}

export const flame = createFlame();
export const flameService: FlameServiceDecorator = (...args) => flame.serviceDecorator(...args);
