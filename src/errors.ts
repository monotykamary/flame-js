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

export class FlameError extends Error {
  readonly code: FlameErrorCode;
  readonly details?: unknown;
  readonly retryable?: boolean;

  constructor(code: FlameErrorCode, message: string, options?: { details?: unknown; retryable?: boolean }) {
    super(message);
    this.name = "FlameError";
    this.code = code;
    this.details = options?.details;
    this.retryable = options?.retryable;
  }
}

export class InvokeError extends FlameError {
  constructor(code: FlameErrorCode, message: string, options?: { details?: unknown; retryable?: boolean }) {
    super(code, message, options);
    this.name = "InvokeError";
  }
}

export class RegistryError extends FlameError {
  constructor(message: string, options?: { details?: unknown }) {
    super("registry_error", message, { details: options?.details });
    this.name = "RegistryError";
  }
}

export class ConfigError extends FlameError {
  constructor(message: string, options?: { details?: unknown }) {
    super("config_error", message, { details: options?.details });
    this.name = "ConfigError";
  }
}
