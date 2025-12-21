import { flame } from "../src";
import { MathService } from "./services";

const secret = process.env.FLAME_SECRET ?? "flame-secret";
const runnerUrl = process.env.RUNNER_URL ?? "http://localhost:8080";

await flame.configure({
  mode: "parent",
  runnerUrl,
  security: { secret }
});

const result = await MathService.add(2, 3);
if (result !== 5) {
  console.error("Unexpected result", result);
  process.exit(1);
}

console.log("E2E_OK");
await flame.shutdown();
