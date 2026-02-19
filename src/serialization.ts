import { tryFn } from "errore";
import superjson from "superjson";
import { SerializationError } from "./errors";

export type Serialized = string;

export function serialize(value: unknown): Serialized {
  const result = tryFn(() => superjson.stringify(value));
  if (!(result instanceof Error)) {
    return result;
  }

  throw new SerializationError("Failed to serialize value", { details: result });
}

export function deserialize<T>(payload: Serialized): T {
  const result = tryFn(() => superjson.parse<T>(payload));
  if (!(result instanceof Error)) {
    return result;
  }

  throw new SerializationError("Failed to deserialize payload", { details: result });
}
