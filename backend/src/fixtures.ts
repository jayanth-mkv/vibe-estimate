import { AppError } from "./errors.js";
import type { Analysis, StoredProject } from "./types.js";

export const FIXTURE_NAME = "Asha’s home renovation";
export const FIXTURE_SCOPE = "Kitchen lighting: 3m LED strip included. Display lights excluded.";
export const FIXTURE_MESSAGES = "Asha: Could we add 4 display lights? Designer: Display lights cost ₹2,000 each. Asha: Could we do 6? Let me check the total. Asha: Please remember the kitchen lighting.";
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
function exactQuote(source: string, expected: string): string {
  const pattern = expected.split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const quote = new RegExp(pattern).exec(source)?.[0];
  if (!quote) throw new AppError(422, "FIXTURE_UNSUPPORTED", "The sample evidence could not be matched. Restore the supplied lighting example.");
  return quote;
}

export function fixtureAnalysis(project: StoredProject, clarification?: string): Analysis {
  if (normalize(project.scope) !== FIXTURE_SCOPE || normalize(project.messages) !== FIXTURE_MESSAGES) {
    throw new AppError(422, "FIXTURE_UNSUPPORTED", "Local sample mode only supports the supplied lighting example. Enable Gemini for your own project text.");
  }
  const answer = clarification?.trim().toLowerCase().replace(" at the supplied rate. client approval is not recorded.", "").replace(/[.!]$/, "");
  if (answer && !/^(?:(?:please )?(?:quote|use|choose|make it|let's do|let us do|i want|i choose|confirm) )?(?:4|four|6|six)(?: (?:display )?lights)?(?: please)?$/.test(answer)) {
    throw new AppError(422, "FIXTURE_UNSUPPORTED", "For this local sample, reply “Quote 6 lights” or “Quote 4 lights”. Your own conversation requires Gemini mode.");
  }
  const quantity = answer ? (/4|four/.test(answer) ? 4 : 6) : undefined;
  return {
    summary: quantity ? `Prepare a draft for ${quantity} display lights. Kitchen lighting is already included. Client approval has not been collected.` : "Kitchen lighting is included. Display lights are a proposed extra; confirm the quantity before drafting. Client approval has not been collected.",
    included: ["Kitchen lighting: 3m LED strip (already included; no extra charge)."],
    proposed: [quantity ? `${quantity} display lights at the supplied rate of ₹2,000 each, for owner review.` : "Display lights at the supplied rate of ₹2,000 each; the messages mention both 4 and 6."],
    questions: quantity ? [] : ["Should the draft include 4 or 6 display lights?"],
    evidence: [
      { source: "scope", quote: exactQuote(project.scope, "Kitchen lighting: 3m LED strip included.") },
      { source: "scope", quote: exactQuote(project.scope, "Display lights excluded.") },
      { source: "messages", quote: exactQuote(project.messages, "Display lights cost ₹2,000 each.") },
      { source: "messages", quote: exactQuote(project.messages, "Could we do 6? Let me check the total.") }
    ],
    provider: "fixture"
  };
}
