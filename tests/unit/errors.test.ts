import { describe, expect, it } from "bun:test";
import { ConfigError, FlameError, InvokeError, RegistryError } from "../../src/errors";


describe("errors", () => {
  it("creates typed errors", () => {
    const base = new FlameError("config_error", "bad");
    expect(base.code).toBe("config_error");

    const invoke = new InvokeError("timeout", "slow");
    expect(invoke.code).toBe("timeout");

    const registry = new RegistryError("missing");
    expect(registry.code).toBe("registry_error");

    const config = new ConfigError("oops");
    expect(config.code).toBe("config_error");
  });
});
