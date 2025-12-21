import superjson from "superjson";
import { FlameError } from "./errors";

export type Serialized = string;

export function serialize(value: unknown): Serialized {
  try {
    return superjson.stringify(value);
  } catch (error) {
    throw new FlameError("serialization_error", "Failed to serialize value", { details: error });
  }
}

export function deserialize<T>(payload: Serialized): T {
  try {
    return superjson.parse<T>(payload);
  } catch (error) {
    throw new FlameError("serialization_error", "Failed to deserialize payload", { details: error });
  }
}
