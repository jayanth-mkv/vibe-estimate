"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, FileText, Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { examples, type SourceInput } from "@/lib/examples";
import type { Project } from "@/lib/types";
import styles from "./onboarding.module.css";

type HomeProps = {
  projects: Project[];
  signedIn: boolean;
  busy: boolean;
  available: boolean;
  fixture: boolean;
  onNew: () => void;
  onExample: (source: SourceInput) => void;
  onOpen: (project: Project) => void;
  onRefresh: () => void;
  onSignIn: () => void;
};

function projectNextStep(project: Project) {
  if (project.proposals.some((proposal) => proposal.status === "draft")) {
    return { status: "Draft saved", action: "Review or revise your draft" };
  }
  if (project.analysis?.questions.length) {
    return { status: "Reviewed", action: "Clarify the open questions" };
  }
  if (project.analysis) {
    return { status: "Reviewed", action: "Prepare your draft" };
  }
  return { status: "Sources saved", action: "Review scope and messages" };
}

function updatedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function Home({
  projects,
  signedIn,
  busy,
  available,
  fixture,
  onNew,
  onExample,
  onOpen,
  onRefresh,
  onSignIn,
}: HomeProps) {
  const returning = signedIn && projects.length > 0;
  const recentProjects = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const exampleList = (
    <>
      <p className={styles.exampleHelp}>Fictional projects with sample scope and messages. No client approval is collected.</p>
      <ul className={styles.exampleList}>
        {examples.map((example) => {
          const fixtureUnavailable = fixture && example.id !== "lighting";
          return (
            <li className={styles.exampleRow} key={example.id}>
              <div className={styles.exampleCopy}>
                <span className={styles.category}>{example.category}</span>
                <h3>{example.title}</h3>
                <p>{example.description}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className={styles.exampleButton}
                disabled={busy || !available || fixtureUnavailable}
                aria-describedby={fixtureUnavailable ? "fixture-example-help" : undefined}
                onClick={() => onExample({ ...example.source })}
              >
                {example.id === "lighting" ? "Try the lighting example" : `Try the ${example.id} example`}
                <ArrowRight aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ul>
      {fixture && (
        <p className={styles.fixtureNote} id="fixture-example-help">
          Local sample mode supports the lighting example. The other examples need live Gemini.
        </p>
      )}
    </>
  );

  return (
    <div className={styles.home}>
      {returning ? (
        <section aria-labelledby="projects-heading">
          <div className={styles.sectionHeading}>
            <div>
              <h1 id="projects-heading">Your projects</h1>
              <p>Pick up where you left off.</p>
            </div>
            <Button type="button" className={styles.primaryButton} onClick={onNew} disabled={busy}>
              <Plus aria-hidden="true" /> New project
            </Button>
          </div>
          <div className={styles.listToolbar}>
            <h2>Recent projects</h2>
            <Button
              type="button"
              variant="ghost"
              className={styles.quietButton}
              onClick={onRefresh}
              disabled={busy || !available}
            >
              <RotateCw aria-hidden="true" /> Refresh projects
            </Button>
          </div>
          <ul className={styles.projectList}>
            {recentProjects.map((project) => {
              const nextStep = projectNextStep(project);
              const date = updatedDate(project.updatedAt);
              return (
                <li key={project.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className={styles.projectRow}
                    disabled={busy}
                    onClick={() => onOpen(project)}
                  >
                    <span className={styles.projectIcon}><FileText aria-hidden="true" /></span>
                    <span className={styles.projectCopy}>
                      <span className={styles.projectName}>{project.name}</span>
                      <span className={styles.nextStep}>{nextStep.action}</span>
                    </span>
                    <span className={styles.projectMeta}>
                      <span className={styles.projectStatus}>{nextStep.status}</span>
                      {date && <span className={styles.projectDate}>Updated {date}</span>}
                    </span>
                    <ChevronRight className={styles.rowArrow} aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className={styles.welcome} aria-labelledby="welcome-heading">
          <Image className={styles.welcomeArt} src="/images/designer-review.webp" width={1200} height={800} alt="" sizes="300px" />
          <h1 id="welcome-heading">Turn client changes into clear drafts.</h1>
          <p className={styles.welcomeCopy}>
            Bring the agreed scope and client messages together.{" "}<br className={styles.desktopBreak} />
            Review what changed, confirm the details, and save a draft.
          </p>
          <ol className={styles.steps} aria-label="How a project works">
            <li><span className={styles.stepNumber}>1</span> Sources</li>
            <li><span className={styles.stepNumber}>2</span> Review</li>
            <li><span className={styles.stepNumber}>3</span> Draft</li>
          </ol>
          <div className={styles.welcomeActions}>
            <Button type="button" className={styles.primaryButton} onClick={onNew} disabled={busy}>
              <Plus aria-hidden="true" /> Start a project
            </Button>
            {!signedIn && (
              <Button type="button" variant="ghost" className={styles.quietButton} onClick={onSignIn} disabled={busy || !available}>
                Open saved projects
              </Button>
            )}
          </div>
        </section>
      )}
      {returning ? (
        <details className={styles.exampleDisclosure}>
          <summary>Try a fictional example</summary>
          {exampleList}
        </details>
      ) : (
        <section className={styles.examples} aria-labelledby="examples-heading">
          <h2 id="examples-heading">Or start with an example</h2>
          {exampleList}
        </section>
      )}
      <Link href="/welcome" className={styles.tourLink}>Explore the illustrated product tour <ArrowRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}

type SourceWizardProps = {
  value: SourceInput;
  onChange: (value: SourceInput) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  available: boolean;
  fixture: boolean;
};

type FieldErrors = Partial<Record<keyof SourceInput, string>>;

function scopeErrors(value: SourceInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.name.trim()) errors.name = "Enter a project name.";
  else if (value.name.length > 100) errors.name = "Keep the project name to 100 characters or fewer.";
  if (value.scope.trim().length < 10) errors.scope = "Add at least 10 characters of agreed scope.";
  else if (value.scope.length > 12_000) errors.scope = "Keep the agreed scope to 12,000 characters or fewer.";
  return errors;
}

export function SourceWizard({ value, onChange, onSave, onCancel, busy, available, fixture }: SourceWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const scopeInput = useRef<HTMLTextAreaElement>(null);
  const messagesInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function changeField(field: keyof SourceInput, text: string) {
    onChange({ ...value, [field]: text });
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const nextErrors = scopeErrors(value);
    if (nextErrors.name || nextErrors.scope) {
      setErrors(nextErrors);
      if (step === 2) setStep(1);
      else if (nextErrors.name) nameInput.current?.focus();
      else scopeInput.current?.focus();
      return;
    }
    if (step === 1) {
      setErrors({});
      setStep(2);
      return;
    }
    if (value.messages.trim().length < 10) nextErrors.messages = "Add at least 10 characters of client messages.";
    else if (value.messages.length > 16_000) nextErrors.messages = "Keep the client messages to 16,000 characters or fewer.";
    setErrors(nextErrors);
    if (nextErrors.messages) {
      messagesInput.current?.focus();
      return;
    }
    if (available) onSave();
  }

  return (
    <section className={styles.wizard} aria-labelledby="sources-heading">
      <div className={styles.wizardHeader}>
        <h1 id="sources-heading">Add your sources</h1>
        <p>Start with the original wording. You can clarify details after the review.</p>
      </div>
      <ol className={styles.wizardSteps} aria-label="Source setup progress">
        <li aria-current={step === 1 ? "step" : undefined}>
          <span className={styles.stepNumber}>1</span> Agreed scope
        </li>
        <li aria-current={step === 2 ? "step" : undefined}>
          <span className={styles.stepNumber}>2</span> Client messages
        </li>
      </ol>
      <form className={styles.sourceForm} onSubmit={submit} noValidate aria-busy={busy}>
        <div className={styles.partHeader}>
          <div>
            <p className={styles.partLabel}>Part {step} of 2</p>
            <h2 ref={heading} tabIndex={-1}>
              {step === 1 ? "What was agreed?" : "What did the client ask to change?"}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            className={styles.quietButton}
            disabled={busy}
            onClick={() => {
              onChange({ ...examples[0].source });
              setErrors({});
            }}
          >
            Use example text
          </Button>
        </div>
        {step === 1 ? (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="project-name">Project name</label>
              <Input
                id="project-name"
                ref={nameInput}
                className={styles.input}
                value={value.name}
                onChange={(event) => changeField("name", event.target.value)}
                placeholder="e.g. Meera’s kitchen renovation"
                required
                maxLength={100}
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "project-name-error" : undefined}
              />
              {errors.name && <p className={styles.fieldError} id="project-name-error" role="alert">{errors.name}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="agreed-scope">Agreed scope</label>
              <p className={styles.fieldHelp} id="scope-help">Paste the agreed work, quantities, and exclusions from your scope.</p>
              <Textarea
                id="agreed-scope"
                ref={scopeInput}
                className={styles.textarea}
                value={value.scope}
                onChange={(event) => changeField("scope", event.target.value)}
                placeholder="e.g. Kitchen lighting: 3m LED strip included. Display lights excluded."
                required
                minLength={10}
                maxLength={12_000}
                rows={6}
                disabled={busy}
                aria-invalid={Boolean(errors.scope)}
                aria-describedby={`scope-help${errors.scope ? " scope-error" : ""}`}
              />
              {errors.scope && <p className={styles.fieldError} id="scope-error" role="alert">{errors.scope}</p>}
            </div>
          </div>
        ) : (
          <div className={styles.fields}>
            <div className={styles.savedContext}>
              <FileText aria-hidden="true" />
              <div><span className={styles.contextLabel}>Project</span><strong>{value.name}</strong></div>
              <span className={styles.contextNote}>Scope added</span>
            </div>
            <div className={styles.field}>
              <label htmlFor="client-messages">Client messages</label>
              <p className={styles.fieldHelp} id="messages-help">Keep speaker names and message order. Include prices only if someone stated them.</p>
              <Textarea
                id="client-messages"
                ref={messagesInput}
                className={`${styles.textarea} ${styles.messagesTextarea}`}
                value={value.messages}
                onChange={(event) => changeField("messages", event.target.value)}
                placeholder={"Client: Could we add four display lights?\nDesigner: Let me confirm the price."}
                required
                minLength={10}
                maxLength={16_000}
                rows={8}
                disabled={busy}
                aria-invalid={Boolean(errors.messages)}
                aria-describedby={`messages-help${errors.messages ? " messages-error" : ""}`}
              />
              {errors.messages && <p className={styles.fieldError} id="messages-error" role="alert">{errors.messages}</p>}
            </div>
          </div>
        )}
        {fixture && (
          <p className={styles.fixtureNote}>Local sample mode reviews the lighting example. Choose “Use example text” to try it.</p>
        )}
        {!available && <p className={styles.availabilityNote} role="status">The service is unavailable. You can keep preparing your sources here.</p>}
        <div className={styles.formFooter}>
          <p>Nothing is saved until you choose Save project.</p>
          <div className={styles.formActions}>
            <Button type="button" variant="ghost" className={styles.quietButton} onClick={onCancel} disabled={busy}>Cancel</Button>
            <div className={styles.stepActions}>
              {step === 2 && (
                <Button type="button" variant="outline" className={styles.outlineButton} onClick={() => setStep(1)} disabled={busy}>Back</Button>
              )}
              <Button type="submit" className={styles.primaryButton} disabled={busy || (step === 2 && !available)}>
                {step === 1 ? "Continue" : busy ? "Saving project…" : "Save project"}
                {step === 1 && <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
