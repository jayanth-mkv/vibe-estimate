"use client";
// Operate: real homes are the front door; the next design is one action away.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, Play, Plus } from "lucide-react";
import { homeTemplates } from "@vibeestimate/scene-core";
import { Button } from "@/components/ui/button";
import { makeHomeApi, type HomeProject } from "@/lib/home-api";
import { api as projectApi } from "@/lib/api";
import { clientAuth, googleAuthEnabled, openGoogleWorkspace, saveAccessWithGoogle } from "@/lib/firebase";
import { useHomeSession } from "./use-home-session";
import "./home-studio.css";
export function HomeBrand() { return <Link href="/" className="brand" aria-label="VibeEstimate home"><span className="brand-mark" aria-hidden="true"><CheckCheck size={21} /></span>VibeEstimate</Link>; }
export function HomeWorkspace() {
  const router = useRouter(), session = useHomeSession();
  const [homes, setHomes] = useState<HomeProject[]>([]), [loadedUid, setLoadedUid] = useState(""), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), pendingCreate = useRef<string | null>(null), uid = session.user?.uid;
  useEffect(() => { if (new URLSearchParams(window.location.search).get("project")) router.replace(`/proposals${window.location.search}`); }, [router]);
  useEffect(() => { if (!uid) return; let alive = true;
    void makeHomeApi().list().then(result => { if (alive && clientAuth().currentUser?.uid === uid) { setHomes(result.homes); setLoadedUid(uid); setError(""); } }).catch(cause => { if (alive) { setError(cause instanceof Error ? cause.message : "Your homes could not load."); setLoadedUid(uid); } });
    return () => { alive = false; };
  }, [uid, refresh]);
  async function create() { if (lock.current) return; lock.current = true; setBusy(true); setError(""); const owner = session.user?.uid;
    try { pendingCreate.current ??= crypto.randomUUID(); const result = await makeHomeApi().create(pendingCreate.current); if (clientAuth().currentUser?.uid !== owner) return; pendingCreate.current = null; router.push(`/projects/${result.home.id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your project could not be created. Try again."); } finally { lock.current = false; setBusy(false); }
  }
  async function google(returning = false) { if (busy) return; setBusy(true); setError(""); try {
    if (returning) {
      const currentUid = clientAuth().currentUser?.uid;
      if (!currentUid) throw new Error("Reconnect to your workspace before opening a different account.");
      // Both products share one identity. Recheck authoritative lists immediately
      // before switching; a failed read cannot mean the guest has no work.
      const [savedHomes, savedProjects] = await Promise.all([makeHomeApi().list(), projectApi.list()]);
      if (clientAuth().currentUser?.uid !== currentUid) throw new Error("Your account changed. Reopen your workspace before continuing.");
      if (savedHomes.homes.length || savedProjects.projects.length) throw new Error("This guest workspace already has saved work. Keep access with Google to preserve it, or continue in this browser.");
      await openGoogleWorkspace();
    } else await saveAccessWithGoogle();
    setRefresh(value => value + 1);
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save access."); } finally { setBusy(false); } }
  const visibleHomes = uid && loadedUid === uid ? homes : [], loading = !session.ready || Boolean(uid && loadedUid !== uid);
  return <div className="home-product"><a className="skip-link" href="#home-main">Skip to homes</a>
    <header className="home-header"><HomeBrand /><nav aria-label="Workspace"><Link href="/join">Join a room</Link>{googleAuthEnabled && session.user?.isAnonymous && visibleHomes.length > 0 && <Button variant="ghost" disabled={busy} onClick={() => void google()}>Keep access with Google</Button>}</nav></header>
    <main id="home-main" className="home-library"><div className="home-library-heading"><div><h1>Your homes</h1><p>A space to imagine, refine, and agree on a home.</p></div><div className="home-library-actions"><Button disabled={busy || !session.user} onClick={() => void create()}><Plus size={18} aria-hidden="true" />{busy ? "Creating project…" : "New project"}</Button></div></div>
      {(error || session.error) && <div className="home-error" role="alert"><p>{error || session.error}</p><Button variant="outline" onClick={() => { if (!session.user) void session.reconnect(); else setRefresh(value => value + 1); }}>Reconnect</Button></div>}
      {loading ? <div className="home-loading" role="status"><div /><div /><p>Opening your saved homes…</p></div> : visibleHomes.length ? <ul className="home-project-grid">{[...visibleHomes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(home => { const template = homeTemplates.find(item => item.id === home.templateId); return <li key={home.id}><Link href={home.roomId ? `/rooms/${home.roomId}` : `/projects/${home.id}`} className="home-project-link"><div className="home-project-image">{template ? <Image src={template.thumbnailPath} width={960} height={700} alt={`${template.name} starting floor layout`} /> : <div className="home-draft-image"><Plus size={32} aria-hidden="true" /><span>Choose your home</span></div>}</div><div className="home-project-copy"><h2>{home.title}</h2><span>{home.scene ? `${home.scene.rooms.length} rooms · ${home.revisions.length} saved versions` : "Ready to choose a layout"}</span><p>{home.brief?.summary || "Start with a home that feels right, then make it yours."}</p><div><time dateTime={home.updatedAt}>{new Date(home.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time><ArrowRight size={19} aria-hidden="true" /></div></div></Link></li>; })}</ul>
      : <section className="home-first-use"><div><h2>Your next home starts with a possibility.</h2><p>Choose a complete floor plan. Tell your design assistant what matters. See furniture, finishes and lights come together in a home you can explore.</p><div className="home-library-actions"><Button disabled={busy || !session.user} onClick={() => void create()}>Create your first home <ArrowRight size={18} aria-hidden="true" /></Button><Button asChild variant="outline"><a href="/demo/index.html"><Play size={18} aria-hidden="true" />Show tour</a></Button></div><p className="home-small">No setup form. Your project saves privately as you work.</p>{googleAuthEnabled && <Button variant="ghost" onClick={() => void google(true)} disabled={busy}>Open work saved with Google</Button>}</div><figure><Image src={homeTemplates[1].thumbnailPath} alt="An authored family-home layout with connected living spaces and two bedrooms" width={960} height={700} priority /><figcaption>A starting layout. Your design makes it yours.</figcaption></figure></section>}
      <footer className="home-library-footer"><p>{session.user?.isAnonymous ? "Your projects belong to this browser’s private guest workspace." : "Your saved projects are private until you invite a client."}</p>{googleAuthEnabled && session.user?.isAnonymous && visibleHomes.length === 0 && <Button variant="ghost" disabled={busy} onClick={() => void google()}>Keep access with Google</Button>}<Link href="/proposals">Scope & proposals</Link></footer>
    </main></div>;
}
