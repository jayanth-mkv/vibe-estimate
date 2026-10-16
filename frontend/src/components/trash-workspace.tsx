"use client";

// Operate: recover named saved work in a quiet, dated list beside the homes library.
// Keep the navy/red system, explicit restore actions, and server-confirmed outcomes.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeBrand } from "@/components/spatial/home-workspace";
import { useHomeSession } from "@/components/spatial/use-home-session";
import { clientAuth } from "@/lib/firebase";
import { makeTrashApi, restoredItemHref, type TrashItem } from "@/lib/trash-api";
import "./spatial/home-studio.css";
import "./trash.css";

export function TrashWorkspace() {
  const session = useHomeSession(), uid = session.user?.uid;
  const [items, setItems] = useState<TrashItem[]>([]), [loadedUid, setLoadedUid] = useState("");
  const [refresh, setRefresh] = useState(0), [error, setError] = useState<{ uid: string; text: string } | null>(null);
  const [pending, setPending] = useState(""), [rowError, setRowError] = useState<{ uid: string; trashId: string; text: string } | null>(null);
  const [notice, setNotice] = useState<{ uid: string; text: string; href?: string } | null>(null);
  const requests = useRef(new Map<string, string>()), lock = useRef(false), alive = useRef(true);
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void makeTrashApi().list().then(result => {
      if (!active || clientAuth().currentUser?.uid !== uid) return;
      setItems(result.items); setLoadedUid(uid); setError(null);
      const moved = new URLSearchParams(window.location.search).get("moved");
      const item = result.items.find(item => item.trashId === moved);
      if (item) setNotice({ uid, text: `“${item.name}” moved to Trash.${item.roomId ? " Its shared room is also in Trash." : ""}` });
    }).catch(cause => {
      if (active && clientAuth().currentUser?.uid === uid) { setError({ uid, text: cause instanceof Error ? cause.message : "Trash could not load. Try again." }); setLoadedUid(uid); }
    });
    return () => { active = false; };
  }, [uid, refresh]);

  async function restore(item: TrashItem) {
    if (lock.current || !uid || clientAuth().currentUser?.uid !== uid) return;
    lock.current = true; setPending(item.trashId); setRowError(null); setNotice(null);
    const key = `${uid}:${item.kind}:${item.id}:${item.trashId}`;
    if (!requests.current.has(key)) requests.current.set(key, crypto.randomUUID());
    try {
      const api = makeTrashApi(), result = await api.restore(item, requests.current.get(key)!);
      if (!alive.current || clientAuth().currentUser?.uid !== uid) return;
      const latest = await api.list();
      if (!alive.current || clientAuth().currentUser?.uid !== uid) return;
      setItems(latest.items); setLoadedUid(uid);
      if (latest.items.some(current => current.kind === item.kind && current.id === item.id)) {
        setError({ uid, text: "This item was moved to Trash again. Review its latest deletion before restoring it." });
        return;
      }
      requests.current.delete(key); setError(null);
      setNotice({ uid, text: `“${item.name}” restored.${item.roomId || item.kind === "room" ? " Existing members can open the room again. Create a new invitation if needed." : ""}${item.kind === "room" ? " Resume the scope agent from the room when you are ready." : ""}`, href: restoredItemHref(result) });
      window.requestAnimationFrame(() => status.current?.focus());
    } catch (cause) {
      if (alive.current && clientAuth().currentUser?.uid === uid) setRowError({ uid, trashId: item.trashId, text: `${cause instanceof Error ? cause.message : "Restore could not be confirmed."} Try Restore again safely, or reload Trash.` });
    } finally { lock.current = false; if (alive.current) setPending(""); }
  }

  const visible = uid && loadedUid === uid ? items : [];
  const loading = !session.ready || Boolean(uid && loadedUid !== uid);
  const visibleError = error && error.uid === uid ? error.text : "";
  const visibleNotice = notice && notice.uid === uid ? notice : null;
  return <div className="home-product"><a className="skip-link" href="#trash-main">Skip to Trash</a>
    <header className="home-header"><HomeBrand /><nav aria-label="Workspace"><Link href="/">Your homes</Link></nav></header>
    <main id="trash-main" className="home-library home-trash-library">
      <div className="home-library-heading"><div><h1>Trash</h1><p>Restore saved homes and shared rooms you deleted.</p></div><Button variant="outline" disabled={loading || !!pending || !uid} onClick={() => setRefresh(value => value + 1)}>Reload Trash</Button></div>
      <p className="home-small">Saved history stays with each item. Restoring a shared room reopens access for its existing members; previous invitations stay expired.</p>
      {visibleNotice && <div className="home-delete-status" role="status" tabIndex={-1} ref={status}><p>{visibleNotice.text}</p>{visibleNotice.href && <Link href={visibleNotice.href}>Open restored {visibleNotice.href.startsWith("/rooms/") ? "room" : "home"}</Link>}</div>}
      {(visibleError || session.error) && <div role="alert" className="home-error"><p>{visibleError || session.error}</p><Button variant="outline" disabled={session.connecting || !!pending} onClick={() => { if (!uid) void session.reconnect(); else setRefresh(value => value + 1); }}>{session.connecting ? "Connecting…" : uid ? "Try again" : session.actionLabel}</Button></div>}
      {loading ? <div className="home-loading" role="status"><p>Opening Trash…</p></div> : !uid ? <section className="home-trash-empty"><h2>Open your workspace to view Trash.</h2><p>{session.accessMessage || "Use the same account that owns your saved work."}</p><Button disabled={session.connecting} onClick={() => void session.reconnect()}>{session.connecting ? "Connecting…" : session.actionLabel}</Button></section> : visible.length ? <ul className="home-trash-list" aria-label="Deleted homes and rooms">{[...visible].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).map(item => <li key={`${item.kind}:${item.id}:${item.trashId}`} className="home-trash-item" data-trash-id={item.trashId}><div><h2>{item.name}</h2><p>{item.kind === "room" ? "Shared room" : item.roomId ? "Home and shared room" : "Saved home"}</p><time dateTime={item.deletedAt}>Deleted {new Date(item.deletedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><Button variant="outline" disabled={!!pending} aria-label={`Restore ${item.name}`} onClick={() => void restore(item)}><RotateCcw size={16} aria-hidden="true" />{pending === item.trashId ? "Restoring…" : "Restore"}</Button>{rowError?.uid === uid && rowError.trashId === item.trashId && <p className="saved-item-error" role="alert">{rowError.text}</p>}</li>)}</ul> : !visibleError && <section className="home-trash-empty"><h2>Trash is empty.</h2><p>Homes and shared rooms you delete will appear here for recovery.</p><Link href="/">Back to your homes</Link></section>}
      <footer className="home-library-footer"><p>Only the owner can delete or restore saved work.</p><Link href="/proposals">Scope &amp; proposals</Link></footer>
    </main>
  </div>;
}
