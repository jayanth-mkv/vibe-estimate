import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { root, localEnv } from "./local-env.mjs";

const results = [];
for (const name of ["playwright", "shadcn"]) {
  const launcher = path.join(root, "scripts/start-" + name + "-mcp.mjs");
  if (!fs.existsSync(launcher)) continue;
  const client = new Client({ name: "vibeestimate-local-verification", version: "0.1.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [launcher], cwd: root, env: localEnv(), stderr: "pipe" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    if (!listed.tools.length) throw new Error(name + " returned no tools.");
    if (name === "playwright") {
      if (!listed.tools.some(tool => tool.name === "browser_navigate")) throw new Error("Missing browser navigation tool.");
      const result = await client.callTool({ name: "browser_navigate", arguments: { url: "data:text/html,<title>VibeEstimate MCP check</title><h1>Project-local browser ready</h1>" } });
      if (result.isError) throw new Error("Playwright MCP browser launch failed: " + JSON.stringify(result.content));
      await client.callTool({ name: "browser_close", arguments: {} });
    }
    results.push({ server: name, connected: true, tools: listed.tools.length, browserLaunched: name === "playwright" });
  } finally {
    await client.close();
  }
}
fs.mkdirSync(path.join(root, ".cache/verification"), { recursive: true });
fs.writeFileSync(path.join(root, ".cache/verification/mcp.json"), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 2));
