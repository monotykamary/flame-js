import { describe, expect, it } from "bun:test";
import {
  ConfigError,
  FlameError,
  InvokeError,
  RegistryError,
  RemoteError,
  SignatureError,
  TimeoutError,
  TransportError
} from "../../src/errors";


describe("errors", () => {
  it("creates typed errors", () => {
    const base = new FlameError("config_error", "bad");
    expect(base.code).toBe("config_error");
    expect(base.name).toBe("FlameError");

    const invoke = new InvokeError("slow");
    expect(invoke.code).toBe("invoke_error");
    expect(invoke._tag).toBe("InvokeError");

    const registry = new RegistryError("missing");
    expect(registry.code).toBe("registry_error");
    expect(registry._tag).toBe("RegistryError");

    const config = new ConfigError("oops");
    expect(config.code).toBe("config_error");
    expect(config._tag).toBe("ConfigError");
  });

  it("creates specific invocation error tags", () => {
    const transport = new TransportError("runner failed", { retryable: true });
    expect(transport.code).toBe("transport_error");
    expect(transport._tag).toBe("TransportError");
    expect(transport.retryable).toBe(true);

    const timeout = new TimeoutError("timed out", { retryable: true });
    expect(timeout.code).toBe("timeout");
    expect(timeout._tag).toBe("TimeoutError");

    const remote = new RemoteError("remote exploded");
    expect(remote.code).toBe("remote_error");
    expect(remote._tag).toBe("RemoteError");
  });

  it("creates signature errors", () => {
    const signature = new SignatureError("bad signature");
    expect(signature.code).toBe("signature_error");
    expect(signature._tag).toBe("SignatureError");
  });
});
