import { describe, expect, it } from "vitest";
import { nextRefreshDelay } from "../src/lib/use-adaptive-refresh";

describe("adaptive refresh cost bound", () => {
  it("backs off an idle tab from 1.5 s to the cap and returns to fast on a change", () => {
    const delays: number[] = [];
    let delay = 1500;
    for (let i = 0; i < 8; i++) { delay = nextRefreshDelay(false, delay, 1500, 30_000); delays.push(delay); }
    expect(delays).toEqual([3000, 6000, 12_000, 24_000, 30_000, 30_000, 30_000, 30_000]);
    expect(nextRefreshDelay(true, 30_000, 1500, 30_000)).toBe(1500);
  });

  it("keeps an idle tab to a small fraction of fixed 1.5 s polling", () => {
    let elapsed = 0, requests = 0, delay = 1500;
    while (elapsed < 3_600_000) { elapsed += delay; requests++; delay = nextRefreshDelay(false, delay, 1500, 30_000); }
    expect(requests).toBeLessThan(130);
    expect(3_600_000 / 1500).toBe(2400);
  });

  it("never schedules faster than the fastest interval or slower than the cap", () => {
    expect(nextRefreshDelay(false, 4000, 2500, 5000)).toBe(5000);
    expect(nextRefreshDelay(false, 500, 2500, 30_000)).toBe(2500);
  });
});
