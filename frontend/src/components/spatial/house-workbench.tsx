"use client";

// Extend the pinned Operate surface: a house canvas, explicit selection, then an
// inspector. Canonical geometry remains authoritative; the developer panel is secondary.
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { Component, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { applyHousePatch, entitiesInRegion, experimentExamples, houseFixtures, validateHouse } from "@vibeestimate/scene-core";
import { catalog, houseScopeSchema, type HouseDocument, type HouseOperation, type HousePatch, type HouseScope } from "@vibeestimate/scene-schema";
import { Button } from "@/components/ui/button";
import { HousePlan } from "./house-plan";
import "./house.css";

const HouseViewer = dynamic(() => import("@vibeestimate/pascal-adapter").then(module => module.HouseViewer), { ssr: false });
type View = "plan" | "overview" | "inside";
type Fixture = "room" | "adjoining" | "house";
type Surface = "floor" | "body" | "front" | "back";
type Status = "loading" | "ready" | "failed";
const fixtureNames: Record<Fixture, string> = { room: "Measured room", adjoining: "Adjoining rooms", house: "Complete house" };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const reason = (error: unknown) => error instanceof Error ? error.message : "The action could not be completed.";

class HouseGraphicsBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function NumberField({ name, label, value, min, max, step = 1 }: { name: string; label: string; value: number; min?: number; max?: number; step?: number }) {
  return <label className="house-field"><span>{label}</span><input name={name} type="number" defaultValue={value} min={min} max={max} step={step} required /></label>;
}

function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url; link.download = filename;
  window.document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HouseWorkbench() {
  const [fixture, setFixture] = useState<Fixture>("house");
  const [history, setHistory] = useState<HouseDocument[]>(() => [validateHouse(houseFixtures.house)]);
  const [cursor, setCursor] = useState(0);
  const scene = history[cursor];
  const [roomId, setRoomId] = useState(scene.rooms[0].id);
  const focusedRoom = scene.rooms.find(room => room.id === roomId) ?? scene.rooms[0];
  const [view, setView] = useState<View>("overview");
  const [planExtent, setPlanExtent] = useState<"floor" | "room">("floor");
  const [lighting, setLighting] = useState<"day" | "evening">("day");
  const [status, setStatus] = useState<Status>("loading");
  const [graphicsError, setGraphicsError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const [scope, setScope] = useState<HouseScope>({ selectedIds: [] });
  const [surface, setSurface] = useState<Surface>("body");
  const [patchText, setPatchText] = useState(pretty({ schemaVersion: 2, operations: [] }));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Select an object, room or wall to start an experiment.");
  const [catalogId, setCatalogId] = useState("floor-lamp");
  const exportSvg = useRef<SVGSVGElement>(null);
  const onReady = useCallback(() => { setStatus("ready"); setGraphicsError(""); }, []);
  const onFailure = useCallback((message?: string) => { setStatus("failed"); setGraphicsError(message ?? "The Plan and editing controls remain available. Retry to start Pascal again."); }, []);
  const selectedId = scope.selectedIds[0];
  const selectedInstance = scene.instances.find(instance => instance.id === selectedId);
  const selectedRoom = scene.rooms.find(room => room.id === selectedId);
  const selectedWall = scene.walls.find(wall => wall.id === selectedId);
  const selectedOpening = scene.openings.find(opening => opening.id === selectedId);
  const placementRoom = scene.rooms.find(room => room.id === scope.region?.roomId) ?? scene.rooms.find(room => scope.selectedIds.includes(room.id));
  const selectedAsset = catalog.find(entry => entry.id === catalogId)!;
  const examples = experimentExamples(scene);
  const contained = scope.region ? entitiesInRegion(scene, scope.region) : [];
  const editableRegion = scope.region?.roomId === focusedRoom.id ? scope.region : focusedRoom;
  const editable = scope.selectedIds.length === 1;

  useEffect(() => {
    if (view === "plan" || status !== "loading") return;
    const timeout = window.setTimeout(onFailure, 45_000);
    return () => window.clearTimeout(timeout);
  }, [view, status, attempt, onFailure]);

  const choose = useCallback((id: string, face?: Surface) => {
    setScope({ selectedIds: [id] }); setSurface(face ?? "body"); setError("");
    setNotice(`Selected ${id}. Changes are limited to this target.`);
  }, []);

  function changeView(next: View) {
    if (view === "plan" && next !== "plan") { setStatus("loading"); setAttempt(value => value + 1); }
    setView(next);
  }

  function loadFixture(next: Fixture) {
    const document = validateHouse(houseFixtures[next]);
    setFixture(next); setHistory([document]); setCursor(0); setRoomId(document.rooms[0].id);
    setScope({ selectedIds: [] }); setError(""); setNotice(`Loaded ${fixtureNames[next].toLowerCase()}. Session changes reset.`);
    setStatus("loading"); setAttempt(value => value + 1); setReset(value => value + 1);
  }

  function publish(patch: unknown) {
    try {
      // Scope belongs to the host and is captured before validation/publication.
      const frozenScope: HouseScope = structuredClone(scope);
      const document = applyHousePatch(scene, patch, frozenScope, { planMode: view === "plan" });
      setHistory(previous => [...previous.slice(0, cursor + 1), document]); setCursor(cursor + 1);
      const currentIds = new Set([...document.rooms, ...document.walls, ...document.openings, ...document.instances].map(entity => entity.id));
      setScope(current => ({ ...current, selectedIds: current.selectedIds.filter(id => currentIds.has(id)) }));
      setError(""); setNotice("Change applied to the selected scope. Undo is available for this session.");
      return true;
    } catch (failure) { setError(reason(failure)); setNotice("The scene is unchanged."); return false; }
  }

  function applyOperations(operations: HouseOperation[]) {
    const patch: HousePatch = { schemaVersion: 2, operations };
    setPatchText(pretty(patch)); publish(patch);
  }

  function applyJSON() {
    try { publish(JSON.parse(patchText)); }
    catch (failure) { setError(`Invalid JSON: ${reason(failure)}`); setNotice("The scene is unchanged."); }
  }

  function navigateHistory(next: number) {
    setCursor(next); setScope({ selectedIds: [] }); setError("");
    setNotice(`Showing session state ${next}. No durable save has been made.`);
  }

  function defineRegion(event: FormEvent<HTMLFormElement>) {
    const data = values(event);
    const region = { roomId: focusedRoom.id, x: Number(data.get("x")), z: Number(data.get("z")), width: Number(data.get("width")), depth: Number(data.get("depth")) };
    try {
      houseScopeSchema.parse({ selectedIds: [], region });
      if (region.x < focusedRoom.x || region.z < focusedRoom.z || region.x + region.width > focusedRoom.x + focusedRoom.width || region.z + region.depth > focusedRoom.z + focusedRoom.depth) throw new Error("Selection region must fit inside its room. Adjust its position or dimensions.");
      entitiesInRegion(scene, region);
      setScope({ selectedIds: [], region }); setError(""); changeView("plan");
      setNotice("Region defined. Select its fully contained objects to edit them, or place an object within it.");
    } catch (failure) { setError(reason(failure)); }
  }

  async function exportPlan() {
    try {
      const node = exportSvg.current;
      if (!node) throw new Error("The plan is not ready. Try again.");
      const clone = node.cloneNode(true) as SVGSVGElement;
      const box = node.viewBox.baseVal;
      const width = 1800, height = Math.round(width * box.height / box.width);
      clone.setAttribute("width", String(width)); clone.setAttribute("height", String(height));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
      try {
        const image = new window.Image(); image.src = url; await image.decode();
        const canvas = window.document.createElement("canvas"); canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PNG export is unavailable in this browser. Export JSON remains available.");
        context.drawImage(image, 0, 0);
        const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed. Try again.")), "image/png"));
        download(png, `${scene.id}-plan.png`); setError(""); setNotice("Labelled floor-plan PNG downloaded.");
      } finally { URL.revokeObjectURL(url); }
    } catch (failure) { setError(reason(failure)); }
  }

  const selectedLabel = selectedInstance ? catalog.find(entry => entry.id === selectedInstance.catalogId)?.name : selectedRoom?.name ?? selectedWall?.id ?? selectedOpening?.id;
  const materialSurface: Surface = selectedRoom ? "floor" : selectedWall ? (surface === "back" ? "back" : "front") : "body";
  const materialId = selectedRoom?.floorMaterialId ?? (selectedWall ? materialSurface === "front" ? selectedWall.frontMaterialId : selectedWall.backMaterialId : selectedInstance?.materialId);
  const statusLabel = view === "plan" ? "2D plan" : status === "ready" ? "Pascal 3D ready" : status === "failed" ? "3D unavailable" : "Starting Pascal 3D…";

  return <div className="house-app">
    <a className="skip-link" href="#house-workspace">Skip to house experiment</a>
    <header className="site-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><CheckCheck size={22} /></span><span>VibeEstimate<span className="brand-separator"> / </span><span className="brand-context">Spatial lab</span></span></div><Link className="house-p0-link" href="/">Back to workspace</Link></header>
    <main id="house-workspace" className="workspace house-workspace">
      <div className="page-heading"><div><p className="section-label">Interactive house demo</p><h1>House studio</h1></div><span className="house-session-label">Session state {cursor}</span></div>
      <div className="house-project-toolbar">
        <label className="house-field"><span>Fixture</span><select aria-label="Fixture" value={fixture} onChange={event => loadFixture(event.target.value as Fixture)}>{Object.entries(fixtureNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label className="house-field"><span>Room focus</span><select aria-label="Room focus" value={focusedRoom.id} onChange={event => { setRoomId(event.target.value); setReset(value => value + 1); }}>{scene.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <div className="house-session-actions"><Button variant="outline" disabled={cursor === 0} onClick={() => navigateHistory(cursor - 1)}>Undo</Button><Button variant="outline" disabled={cursor === history.length - 1} onClick={() => navigateHistory(cursor + 1)}>Redo</Button><Button variant="ghost" onClick={() => loadFixture(fixture)}>Reset session</Button></div>
      </div>
      <div className="house-layout">
        <div className="house-stage-column">
          <section className="preview" aria-label="House preview">
            <div className="view-toolbar house-view-toolbar"><div className="view-switch" role="group" aria-label="House view">{(["plan", "overview", "inside"] as const).map(mode => <Button key={mode} variant="ghost" className="view-button" aria-pressed={view === mode} onClick={() => changeView(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</Button>)}</div><div className="house-lighting-switch" role="group" aria-label="Lighting environment">{(["day", "evening"] as const).map(mode => <Button key={mode} variant="ghost" aria-pressed={lighting === mode} onClick={() => setLighting(mode)}>{mode === "day" ? "Day" : "Evening"}</Button>)}</div><Button variant="ghost" className="reset-button" disabled={view === "plan" || status !== "ready"} onClick={() => setReset(value => value + 1)}>Reset view</Button></div>
            {view === "plan" && <div className="house-plan-inspection">
              <div className="house-plan-extent" role="group" aria-label="Plan inspection area"><Button variant="ghost" aria-pressed={planExtent === "floor"} onClick={() => setPlanExtent("floor")}>Whole floor</Button><Button variant="ghost" aria-pressed={planExtent === "room"} onClick={() => setPlanExtent("room")}>Focused room</Button></div>
              <p><strong>{focusedRoom.name}</strong><span>{focusedRoom.width.toLocaleString("en-GB")} × {focusedRoom.depth.toLocaleString("en-GB")} mm · {(focusedRoom.width * focusedRoom.depth / 1_000_000).toFixed(1)} m² clear area</span></p>
            </div>}
            {view !== "plan" && <p className="house-lighting-cue">Illustrative lighting · shadows and wall occlusion are not simulated.</p>}
            <div className="canvas-area house-canvas" data-view={view} aria-label={`${view} of ${scene.name}`}>
              <div className="canvas-caption"><span>{scene.level.name}</span><span>{view === "inside" ? focusedRoom.name : `${scene.rooms.length} rooms · ${scene.instances.length} objects`}</span></div>
              {view === "plan" ? <HousePlan document={scene} selectedIds={scope.selectedIds} region={scope.region} onSelect={choose} focusRoomId={planExtent === "room" ? focusedRoom.id : undefined} /> : <>
                {status !== "failed" && <HouseGraphicsBoundary key={attempt} onFailure={onFailure}><HouseViewer document={scene} mode={view} roomId={focusedRoom.id} reset={reset} lighting={lighting} selectedIds={scope.selectedIds} onSelect={choose} onReady={onReady} onFailure={onFailure} /></HouseGraphicsBoundary>}
                {status === "loading" && <div className="graphics-loading" aria-live="polite"><span className="loading-mark" aria-hidden="true" /><strong>Opening the house</strong><span>Preparing local models and Pascal geometry…</span></div>}
                {status === "failed" && <div className="graphics-fallback"><HousePlan document={scene} /><div className="failure-message" role="alert"><strong>3D graphics are unavailable</strong><p>{graphicsError}</p><div><Button onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Retry 3D</Button><Button variant="outline" onClick={() => changeView("plan")}>Open Plan</Button></div></div></div>}
              </>}
            </div>
            <div className="canvas-footer"><span role="status" className={`renderer-status ${status === "failed" && view !== "plan" ? "is-failed" : ""}`}><span aria-hidden="true" />{statusLabel}</span><p>{view === "plan" ? "Pick an entity · Dimensions in millimetres" : status === "failed" ? "Plan and local editing remain available" : view === "inside" ? "Drag to adjust view · Reset restores eye level" : "Drag to orbit · Click an object to select"}</p></div>
          </section>
          <div className="house-scene-facts"><span><strong>{scene.rooms.length}</strong> rooms</span><span><strong>{(scene.rooms.reduce((total, room) => total + room.width * room.depth, 0) / 1_000_000).toFixed(1)} m²</strong> internal area</span><span><strong>{scene.instances.filter(instance => instance.light?.enabled).length}</strong> lights on</span><span>Ceiling <strong>{scene.level.ceilingHeight / 1000} m</strong> · assumed</span></div>
          <div className="house-notice" role="status">{notice}</div>
          {error && <div className="house-error" role="alert"><strong>Change could not be completed</strong><pre>{error}</pre><p>Correct the fields or selection and try again.</p></div>}
          <aside className="house-inspector" aria-label="Selection and editing controls">
          <section className="house-inspector-section"><div className="house-inspector-heading"><h2>Selection</h2><Button variant="ghost" disabled={!scope.selectedIds.length && !scope.region} onClick={() => { setScope({ selectedIds: [] }); setNotice("Selection cleared."); }}>Clear</Button></div>
            <label className="house-field"><span>Select an entity</span><select aria-label="Select an entity" value={selectedId ?? ""} onChange={event => event.target.value ? choose(event.target.value) : setScope({ selectedIds: [] })}><option value="">Choose a room, object or wall</option><optgroup label="Rooms">{scene.rooms.map(room => <option key={room.id} value={room.id}>{room.name} · floor</option>)}</optgroup><optgroup label={`Objects in ${focusedRoom.name}`}>{scene.instances.filter(instance => instance.roomId === focusedRoom.id).map(instance => <option key={instance.id} value={instance.id}>{instance.id}{instance.locked ? " · locked" : ""}</option>)}</optgroup><optgroup label="Walls">{scene.walls.filter(wall => wall.frontRoomId === focusedRoom.id || wall.backRoomId === focusedRoom.id).map(wall => <option key={wall.id} value={wall.id}>{wall.id}{wall.frontRoomId && wall.backRoomId ? " · shared" : ""}</option>)}</optgroup><optgroup label="Openings">{scene.openings.map(opening => <option key={opening.id} value={opening.id}>{opening.id}</option>)}</optgroup>{selectedInstance && selectedInstance.roomId !== focusedRoom.id && <option value={selectedInstance.id}>{selectedInstance.id}</option>}</select></label>
            <div className="house-selection-summary"><strong>{scope.selectedIds.length > 1 ? `${scope.selectedIds.length} entities selected` : selectedLabel ?? "Nothing selected"}</strong><span>{scope.selectedIds.length ? scope.selectedIds.join(", ") : "Select first to enable precise changes."}</span>{selectedRoom && <span>{selectedRoom.width.toLocaleString("en-GB")} × {selectedRoom.depth.toLocaleString("en-GB")} mm · {(selectedRoom.width * selectedRoom.depth / 1_000_000).toFixed(1)} m² clear area</span>}{selectedInstance?.locked && <span className="house-locked">Locked object · changes are disabled</span>}</div>
            <details className="house-multi-select"><summary>Select multiple objects</summary><div>{scene.instances.map(instance => <label key={instance.id}><input type="checkbox" checked={scope.selectedIds.includes(instance.id)} onChange={event => setScope(current => ({ ...current, selectedIds: event.target.checked ? [...current.selectedIds, instance.id] : current.selectedIds.filter(id => id !== instance.id) }))} /><span>{instance.id}{instance.locked ? " · locked" : ""}</span></label>)}</div></details>
          </section>
          <section className="house-inspector-section"><details className="house-region-controls"><summary>Define a Plan region</summary><p>Coordinates are global millimetres inside {focusedRoom.name}. Boundary-crossing objects stay outside the selection.</p><form key={`${focusedRoom.id}-${pretty(editableRegion)}`} onSubmit={defineRegion}><div className="house-field-grid"><NumberField name="x" label="Region X (mm)" value={editableRegion.x} /><NumberField name="z" label="Region Z (mm)" value={editableRegion.z} /><NumberField name="width" label="Width (mm)" value={editableRegion.width} min={50} /><NumberField name="depth" label="Depth (mm)" value={editableRegion.depth} min={50} /></div><Button type="submit" variant="outline">Set region</Button></form>{scope.region && <div className="house-region-members"><p><strong>{contained.length}</strong> fully contained objects</p><p>{contained.length ? contained.join(", ") : "No object fits fully inside this region."}</p><Button variant="outline" disabled={!contained.length} onClick={() => { setScope(current => ({ ...current, selectedIds: contained })); setNotice(`Selected ${contained.length} fully contained objects. Boundary-crossing objects remain unchanged.`); }}>Select contained objects</Button></div>}</details></section>
          {editable && selectedInstance && <section className="house-inspector-section"><h2>Object transform</h2><form key={`${selectedInstance.id}-${cursor}`} onSubmit={event => { const data = values(event); applyOperations([{ op: "move", entityId: selectedInstance.id, position: [Number(data.get("x")), selectedInstance.position[1], Number(data.get("z"))] }, { op: "rotate", entityId: selectedInstance.id, rotation: Number(data.get("rotation")) }]); }}><div className="house-field-grid"><NumberField name="x" label="Position X (mm)" value={selectedInstance.position[0]} /><NumberField name="z" label="Position Z (mm)" value={selectedInstance.position[2]} /><NumberField name="rotation" label="Rotation (°)" value={selectedInstance.rotation} min={0} max={359} /></div><Button type="submit" variant="outline" disabled={selectedInstance.locked}>Apply transform</Button></form>
            {catalog.find(entry => entry.id === selectedInstance.catalogId)?.resizable && <form className="house-spaced-form" key={`size-${selectedInstance.id}-${cursor}`} onSubmit={event => { const data = values(event); applyOperations([{ op: "resize", entityId: selectedInstance.id, dimensions: [Number(data.get("width")), Number(data.get("height")), Number(data.get("depth"))] }]); }}><div className="house-field-grid"><NumberField name="width" label="Width (mm)" value={selectedInstance.dimensions[0]} min={50} /><NumberField name="height" label="Height (mm)" value={selectedInstance.dimensions[1]} min={50} /><NumberField name="depth" label="Depth (mm)" value={selectedInstance.dimensions[2]} min={50} /></div><Button type="submit" variant="outline" disabled={selectedInstance.locked}>Resize object</Button></form>}
            <Button variant="ghost" className="house-remove-button" disabled={selectedInstance.locked} onClick={() => applyOperations([{ op: "remove", entityId: selectedInstance.id }])}>Remove object</Button>
          </section>}
          {editable && selectedInstance?.light && <section className="house-inspector-section"><h2>Light</h2><form key={`light-${selectedInstance.id}-${cursor}`} onSubmit={event => { const data = values(event); applyOperations([{ op: "setLight", entityId: selectedInstance.id, light: { enabled: data.get("enabled") === "on", intensity: Number(data.get("intensity")), temperature: data.get("temperature") as "warm" | "neutral" | "cool" } }]); }}><label className="house-check-field"><input type="checkbox" name="enabled" defaultChecked={selectedInstance.light.enabled} /><span>Light enabled</span></label><div className="house-field-grid"><NumberField name="intensity" label="Intensity (0–100)" value={selectedInstance.light.intensity} min={0} max={100} /><label className="house-field"><span>Temperature</span><select name="temperature" defaultValue={selectedInstance.light.temperature}><option value="warm">Warm</option><option value="neutral">Neutral</option><option value="cool">Cool</option></select></label></div><Button type="submit" variant="outline" disabled={selectedInstance.locked}>Apply light settings</Button></form></section>}
          {editable && (selectedInstance || selectedRoom || selectedWall) && <section className="house-inspector-section"><h2>Surface finish</h2><form key={`material-${selectedId}-${materialSurface}-${cursor}`} onSubmit={event => { const data = values(event); applyOperations([{ op: "setMaterial", entityId: selectedId!, surface: materialSurface, materialId: String(data.get("material")) }]); }}>
            {selectedWall && <label className="house-field"><span>Wall surface</span><select value={materialSurface} onChange={event => setSurface(event.target.value as Surface)}><option value="front">Front · {selectedWall.frontRoomId ?? "outside"}</option><option value="back">Back · {selectedWall.backRoomId ?? "outside"}</option></select></label>}
            <label className="house-field"><span>{selectedRoom ? "Floor material" : selectedWall ? "Wall material" : "Object material"}</span><select name="material" defaultValue={materialId}>{scene.materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label><Button type="submit" variant="outline" disabled={selectedInstance?.locked}>Apply material</Button></form></section>}
          {editable && selectedOpening && <section className="house-inspector-section"><h2>Plan architecture</h2><p>Move the opening along its wall. This explicit architectural command is available in Plan.</p><form key={`opening-${selectedId}-${cursor}`} onSubmit={event => { const data = values(event); applyOperations([{ op: "planMoveOpening", entityId: selectedOpening.id, offset: Number(data.get("offset")) }]); }}><NumberField name="offset" label="Opening offset (mm)" value={selectedOpening.offset} min={0} /><Button type="submit" variant="outline" disabled={view !== "plan"}>Move opening</Button></form></section>}
          <section className="house-inspector-section"><h2>Add furniture or a light</h2><p>{placementRoom ? `Place inside ${placementRoom.name}${scope.region ? "’s selected region" : ""}.` : "Select a room or define a region to place an object."}</p><label className="house-field"><span>Local catalog</span><select aria-label="Local catalog" value={catalogId} onChange={event => setCatalogId(event.target.value)}>{catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><div className="house-catalog-preview"><Image src={selectedAsset.thumbnailPath} alt={`${selectedAsset.name} — actual local model`} width={88} height={88} unoptimized /><div><strong>{selectedAsset.name}</strong><p>{selectedAsset.dimensions.join(" × ")} mm</p><span>{selectedAsset.mount} mounted</span></div></div>
            {placementRoom && <form key={`place-${placementRoom.id}-${catalogId}-${scope.region ? pretty(scope.region) : "room"}`} onSubmit={event => { const data = values(event); let sequence = 1; while (scene.instances.some(instance => instance.id === `${catalogId}-${sequence}`)) sequence++; applyOperations([{ op: "place", instance: { id: `${catalogId}-${sequence}`, roomId: placementRoom.id, catalogId, position: [Number(data.get("x")), selectedAsset.mount === "ceiling" ? scene.level.ceilingHeight - selectedAsset.dimensions[1] : 0, Number(data.get("z"))], rotation: Number(data.get("rotation")), dimensions: [...selectedAsset.dimensions], materialId: scene.materials[0].id, locked: false, ...(selectedAsset.kind === "light" ? { light: { enabled: true, intensity: 65, temperature: "warm" as const } } : {}) } }]); }}><div className="house-field-grid"><NumberField name="x" label="Placement X (mm)" value={Math.round((scope.region?.x ?? placementRoom.x) + (scope.region?.width ?? placementRoom.width) / 2)} /><NumberField name="z" label="Placement Z (mm)" value={Math.round((scope.region?.z ?? placementRoom.z) + (scope.region?.depth ?? placementRoom.depth) / 2)} /><NumberField name="rotation" label="Placement rotation (°)" value={0} min={0} max={359} /></div><Button type="submit">Add {selectedAsset.kind === "light" ? "light" : "object"}</Button></form>}
          </section>
        </aside>
          <section className="house-experiments" aria-labelledby="experiment-heading"><div className="house-section-heading"><h2 id="experiment-heading">Try a programmatic change</h2><p>Load an example, inspect its selected scope, then apply the patch.</p></div><div className="house-example-list">{examples.map(example => <Button key={example.id} variant="outline" className="house-example" onClick={() => { setScope(structuredClone(example.scope)); setPatchText(pretty(example.patch)); setError(""); setNotice(`${example.name}: ${example.description} Review the JSON below, then apply.`); if (example.view) changeView(example.view); if (example.scope.region) setRoomId(example.scope.region.roomId); }}><span>{example.name}</span><span aria-hidden="true">↗</span></Button>)}</div></section>
          <details className="house-developer" open><summary>Developer patch workbench</summary><div className="house-patch-content"><p>Selection is supplied by this page. JSON cannot expand the selected scope.</p><label className="house-field"><span>Scene patch JSON</span><textarea aria-label="Scene patch JSON" value={patchText} onChange={event => setPatchText(event.target.value)} spellCheck={false} rows={12} /></label><div className="house-patch-actions"><Button onClick={applyJSON}>Apply patch</Button><span>{scope.selectedIds.length} selected{scope.region ? " · region active" : ""}</span></div><details><summary>Inspect selected scope</summary><pre>{pretty(scope)}</pre></details><details><summary>Inspect scene document</summary><pre>{pretty(scene)}</pre></details></div></details>
          <div className="house-downloads"><Button variant="outline" onClick={() => download(new Blob([pretty(scene)], { type: "application/json" }), `${scene.id}.json`)}>Export scene JSON</Button><Button variant="outline" onClick={() => void exportPlan()}>Download floor-plan PNG</Button></div>
          <p className="house-disclosure">Synthetic fixture with illustrative finishes. Changes and undo history last for this browser session. This sample stays in your browser session and is separate from saved projects.</p>
        </div>

      </div>
      <div hidden><HousePlan document={scene} svgRef={exportSvg} /></div>
    </main>
  </div>;
}
