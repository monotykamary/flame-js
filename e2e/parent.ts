import { Effect } from "effect";
import { flame } from "../src";
import { MathService, addFn, decorated, StaticUtils } from "./services";

const secret = process.env.FLAME_SECRET ?? "flame-secret";
const runnerUrl = process.env.RUNNER_URL ?? "http://localhost:8080";

await flame.configure({
  mode: "parent",
  security: { secret },
  pools: {
    default: { runners: [{ url: runnerUrl }] },
    gpu: { runners: [{ url: runnerUrl }] }
  }
});

const result = await MathService.add(2, 3);
if (result !== 5) {
  console.error("Unexpected result", result);
  process.exit(1);
}

const sub = await MathService.sub(5, 3);
if (sub !== 2) {
  console.error("Unexpected sub result", sub);
  process.exit(1);
}

const fnResult = await addFn(10, 5);
if (fnResult !== 15) {
  console.error("Unexpected fn result", fnResult);
  process.exit(1);
}

const decoratedAdd = await decorated.add(4, 6);
if (decoratedAdd !== 10) {
  console.error("Unexpected decorated add", decoratedAdd);
  process.exit(1);
}

const decoratedMul = await decorated.mul(3, 7);
if (decoratedMul !== 21) {
  console.error("Unexpected decorated mul", decoratedMul);
  process.exit(1);
}

const ping = await StaticUtils.ping();
if (ping !== "pong") {
  console.error("Unexpected ping", ping);
  process.exit(1);
}

const effectAdd = flame.toEffect(decorated.add);
const effectResult = await Effect.runPromise(effectAdd(1, 1));
if (effectResult !== 2) {
  console.error("Unexpected effect result", effectResult);
  process.exit(1);
}

console.log("E2E_OK");
await flame.shutdown();
