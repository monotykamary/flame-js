import { flame } from "../src";
import "./services";

const secret = process.env.FLAME_SECRET ?? "flame-secret";
const port = process.env.PORT ? Number(process.env.PORT) : 8080;

await flame.configure({
  mode: "runner",
  security: { secret }
});

const server = flame.createRunnerServer({ port, security: { secret } });
console.log(`RUNNER_READY ${server.url}`);

await new Promise(() => {});
