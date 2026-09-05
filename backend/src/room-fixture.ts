import { validateAnalysis } from "./domain.js";
import { AppError } from "./errors.js";
import { fixtureAnalysis } from "./fixtures.js";
import { reviewProject, ROOM_MESSAGE_LIMIT, ROOM_TRANSCRIPT_MARKER } from "./room-domain.js";
import type { RoomRole, StoredRoom } from "./room-types.js";
import type { StoredProject } from "./types.js";

/** Explicit synthetic demo lines, never a fallback for arbitrary conversation or failed Gemini. */
export const ROOM_FIXTURE_MESSAGES: Record<RoomRole, readonly string[]> = {
  client: [
    "Could we quote 6 display lights?",
    "Could we revise the draft to 4 display lights?",
    "Please keep the kitchen lighting in the agreed scope."
  ],
  designer: [
    "I will prepare a draft for 6 display lights at ₹2,000 each.",
    "I will revise the draft to 4 display lights at ₹2,000 each.",
    "Kitchen lighting stays included. Client approval has not been collected."
  ]
};
const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
export function roomFixtureAnalysis(room: StoredRoom) {
  const project = reviewProject(room);
  return analyzeFixtureEvidence(project, room.sourceMessages, room.messages);
}

/** Only server-created room projects can use this branch, and their entire transcript is checked again. */
export function roomSnapshotFixtureAnalysis(project: StoredProject, clarification?: string) {
  const parts = project.messages.split(ROOM_TRANSCRIPT_MARKER);
  if (!project.roomId || parts.length !== 2 || !parts[0] || !parts[1]) throw unsupportedSnapshot();
  const entries = parts[1].split(/\n\n(?=\[Room message \d+ — (?:Client|Designer)\]\n)/);
  if (!entries.length || entries.length > ROOM_MESSAGE_LIMIT) throw unsupportedSnapshot();
  const messages = entries.map((entry, index) => {
    const match = /^\[Room message (\d+) — (Client|Designer)\]\n([\s\S]+)$/.exec(entry);
    if (!match?.[3] || Number(match[1]) !== index + 1 || match[3].length > 1000) throw unsupportedSnapshot();
    return { role: match[2] === "Client" ? "client" as const : "designer" as const, text: match[3] };
  });
  if (clarification && !/^quote [46] lights[.!]?$/.test(normalize(clarification))) {
    throw new AppError(422, "ROOM_FIXTURE_UNSUPPORTED", "For a local room draft, reply “Quote 6 lights” or “Quote 4 lights”. Other clarifications require Gemini mode.");
  }
  return analyzeFixtureEvidence(project, parts[0], messages, clarification);
}
function unsupportedSnapshot() {
  return new AppError(422, "ROOM_FIXTURE_UNSUPPORTED", "This room draft does not match the supplied lighting conversation. Other text requires Gemini mode.");
}
function analyzeFixtureEvidence(project: StoredProject, sourceMessages: string, messages: { role: RoomRole; text: string }[], clarification?: string) {
  // This calls the existing strict lighting fixture with its unchanged original evidence.
  const original = { ...project, messages: sourceMessages };
  fixtureAnalysis(original);
  for (const message of messages) {
    if (!ROOM_FIXTURE_MESSAGES[message.role].some(suggestion => normalize(suggestion) === normalize(message.text))) {
      throw new AppError(422, "ROOM_FIXTURE_UNSUPPORTED", "The local room sample supports only its supplied lighting messages. Your conversation is saved; enable Gemini for other text.");
    }
  }
  const choice = messages.findLast(message => /[46] display lights/.test(normalize(message.text)));
  const quantity = choice && /4 display lights/.test(normalize(choice.text)) ? 4 : choice ? 6 : undefined;
  const { provider: _provider, ...output } = fixtureAnalysis(original, clarification ?? (quantity ? `Quote ${quantity} lights` : undefined));
  if (choice) output.evidence.push({ source: "messages", quote: choice.text });
  return validateAnalysis(output, project, "fixture");
}
