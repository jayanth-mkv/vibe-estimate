"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * THESIS: Give a designer clarity before a client change becomes a proposal.
 * OWN-WORLD: Petpooja's measured navy hero, white Poppins display, DM Sans, red actions, flat illustrated panels.
 * STORY: Recognize the problem, see the source-to-draft example, open a private review workspace.
 * FIRST VIEWPORT: Centered three-line 68px headline and red action above an overlapping laptop and phone.
 * FORM: User-pinned Petpooja homepage, inspected at desktop/mobile; no new direction selection.
 */

function ForwardArrow() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}

function ProductPreview() {
  return <figure className="product-preview">
    <div className="preview-devices" role="img" aria-label="Fictional project preview: kitchen lighting stays included; six additional display lights at 2,000 rupees each make a 12,000 rupee draft, revised to four lights for 8,000 rupees. Neither draft records client approval.">
      <div className="laptop" aria-hidden="true">
        <div className="laptop-camera" />
        <div className="mock-app">
          <div className="mock-topbar"><span className="mock-logo">v<span>e</span></span><b>VibeEstimate</b><span className="mock-topbar-section">Project workspace</span><span className="mock-avatar">A</span></div>
          <div className="mock-project-heading"><div><span className="mock-caption">PROJECT REVIEW</span><strong>Asha’s home renovation</strong></div><span className="mock-saved">Project saved</span></div>
          <div className="mock-workflow"><span>1 <b>Source material</b></span><span>2 <b>Review the change</b></span><span className="active">3 <b>Prepare a draft</b></span></div>
          <div className="mock-columns">
            <div className="mock-source"><div className="mock-panel-title">Original source material</div><div className="mock-source-body"><b>Agreed scope</b><p>Kitchen lighting: 3m LED strip included.<br />Display lights excluded.</p><b>Client conversation</b><div className="mock-message"><span>Asha</span><p>Could we add 4 display lights?</p></div><div className="mock-message designer"><span>Designer</span><p>Display lights cost ₹2,000 each.</p></div><div className="mock-message"><span>Asha</span><p>Could we do 6? Let me check the total.</p></div></div></div>
            <div className="mock-decision"><div className="mock-included"><span className="mock-check">✓</span><div><b>Already included</b><p>Kitchen lighting · 3m LED strip</p></div></div><div className="mock-draft"><span className="mock-caption">PROPOSED ADDITION</span><b>Display lighting</b><div className="mock-quantity"><span>6 display lights</span><span>₹2,000 each</span></div><div className="mock-total"><span>Additional-work total</span><strong>₹12,000</strong></div><span className="mock-draft-label">Draft · Approval not collected</span></div><p className="mock-note">Every finding links back to the original wording.</p></div>
          </div>
        </div>
      </div>
      <div className="laptop-base" aria-hidden="true" />
      <div className="phone" aria-hidden="true"><div className="phone-notch" /><div className="phone-top"><span>9:41</span><span>•••</span></div><div className="phone-brand">Vibe<span>Estimate</span></div><div className="phone-content"><span className="phone-caption">YOUR PROJECT</span><b>Asha’s home renovation</b><span className="phone-version">Draft 2</span><strong>Your revised draft</strong><p>Display lighting</p><div className="phone-quantity"><span>4 lights</span><span>₹2,000 each</span></div><span className="phone-caption">ADDITIONAL WORK</span><span className="phone-total">₹8,000</span><span className="phone-state">Draft saved</span><p className="phone-approval">Approval not collected</p><div className="phone-history"><span>Previous version kept</span><b>6 lights · ₹12,000</b></div></div></div>
    </div>
    <figcaption>Fictional project preview <span aria-hidden="true">·</span> Your decisions. Every version kept.</figcaption>
  </figure>;
}

const workflowSteps = [
  { value: "scope", label: "Scope", title: "Start with what was agreed.", copy: "Bring the original scope and relevant client messages into one project. Keep their wording intact, so the review has evidence to work from." },
  { value: "review", label: "Review", title: "Make every change a clear decision.", copy: "See what is already included, what could be additional work, and which details need an answer. Add a clarification and continue the review." },
  { value: "draft", label: "Draft", title: "A considered proposal, ready for your review.", copy: "Enter the confirmed work, quantity, and unit price. Create a useful draft with a calculated total, while keeping included work separate." },
  { value: "revision", label: "Revision", title: "Plans change. Keep the whole story.", copy: "Revise your quantity or price, preserve the previous version, and download the saved draft when you are ready to share it." },
];

type LandingProps = { busy: boolean; local: boolean; onStart: () => void; startLabel?: string };

export function Landing({ busy, local, onStart, startLabel }: LandingProps) {
  return <div className="landing">
    <section className="landing-hero" aria-labelledby="welcome-title">
      <div className="hero-copy"><h1 id="welcome-title">Clearer Scope.<br />Better Conversations.<br />Considered Changes.</h1><p className="hero-lead">Bring the agreement and client messages together. Review what’s included, clarify what’s changing, and prepare a proposal you can stand behind.</p><Button id="get-started" className="button primary hero-cta" disabled={busy} onClick={onStart}>{busy ? "Opening your workspace…" : startLabel ?? (local ? "Open local workspace" : "Sign in with Google")}</Button><p className="hero-privacy">{local ? "A private local test session. No real client data needed." : "A private workspace for your projects."}</p></div>
      <ProductPreview />
    </section>

    <section id="how-it-works" className="workflow-intro" aria-label="How VibeEstimate works">
      <Tabs defaultValue="review" className="product-tabs">
        <TabsList className="product-tab-list" aria-label="Explore the project workflow">{workflowSteps.map((step) => <TabsTrigger key={step.value} value={step.value} className="product-tab">{step.label}</TabsTrigger>)}</TabsList>
        {workflowSteps.map((step) => <TabsContent key={step.value} value={step.value} className="product-tab-panel"><h2>{step.title}</h2><p>{step.copy}</p><a className="inline-action" href="#get-started">Start your review<ForwardArrow /></a></TabsContent>)}
      </Tabs>
    </section>

    <section className="scope-promise" aria-label="Designed around your project"><p>DESIGNED FOR THE CHANGES BETWEEN THE LINES</p><div><span>Original agreement</span><span className="promise-plus" aria-hidden="true">+</span><span>Client conversation</span><span className="promise-arrow" aria-hidden="true">→</span><strong>A clearer next step</strong></div></section>

    <section id="why-vibeestimate" className="feature-section" aria-labelledby="features-title">
      <div className="feature-section-heading"><span className="section-tag">WHY VIBEESTIMATE</span><h2 id="features-title">Less back-and-forth.<br />More shared understanding.</h2><p>A space to work through the details, with the original agreement close by and every decision still in your hands.</p></div>
      <div className="feature-grid">
        <article className="feature-card feature-source"><div className="feature-copy"><h3>Keep the context.</h3><p>Review the conversation alongside the agreed scope. Follow each finding back to the words that support it.</p></div><Image src="/images/designer-review.webp" width={1200} height={800} alt="An interior designer comparing a floor plan with a client message." sizes="(max-width: 840px) 90vw, 60vw" /></article>
        <article className="feature-card feature-clarity"><div className="feature-copy"><h3>Ask the useful question.</h3><p>Resolve a missing quantity, an unclear request, or an unconfirmed rate before it reaches your draft.</p></div><div className="illustrative-conversation" aria-label="Fictional clarification example"><span className="conversation-label">FOR EXAMPLE</span><blockquote>“Could we do six?”</blockquote><div className="clarity-answer"><span className="mini-spark" aria-hidden="true">?</span><p>Six display lights in total, or six more?</p></div><span className="conversation-footnote">Clarification comes before calculation.</span></div></article>
        <article className="feature-card feature-included"><div className="feature-copy"><h3>Keep included work included.</h3><p>Separate existing commitments from proposed additions before choosing what goes into the draft.</p></div><div className="included-example" aria-label="Fictional scope example"><div><span className="included-icon" aria-hidden="true">✓</span><span><b>Kitchen lighting</b><small>Already in the agreed scope</small></span><strong>Included</strong></div><div><span className="addition-icon" aria-hidden="true">+</span><span><b>Display lights</b><small>Discussed in the conversation</small></span><strong>Addition</strong></div><p>Fictional lighting example</p></div></article>
        <article id="drafts" className="feature-card feature-revision"><div className="feature-copy"><h3>Every version, kept.</h3><p>Make a revision without losing the earlier draft. Your project and proposal history stay private to your account.</p></div><Image src="/images/proposal-revisions.webp" width={720} height={720} alt="Proposal papers with a revision arrow, a pencil, and a calculator." sizes="(max-width: 840px) 75vw, 30vw" /></article>
      </div>
    </section>

    <section className="closing-section" aria-labelledby="closing-title"><span className="section-tag">FROM CONVERSATION TO PROPOSAL</span><h2 id="closing-title">Ready for the next<br />“one more thing”?</h2><p>Start with your own project, or explore a fictional lighting conversation from first review to revised draft.</p><Button className="button primary closing-cta" disabled={busy} onClick={onStart}>{busy ? "Opening your workspace…" : "Start your first review"}<ForwardArrow /></Button><span className="closing-note">Owner-reviewed drafts. Client approval stays a separate step.</span></section>
  </div>;
}
