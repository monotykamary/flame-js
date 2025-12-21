import type { FlameOptions } from "./types";
import type { FlameHandler, MethodDefinition, ServiceDefinition, FlameRegistry } from "./registry";

export interface FlameMethod<Args extends unknown[] = unknown[], Result = unknown> {
  id: string;
  handler: FlameHandler<Args, Result>;
  options?: FlameOptions;
  __flameMethod: true;
}

export function defineMethod<Args extends unknown[], Result>(
  id: string,
  handler: FlameHandler<Args, Result>,
  options?: FlameOptions
): FlameMethod<Args, Result> {
  return { id, handler, options, __flameMethod: true };
}

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
      const def = { id: value.id, handler: value.handler, options: value.options };
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
  const service: ServiceDefinition = { id: serviceId, methods, options };
  registry.registerService(service);
  return service;
}
