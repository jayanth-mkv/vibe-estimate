import fs from "node:fs";
import { geminiBackendEnv } from "./gemini-config.mjs";

// Read-only model discovery. The API key is sent in a header, never in a URL,
// command argument, error message, browser process, or saved output.
const [configPath, selectedModel] = process.argv.slice(2);
const failure = message => Object.assign(new Error(message), { safeMessage: true });
try {
  if (!configPath) throw failure("Pass the private Gemini JSON path and optionally an available model ID.");
  const env = geminiBackendEnv({}, configPath);
  const models = [];
  let pageToken;
  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw failure("Gemini model discovery failed with HTTP " + response.status + ". No credential or raw upstream error was logged.");
    const body = await response.json();
    models.push(...(body.models ?? []).filter(model => model.supportedGenerationMethods?.includes("generateContent")).map(model => ({ id: model.name.replace(/^models\//, ""), displayName: model.displayName })));
    pageToken = body.nextPageToken;
  } while (pageToken);
  if (selectedModel) {
    if (!models.some(model => model.id === selectedModel)) throw failure("The selected model is not available for content generation with this credential.");
    const privatePath = fs.realpathSync(configPath);
    const settings = JSON.parse(fs.readFileSync(privatePath, "utf8"));
    settings.model = selectedModel;
    fs.writeFileSync(privatePath, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
    console.log("Available model selected: " + selectedModel + ". Private credential file updated without displaying its contents.");
  } else console.log(JSON.stringify({ availableTextModels: models.filter(model => /gemini.*flash/.test(model.id) && !/image|audio|tts|live|robotics/.test(model.id)) }, null, 2));
} catch (error) {
  console.error(error?.safeMessage ? error.message : "Gemini model discovery failed. Check the private configuration and network connection. Credential values and raw upstream errors were not logged.");
  process.exitCode = 1;
}
