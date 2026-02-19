import { createTaggedError } from "errore";

export type FlameErrorCode =
  | "config_error"
  | "invoke_error"
  | "transport_error"
  | "timeout"
  | "remote_error"
  | "no_runner"
  | "registry_error"
  | "serialization_error"
  | "signature_error";

export interface FlameErrorOptions {
  details?: unknown;
  retryable?: boolean;
  cause?: unknown;
}

function toCauseOptions(options?: { cause?: unknown }): { cause?: unknown } | undefined {
  if (options?.cause === undefined) return undefined;
  return { cause: options.cause };
}

function assignMetadata(
  target: { details?: unknown; retryable?: boolean },
  options?: FlameErrorOptions
): void {
  if (options?.details !== undefined) {
    target.details = options.details;
  }
  if (options?.retryable !== undefined) {
    target.retryable = options.retryable;
  }
}

function normalizeErrorArgs(
  defaultCode: FlameErrorCode,
  codeOrMessage: FlameErrorCode | string,
  messageOrOptions?: string | (FlameErrorOptions & { code?: FlameErrorCode }),
  options?: FlameErrorOptions
): { code: FlameErrorCode; message: string; options?: (FlameErrorOptions & { code?: FlameErrorCode }) } {
  if (typeof messageOrOptions === "string") {
    if (options === undefined) {
      return { code: codeOrMessage as FlameErrorCode, message: messageOrOptions };
    }
    return { code: codeOrMessage as FlameErrorCode, message: messageOrOptions, options };
  }
  if (messageOrOptions === undefined) {
    return { code: defaultCode, message: codeOrMessage as string };
  }
  return { code: defaultCode, message: codeOrMessage as string, options: messageOrOptions };
}

export class FlameError extends Error {
  readonly code: FlameErrorCode;
  details?: unknown;
  retryable?: boolean;

  constructor(code: FlameErrorCode, message: string, options?: FlameErrorOptions);
  constructor(message: string, options?: FlameErrorOptions & { code?: FlameErrorCode });
  constructor(
    codeOrMessage: FlameErrorCode | string,
    messageOrOptions?: string | (FlameErrorOptions & { code?: FlameErrorCode }),
    options?: FlameErrorOptions
  ) {
    const normalized = normalizeErrorArgs("invoke_error", codeOrMessage, messageOrOptions, options);
    super(normalized.message, toCauseOptions(normalized.options));
    this.code = normalized.options?.code ?? normalized.code;
    assignMetadata(this, normalized.options);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const InvokeErrorTag = createTaggedError({
  name: "InvokeError",
  message: "$message",
  extends: FlameError
});

export class InvokeError extends InvokeErrorTag {
  override readonly code: FlameErrorCode;

  constructor(message: string, options?: FlameErrorOptions);
  constructor(code: FlameErrorCode, message: string, options?: FlameErrorOptions);
  constructor(
    codeOrMessage: FlameErrorCode | string,
    messageOrOptions?: string | FlameErrorOptions,
    options?: FlameErrorOptions
  ) {
    const normalized = normalizeErrorArgs("invoke_error", codeOrMessage, messageOrOptions, options);
    super({ message: normalized.message, ...toCauseOptions(normalized.options) });
    this.code = normalized.code;
    assignMetadata(this, normalized.options);
  }
}

const TransportErrorTag = createTaggedError({
  name: "TransportError",
  message: "$message",
  extends: FlameError
});

export class TransportError extends TransportErrorTag {
  override readonly code: FlameErrorCode = "transport_error";

  constructor(message: string, options?: FlameErrorOptions) {
    super({ message, ...toCauseOptions(options) });
    assignMetadata(this, options);
  }
}

const TimeoutErrorTag = createTaggedError({
  name: "TimeoutError",
  message: "$message",
  extends: FlameError
});

export class TimeoutError extends TimeoutErrorTag {
  override readonly code: FlameErrorCode = "timeout";

  constructor(message: string, options?: FlameErrorOptions) {
    super({ message, ...toCauseOptions(options) });
    assignMetadata(this, options);
  }
}

const RemoteErrorTag = createTaggedError({
  name: "RemoteError",
  message: "$message",
  extends: FlameError
});

export class RemoteError extends RemoteErrorTag {
  override readonly code: FlameErrorCode = "remote_error";

  constructor(message: string, options?: FlameErrorOptions) {
    super({ message, ...toCauseOptions(options) });
    assignMetadata(this, options);
  }
}

const NoRunnerErrorTag = createTaggedError({
  name: "NoRunnerError",
  message: "$message",
  extends: FlameError
});

export class NoRunnerError extends NoRunnerErrorTag {
  override readonly code: FlameErrorCode = "no_runner";

  constructor(message: string, options?: FlameErrorOptions) {
    super({ message, ...toCauseOptions(options) });
    assignMetadata(this, options);
  }
}

const RegistryErrorTag = createTaggedError({
  name: "RegistryError",
  message: "$message",
  extends: FlameError
});

export class RegistryError extends RegistryErrorTag {
  override readonly code: FlameErrorCode = "registry_error";

  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super({ message, ...toCauseOptions(options) });
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

const ConfigErrorTag = createTaggedError({
  name: "ConfigError",
  message: "$message",
  extends: FlameError
});

export class ConfigError extends ConfigErrorTag {
  override readonly code: FlameErrorCode = "config_error";

  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super({ message, ...toCauseOptions(options) });
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

const SerializationErrorTag = createTaggedError({
  name: "SerializationError",
  message: "$message",
  extends: FlameError
});

export class SerializationError extends SerializationErrorTag {
  override readonly code: FlameErrorCode = "serialization_error";

  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super({ message, ...toCauseOptions(options) });
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

const SignatureErrorTag = createTaggedError({
  name: "SignatureError",
  message: "$message",
  extends: FlameError
});

export class SignatureError extends SignatureErrorTag {
  override readonly code: FlameErrorCode = "signature_error";

  constructor(message: string, options?: { details?: unknown; cause?: unknown }) {
    super({ message, ...toCauseOptions(options) });
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}
