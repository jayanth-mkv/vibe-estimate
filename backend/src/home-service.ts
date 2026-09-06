import { randomUUID } from "node:crypto";
import { catalog, type DesignSelection, type HousePatch } from "@vibeestimate/scene-schema";
import { applyDesignPatch, compileDesignResponse, createHomeTemplate, describeDesignChanges, resolveDesignScope } from "@vibeestimate/scene-core";
import { AppError } from "./errors.js";
import { HomeModelError } from "./home-ai.js";
import { homeHash, HomeStore } from "./home-store.js";
import { newProject, type ProjectStore } from "./store.js";
import type { HomeAIProvider, HomeGenerationInput, HomeModelContext, HomeRevision, HomeSummary, HomeReviewSource } from "./home-types.js";

export const HOME_ASSUMPTIONS = ["This is a proposed design based on an authored starting layout, not a survey of your property.", "Ceiling heights, furniture bounds and dimensions must be checked on site.", "Lights are illustrative; the design does not confirm wiring, lux levels, structural safety or installation feasibility.", "Catalog objects have no supplier price or availability commitment."];
const markdownText = (text: string) => text.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}\[\]<>|#]/g, "").trim();
function sceneCheck<T>(operation: () => T, model = false): T {
  try { return operation(); }
  catch (error) { throw new AppError(model ? 502 : 422, model ? "DESIGN_INVALID_RESPONSE" : "INVALID_DESIGN", error instanceof Error ? error.message.slice(0, 400) : "This design change could not be validated."); }
}

/** The inventory and dimensions are assembled in code; AI supplies prose only. */
export function designMarkdown(revision: HomeRevision, title: string, narrative: string) {
  const scene = revision.scene;
  const counts = new Map<string, number>();
  for (const instance of scene.instances) counts.set(instance.catalogId, (counts.get(instance.catalogId) ?? 0) + 1);
  return [
    `# ${markdownText(title)}`, "", "Proposed interior design · draft for review", `Saved revision: ${revision.id}`, "", markdownText(narrative), "",
    "## Rooms and assumed clear dimensions", "", "| Room | Width × depth |", "| --- | --- |",
    ...scene.rooms.map(room => `| ${markdownText(room.name)} | ${(room.width / 1000).toFixed(2)} × ${(room.depth / 1000).toFixed(2)} m |`),
    "", "## Proposed furniture and lights", "", "| Catalog item | Count |", "| --- | --- |",
    ...[...counts].map(([id, count]) => `| ${markdownText(catalog.find(item => item.id === id)?.name ?? id)} | ${count} |`),
    "", "## Review before proceeding", "", ...HOME_ASSUMPTIONS.map(item => `- ${item}`),
    "- Prices, quantities for construction, installation details, fees, programme and commercial agreement remain unconfirmed.",
    "- This document records a design option. It is not a quotation, invoice, site instruction or signed contract.", "",
  ].join("\n");
}

export class HomeService {
  constructor(readonly store: HomeStore, readonly provider: HomeAIProvider, private projects: ProjectStore) {}
  async template(uid: string, id: string, input: { requestId: string; baseRevisionId: string | null; templateId: string }) {
    const hash = homeHash(input); const receipt = await this.store.receipt(uid, id, input.requestId, "template", hash);
    if (receipt) return this.store.get(uid, id);
    if (input.baseRevisionId !== null) await this.store.revision(uid, id, input.baseRevisionId);
    const scene = sceneCheck(() => createHomeTemplate(input.templateId));
    const revision: HomeRevision = { id: randomUUID(), parentRevisionId: input.baseRevisionId, title: scene.name, description: "Selected an authored starting layout.", createdAt: new Date().toISOString(), source: "template", conflict: false, scene, brief: { title: scene.name, summary: "A starting layout ready for your design brief.", source: "template", assumptions: HOME_ASSUMPTIONS }, requestId: input.requestId };
    return this.store.publish(uid, id, { ...input, hash, kind: "template", revision });
  }
  async edit(uid: string, id: string, input: { requestId: string; baseRevisionId: string; patch: HousePatch; selection: DesignSelection }) {
    const hash = homeHash(input); if (await this.store.receipt(uid, id, input.requestId, "manual", hash)) return this.store.get(uid, id);
    const base = await this.store.revision(uid, id, input.baseRevisionId);
    const scene = sceneCheck(() => applyDesignPatch(base.scene, input.patch, input.selection));
    const revision: HomeRevision = { id: randomUUID(), parentRevisionId: base.id, title: base.title, description: `Saved ${input.patch.operations.length} selected design ${input.patch.operations.length === 1 ? "change" : "changes"}.`, createdAt: new Date().toISOString(), source: "manual", conflict: false, scene, brief: base.brief, requestId: input.requestId, patch: input.patch, changes: describeDesignChanges(base.scene, scene) };
    return this.store.publish(uid, id, { ...input, hash, kind: "manual", revision });
  }
  async restore(uid: string, id: string, input: { requestId: string; baseRevisionId: string; revisionId: string }) {
    const hash = homeHash(input); if (await this.store.receipt(uid, id, input.requestId, "restore", hash)) return this.store.get(uid, id);
    const selected = await this.store.revision(uid, id, input.revisionId);
    await this.store.revision(uid, id, input.baseRevisionId);
    const revision: HomeRevision = { id: randomUUID(), parentRevisionId: input.baseRevisionId, title: selected.title, description: `Restored saved design ${selected.id}.`, createdAt: new Date().toISOString(), source: "restore", conflict: false, scene: selected.scene, brief: selected.brief, requestId: input.requestId };
    return this.store.publish(uid, id, { ...input, hash, kind: "restore", revision });
  }
  private async run(uid: string, id: string, input: { requestId: string; baseRevisionId: string; prompt?: string; selection?: DesignSelection }, kind: "generate" | "summary" | "agreement", options?: { actorId: string; assistant?: { name: string; instructions: string }; reviewSource?: HomeReviewSource }) {
    const base = await this.store.revision(uid, id, input.baseRevisionId);
    if (input.selection) sceneCheck(() => resolveDesignScope(base.scene, input.selection!));
    const hash = homeHash({ ...input, ...(options ? { actorId: options.actorId, assistant: options.assistant ?? null } : {}) });
    if (kind !== "generate") {
      const cached = await this.store.cachedProse(uid, id, { requestId: input.requestId, baseRevisionId: input.baseRevisionId, kind, hash });
      if (cached) return { home: await this.store.get(uid, id), job: cached };
    }
    const started = await this.store.beginJob(uid, id, { requestId: input.requestId, baseRevisionId: input.baseRevisionId, kind, hash });
    if (!started.dispatch) {
      if (started.job.status === "save_pending") await this.store.complete(uid, id, input.requestId);
      return { home: await this.store.get(uid, id), job: await this.store.job(uid, id, input.requestId) };
    }
    const context: HomeModelContext = { home: await this.store.get(uid, id), revision: base, ...(input.selection ? { selection: input.selection } : {}), ...(input.prompt ? { prompt: input.prompt } : {}), ...(kind === "agreement" ? { purpose: "agreement" } : {}), ...(options?.assistant ? { assistant: options.assistant } : {}), ...(options?.reviewSource ? { reviewSource: options.reviewSource } : {}) };
    let output: unknown; let actualModel = "";
    try {
      for (const [index, model] of this.provider.models.slice(0, 2).entries()) {
        if (!await this.store.reserveAttempt(uid, id, input.requestId, model)) return { home: await this.store.get(uid, id), job: await this.store.job(uid, id, input.requestId) };
        actualModel = model;
        try { output = kind === "generate" ? await this.provider.generate(context, model) : await this.provider.summarize(context, model); break; }
        catch (error) { if (!(error instanceof HomeModelError && error.recoverable && error.outcome === "definite" && index + 1 < Math.min(2, this.provider.models.length))) throw error; }
      }
      if (output === undefined) throw new HomeModelError("definite", false);
      await this.store.phase(uid, id, input.requestId, "validating");
      let result: { revision: HomeRevision } | { summary: HomeSummary };
      if (kind === "generate") {
        const compiled = sceneCheck(() => compileDesignResponse(base.scene, output, input.selection!), true);
        const revision: HomeRevision = {
          id: randomUUID(), parentRevisionId: base.id, title: compiled.title, description: compiled.summary,
          createdAt: new Date().toISOString(), source: this.provider.kind, conflict: false, scene: compiled.document,
          brief: { title: compiled.title, summary: compiled.summary, source: this.provider.kind, assumptions: HOME_ASSUMPTIONS },
          requestId: input.requestId, prompt: input.prompt!, patch: compiled.patch, model: actualModel, changes: describeDesignChanges(base.scene, compiled.document),
        };
        result = { revision };
      } else {
        const prose = output as { title: string; narrative: string };
        if (typeof prose.title !== "string" || prose.title.length > 100 || typeof prose.narrative !== "string" || !prose.narrative.trim() || prose.narrative.length > 1800) throw new AppError(502, "DESIGN_INVALID_RESPONSE", "The generated summary could not be verified.");
        result = { summary: { id: input.requestId, revisionId: base.id, title: prose.title, narrative: prose.narrative, markdown: designMarkdown(base, prose.title, prose.narrative), provider: this.provider.kind, model: actualModel, createdAt: new Date().toISOString(), ...(kind === "agreement" ? { purpose: "agreement" } : {}), ...(options?.reviewSource ? { reviewSource: options.reviewSource } : {}) } };
      }
      // Retry only this idempotent persistence operation. Never repeat generation
      // after a write failure or an ambiguous upstream outcome.
      try { await this.store.stage(uid, id, input.requestId, result); }
      catch { await this.store.stage(uid, id, input.requestId, result); }
    } catch (error) {
      const known = error instanceof AppError;
      const ambiguous = error instanceof HomeModelError ? error.outcome === "unknown" : !known;
      await this.store.fail(uid, id, input.requestId, ambiguous ? "unknown" : "failed", {
        code: known ? error.code : "GENERATION_OUTCOME_UNKNOWN",
        message: known ? error.message : "The generated result could not be confirmed saved. Check this request before deliberately starting a new one.",
      });
      return { home: await this.store.get(uid, id), job: await this.store.job(uid, id, input.requestId) };
    }
    try { await this.store.complete(uid, id, input.requestId); }
    catch { /* A durably staged result remains save_pending for the same request. */ }
    return { home: await this.store.get(uid, id), job: await this.store.job(uid, id, input.requestId) };
  }
  generate(uid: string, id: string, input: HomeGenerationInput, options?: { actorId: string; assistant?: { name: string; instructions: string } }) { return this.run(uid, id, input, "generate", options); }
  summarize(uid: string, id: string, input: { requestId: string; baseRevisionId: string }) { return this.run(uid, id, input, "summary"); }
  draftAgreement(uid: string, id: string, input: { requestId: string; baseRevisionId: string }, actorId: string, reviewSource: HomeReviewSource) { return this.run(uid, id, input, "agreement", { actorId, reviewSource }); }
  async proposal(uid: string, id: string, input: { requestId: string; baseRevisionId: string }) {
    const hash = homeHash(input); const receipt = await this.store.receipt(uid, id, input.requestId, "proposal", hash);
    if (receipt?.projectId) return { home: await this.store.get(uid, id), project: await this.projects.get(uid, receipt.projectId) };
    const revision = await this.store.revision(uid, id, input.baseRevisionId);
    const scope = "No construction scope or commercial terms have been agreed. This is an AI-assisted proposed interior design for owner review; site measurements and feasibility remain unconfirmed.";
    const messages = `Proposed design brief, not client messages or approval:\n${revision.brief.summary}\nSource saved home revision: ${revision.id}.`;
    const project = newProject(uid, { name: revision.title, scope, messages });
    const projectId = await this.store.linkProposal(uid, id, { ...input, hash, project });
    return { home: await this.store.get(uid, id), project: await this.projects.get(uid, projectId) };
  }
}
