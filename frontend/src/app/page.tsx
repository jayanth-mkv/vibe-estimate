"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, CircleHelp } from "lucide-react";
import { Home, SourceWizard } from "@/components/onboarding";
import { ProjectView } from "./project-view";
import { examples, type SourceInput } from "@/lib/examples";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { api } from "@/lib/api";
import { roomApi } from "@/lib/room-api";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { clientAuth, googleAuthEnabled, openGoogleWorkspace, saveAccessWithGoogle, startSession, usesEmulators, usesGuestAccess, usesAnonymousAuth } from "@/lib/firebase";
import { workspaceStatus } from "@/lib/workspace-status";
import { ServiceError } from "@/lib/service-request";
import { forgetReview, readReviewRequest, rememberReview, restoreReview, resumeReviewInput, retryReview, reviewInput, startReview, withReviewMetadata, type PendingReview } from "@/lib/review-request";
import type { Health, Project } from "@/lib/types";

const emptySource = (): SourceInput => ({ name: "", scope: "", messages: "" });
const describeError = (error: unknown) => {
  if (error && typeof error === "object" && "code" in error && String(error.code).startsWith("auth/")) {
    if (error.code === "auth/popup-closed-by-user") return "Sign-in was closed. Your text is still here. Try again when you’re ready.";
    return usesEmulators ? "Your local workspace could not connect. Check the connection and try again." : usesGuestAccess ? "Your guest workspace could not connect. Your text is still here; please try again." : "Sign-in could not be completed. Please try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
};

function Brand() {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><CheckCheck size={22} /></span>VibeEstimate</span>;
}

export default function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessSaved, setAccessSaved] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [serviceChecked, setServiceChecked] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsKnown, setProjectsKnown] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clarification, setClarification] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [description, setDescription] = useState("");
  const [newProject, setNewProject] = useState<SourceInput>(emptySource);
  const [leaveAction, setLeaveAction] = useState<"projects" | "signout" | "room" | null>(null);
  const [sourceRoomId, setSourceRoomId] = useState<string | null>(null);
  const [reloadProjects, setReloadProjects] = useState(0);
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [reviewStorageUnavailable, setReviewStorageUnavailable] = useState(false);
  const pendingReviewRef = useRef<PendingReview | null>(null);
  const reviewWorkingRef = useRef(false);
  const sessionUidRef = useRef<string | null>(null);
  const startingProjectRef = useRef(false);
  const helpRef = useRef<HTMLDetailsElement>(null);
  const currentDraft = selected?.proposals.find((proposal) => proposal.status === "draft");
  const defaultDescription = selected?.analysis?.provider === "fixture" ? "Display lights" : "";
  const hasUnsavedChanges = Boolean(clarification.trim() || (creating && Object.values(newProject).some(Boolean)) || (selected?.analysis && (currentDraft ? Number(quantity) !== currentDraft.quantity || Math.round(Number(unitPrice) * 100) !== currentDraft.unitPricePaise || description.trim() !== (currentDraft.description || defaultDescription) : quantity || unitPrice || description !== defaultDescription)));

  const refreshHealth = async () => {
    try { setHealth(await api.health()); } catch { setHealth(null); } finally { setServiceChecked(true); }
  };

  const keepReview = useCallback((projectId: string, review: PendingReview | null, uid?: string) => {
    pendingReviewRef.current = review;
    setPendingReview(review);
    setReviewStorageUnavailable(Boolean(review && uid && !rememberReview(uid, projectId, review)));
  }, []);

  const choose = useCallback((project: Project | null) => {
    setSelected(project);
    setCreating(false);
    setError("");
    setNotice("");
    const uid = clientAuth().currentUser?.uid;
    const recovery = project && uid ? restoreReview(uid, project.id, project.reviewRequest) : null;
    keepReview(project?.id ?? "", recovery, uid);
    setClarification(recovery?.clarification ?? "");
    const draft = project?.proposals.find((proposal) => proposal.status === "draft");
    setQuantity(draft ? String(draft.quantity) : "");
    setUnitPrice(draft ? String(draft.unitPricePaise / 100) : "");
    setDescription(draft?.description || (project?.analysis?.provider === "fixture" ? "Display lights" : ""));
    requestRef.current = null;
    const params = new URLSearchParams(window.location.search);
    const candidate = project?.roomId || (project && params.get("project") === project.id ? params.get("room") : null);
    const roomId = candidate && /^[a-f0-9-]{36}$/i.test(candidate) ? candidate : null;
    setSourceRoomId(roomId);
    window.history.replaceState(null, "", project ? `?project=${encodeURIComponent(project.id)}${roomId ? `&room=${encodeURIComponent(roomId)}` : ""}` : "/");
  }, [keepReview]);

  const acceptProject = (project: Project) => {
    setSelected(project);
    setProjects((existing) => [project, ...existing.filter((item) => item.id !== project.id)]);
  };

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void api.health().then((result) => { if (active) setHealth(result); }).catch(() => { if (active) setHealth(null); }).finally(() => { if (active) setServiceChecked(true); });
    // Browser-only SDK initialization shares the asynchronous subscription lifecycle.
    void Promise.resolve().then(async () => {
      if (!active) return;
      const auth = clientAuth();
      await auth.authStateReady();
      if (!active) return;
      if (usesGuestAccess && !auth.currentUser) await startSession();
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        const previousUid = sessionUidRef.current;
        const nextUid = currentUser?.uid ?? null;
        sessionUidRef.current = nextUid;
        if (previousUid && previousUid !== nextUid) {
          // Another identity must never inherit this owner's visible work or
          // recovery note. The old note stays scoped to its original UID.
          setProjects([]); setSelected(null); setCreating(false);
          pendingReviewRef.current = null; setPendingReview(null); setReviewStorageUnavailable(false);
          setClarification(""); setQuantity(""); setUnitPrice(""); setDescription(""); setNewProject(emptySource());
          setSourceRoomId(null); setError(""); setNotice(""); requestRef.current = null;
          window.history.replaceState(null, "", "/");
        }
        setUser(currentUser);
        setAccessSaved(Boolean(currentUser && !currentUser.isAnonymous));
        setProjectsKnown(false);
        setAuthReady(true);
        setLoadingProjects(Boolean(currentUser));
        if (!currentUser) { setProjects([]); setSelected(null); pendingReviewRef.current = null; setPendingReview(null); }
      });
    }).catch((cause) => {
      if (active) { setError(describeError(cause)); setAuthReady(true); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      // The first save owns its create response. A concurrent sign-in list
      // must not replace the just-created project or clear its source form.
      if (startingProjectRef.current) { setLoadingProjects(false); return; }
      try {
        const result = await api.list();
        if (!active || startingProjectRef.current) return;
        setProjects(result.projects);
        setProjectsKnown(true);
        const id = new URLSearchParams(window.location.search).get("project");
        if (id) {
          const result = await api.project(id);
          if (active) choose(result.project);
        }
      } catch (cause) { if (active) setError(describeError(cause)); }
      finally { if (active) setLoadingProjects(false); }
    })();
    return () => { active = false; };
  }, [user, reloadProjects, choose]);

  useEffect(() => {
    const closeHelp = (event: PointerEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) helpRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeHelp);
    return () => document.removeEventListener("pointerdown", closeHelp);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (busy || hasUnsavedChanges) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, hasUnsavedChanges]);

  const action = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(describeError(cause)); }
    finally { setBusy(""); }
  };

  const create = (body: SourceInput) => action("create", async () => {
    startingProjectRef.current = true;
    try {
      if (!clientAuth().currentUser) await startSession();
      const result = await api.create(body);
      setProjects((existing) => [result.project, ...existing.filter((project) => project.id !== result.project.id)]);
      choose(result.project);
      setNewProject(emptySource());
      setNotice("Sources saved. You’re ready to review the change.");
    } finally { startingProjectRef.current = false; setLoadingProjects(false); }
  });

  const openRoom = () => {
    if (!selected) return;
    if (sourceRoomId) { router.push(`/rooms/${sourceRoomId}`); return; }
    void action("room", async () => {
      const result = await roomApi.create(selected.id);
      router.push(`/rooms/${result.room.id}`);
    });
  };

  const startRoomDemo = () => action("room-demo", async () => {
    startingProjectRef.current = true;
    try {
      if (!clientAuth().currentUser) await startSession();
      const result = await api.create({ ...examples[0].source });
      const shared = await roomApi.create(result.project.id);
      router.push(`/rooms/${shared.room.id}`);
    } finally { startingProjectRef.current = false; setLoadingProjects(false); }
  });

  const finishLeave = (destination: "projects" | "signout" | "room") => {
    setLeaveAction(null);
    if (destination === "room") { openRoom(); return; }
    setNewProject({ name: "", scope: "", messages: "" });
    if (destination === "signout") void action("signout", async () => { await signOut(clientAuth()); choose(null); });
    else { choose(null); if (user) { setLoadingProjects(true); setReloadProjects((value) => value + 1); } }
  };

  const requestLeave = (destination: "projects" | "signout" | "room") => {
    if (busy) return;
    if (hasUnsavedChanges) setLeaveAction(destination);
    else finishLeave(destination);
  };

  const runReview = (mode: "start" | "check" | "retry") => {
    if (!selected || busy || reviewWorkingRef.current) return;
    const uid = clientAuth().currentUser?.uid;
    if (!uid) { setError("Your session has ended. Reconnect to continue. Your inputs are still here."); return; }
    let attempt: PendingReview;
    try {
      const current = pendingReviewRef.current;
      if (mode === "start") attempt = startReview(clarification, current);
      else {
        if (!current) return;
        attempt = mode === "retry" ? retryReview(current, undefined, clarification) : current;
      }
    } catch (cause) { setError(describeError(cause)); return; }
    // Record before dispatch, synchronously, so rapid clicks and lost responses
    // cannot turn one intended review into multiple paid requests.
    reviewWorkingRef.current = true;
    keepReview(selected.id, attempt, uid);
    const input = mode === "check" ? resumeReviewInput(attempt) : reviewInput(attempt);
    return action(mode === "start" ? "analyze" : mode === "check" ? "review-status" : "review-retry", async () => {
      try {
        const result = await api.analyze(selected.id, input);
        if (clientAuth().currentUser?.uid !== uid) return;
        acceptProject(result.project);
        forgetReview(uid, selected.id, attempt.requestId);
        const next = readReviewRequest(result.project.reviewRequest);
        keepReview(selected.id, next ? withReviewMetadata(attempt, next) : null, uid);
        setClarification((text) => text.trim() === (attempt.clarification ?? "").trim() ? "" : text);
        // Resuming a review must not reset a saved draft or unsaved owner prices.
        if (!selected.analysis && !currentDraft) {
          const restoredDraft = result.project.proposals.find((proposal) => proposal.status === "draft");
          setQuantity(restoredDraft ? String(restoredDraft.quantity) : "");
          setUnitPrice(restoredDraft ? String(restoredDraft.unitPricePaise / 100) : "");
          setDescription(restoredDraft?.description || (result.project.analysis?.provider === "fixture" ? "Display lights" : ""));
        }
        setNotice(next ? "Saved review restored. Another review still needs attention." : "Review saved. Check the findings, then choose what goes in your draft.");
      } catch (cause) {
        if (clientAuth().currentUser?.uid !== uid) return;
        if (mode === "check" && cause instanceof ServiceError && cause.code === "REVIEW_REQUEST_NOT_FOUND") {
          forgetReview(uid, selected.id, attempt.requestId);
          const current = cause.reviewRequest ? withReviewMetadata(null, cause.reviewRequest) : null;
          keepReview(selected.id, current, uid);
          setNotice(current ? "A different review is active for this project. Check its status before starting another review. Your text is still here."
            : "No review was started for that request. Your text is still here. Start a review when you’re ready.");
          return;
        }
        const server = cause instanceof ServiceError ? cause.reviewRequest : undefined;
        const retained = server ? withReviewMetadata(attempt, server)
          : { ...attempt, status: "unknown" as const, retryAllowed: false, retryAfterMs: undefined };
        keepReview(selected.id, retained, uid);
        if (server?.status === "running" || server?.status === "save_pending") return;
        throw cause;
      }
    }).finally(() => { reviewWorkingRef.current = false; });
  };

  const analyze = (event?: FormEvent) => {
    event?.preventDefault();
    return runReview("start");
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const count = Number(quantity);
    const price = Math.round(Number(unitPrice) * 100);
    if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isSafeInteger(price) || price < 1 || price > 100000000 || !/^\d+(\.\d{1,2})?$/.test(unitPrice)) {
      setError("Enter a whole quantity from 1 to 1,000 and a confirmed price greater than ₹0, with at most two decimal places.");
      return;
    }
    const key = `${selected.id}:${count}:${price}:${description.trim()}`;
    if (requestRef.current?.key !== key) requestRef.current = { key, id: crypto.randomUUID() };
    const requestId = requestRef.current.id;
    return action("save", async () => {
      const result = await api.propose(selected.id, { quantity: count, unitPricePaise: price, requestId, description: description.trim() });
      acceptProject(result.project);
      setNotice(currentDraft ? "Revision saved. Your previous version is kept." : "Draft saved. Your proposal is ready for your final check.");
    });
  };

  const download = () => {
    if (!selected) return;
    return action("export", async () => {
      const content = await api.export(selected.id);
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vibeestimate-draft-${selected.id}.txt`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Draft downloaded. Review it before sharing it with your client.");
    });
  };

  const draft = currentDraft;
  const draftChanged = !!draft && (Number(quantity) !== draft.quantity || Math.round(Number(unitPrice) * 100) !== draft.unitPricePaise || description.trim() !== (draft.description || defaultDescription));
  const isLoading = !authReady || (user && loadingProjects && !creating && !selected);
  const startNew = () => { setCreating(true); setError(""); setNotice(""); };
  const canOpenGoogle = googleAuthEnabled && usesAnonymousAuth && !accessSaved && !selected && !creating && !hasUnsavedChanges && projects.length === 0 && (!user || projectsKnown);
  const continueGoogle = () => {
    if (!canOpenGoogle) return;
    void action("google-signin", async () => {
      // Recheck the server immediately before an explicit account switch. A
      // previous create may have saved even when its response did not arrive.
      if (clientAuth().currentUser) {
        const fresh = await api.list();
        setProjects(fresh.projects);
        setProjectsKnown(true);
        if (fresh.projects.length) throw new Error("Your guest workspace has saved work. Use Save access with Google to keep these projects with you.");
      }
      await openGoogleWorkspace();
      setNotice("Your Google workspace is open.");
    });
  };

  return <>
    <a className="skip-link" href="#main">Skip to workspace</a>
    <header className="topbar"><div className="topbar-inner">
      <Link href="/" onClick={(event) => { event.preventDefault(); requestLeave("projects"); }} aria-label="VibeEstimate workspace"><Brand /></Link>
      <div className="header-actions">
        <details ref={helpRef} className="quick-guide" onKeyDown={(event) => {
          if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
        }}>
          <summary aria-label="How it works"><CircleHelp size={18} /><span>How it works</span></summary>
          <div className="guide-content"><h2>A clear draft in three steps</h2>
            <ol><li><strong>Add your sources</strong><p>Paste the agreed scope and the client’s messages.</p></li><li><strong>Review the change</strong><p>Check what is included, what is extra, and what needs an answer.</p></li><li><strong>Prepare your draft</strong><p>Confirm quantity and price. Save, revise and download.</p></li></ol>
            <p className="fine-print">You decide what to propose. Client approval is a separate step.</p>
          </div>
        </details>
        {authReady && (usesAnonymousAuth ? googleAuthEnabled && user && !accessSaved && (projects.length > 0 || creating || selected) ? <Button variant="ghost" className="button text-button google-access-button" disabled={!!busy} onClick={() => void action("google", async () => { await saveAccessWithGoogle(); setAccessSaved(true); setNotice("Access saved with Google. Your projects and drafts stay with you."); })}>{busy === "google" ? "Connecting…" : "Save access with Google"}</Button> : <span className="guest-access-label">{accessSaved ? "Access saved" : "Guest access"}</span> : user ? <Button variant="ghost" className="button text-button" disabled={!!busy} onClick={() => requestLeave("signout")}>Sign out</Button> : <Button variant="ghost" className="button text-button signin-button" disabled={!!busy} onClick={() => void action("signin", async () => { await startSession(); })}>Sign in</Button>)}
      </div>
    </div></header>

    <main id="main" className="shell">
      {error && <div className="alert" role="alert"><span>{error}</span><Button variant="ghost" className="button text-button" aria-label="Dismiss error" onClick={() => setError("")}>Dismiss</Button></div>}
      <div className={notice ? "notice visible" : "notice"} role="status" aria-live="polite">{notice && <><Check size={17} aria-hidden="true" />{notice}</>}</div>
      {isLoading ? <div className="loading-state" aria-label={authReady ? "Loading projects" : "Opening workspace"}><div className="skeleton" /><div className="skeleton short" /><p>Opening your workspace…</p></div> : <>
        {!selected && !creating && <Home guest={usesAnonymousAuth && !accessSaved} cloud={health?.storageConnection === "cloud"} googleContinue={canOpenGoogle} onGoogleContinue={continueGoogle} onRoomDemo={() => void startRoomDemo()} projects={projects} signedIn={!!user} busy={!!busy} available={!!health} fixture={health?.aiProvider === "fixture"} onNew={startNew} onExample={(source) => void create(source)} onOpen={choose} onRefresh={() => { setLoadingProjects(true); setReloadProjects((value) => value + 1); }} onSignIn={() => void action("signin", async () => { if (!clientAuth().currentUser) await startSession(); else { setLoadingProjects(true); setReloadProjects((value) => value + 1); } })} />}
        {creating && <><Button variant="ghost" className="button back-button" disabled={!!busy} onClick={() => requestLeave("projects")}><ArrowLeft size={17} />All projects</Button><SourceWizard value={newProject} onChange={setNewProject} onSave={() => void create(newProject)} onCancel={() => requestLeave("projects")} busy={!!busy} available={!!health} fixture={health?.aiProvider === "fixture"} /></>}
        {selected && <ProjectView roomId={sourceRoomId} onRoom={() => requestLeave("room")} key={selected.id} project={selected} health={health} busy={busy} hasUnsavedChanges={hasUnsavedChanges} draftChanged={draftChanged} pendingReview={pendingReview} reviewStorageUnavailable={reviewStorageUnavailable} onCheckReview={() => void runReview("check")} onRetryReview={() => void runReview("retry")} fields={{ quantity, unitPrice, description, clarification }} setters={{ quantity: setQuantity, unitPrice: setUnitPrice, description: setDescription, clarification: setClarification }} onLeave={() => requestLeave("projects")} onAnalyze={(event) => void analyze(event)} onSave={(event) => void save(event)} onDownload={() => void download()} />}
      </>}
      {serviceChecked && !health && <div className="service-status" role="status"><span>The project service is unavailable. Your text stays here. Reconnect to save or review.</span><Button className="button secondary" onClick={() => void refreshHealth()}>Check connection</Button></div>}
    </main>
    <AlertDialog open={leaveAction !== null} onOpenChange={(open) => { if (!open) setLeaveAction(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Leave these changes behind?</AlertDialogTitle><AlertDialogDescription>Your latest edits have not been saved. Your previously saved project and proposals will remain in your account.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="button secondary">Keep editing</AlertDialogCancel><AlertDialogAction className="button primary" onClick={() => { if (leaveAction) finishLeave(leaveAction); }}>Discard edits and leave</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <footer className="page-footer"><span>From the original wording to your next decision.</span><span className="environment-strip"><span className="status-dot" aria-hidden="true" />{workspaceStatus(health)}</span></footer>
  </>;
}
