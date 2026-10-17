"use client";

// Upload a floor plan without typing a single measurement: the plan's own numbers
// set the scale when they agree; otherwise one tap on a home size does.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImageUp, Minus, Plus, RotateCcw } from "lucide-react";
import { fitPlanScale, planSizeChoices } from "@vibeestimate/scene-core";
import type { PlanReading } from "@vibeestimate/scene-schema";
import { Button } from "@/components/ui/button";
import { makeHomeApi, type HomeProject } from "@/lib/home-api";

const MAX_SIDE = 1800, MAX_BYTES = 950 * 1024;
/** Re-encode in the browser: smaller uploads and no photo metadata such as location. */
export async function preparePlanImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP image of your plan. For a PDF, take a screenshot first.");
  if (file.size > 20 * 1024 * 1024) throw new Error("This image is very large. Take a screenshot of the plan and upload that instead.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("This image could not be opened. Try a PNG or JPEG."); }
  for (const [side, quality] of [[MAX_SIDE, 0.86], [MAX_SIDE, 0.72], [1400, 0.7], [1100, 0.65]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare this image.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) { if (Math.min(canvas.width, canvas.height) < 200) throw new Error("This image is too small to read. Use a larger picture of the plan."); return blob; }
  }
  throw new Error("This image is too detailed to upload. Crop it to just the floor plan and try again.");
}

type Props = { home: HomeProject; busy: boolean; onHome: (home: HomeProject) => void; onError: (message: string) => void; onNotice: (message: string) => void };

export function PlanImport({ home, busy, onHome, onError, onNotice }: Props) {
  const api = useMemo(() => makeHomeApi(), []);
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading" | "reading" | "creating">("idle");
  const [imageUrl, setImageUrl] = useState(""), [removed, setRemoved] = useState<number[]>([]), [adjust, setAdjust] = useState(1), [chosen, setChosen] = useState<number | null>(null);
  const plan = home.plan, reading = plan?.reading as PlanReading | undefined;
  const fit = useMemo(() => reading && plan ? fitPlanScale(reading, plan) : null, [reading, plan]);
  const choices = useMemo(() => reading && plan ? planSizeChoices(reading, plan) : [], [reading, plan]);
  const working = busy || phase !== "idle";

  useEffect(() => {
    if (!plan) return;
    let url = "", alive = true;
    void api.planImage(home.id, plan.id).then(blob => { if (!alive) return; url = URL.createObjectURL(blob); setImageUrl(url); }).catch(() => { /* The overlay still works without the picture. */ });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [api, home.id, plan]);

  async function step<T>(label: typeof phase, work: () => Promise<T>) { setPhase(label); onError(""); try { return await work(); } catch (cause) { onError(cause instanceof Error ? cause.message : "Your plan could not be processed. Your home is unchanged."); } finally { setPhase("idle"); } }
  async function choose(file: File) {
    const blob = await step("preparing", () => preparePlanImage(file)); if (!blob) return;
    const uploaded = await step("uploading", () => api.uploadPlan(home.id, blob, crypto.randomUUID())); if (!uploaded) return;
    onHome(uploaded.home); setRemoved([]); setAdjust(1); setChosen(null);
    const read = await step("reading", () => api.readPlan(home.id, uploaded.home.plan!.id)); if (read) { onHome(read.home); if (read.home.plan?.reading) onNotice("We read your plan. Check the rooms and the size, then create your home."); }
  }
  async function retryRead() { if (!plan) return; const read = await step("reading", () => api.readPlan(home.id, plan.id)); if (read) onHome(read.home); }

  const base = chosen ?? (fit?.status === "confirmed" ? fit.mmPerPixel : null);
  const mmPerPixel = base ? Math.round(base * adjust * 1000) / 1000 : null;
  const sized = (box: readonly number[]) => mmPerPixel && plan ? [((box[3]! - box[1]!) / 1000 * plan.width * mmPerPixel / 1000), ((box[2]! - box[0]!) / 1000 * plan.height * mmPerPixel / 1000)] : null;
  const anchor = reading?.rooms.map((room, index) => ({ room, index })).filter(({ index }) => !removed.includes(index)).sort((a, b) => (b.room.box[3] - b.room.box[1]) * (b.room.box[2] - b.room.box[0]) - (a.room.box[3] - a.room.box[1]) * (a.room.box[2] - a.room.box[0]))[0];
  const anchorSize = anchor ? sized(anchor.room.box) : null;

  async function create() {
    if (!plan || !reading || !mmPerPixel) return;
    const result = await step("creating", () => api.acceptPlan(home.id, plan.id, { names: reading.rooms.map(room => room.label), removedRooms: removed, mmPerPixel, furnish: true }, home.headRevisionId, crypto.randomUUID()));
    if (result) { onHome(result.home); onNotice("Your home is ready, furnished from your plan. Try a Home Tour or a quick style."); }
  }

  const status = { preparing: "Preparing your image…", uploading: "Uploading your plan…", reading: "Reading rooms, doors and windows…", creating: "Building your home…" } as const;
  return <section className="home-plan-import" aria-label="Upload your floor plan">
    <div className="home-plan-intro"><ImageUp size={26} aria-hidden="true" /><div><h2>Have a floor plan?</h2><p>Upload a photo, screenshot or listing image. We read the rooms and their sizes, then you confirm with a tap. No measuring.</p></div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }} aria-label="Floor plan image" />
      <Button variant={plan ? "outline" : "default"} disabled={working} onClick={() => input.current?.click()}><ImageUp size={17} aria-hidden="true" />{plan ? "Upload a different plan" : "Upload your plan"}</Button></div>
    {phase !== "idle" && <p className="home-plan-status" role="status"><span className="home-plan-spinner" aria-hidden="true" />{status[phase]}</p>}
    {plan && !reading && phase === "idle" && <div className="home-error" role="alert"><p>{plan.error?.message ?? "Your plan is uploaded and ready to read."}</p>{plan.attempts < 2 ? <Button variant="outline" disabled={working} onClick={() => void retryRead()}><RotateCcw size={16} aria-hidden="true" />{plan.attempts ? "Try reading again" : "Read my plan"}</Button> : <p>Choose a starting home below, or upload a clearer picture.</p>}</div>}
    {plan && reading && <div className="home-plan-review">
      <figure className="home-plan-figure" style={{ aspectRatio: `${plan.width} / ${plan.height}` }}>
        {/* A private, authenticated blob URL: Next image optimisation must not fetch it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imageUrl && <img src={imageUrl} alt="Your uploaded floor plan" />}
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {reading.rooms.map((room, index) => { const [y0, x0, y1, x1] = room.box, off = removed.includes(index); return <g key={index} opacity={off ? 0.35 : 1}><rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={off ? "transparent" : "rgba(197,32,49,0.10)"} stroke={off ? "#586673" : "#c52031"} strokeWidth="4" strokeDasharray={off ? "12 10" : undefined} vectorEffect="non-scaling-stroke" /></g>; })}
          {reading.doors.map((door, index) => <circle key={`d${index}`} cx={door.point[1]} cy={door.point[0]} r="9" fill="#8c6670" />)}
          {reading.windows.map((window, index) => <circle key={`w${index}`} cx={window.point[1]} cy={window.point[0]} r="8" fill="#4d89a6" />)}
        </svg>
        {reading.rooms.map((room, index) => { const [y0, x0, y1, x1] = room.box, size = sized(room.box); return <span key={index} className="home-plan-label" style={{ left: `${(x0 + x1) / 20}%`, top: `${(y0 + y1) / 20}%` }} data-removed={removed.includes(index) || undefined}>{room.label}{size && !removed.includes(index) ? <small>{size[0].toFixed(1)} × {size[1].toFixed(1)} m</small> : null}</span>; })}
      </figure>
      <div className="home-plan-confirm">
        <h3>{reading.rooms.length - removed.length} rooms found</h3>
        <ul>{reading.rooms.map((room, index) => <li key={index}><span>{room.label}</span><Button variant="ghost" aria-pressed={!removed.includes(index)} disabled={working || (!removed.includes(index) && removed.length >= reading.rooms.length - 1)} onClick={() => setRemoved(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index])}>{removed.includes(index) ? "Add back" : "Remove"}</Button></li>)}</ul>
        {fit?.status === "confirmed" && chosen === null ? <div className="home-plan-scale"><h3>Is this the right size?</h3>{anchor && anchorSize && <p><strong>{anchor.room.label} ≈ {anchorSize[0].toFixed(1)} × {anchorSize[1].toFixed(1)} m</strong> · from the numbers on your plan</p>}<div className="home-quick-actions"><Button variant="outline" aria-label="A little smaller" disabled={working} onClick={() => setAdjust(value => Math.max(0.6, value / 1.05))}><Minus size={16} aria-hidden="true" />Smaller</Button><Button variant="outline" aria-label="A little bigger" disabled={working} onClick={() => setAdjust(value => Math.min(1.6, value * 1.05))}><Plus size={16} aria-hidden="true" />Bigger</Button></div></div>
          : <div className="home-plan-scale"><h3>About how big is your whole home?</h3><p>{fit?.status === "conflict" ? "The sizes printed on your plan disagree, so pick the closest total." : "Your plan has no sizes we could read. Pick the closest total floor area."}</p><div className="home-plan-sizes" role="group" aria-label="Home size">{choices.map(choice => <Button key={choice.areaM2} variant="outline" aria-pressed={chosen === choice.mmPerPixel} disabled={working} onClick={() => { setChosen(choice.mmPerPixel); setAdjust(1); }}>{choice.areaM2} m²</Button>)}</div>{chosen !== null && <div className="home-quick-actions"><Button variant="outline" aria-label="A little smaller" disabled={working} onClick={() => setAdjust(value => Math.max(0.6, value / 1.05))}><Minus size={16} aria-hidden="true" />Smaller</Button><Button variant="outline" aria-label="A little bigger" disabled={working} onClick={() => setAdjust(value => Math.min(1.6, value * 1.05))}><Plus size={16} aria-hidden="true" />Bigger</Button></div>}</div>}
        <Button className="home-full-action" disabled={working || !mmPerPixel} onClick={() => void create()}><Check size={17} aria-hidden="true" />Create my home</Button>
        <p className="home-small">{plan.provider === "fixture" ? "Local test reading · the image was not analysed." : "Read from your image by Gemini and checked in code."} Sizes are estimates from your plan; check them on site before ordering or building.</p>
      </div>
    </div>}
  </section>;
}
