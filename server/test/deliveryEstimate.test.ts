import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS,
  MIN_HISTORY,
  applyWindow,
  computePromiseStats,
  quantile,
  windowFromHistory,
  type PromiseSample,
} from "../src/lib/deliveryEstimate.js";

test("quantile interpolates between values", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4, 5], 0), 1);
  assert.equal(quantile([1, 2, 3, 4, 5], 1), 5);
  assert.equal(quantile([10, 20], 0.5), 15);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test("too little history falls back to the default 3-7 day window", () => {
  const few = Array.from({ length: MIN_HISTORY - 1 }, () => 10);
  const window = windowFromHistory(few);
  assert.deepEqual(
    [window.fromDays, window.toDays, window.source, window.basis],
    [3, 7, "default", MIN_HISTORY - 1]
  );
});

test("enough history gives a p50-p90 window", () => {
  // 1..100 days: p50 = 50.5 -> 50, p90 = 90.1 -> 91, capped at 30 days.
  const history = Array.from({ length: 100 }, (_, i) => i + 1);
  const window = windowFromHistory(history);
  assert.equal(window.source, "history");
  assert.equal(window.basis, 100);
  assert.equal(window.toDays, 30);
  assert.ok(window.fromDays >= 1 && window.fromDays < window.toDays);
});

test("typical history produces a sensible window", () => {
  // 30 deliveries: 20 of 4 days, 7 of 6 days, 3 of 9 days.
  const history = [
    ...Array(20).fill(4),
    ...Array(7).fill(6),
    ...Array(3).fill(9),
  ];
  const window = windowFromHistory(history);
  assert.equal(window.source, "history");
  assert.equal(window.fromDays, 4);
  assert.ok(window.toDays >= 6 && window.toDays <= 9);
});

test("window always spans at least one day and ignores bad values", () => {
  const history = [...Array(40).fill(0), NaN, -3, Infinity];
  const window = windowFromHistory(history);
  assert.equal(window.basis, 40);
  assert.ok(window.fromDays >= 1);
  assert.ok(window.toDays >= window.fromDays + 1);
});

test("applyWindow adds whole days", () => {
  const placed = new Date("2026-01-01T00:00:00Z");
  const { from, to } = applyWindow(placed, { fromDays: 2, toDays: 5 });
  assert.equal(from.getTime() - placed.getTime(), 2 * DAY_MS);
  assert.equal(to.getTime() - placed.getTime(), 5 * DAY_MS);
});

const sample = (over: Partial<PromiseSample>): PromiseSample => ({
  originalTo: new Date("2026-01-10T00:00:00Z"),
  currentTo: new Date("2026-01-10T00:00:00Z"),
  deliveredAt: new Date("2026-01-09T10:00:00Z"),
  revisions: 0,
  simulated: false,
  ...over,
});

test("promise is kept when delivered any time on the promised day", () => {
  const stats = computePromiseStats([
    sample({ deliveredAt: new Date("2026-01-10T23:00:00Z") }),
  ]);
  assert.equal(stats.keptOriginalPct, 100);
});

test("late delivery is counted and measured in days", () => {
  const stats = computePromiseStats([
    sample({}), // on time
    sample({ deliveredAt: new Date("2026-01-12T12:00:00Z") }), // 2 days late
  ]);
  assert.equal(stats.sample, 2);
  assert.equal(stats.keptOriginalPct, 50);
  assert.equal(stats.avgDaysLateWhenLate, 2);
});

test("a revised date can hide lateness; the original-date stat does not", () => {
  const stats = computePromiseStats([
    sample({
      currentTo: new Date("2026-01-14T00:00:00Z"),
      deliveredAt: new Date("2026-01-13T12:00:00Z"),
      revisions: 1,
    }),
  ]);
  assert.equal(stats.keptOriginalPct, 0);
  assert.equal(stats.keptLatestPct, 100);
  assert.equal(stats.revisedPct, 100);
});

test("simulated share is reported and empty input is handled", () => {
  const stats = computePromiseStats([
    sample({ simulated: true }),
    sample({ simulated: false }),
    sample({ simulated: true }),
    sample({ simulated: true }),
  ]);
  assert.equal(stats.simulatedPct, 75);

  const empty = computePromiseStats([]);
  assert.equal(empty.sample, 0);
  assert.equal(empty.keptOriginalPct, null);
  assert.equal(empty.avgDaysLateWhenLate, null);
});

test("when the window uses p90, about 90% of the same data is within it", () => {
  // Deterministic pseudo-random durations (days), same distribution for fit and check.
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const durations = Array.from({ length: 2000 }, () => 2 + Math.floor(rand() * rand() * 20));
  const window = windowFromHistory(durations);
  const within = durations.filter((d) => d <= window.toDays).length / durations.length;
  assert.ok(within >= 0.88, `expected ~90% within window, got ${within}`);
});
