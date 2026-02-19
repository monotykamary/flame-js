import type { PoolConfig, Backend, RunnerHandle } from "./pool/types";
import type { HmacConfig } from "./security";

export type Mode = "parent" | "runner" | "local";
export type ErrorHandlingMode = "throw" | "return";

export interface FlameConfig {
  mode?: Mode;
  defaultPool?: string;
  pools?: Record<string, PoolConfig>;
  backend?: Backend;
  runnerUrl?: string;
  invokePath?: string;
  security?: HmacConfig;
  requestTimeoutMs?: number;
  maxBodyBytes?: number;
  exposeErrors?: boolean;
  logger?: Logger;
}

export interface FlameOptions {
  pool?: string;
  timeoutMs?: number;
  idempotencyKey?: string;
  errors?: ErrorHandlingMode;
  retry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
  };
}

export interface InvocationRequest {
  invocationId: string;
  serviceId: string;
  methodId: string;
  args: string;
  timeoutMs?: number;
  trace?: Record<string, string>;
  idempotencyKey?: string;
  iat: number;
  exp: number;
}

export interface InvocationSuccess {
  ok: true;
  result: string;
}

export interface InvocationFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
  };
}

export type InvocationResponse = InvocationSuccess | InvocationFailure;

export interface InvocationContext {
  invocationId: string;
  deadline: number | null;
  signal: AbortSignal;
  trace?: Record<string, string>;
}

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface RunnerSlot {
  runner: RunnerHandle;
}
