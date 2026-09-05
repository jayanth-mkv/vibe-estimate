"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Download, FileText, MessageSquareText, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Health, Project } from "@/lib/types";

type Fields = { quantity: string; unitPrice: string; description: string; clarification: string };
type Props = {
  project: Project; health: Health | null; busy: string; hasUnsavedChanges: boolean; draftChanged: boolean;
  fields: Fields; setters: Record<keyof Fields, (value: string) => void>;
  onLeave: () => void; onAnalyze: (event?: FormEvent) => void;
  onSave: (event: FormEvent) => void; onDownload: () => void;
  roomId: string | null; onRoom: () => void;
};
const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export function ProjectView({ project, health, busy, hasUnsavedChanges, draftChanged, fields, setters, onLeave, onAnalyze, onSave, onDownload, roomId, onRoom }: Props) {
  const { quantity, unitPrice, description, clarification } = fields;
  const draft = project.proposals.find((proposal) => proposal.status === "draft");
  const [workStep, setWorkStep] = useState<"review" | "draft">(draft ? "draft" : "review");
  const [sourcesOpen, setSourcesOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusStepRef = useRef(false);
  const preview = Number(quantity) > 0 && Number(unitPrice) > 0 ? Math.round(Number(unitPrice) * 100) * Number(quantity) : null;

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!focusStepRef.current) return;
    focusStepRef.current = false;
    const heading = document.getElementById(workStep === "draft" ? "draft-title" : "review-title");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "nearest" });
  }, [workStep]);

  const openDraft = () => {
    if (workStep === "draft") document.getElementById("draft-title")?.focus();
    else { focusStepRef.current = true; setWorkStep("draft"); }
  };
  const showSource = (id = "source-scope") => {
    setSourcesOpen(true);
    requestAnimationFrame(() => {
      const source = document.getElementById(id);
      source?.focus({ preventScroll: true });
      source?.scrollIntoView({ block: "nearest" });
    });
  };

  return <>
    <section className="project-heading">
      <div className="project-identity"><Button variant="ghost" className="button back-button" disabled={!!busy} onClick={onLeave}><ArrowLeft size={17} />All projects</Button><h1 tabIndex={-1} ref={headingRef}>{project.name}</h1></div>
      <div className="project-actions"><span className={`saved-state ${hasUnsavedChanges ? "is-unsaved" : ""}`}><span className="status-dot" aria-hidden="true" />{busy ? "Working…" : hasUnsavedChanges ? "Changes not saved" : "Project saved"}</span><Button variant="outline" className="button secondary" onClick={onRoom} disabled={!!busy}><UsersRound size={16} aria-hidden="true" />{roomId ? "Back to room" : "Start shared room"}</Button></div>
    </section>
    <Tabs value={workStep} onValueChange={(value) => setWorkStep(value as "review" | "draft")} className="project-tabs">
      <div className="workflow-navigation">
        <div className="workflow-steps">
          <Button variant="ghost" className="button sources-step" onClick={() => showSource()}><span className="step-marker done" aria-hidden="true"><Check size={14} /></span>Sources</Button>
          <ChevronDown className="step-arrow" aria-hidden="true" size={16} />
          <TabsList className="work-tabs" aria-label="Project steps">
            <TabsTrigger value="review" className="work-tab"><span className={`step-marker ${project.analysis ? "done" : ""}`} aria-hidden="true">{project.analysis ? <Check size={14} /> : "2"}</span>Review</TabsTrigger>
            <TabsTrigger value="draft" disabled={!project.analysis} className="work-tab"><span className={`step-marker ${draft ? "done" : ""}`} aria-hidden="true">{draft ? <Check size={14} /> : "3"}</span>Draft</TabsTrigger>
          </TabsList>
        </div>
        {project.analysis && <a className="jump-to-draft" href="#draft-title" onClick={(event) => { event.preventDefault(); openDraft(); }}>Jump to draft<ArrowRight size={15} aria-hidden="true" /></a>}
      </div>
      <div className="review-layout">
        <aside className="evidence-column" aria-label="Project evidence">
          <details className="source-document" open={sourcesOpen} onToggle={(event) => setSourcesOpen(event.currentTarget.open)}>
            <summary><span><FileText size={17} aria-hidden="true" />Your sources<span className="source-count">2</span></span><ChevronDown size={17} aria-hidden="true" /></summary>
            <div className="source-body">
              <p className="source-caption">Original wording, kept with your project.</p>
              <section><h2 id="source-scope" tabIndex={-1}><FileText size={15} aria-hidden="true" />Agreed scope</h2><p className="source-text">{project.scope}</p></section>
              <section><h2 id="source-messages" tabIndex={-1}><MessageSquareText size={15} aria-hidden="true" />Client conversation</h2><p className="source-text conversation">{project.messages}</p></section>
              {project.analysis && <section className="evidence-findings"><h2>Behind the review</h2>{project.analysis.evidence.map((evidence, index) => <figure id={`source-quote-${index}`} tabIndex={-1} className="evidence-quote" key={`${index}-${evidence.source}`}><figcaption><span className="citation-number">{index + 1}</span>{evidence.source === "scope" ? "Agreed scope" : "Client messages"}</figcaption><blockquote>{evidence.quote}</blockquote></figure>)}</section>}
            </div>
          </details>
          <p className="source-note">Only extra work belongs in the new draft.</p>
        </aside>
        <div className="decision-column">
          <TabsContent value="review" className="work-panel">
            {!project.analysis ? <section className="review-start" aria-labelledby="review-title">
              <div className="ready-mark"><Check size={23} aria-hidden="true" /></div>
              <p className="step-caption">Sources ready · Step 2 of 3</p>
              <h2 id="review-title" tabIndex={-1}>Let’s make the change clear.</h2>
              <p>Compare the client’s request with the agreement before you put a price on it.</p>
              <ul className="review-expectations"><li><Check size={16} aria-hidden="true" />See what is already included</li><li><Plus size={16} aria-hidden="true" />Separate proposed extras</li><li><CircleHelp size={16} aria-hidden="true" />Find details to clarify</li></ul>
              <Button className="button primary" disabled={!!busy || !health} onClick={() => onAnalyze()}>{busy === "analyze" ? "Reviewing source material…" : "Review scope and messages"}<ArrowRight size={17} /></Button>
              <p className="fine-print">{health?.aiProvider === "fixture" ? "This local example uses a deterministic sample review." : "Gemini suggests. You check the sources and decide."}</p>
            </section> : <section className="review-result" aria-labelledby="review-title">
              <div className="section-heading"><div><p className="step-caption">Step 2 of 3</p><h2 id="review-title" tabIndex={-1}>Review the change</h2></div><span className="badge">{project.analysis.provider === "fixture" ? "Sample review" : "Gemini review"}</span></div>
              {draft && <p className="review-context">Your saved draft keeps its own quantity and price. Updating this review won’t change those choices.</p>}
              <p className="review-summary">{project.analysis.summary}</p>
              <div className="citation-links" aria-label="Review sources"><span>Check the sources</span>{project.analysis.evidence.map((evidence, index) => <Button key={index} variant="ghost" className="citation-button" aria-label={`View source ${index + 1}: ${evidence.source === "scope" ? "agreed scope" : "client messages"}`} onClick={() => showSource(`source-quote-${index}`)}>{index + 1}</Button>)}</div>
              <div className="findings-grid">
                <div className="finding"><h3><Check size={17} aria-hidden="true" />Already included</h3><ul>{project.analysis.included.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="finding-note">Keep this out of the extra-work total.</p></div>
                <div className="finding"><h3><Plus size={17} aria-hidden="true" />Proposed addition</h3><ul>{project.analysis.proposed.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
              </div>
              {!!project.analysis.questions.length && <div className="questions"><h3><CircleHelp size={17} aria-hidden="true" />Confirm before drafting</h3><ul>{project.analysis.questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
              <details className="clarification"><summary>Add a clarification<ChevronDown size={16} aria-hidden="true" /></summary>
                <form onSubmit={onAnalyze}><label htmlFor="clarification">What should the review take into account?</label><Textarea id="clarification" value={clarification} onChange={(event) => setters.clarification(event.target.value)} rows={3} required maxLength={1000} disabled={!!busy} placeholder={project.analysis.provider === "fixture" ? "Quote 6 lights" : "For this draft, use… Include the quantity, finish or agreed rate you want considered."} />
                  <div className="form-actions"><Button className="button secondary" disabled={!!busy || !clarification.trim()}>{busy === "analyze" ? "Updating review…" : "Update review"}</Button><span className="muted">{clarification.length}/1,000</span></div><p className="fine-print">Adds context to the review. It does not record client approval.</p>
                </form>
              </details>
              <div className="next-step"><div><strong>You choose what to propose.</strong><p>Confirm the description, quantity and price in the next step.</p></div><Button className="button primary" disabled={!!busy} onClick={openDraft}>Continue to draft<ArrowRight size={17} /></Button></div>
            </section>}
          </TabsContent>
          <TabsContent value="draft" className="work-panel">
            {project.analysis && <>
              <section className="draft-sheet" aria-labelledby="draft-title">
                <div className="section-heading"><div><p className="step-caption">Step 3 of 3</p><h2 id="draft-title" tabIndex={-1}>{draft ? "Your saved draft" : "Prepare the draft"}</h2></div><span className="badge draft-badge">Approval not collected</span></div>
                {draft && !draftChanged && <div className="draft-milestone"><CheckCheck size={24} aria-hidden="true" /><div><strong>Draft {project.proposals.length} saved. Ready for your final check.</strong><p>{project.proposals.length > 1 ? "Your earlier versions are safely kept below." : "You can download it now or make a revision."}</p></div></div>}
                <p className="draft-description">{project.analysis.provider === "fixture" ? "Display lighting · proposed additional work" : "Describe only the additional work you want to propose. Use a confirmed quantity and rate."}</p>
                <form onSubmit={onSave}>
                  <label htmlFor="description">Proposed work</label><Input id="description" required maxLength={200} value={description} disabled={!!busy} onChange={(event) => setters.description(event.target.value)} placeholder="For example, matte white display lights" />
                  <div className="amount-inputs"><div><label htmlFor="quantity">{project.analysis.provider === "fixture" ? "Number of display lights" : "Quantity"}</label><Input id="quantity" name="quantity" type="number" inputMode="numeric" required min={1} max={1000} step={1} value={quantity} disabled={!!busy} onChange={(event) => setters.quantity(event.target.value)} placeholder="Enter quantity" /></div><div><label htmlFor="unit-price">Confirmed unit price (₹)</label><Input id="unit-price" name="unitPrice" type="number" inputMode="decimal" required min="0.01" max="1000000" step="0.01" value={unitPrice} disabled={!!busy} onChange={(event) => setters.unitPrice(event.target.value)} placeholder="Enter rate" /></div></div>
                  <p className="field-help">{project.analysis.provider === "fixture" ? "Use the agreed rate. Included kitchen lighting is excluded from this additional-work total." : "Use confirmed values from the agreed scope or clarification. Included work stays out of this total."}</p>
                  <div className="draft-total"><span>{draftChanged ? "Revised draft total" : "Additional-work total"}</span><output aria-live="polite" htmlFor="quantity unit-price">{preview !== null && Number.isFinite(preview) ? rupees(preview) : "—"}</output></div>
                  {draft && <p className="previous-total">{draftChanged ? `Last saved draft: ${rupees(draft.totalPaise)}. Saving keeps the previous version.` : `Saved ${date(draft.createdAt)}. Change the quantity or price to create a revision.`}</p>}
                  <div className="draft-actions"><Button className="button primary" disabled={!!busy || (!!draft && !draftChanged)}>{busy === "save" ? "Saving draft…" : draft ? "Save revision" : "Save draft"}<ArrowRight size={17} /></Button>{draft && <Button type="button" className={`button ${draftChanged ? "secondary" : "download-button"}`} disabled={!!busy || draftChanged} onClick={onDownload}>{busy === "export" ? "Preparing download…" : "Download draft"}<Download size={17} /></Button>}</div>
                  <p className="fine-print">{draftChanged ? "Save your revision to include these changes in the download." : "This is a draft for your review, not an invoice or an approved order."}</p>
                </form>
              </section>
              {!!project.proposals.length && <section className="history" aria-labelledby="history-title"><div className="section-heading"><h2 id="history-title">Every version, kept.</h2><span className="muted">Only you can access this project</span></div><div className="history-table" role="region" aria-label="Proposal revision history" tabIndex={0}><table><thead><tr><th scope="col">Version</th><th scope="col">Details</th><th scope="col">Total</th><th scope="col">Status</th></tr></thead><tbody>{[...project.proposals].reverse().map((proposal, index) => <tr key={proposal.id}><th scope="row">Draft {project.proposals.length - index}<span>{date(proposal.createdAt)}</span></th><td><span>{proposal.description || "Proposed additional work"}</span><br />{proposal.quantity} × {rupees(proposal.unitPricePaise)}</td><td className="money">{rupees(proposal.totalPaise)}</td><td><span className={`badge ${proposal.status === "draft" ? "current-badge" : ""}`}>{proposal.status === "draft" ? "Current draft" : "Previous version"}</span></td></tr>)}</tbody></table></div></section>}
            </>}
          </TabsContent>
        </div>
      </div>
    </Tabs>
  </>;
}
