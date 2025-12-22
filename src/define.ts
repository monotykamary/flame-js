import type { FlameOptions } from "./types";
import type { FlameHandler, MethodDefinition, ServiceDefinition, FlameRegistry } from "./registry";
import { createNamedProxy } from "./named-proxy";

export interface FlameMethod<Args extends unknown[] = unknown[], Result = unknown> {
  id: string;
  handler: FlameHandler<Args, Result>;
  options?: FlameOptions;
  __flameMethod: true;
}

function defineMethodInternal<Args extends unknown[], Result>(
  id: string,
  handler: FlameHandler<Args, Result>,
  options?: FlameOptions
): FlameMethod<Args, Result> {
  const method: FlameMethod<Args, Result> = { id, handler, __flameMethod: true };
  if (options !== undefined) {
    method.options = options;
  }
  return method;
}

export type DefineMethod = {
  <Args extends unknown[], Result>(
    id: string,
    handler: FlameHandler<Args, Result>,
    options?: FlameOptions
  ): FlameMethod<Args, Result>;
  [key: string]: <Args extends unknown[], Result>(
    handler: FlameHandler<Args, Result>,
    options?: FlameOptions
  ) => FlameMethod<Args, Result>;
};

export const defineMethod = createNamedProxy(defineMethodInternal) as DefineMethod;

export function isFlameMethod(value: unknown): value is FlameMethod {
  return typeof value === "object" && value !== null && (value as FlameMethod).__flameMethod === true;
}

export interface NormalizedMethods {
  byId: Map<string, MethodDefinition>;
  byProperty: Record<string, MethodDefinition>;
}

export function normalizeMethods(
  methods: Record<string, FlameMethod<any[], any> | ((...args: any[]) => Promise<any> | any)>
): NormalizedMethods {
  const byId = new Map<string, MethodDefinition>();
  const byProperty: Record<string, MethodDefinition> = {};

  for (const [key, value] of Object.entries(methods)) {
    if (isFlameMethod(value)) {
      const def: MethodDefinition = { id: value.id, handler: value.handler };
      if (value.options !== undefined) {
        def.options = value.options;
      }
      byId.set(value.id, def);
      byProperty[key] = def;
    } else {
      const handler: FlameHandler<unknown[], unknown> = async (_ctx, ...args) => value(...args);
      const def = { id: key, handler };
      byId.set(key, def);
      byProperty[key] = def;
    }
  }

  return { byId, byProperty };
}

export function registerService(
  registry: FlameRegistry,
  serviceId: string,
  methods: Map<string, MethodDefinition>,
  options?: FlameOptions
): ServiceDefinition {
  const service: ServiceDefinition = { id: serviceId, methods };
  if (options !== undefined) {
    service.options = options;
  }
  registry.registerService(service);
  return service;
}
