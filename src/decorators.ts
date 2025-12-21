import type { FlameOptions } from "./types";
import type { FlameRegistry, MethodDefinition } from "./registry";
import type { RuntimeRef } from "./runtime";
import { FlameError } from "./errors";
import { FLAME_META, type FlameMeta } from "./proxy";

export interface FlameMethodDecoratorOptions extends FlameOptions {
  id?: string;
  serviceId?: string;
}

export interface FlameServiceDecoratorOptions extends FlameOptions {
  id?: string;
  factory?: () => unknown;
}

export type FlameMethodDecorator = (
  options?: FlameMethodDecoratorOptions | string
) => MethodDecorator;
export type FlameServiceDecorator = (
  serviceIdOrOptions?: string | FlameServiceDecoratorOptions,
  options?: FlameOptions
) => ClassDecorator;

interface MethodMeta {
  id: string;
  options?: FlameOptions;
  original: (...args: any[]) => any;
  isStatic: boolean;
  wrapped: boolean;
}

interface ServiceMeta {
  id?: string;
  options?: FlameOptions;
  factory?: () => unknown;
  methods: Map<PropertyKey, MethodMeta>;
}

function normalizeMethodOptions(
  options?: FlameMethodDecoratorOptions | string
): { id?: string; serviceId?: string; options?: FlameOptions } {
  if (typeof options === "string") {
    return { id: options };
  }
  if (!options) return {};
  const { id, serviceId, ...rest } = options;
  return { id, serviceId, options: rest };
}

function normalizeServiceOptions(
  serviceIdOrOptions?: string | FlameServiceDecoratorOptions,
  options?: FlameOptions
): { id?: string; options?: FlameOptions; factory?: () => unknown } {
  if (typeof serviceIdOrOptions === "string") {
    return { id: serviceIdOrOptions, options };
  }
  if (!serviceIdOrOptions) return { options };
  const { id, factory, ...rest } = serviceIdOrOptions;
  return { id, options: rest, factory };
}

function mergeOptions(service?: FlameOptions, method?: FlameOptions): FlameOptions | undefined {
  if (!service && !method) return undefined;
  return { ...service, ...method };
}

function getServiceMeta(target: Function, metaKey: symbol): ServiceMeta {
  const store = target as unknown as Record<symbol, ServiceMeta | undefined>;
  const existing = store[metaKey];
  if (existing) return existing;
  const created: ServiceMeta = { methods: new Map() };
  (target as unknown as Record<symbol, ServiceMeta>)[metaKey] = created;
  return created;
}

function resolveServiceId(meta: ServiceMeta, target: Function): string {
  if (meta.id) return meta.id;
  if (target.name) return target.name;
  throw new FlameError(
    "config_error",
    "Missing service id for decorator. Use @flameService('serviceId') or pass serviceId in @flame()"
  );
}

function createHandler(target: Function, meta: ServiceMeta, method: MethodMeta): MethodDefinition {
  const handler = async (_ctx: unknown, ...args: unknown[]) => {
    if (method.isStatic) {
      return method.original.apply(target, args);
    }

    const instance = meta.factory ? meta.factory() : new (target as any)();
    return method.original.apply(instance, args);
  };

  return { id: method.id, handler, options: mergeOptions(meta.options, method.options) };
}

function registerDecoratedService(
  registry: FlameRegistry,
  target: Function,
  meta: ServiceMeta
): void {
  const serviceId = resolveServiceId(meta, target);
  const methods = new Map<string, MethodDefinition>();

  for (const method of meta.methods.values()) {
    const def = createHandler(target, meta, method);
    if (!methods.has(def.id)) {
      methods.set(def.id, def);
    }
  }

  registry.registerService({ id: serviceId, methods, options: meta.options });
}

function attachFlameMeta(
  fn: (...args: any[]) => any,
  runtimeRef: RuntimeRef,
  serviceIdProvider: () => string,
  methodId: string,
  optionsProvider: () => FlameOptions | undefined
) {
  const meta = {
    get serviceId() {
      return serviceIdProvider();
    },
    methodId,
    get options() {
      return optionsProvider();
    },
    runtimeRef
  } as FlameMeta;

  Object.defineProperty(fn, FLAME_META, {
    value: meta,
    enumerable: false,
    configurable: false
  });
}

function wrapMethod(
  target: Function,
  propertyKey: PropertyKey,
  descriptor: PropertyDescriptor,
  meta: ServiceMeta,
  method: MethodMeta,
  runtimeRef: RuntimeRef
): void {
  if (method.wrapped) return;
  const original = method.original;

  const wrapper = async function (this: unknown, ...args: unknown[]) {
    const serviceId = resolveServiceId(meta, target);
    const options = mergeOptions(meta.options, method.options);

    if (runtimeRef.current.mode !== "parent") {
      return original.apply(this, args);
    }

    return runtimeRef.current.invoke(serviceId, method.id, args, options);
  };

  attachFlameMeta(
    wrapper,
    runtimeRef,
    () => resolveServiceId(meta, target),
    method.id,
    () => mergeOptions(meta.options, method.options)
  );

  descriptor.value = wrapper;
  method.wrapped = true;
}

export function createDecorators(
  runtimeRef: RuntimeRef,
  registry: FlameRegistry
): { method: FlameMethodDecorator; service: FlameServiceDecorator } {
  const metaKey = Symbol("flame.service.meta");

  const method: FlameMethodDecorator = (options) => {
    const normalized = normalizeMethodOptions(options);

    return (target, propertyKey, descriptor) => {
      if (!descriptor || typeof descriptor.value !== "function") {
        throw new FlameError("config_error", "@flame can only decorate methods");
      }

      const isStatic = typeof target === "function";
      const ctor = isStatic ? (target as Function) : (target as any).constructor;
      const serviceMeta = getServiceMeta(ctor, metaKey);

      if (normalized.serviceId) {
        serviceMeta.id = normalized.serviceId;
      }

      const methodId = normalized.id ?? String(propertyKey);
      const methodMeta: MethodMeta = {
        id: methodId,
        options: normalized.options,
        original: descriptor.value as (...args: any[]) => any,
        isStatic,
        wrapped: false
      };

      serviceMeta.methods.set(propertyKey, methodMeta);
      wrapMethod(ctor, propertyKey, descriptor, serviceMeta, methodMeta, runtimeRef);

      if (serviceMeta.id) {
        registerDecoratedService(registry, ctor, serviceMeta);
      }

      return descriptor;
    };
  };

  const service: FlameServiceDecorator = (serviceIdOrOptions, options) => {
    const normalized = normalizeServiceOptions(serviceIdOrOptions, options);

    return (target) => {
      const serviceMeta = getServiceMeta(target, metaKey);
      if (normalized.id) {
        serviceMeta.id = normalized.id;
      }
      if (normalized.options) {
        serviceMeta.options = normalized.options;
      }
      if (normalized.factory) {
        serviceMeta.factory = normalized.factory;
      }

      const proto = target.prototype;
      const keys = Object.getOwnPropertyNames(proto);
      for (const key of keys) {
        if (key === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        if (!descriptor || typeof descriptor.value !== "function") continue;

        const existing = serviceMeta.methods.get(key);
        const methodMeta: MethodMeta = existing ?? {
          id: key,
          options: undefined,
          original: descriptor.value,
          isStatic: false,
          wrapped: false
        };

        serviceMeta.methods.set(key, methodMeta);
        wrapMethod(target, key, descriptor, serviceMeta, methodMeta, runtimeRef);
        Object.defineProperty(proto, key, descriptor);
      }

      registerDecoratedService(registry, target, serviceMeta);
    };
  };

  return { method, service };
}
