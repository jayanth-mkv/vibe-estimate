"use client";

// A furnished home before any account: everything runs in this browser with no
// server or model cost. Saving signs in and replays the same validated changes.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { applyDesignPatch, applyStyleKit, arrangeRoom, createHomeTemplate, homeTemplates, rotateQuarter, styleKits } from "@vibeestimate/scene-core";
import { catalog, type DesignSelection, type HouseDocument, type HouseOperation } from "@vibeestimate/scene-schema";
import { Button } from "@/components/ui/button";
import { makeHomeApi } from "@/lib/home-api";
import { clientAuth } from "@/lib/firebase";
import { useHomeSession } from "./use-home-session";
import { HomeBrand } from "./home-workspace";
import { HousePlan } from "./house-plan";
import { TourButton, TourControls, useHomeTour } from "./home-tour";
import "./home-studio.css";

const HouseViewer = dynamic(() => import("@vibeestimate/pascal-adapter").then(module => module.HouseViewer), { ssr: false });
type Action = { kind: "style"; kitId: string } | { kind: "patch"; operations: HouseOperation[]; selection: DesignSelection };
type Draft = { templateId: string; actions: Action[] };
const STORAGE = "vibeestimate:try:v1", MAX_ACTIONS = 30;
const DEFAULT_TEMPLATE = "family-home";

function replay(draft: Draft): HouseDocument {
  let scene = createHomeTemplate(draft.templateId);
  for (const action of draft.actions) scene = action.kind === "style" ? applyStyleKit(scene, action.kitId).document : applyDesignPatch(scene, { schemaVersion: 2, operations: action.operations }, action.selection);
  return scene;
}
function load(): Draft {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) ?? "null") as Draft | null;
    if (parsed && homeTemplates.some(item => item.id === parsed.templateId) && Array.isArray(parsed.actions) && parsed.actions.length <= MAX_ACTIONS) { replay(parsed); return parsed; }
  } catch { /* A stale or edited draft starts fresh rather than breaking the page. */ }
  return { templateId: DEFAULT_TEMPLATE, actions: [] };
}
class GraphicsBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function TryStudio() {
  const router = useRouter(), session = useHomeSession();
  // Rendered client-only (see try-entry), so the saved browser draft loads directly.
  const [draft, setDraft] = useState<Draft>(load);
  const [view, setView] = useState<"overview" | "plan">("overview"), [graphics, setGraphics] = useState<"loading" | "ready" | "failed">("loading");
  const [selected, setSelected] = useState<string | null>(null), [variant, setVariant] = useState(0);
  const [notice, setNotice] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState(false), [wantsSave, setWantsSave] = useState(false);
  const saveLock = useRef(false);
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(draft)); } catch { /* Private mode: the draft lives for this visit. */ } }, [draft]);
  const scene = useMemo(() => replay(draft), [draft]);
  const template = homeTemplates.find(item => item.id === draft.templateId)!;
  const tour = useHomeTour(scene);
  const item = selected ? scene.instances.find(entry => entry.id === selected) : undefined;
  const roomId = item?.roomId ?? scene.rooms.find(room => room.id === "living")?.id ?? scene.rooms[0]!.id;

  function push(action: Action, message: string) {
    if (draft.actions.length >= MAX_ACTIONS) { setError("Save this home to keep designing. Your changes so far are kept."); return; }
    try { const next = { ...draft, actions: [...draft.actions, action] }; replay(next); setDraft(next); setError(""); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That change does not fit here."); }
  }
  const onMove = (entityId: string, operations: HouseOperation[]) => push({ kind: "patch", operations, selection: { kind: "object", entityId } }, "Moved. It snapped into place.");
  function choose(id: string) { if (scene.instances.some(entry => entry.id === id)) { setSelected(id); setView("plan"); } }

  async function save() {
    if (saveLock.current) return;
    if (!session.user) { setWantsSave(true); await session.reconnect(); return; }
    saveLock.current = true; setWantsSave(false); setSaving(true); setError("");
    const api = makeHomeApi(), owner = session.user.uid;
    try {
      const { home: created } = await api.create(crypto.randomUUID());
      let home = (await api.template(created.id, draft.templateId, null, crypto.randomUUID())).home;
      for (const action of draft.actions) {
        if (clientAuth().currentUser?.uid !== owner) throw new Error("Your account changed while saving. Your draft is still here.");
        home = action.kind === "style" ? (await api.style(home.id, action.kitId, home.headRevisionId!, crypto.randomUUID())).home : (await api.revise(home.id, { schemaVersion: 2, operations: action.operations }, action.selection, home.headRevisionId!, crypto.randomUUID())).home;
      }
      try { localStorage.removeItem(STORAGE); } catch { /* Saved server-side either way. */ }
      router.push(`/projects/${home.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your home could not be saved yet. Your draft is still here; try again."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  // Continue the save the visitor asked for once sign-in completes.
  const signedIn = Boolean(session.user);
  useEffect(() => { if (!wantsSave || !signedIn) return; const timer = setTimeout(() => void save(), 0); return () => clearTimeout(timer); });

  return <div className="home-product home-studio home-try">
    <header className="home-header home-studio-header"><HomeBrand /><div className="home-project-title"><h1>Try a furnished home</h1><span role="status">No sign-up · nothing is saved until you choose</span></div><div className="home-studio-actions"><Button disabled={saving || session.connecting} onClick={() => void save()}>{saving ? "Saving your home…" : "Save this home"}<ArrowRight size={16} aria-hidden="true" /></Button></div></header>
    <main className="home-design-layout" id="design-workspace">
      <aside className="home-room-rail" aria-label="Choose a home"><h2>Homes</h2>{homeTemplates.map(entry => <Button key={entry.id} variant="ghost" aria-pressed={entry.id === draft.templateId} onClick={() => { setDraft({ templateId: entry.id, actions: [] }); setSelected(null); setNotice(`${entry.name} opened.`); }}><span>{entry.name}</span><small>{entry.areaM2} m²</small></Button>)}<div className="home-rail-note"><strong>{template.areaM2} m²</strong><span>{template.roomCount} rooms · measured template</span></div></aside>
      <section className="home-canvas-column" aria-label="Home design">
        <div className="home-view-toolbar"><div role="group" aria-label="House view">{(["overview", "plan"] as const).map(mode => <Button key={mode} variant="ghost" aria-pressed={view === mode && !tour.state} onClick={() => { tour.stop(); setView(mode); }}>{mode === "plan" ? "Plan" : "3D"}</Button>)}</div><div className="home-view-actions">{tour.state ? <Button variant="ghost" onClick={tour.stop}>Exit tour</Button> : <TourButton onStart={() => { setView("overview"); tour.start(); }} disabled={graphics === "failed"} />}<Button variant="ghost" disabled={!draft.actions.length} onClick={() => { setDraft({ ...draft, actions: draft.actions.slice(0, -1) }); setNotice("Undone."); }}><Undo2 size={16} aria-hidden="true" />Undo</Button><Button variant="ghost" disabled={!draft.actions.length} onClick={() => { setDraft({ ...draft, actions: [] }); setNotice("Back to the original home."); }}><RotateCcw size={16} aria-hidden="true" />Start over</Button></div></div>
        <div className="home-canvas" data-view={view}>
          {(view === "plan" || graphics === "failed") && <HousePlan document={scene} selectedIds={selected ? [selected] : []} onSelect={choose} onMoveItem={onMove} />}
          {/* The 3D canvas stays mounted while Plan is shown: tearing a canvas down
              during creation races its event wiring, and returning to 3D is instant. */}
          {graphics !== "failed" && <div className="home-try-3d" hidden={view === "plan"}>
            <GraphicsBoundary onFailure={() => setGraphics("failed")}><HouseViewer document={scene} mode={tour.state ? "inside" : "overview"} tour={tour.control} roomId={roomId} lighting="day" reset={0} selectedIds={selected ? [selected] : []} onSelect={choose} onReady={() => setGraphics("ready")} onFailure={() => setGraphics("failed")} /></GraphicsBoundary>
            {graphics === "loading" && <div className="home-canvas-loading" role="status"><div className="home-loading"><div /><div /></div><strong>Opening your home</strong></div>}
            <TourControls tour={tour} />
          </div>}
        </div>
        <div className="home-canvas-foot"><p>{view === "plan" ? "Tap a piece, then drag it. It snaps to walls and turns to face the room." : "Drag to look around. Tap a piece to move it on the plan."}</p></div>
        {notice && <p className="home-notice" role="status">{notice}</p>}{error && <div className="home-error" role="alert"><p>{error}</p></div>}
      </section>
      <aside className="home-task-panel" aria-label="Design tools">
        <section className="home-style-kits" aria-label="Quick styles"><h2>Make it yours</h2><p className="home-small">Tap a look. Floors, walls, fabrics and lights change together.</p><div>{styleKits.map(kit => <Button key={kit.id} variant="outline" title={kit.description} onClick={() => push({ kind: "style", kitId: kit.id }, `${kit.name} applied.`)}>{kit.name}</Button>)}</div></section>
        <section className="home-edit-section"><h3>Arrange a room for me</h3><label className="home-field"><span>Room</span><select aria-label="Room to arrange" value={roomId} onChange={event => { const first = scene.instances.find(entry => entry.roomId === event.target.value); setSelected(first?.id ?? null); }}>{scene.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><div className="home-quick-actions"><Button onClick={() => { const next = variant + 1; setVariant(next); const result = arrangeRoom(scene, roomId, next); if (!result.operations.length) { setNotice("This room is already arranged as well as its space allows."); return; } push({ kind: "patch", operations: result.operations, selection: { kind: "room", roomId } }, "Room arranged. Tap again for another option."); }}><Sparkles size={16} aria-hidden="true" />Arrange for me</Button></div></section>
        {item && <section className="home-edit-section"><h3>{catalog.find(entry => entry.id === item.catalogId)?.name}</h3><p className="home-small">Drag it on the plan, or turn it here.</p><div className="home-quick-actions"><Button variant="outline" onClick={() => { const result = rotateQuarter(scene, item.id); if (!result.valid) { setError("Not enough clear space to turn it here. Move it first."); return; } push({ kind: "patch", operations: result.operations, selection: { kind: "object", entityId: item.id } }, "Turned."); }}><RotateCcw size={16} aria-hidden="true" />Rotate 90°</Button></div></section>}
        <section className="home-design-note"><h3>Ready to keep it?</h3><p>Save to continue with your design assistant, invite your designer or client, and agree on a version together.</p><Button className="home-full-action" disabled={saving || session.connecting} onClick={() => void save()}>{saving ? "Saving your home…" : "Save this home"}</Button><p className="home-small">Dimensions are a measured template, not a survey of your property. <Link href="/" className="home-inline-link">Your homes</Link></p></section>
      </aside>
    </main>
  </div>;
}
