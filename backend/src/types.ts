export type Evidence = { source: "scope" | "messages"; quote: string };
export type Analysis = {
  summary: string;
  included: string[];
  proposed: string[];
  questions: string[];
  evidence: Evidence[];
  provider: "fixture" | "gemini";
};
export type Proposal = {
  id: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  status: "draft" | "superseded";
  createdAt: string;
};
export type Project = {
  id: string;
  /** Server-assigned origin for a frozen shared-room review. It grants no room membership. */
  roomId?: string;
  name: string;
  scope: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
  analysis?: Analysis;
  proposals: Proposal[];
};
export type ConversationTurn = { role: "user" | "model"; text: string };
export type ProposalInput = { quantity: number; unitPricePaise: number; requestId: string; description?: string };
export type StoredProject = Project & {
  ownerId: string;
  version: number;
  conversation: ConversationTurn[];
  requests: Record<string, { quantity: number; unitPricePaise: number; proposalId: string; description: string }>;
};
export type CreateProjectInput = Pick<Project, "name" | "scope" | "messages">;

export function publicProject(stored: StoredProject): Project {
  const { ownerId: _owner, version: _version, conversation: _conversation, requests: _requests, ...project } = stored;
  return project;
}
