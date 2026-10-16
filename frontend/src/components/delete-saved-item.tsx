"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { clientAuth, type SessionIdentity } from "@/lib/firebase";
import { makeTrashApi, type TrashItem, type TrashTarget } from "@/lib/trash-api";
import { ServiceError } from "@/lib/service-request";
import { makeHomeApi } from "@/lib/home-api";
import "./trash.css";

type Props = {
  target: TrashTarget;
  ownerUid: string;
  identity?: SessionIdentity;
  disabled?: boolean;
  unsavedChanges?: boolean;
  onDeleted: (item: TrashItem) => void;
  onReview?: () => void;
};

/** Freeze the named item and revision at confirmation; preserve the request after an unknown outcome. */
export function DeleteSavedItem({ target, ownerUid, identity = "designer", disabled, unsavedChanges, onDeleted, onReview }: Props) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [accountUid, setAccountUid] = useState(ownerUid), [reviewRequired, setReviewRequired] = useState(false);
  const [confirmedTarget, setConfirmedTarget] = useState(target);
  const attempt = useRef<{ target: TrashTarget; requestId: string } | null>(null);
  const lock = useRef(false), cancel = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const sameAccount = Boolean(ownerUid && accountUid === ownerUid);
  useEffect(() => {
    alive.current = true;
    const unsubscribe = onAuthStateChanged(clientAuth(identity), user => {
      setAccountUid(user?.uid ?? "");
      if (user?.uid !== ownerUid) { setOpen(false); attempt.current = null; }
    });
    return () => { alive.current = false; unsubscribe(); };
  }, [identity, ownerUid]);

  function changeOpen(next: boolean) {
    if (lock.current || !sameAccount) return;
    if (next) {
      if (!reviewRequired) { setConfirmedTarget(attempt.current?.target ?? target); setError(""); }
    }
    setOpen(next);
  }

  async function move() {
    if (lock.current || reviewRequired || clientAuth(identity).currentUser?.uid !== ownerUid) return;
    lock.current = true; setBusy(true); setError("");
    attempt.current ??= { target: confirmedTarget, requestId: crypto.randomUUID() };
    const api = makeTrashApi(identity);
    try {
      const result = await api.move(attempt.current.target, attempt.current.requestId);
      if (!alive.current || clientAuth(identity).currentUser?.uid !== ownerUid) return;
      // A replayed receipt may belong to a deletion that someone has already restored.
      const current = await api.list();
      if (!alive.current || clientAuth(identity).currentUser?.uid !== ownerUid) return;
      if (!current.items.some(item => item.trashId === result.item.trashId && item.id === result.item.id && item.kind === result.item.kind)) {
        setError("This item was restored after the earlier request. Reload its latest details and review them before deleting again.");
        setReviewRequired(true); return;
      }
      attempt.current = null; setOpen(false); onDeleted(result.item);
    } catch (cause) {
      if (!alive.current || clientAuth(identity).currentUser?.uid !== ownerUid) return;
      const stale = cause instanceof ServiceError && cause.code === "HOME_CHANGED";
      setReviewRequired(stale);
      setError(stale ? "This home changed since you opened it. Reload its latest details and review them before deleting." : `${cause instanceof Error ? cause.message : "The deletion could not be confirmed."} Retry safely with the same request, or check Trash.`);
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  async function reviewLatest() {
    if (lock.current || clientAuth(identity).currentUser?.uid !== ownerUid) return;
    lock.current = true; setBusy(true);
    try {
      let latest = target;
      if (target.kind === "home") {
        const result = await makeHomeApi(identity).get(target.id);
        latest = { kind: "home", id: result.home.id, name: result.home.title, baseRevisionId: result.home.headRevisionId, roomId: result.home.roomId };
      } else {
        const result = await makeHomeApi(identity).request<{ room: { id: string; name: string } }>(`/api/rooms/${encodeURIComponent(target.id)}`);
        latest = { kind: "room", id: result.room.id, name: result.room.name };
      }
      if (!alive.current || clientAuth(identity).currentUser?.uid !== ownerUid) return;
      setConfirmedTarget(latest); attempt.current = null; setReviewRequired(false); setError(""); onReview?.();
      window.requestAnimationFrame(() => cancel.current?.focus());
    } catch (cause) {
      if (alive.current && clientAuth(identity).currentUser?.uid === ownerUid) setError(cause instanceof Error ? cause.message : "The latest details could not load. Try again.");
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  const shared = confirmedTarget.kind === "room" || Boolean(confirmedTarget.roomId);
  return <AlertDialog open={open && sameAccount} onOpenChange={changeOpen}>
    <AlertDialogTrigger asChild><Button variant="ghost" className="saved-item-delete" disabled={disabled || busy || !sameAccount} aria-label={`Delete ${target.name}`}><Trash2 size={16} aria-hidden="true" />Delete</Button></AlertDialogTrigger>
    <AlertDialogContent className="saved-item-delete-dialog" onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <AlertDialogHeader><AlertDialogTitle>Move “{confirmedTarget.name}” to Trash?</AlertDialogTitle><AlertDialogDescription>
        {confirmedTarget.kind === "home" ? shared ? "This home and its shared room will leave your workspace. Members lose access until you restore them." : "This saved home will leave your workspace. You can restore it from Trash." : "This shared room will close for everyone until you restore it from Trash."}
      </AlertDialogDescription></AlertDialogHeader>
      <div className="saved-item-delete-details"><p>{shared ? "Saved designs, messages and agreements are kept. Active assistant work stops and existing invitations expire." : "Saved designs and revisions are kept. Active assistant work stops."}</p>{confirmedTarget.kind === "room" && <p>Private scope and proposal records remain in Scope &amp; proposals.</p>}{unsavedChanges && <p className="saved-item-unsaved">Text you have not sent or saved will be discarded when you leave.</p>}</div>
      {error && <p className="saved-item-error" role="alert">{error}</p>}
      {reviewRequired && <Button variant="outline" disabled={busy} onClick={() => void reviewLatest()}>{busy ? "Loading latest details…" : "Reload latest details"}</Button>}
      <AlertDialogFooter><AlertDialogCancel ref={cancel} disabled={busy}>Cancel</AlertDialogCancel><Button variant="destructive" disabled={busy || reviewRequired} onClick={() => void move()}>{busy && !reviewRequired ? "Moving to Trash…" : "Move to Trash"}</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
