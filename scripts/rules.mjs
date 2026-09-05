import { localEnv } from "./local-env.mjs";
import { completion, nodeChild, portOpen } from "./processes.mjs";

if (!(await portOpen(8085))) throw new Error("Start npm run dev first, or use npm run test:local to start the stack automatically.");
await completion(nodeChild("node_modules/vitest/vitest.mjs", ["run", "--config", "vitest.rules.config.ts"], localEnv()));
