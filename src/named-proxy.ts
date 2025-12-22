export function createNamedProxy<T extends (id: string, ...args: any[]) => any>(fn: T) {
  return new Proxy(fn as (...args: any[]) => any, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }
      return (...args: any[]) => target(prop, ...args);
    }
  }) as T & Record<string, (...args: any[]) => ReturnType<T>>;
}
