import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { FlameService } from "../../src/flame-service";


describe("flame service", () => {
  it("provides a scoped flame instance", async () => {
    const program = Effect.gen(function* () {
      const flame = yield* FlameService;
      const ping = flame.fn("ping", async () => "pong");
      return yield* Effect.tryPromise({
        try: () => ping(),
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error))
      });
    });

    const layer = FlameService.layer({ mode: "local" });
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe("pong");
  });
});
