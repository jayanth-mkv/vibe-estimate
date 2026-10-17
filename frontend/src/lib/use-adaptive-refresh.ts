"use client";

import { useEffect, useRef } from "react";

/** A change returns to the fastest interval; a quiet or failed check doubles it up to the cap. */
export function nextRefreshDelay(changed: boolean, delay: number, fastestMs: number, slowestMs: number) {
  return changed ? fastestMs : Math.min(slowestMs, Math.max(fastestMs, delay * 2));
}

/** Polling cost scales with open tabs, so an idle or hidden tab must stop asking.
 * The callback resolves true when it observed a change; changes reset to the fast
 * interval, quiet periods double it up to `slowestMs`. Hidden tabs make no requests
 * and refresh once when they become visible or focused again. */
export function useAdaptiveRefresh(refresh: () => Promise<boolean>, { enabled, fastestMs, slowestMs = 30_000 }: { enabled: boolean; fastestMs: number; slowestMs?: number }) {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, running = false, delay = fastestMs, timer: ReturnType<typeof setTimeout> | undefined;
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const schedule = () => { if (timer) clearTimeout(timer); if (alive && !hidden()) timer = setTimeout(() => void tick(), delay); };
    async function tick() {
      if (!alive || running || hidden()) return;
      running = true;
      try { delay = nextRefreshDelay(await latest.current(), delay, fastestMs, slowestMs); }
      catch { delay = nextRefreshDelay(false, delay, fastestMs, slowestMs); }
      finally { running = false; schedule(); }
    }
    const wake = () => { if (hidden()) { if (timer) clearTimeout(timer); return; } delay = fastestMs; void tick(); };
    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [enabled, fastestMs, slowestMs]);
}
