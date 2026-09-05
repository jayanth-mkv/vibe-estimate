"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { clientAuth, googleAuthEnabled, saveAccessWithGoogle, startSession, usesAnonymousAuth, usesEmulators, type SessionIdentity } from "@/lib/firebase";
import { api as projectApi } from "@/lib/api";
import { workspaceStatus } from "@/lib/workspace-status";
import type { Health } from "@/lib/types";
import { makeRoomApi } from "@/lib/room-api";
import type { Room } from "@/lib/room-types";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RoomView } from "./room-view";
import styles from "./room.module.css";

export interface PendingMessage { text: string; requestId: string; status: "sending" | "error"; error?: string }
const errorText = (error: unknown) => error instanceof Error ? error.message : "This action could not be completed. Please try again.";

export function RoomWorkspace({ roomId, identity }: { roomId: string; identity: SessionIdentity }) {
  const router = useRouter();
  const api = useMemo(() => makeRoomApi(identity), [identity]);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [bootVersion, setBootVersion] = useState(0);
  const [initialError, setInitialError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteHref, setInviteHref] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [leaveHref, setLeaveHref] = useState("");
  const inviteToken = useRef<string | null>(null);
  const sendLock = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const acceptRoom = useCallback((next: Room) => {
    setRoom((current) => current && current.updatedAt > next.updatedAt ? current : next);
  }, []);

  useEffect(() => {
    let active = true;
    void projectApi.health().then((value) => { if (active) setHealth(value); }).catch(() => { if (active) setHealth(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const auth = clientAuth(identity);
        await auth.authStateReady();
        if (cancelled) return;
        setLoading(true);
        setInitialError("");
        if (identity === "client" && inviteToken.current === null) {
          inviteToken.current = new URLSearchParams(window.location.hash.slice(1)).get("invite") || "";
        }
        if (!auth.currentUser && usesAnonymousAuth) {
          await startSession(identity);
        }
        if (cancelled) return;
        if (!auth.currentUser) {
          setNeedsSignIn(true);
          return;
        }
        setNeedsSignIn(false);
        setAnonymous(auth.currentUser.isAnonymous);
        const result = identity === "client" && inviteToken.current
          ? await api.join(roomId, inviteToken.current)
          : await api.get(roomId);
        if (cancelled) return;
        if (identity === "client") {
          inviteToken.current = "";
          if (new URLSearchParams(window.location.hash.slice(1)).has("invite")) {
            // Passing Next's internal history state would bypass its URL sync
            // and allow a later route refresh to restore the consumed invite.
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
          }
        }
        acceptRoom(result.room);
        setConnectionError("");
      } catch (error) {
        if (!cancelled) setInitialError(errorText(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void connect();
    return () => { cancelled = true; };
  }, [roomId, identity, api, bootVersion, acceptRoom]);

  const connectedRoomId = room?.id;
  useEffect(() => {
    if (!connectedRoomId) return;
    let cancelled = false;
    let polling = false;
    async function refresh() {
      if (polling) return;
      polling = true;
      try {
        const result = await api.get(connectedRoomId!);
        if (!cancelled) {
          acceptRoom(result.room);
          setConnectionError("");
        }
      } catch {
        if (!cancelled) setConnectionError("Connection interrupted. Your saved conversation is here; reconnecting…");
      } finally { polling = false; }
    }
    const timer = window.setInterval(() => void refresh(), 1500);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [connectedRoomId, api, acceptRoom]);

  useEffect(() => {
    if (!text.trim() && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [text, pending]);

  async function signIn() {
    setBusy("signin");
    setInitialError("");
    try { await startSession(identity); setBootVersion((value) => value + 1); }
    catch (error) { setInitialError(errorText(error)); }
    finally { setBusy(""); }
  }

  async function sendMessage(retry = false) {
    if (sendLock.current || !room) return;
    const message = retry && pending ? pending : { text: text.trim(), requestId: crypto.randomUUID(), status: "sending" as const };
    if (!message.text || message.text.length > 1000) return;
    sendLock.current = true;
    setPending({ ...message, status: "sending", error: undefined });
    setNotice("");
    try {
      const result = await api.send(room.id, message.text, message.requestId);
      acceptRoom(result.room);
      setText("");
      setPending(null);
      setNotice("Message saved for everyone in the room.");
      composerRef.current?.focus();
    } catch (error) {
      setPending({ ...message, status: "error", error: errorText(error) });
    } finally { sendLock.current = false; }
  }

  async function act(action: "retry" | "pause" | "resume") {
    if (busy || !room) return;
    setBusy(action);
    setActionError("");
    setNotice("");
    try {
      const result = await api.observer(room.id, action);
      acceptRoom(result.room);
      setNotice(action === "pause" ? "Agent paused. You can keep talking." : action === "resume" ? "Agent resumed." : "Review requested. Your conversation is preserved.");
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(""); }
  }

  async function createInvite() {
    if (busy || !room) return;
    setBusy("invite");
    setActionError("");
    try {
      const result = await api.invite(room.id);
      const url = new URL(`/client/rooms/${encodeURIComponent(room.id)}`, window.location.origin);
      url.hash = new URLSearchParams({ invite: result.inviteToken }).toString();
      setInviteHref(url.href);
      setJoinCode(result.joinCode);
      setNotice("Invite link ready. It expires in 24 hours and admits one client.");
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(""); }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteHref);
      setNotice("Invite link copied. Send it to your client when you’re ready.");
    } catch { setActionError("The link could not be copied. Use the room code or open the client view below."); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(joinCode); setNotice("Room code copied. Your client can enter it on Join a room."); }
    catch { setActionError("The code could not be copied. You can select and copy the room code shown here."); }
  }

  async function saveGoogleAccess() {
    if (busy) return;
    setBusy("google");
    setActionError("");
    try {
      await saveAccessWithGoogle(identity);
      setAnonymous(false);
      setNotice("Access saved with Google. Your room and guest work stay with you.");
    } catch (cause) { setActionError(errorText(cause)); }
    finally { setBusy(""); }
  }

  async function prepareDraft() {
    if (busy || !room || text.trim() || pending) return;
    setBusy("prepare");
    setActionError("");
    try {
      const result = await api.prepareDraft(room.id);
      router.push(`/?project=${encodeURIComponent(result.project.id)}&room=${encodeURIComponent(room.id)}`);
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(""); }
  }

  async function shareDraft() {
    if (busy || !room) return;
    setBusy("share");
    setActionError("");
    try {
      const result = await api.shareDraft(room.id);
      acceptRoom(result.room);
      setNotice("Saved draft shared with your client. Earlier shared versions are preserved.");
    } catch (error) { setActionError(errorText(error)); }
    finally { setBusy(""); }
  }

  function navigate(href: string) {
    if (text.trim() || pending) setLeaveHref(href);
    else router.push(href);
  }

  if (!room) return <div className={styles.page}>
    <header className={styles.header}><Link className="brand" href="/"><span className="brand-mark"><CheckCheck size={19} aria-hidden="true" /></span>VibeEstimate</Link><span className={styles.viewBadge}>{identity === "client" ? "Client room" : "Project room"}</span></header>
    <main className={styles.connectionPage}>
      {loading ? <div role="status"><div className={styles.loadingLine} /><div className={styles.loadingLineShort} /><h1>Opening your project room…</h1><p>Connecting to the saved conversation.</p></div> : <>
        <span className={styles.largeRoomMark}><CheckCheck size={28} aria-hidden="true" /></span>
        <h1>{needsSignIn ? identity === "client" ? "A shared space for your project." : "Return to your project room." : "We couldn’t open this room."}</h1>
        <p>{needsSignIn ? "Discuss the details with your designer, see what belongs in the scope, and keep every draft in one place." : usesAnonymousAuth ? "Use your invitation or the browser where you joined to reopen the conversation." : "Use your invitation and the same signed-in account to reopen the conversation."}</p>
        {initialError && <p role="alert" className={styles.error}>{initialError}</p>}
        {needsSignIn ? <Button className="button primary" disabled={!!busy} onClick={() => void signIn()}>{busy ? "Connecting…" : usesAnonymousAuth ? "Reconnect to room" : identity === "client" ? "Sign in to join" : "Sign in to continue"}</Button> : <Button className="button primary" onClick={() => setBootVersion((value) => value + 1)}>Try again</Button>}
        {identity === "client" && <Link className={styles.joinRecovery} href="/join">Join with a room code</Link>}
        {identity === "client" && <p className={styles.small}>The scope agent sees the conversation. It helps review changes; it does not approve work or prices.</p>}
      </>}
    </main>
  </div>;

  return <>
    <RoomView room={room} text={text} pending={pending} busy={busy} notice={notice} actionError={actionError} connectionError={connectionError} inviteOpen={inviteOpen} inviteHref={inviteHref} joinCode={joinCode} environmentLabel={workspaceStatus(health)} googleAvailable={googleAuthEnabled && anonymous} local={usesEmulators} composerRef={composerRef}
      onTextChange={setText} onSend={() => void sendMessage()} onRetryMessage={() => void sendMessage(true)} onObserver={(action) => void act(action)}
      onToggleInvite={() => { setInviteOpen((value) => !value); setNotice(""); setActionError(""); }} onCreateInvite={() => void createInvite()} onCopyInvite={() => void copyInvite()} onCopyCode={() => void copyCode()} onGoogle={() => void saveGoogleAccess()} onPrepareDraft={() => void prepareDraft()} onShareDraft={() => void shareDraft()} onNavigate={navigate} />
    <AlertDialog open={!!leaveHref} onOpenChange={(open) => { if (!open) setLeaveHref(""); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Leave your unsent message?</AlertDialogTitle><AlertDialogDescription>Your saved conversation will stay in the room. The message you are writing has not been confirmed as saved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="button secondary">Keep writing</AlertDialogCancel><AlertDialogAction className="button primary" onClick={() => { const href = leaveHref; setText(""); setPending(null); setLeaveHref(""); router.push(href); }}>Leave room</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>;
}
