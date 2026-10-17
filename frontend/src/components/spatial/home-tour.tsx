"use client";

import { useMemo, useState } from "react";
import { Footprints, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { homeTour } from "@vibeestimate/scene-core";
import type { HouseDocument } from "@vibeestimate/scene-schema";
import { Button } from "@/components/ui/button";

export type TourState = { playing: boolean; speed: number; seekRoom: number; seekKey: number };
export const TOUR_SPEEDS = [0.5, 1, 1.5, 2] as const;

/** Home Tour state shared by the studio and the no-account trial. */
export function useHomeTour(document: HouseDocument | null | undefined) {
  // room is -1 while walking in from the entrance, before the first room is reached.
  const [state, setState] = useState<TourState | null>(null), [room, setRoom] = useState(-1), [ended, setEnded] = useState(false);
  const route = useMemo(() => document ? homeTour(document) : null, [document]);
  const seek = (index: number) => { if (!route) return; const next = Math.min(Math.max(index, 0), route.rooms.length - 1); setEnded(false); setRoom(next); setState(previous => previous && { ...previous, playing: true, seekRoom: next, seekKey: previous.seekKey + 1 }); };
  return {
    route, state, room, ended,
    start: () => { setEnded(false); setRoom(-1); setState({ playing: true, speed: 1, seekRoom: -1, seekKey: Date.now() }); },
    stop: () => setState(null),
    toggle: () => { if (ended) seek(0); else setState(previous => previous && { ...previous, playing: !previous.playing }); },
    speed: (value: number) => setState(previous => previous && { ...previous, speed: value }),
    seek,
    control: state ? { ...state, onRoom: (index: number) => setRoom(index), onEnd: () => { setEnded(true); setState(previous => previous && { ...previous, playing: false }); } } : null,
  };
}

export function TourButton({ onStart, disabled }: { onStart: () => void; disabled?: boolean }) {
  return <Button variant="ghost" onClick={onStart} disabled={disabled}><Footprints size={16} aria-hidden="true" />Home Tour</Button>;
}

export function TourControls({ tour }: { tour: ReturnType<typeof useHomeTour> }) {
  if (!tour.state || !tour.route) return null;
  const current = tour.room >= 0 ? tour.route.rooms[tour.room] : undefined, total = tour.route.rooms.length;
  return <div className="home-tour-bar" role="group" aria-label="Home Tour controls">
    <p aria-live="polite"><strong>{tour.ended ? "Tour complete" : current?.name ?? "Starting at the entrance"}</strong><span>{tour.ended ? `${total} rooms` : current ? `Room ${tour.room + 1} of ${total}` : `Next: ${tour.route.rooms[0]?.name ?? "the first room"}`}</span></p>
    <div>
      <Button variant="ghost" aria-label="Previous room" disabled={tour.room <= 0 && !tour.ended} onClick={() => tour.seek(tour.ended ? total - 1 : tour.room - 1)}><SkipBack size={18} aria-hidden="true" /></Button>
      <Button variant="outline" aria-label={tour.ended ? "Replay tour" : tour.state.playing ? "Pause tour" : "Resume tour"} onClick={tour.toggle}>{tour.state.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{tour.ended ? "Replay" : tour.state.playing ? "Pause" : "Play"}</Button>
      <Button variant="ghost" aria-label="Next room" disabled={tour.room >= total - 1} onClick={() => tour.seek(tour.room + 1)}><SkipForward size={18} aria-hidden="true" /></Button>
      <label><span>Speed</span><select aria-label="Tour speed" value={tour.state.speed} onChange={event => tour.speed(Number(event.target.value))}>{TOUR_SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <Button variant="ghost" aria-label="Exit tour" onClick={tour.stop}><X size={18} aria-hidden="true" /></Button>
    </div>
  </div>;
}
