import type { FlameOptions, InvocationContext } from "./types";
import { RegistryError } from "./errors";

export type FlameHandler<Args extends unknown[], Result> = (
  context: InvocationContext,
  ...args: Args
) => Promise<Result> | Result;

export interface MethodDefinition<Args extends unknown[] = unknown[], Result = unknown> {
  id: string;
  handler: FlameHandler<Args, Result>;
  options?: FlameOptions;
}

export interface ServiceDefinition {
  id: string;
  methods: Map<string, MethodDefinition>;
  options?: FlameOptions;
}

export interface FlameRegistry {
  registerService: (service: ServiceDefinition) => ServiceDefinition;
  getService: (serviceId: string) => ServiceDefinition | undefined;
  listServices: () => ServiceDefinition[];
}

export function createRegistry(): FlameRegistry {
  const services = new Map<string, ServiceDefinition>();

  return {
    registerService(service) {
      const existing = services.get(service.id);
      if (!existing) {
        services.set(service.id, service);
        return service;
      }

      if (service.options && existing.options && service.options !== existing.options) {
        throw new RegistryError(`Service already registered with different options: ${service.id}`);
      }

      for (const [methodId, method] of service.methods.entries()) {
        const current = existing.methods.get(methodId);
        if (current && current.handler !== method.handler) {
          throw new RegistryError(`Method already registered: ${service.id}.${methodId}`);
        }
        if (!current) {
          existing.methods.set(methodId, method);
        }
      }

      return existing;
    },
    getService(serviceId) {
      return services.get(serviceId);
    },
    listServices() {
      return Array.from(services.values());
    }
  };
}

export function getMethod(
  registry: FlameRegistry,
  serviceId: string,
  methodId: string
): MethodDefinition {
  const service = registry.getService(serviceId);
  if (!service) {
    throw new RegistryError(`Service not found: ${serviceId}`);
  }
  const method = service.methods.get(methodId);
  if (!method) {
    throw new RegistryError(`Method not found: ${serviceId}.${methodId}`);
  }
  return method;
}
