/**
 * Delivery-promise logic.
 *
 * 1. windowFromHistory: derives the estimate shown at checkout from the
 *    store's own past delivery durations (empirical quantiles), instead of a
 *    fixed "3-7 days" for every order. With too little history it falls back
 *    to the default and says so.
 * 2. computePromiseStats: how often the store kept its ORIGINAL promise.
 *
 * All functions are pure so they can be unit-tested without a database.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this many past deliveries we do not trust the history. */
export const MIN_HISTORY = 30;
export const DEFAULT_WINDOW = { fromDays: 3, toDays: 7 } as const;
const MAX_TO_DAYS = 30;

/** Lower and upper quantile of the promised window. */
export const WINDOW_QUANTILES = { low: 0.5, high: 0.9 } as const;

export type EstimateSource = "default" | "history";

export interface DurationWindow {
  fromDays: number;
  toDays: number;
  source: EstimateSource;
  /** Number of past deliveries the window was based on. */
  basis: number;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];

  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * @param durationsDays past delivery durations in days (placed -> delivered)
 */
export function windowFromHistory(durationsDays: number[]): DurationWindow {
  const clean = durationsDays
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);

  if (clean.length < MIN_HISTORY) {
    return { ...DEFAULT_WINDOW, source: "default", basis: clean.length };
  }

  // Cap both ends so a very slow history can never produce from > to.
  const fromDays = Math.min(
    MAX_TO_DAYS - 1,
    Math.max(1, Math.floor(quantile(clean, WINDOW_QUANTILES.low)))
  );
  const toDays = Math.min(
    MAX_TO_DAYS,
    Math.max(fromDays + 1, Math.ceil(quantile(clean, WINDOW_QUANTILES.high)))
  );

  return { fromDays, toDays, source: "history", basis: clean.length };
}

export function applyWindow(
  placedAt: Date,
  window: Pick<DurationWindow, "fromDays" | "toDays">
): { from: Date; to: Date } {
  return {
    from: new Date(placedAt.getTime() + window.fromDays * DAY_MS),
    to: new Date(placedAt.getTime() + window.toDays * DAY_MS),
  };
}

/** End of the calendar day (UTC) containing the given date. */
export function endOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

export interface PromiseSample {
  /** End of the window promised when the order was placed. */
  originalTo: Date;
  /** End of the latest window shown to the customer. */
  currentTo: Date;
  deliveredAt: Date;
  /** How many times the date was revised after the order was placed. */
  revisions: number;
  simulated: boolean;
}

export interface PromiseStats {
  /** Number of delivered orders included. */
  sample: number;
  /** % delivered on/before the ORIGINAL promised date. Null if no data. */
  keptOriginalPct: number | null;
  /** % delivered on/before the LATEST date (after any revisions). */
  keptLatestPct: number | null;
  /** % of orders whose promised date was revised at least once. */
  revisedPct: number | null;
  /** Average days after the original date, over late orders only. */
  avgDaysLateWhenLate: number | null;
  /** Share of the sample that is simulated demo data (0-100). */
  simulatedPct: number | null;
}

const pct = (part: number, total: number) =>
  total === 0 ? null : Math.round((part / total) * 1000) / 10;

/** A promise counts as kept if delivery happens on or before the promised DAY. */
export function computePromiseStats(samples: PromiseSample[]): PromiseStats {
  const total = samples.length;

  let keptOriginal = 0;
  let keptLatest = 0;
  let revised = 0;
  let simulated = 0;
  let lateDaysTotal = 0;
  let lateCount = 0;

  for (const sample of samples) {
    const deliveredMs = sample.deliveredAt.getTime();
    const originalEnd = endOfDayUtc(sample.originalTo).getTime();
    const latestEnd = endOfDayUtc(sample.currentTo).getTime();

    if (deliveredMs <= originalEnd) {
      keptOriginal += 1;
    } else {
      lateCount += 1;
      lateDaysTotal += Math.ceil((deliveredMs - originalEnd) / DAY_MS);
    }

    if (deliveredMs <= latestEnd) keptLatest += 1;
    if (sample.revisions > 0) revised += 1;
    if (sample.simulated) simulated += 1;
  }

  return {
    sample: total,
    keptOriginalPct: pct(keptOriginal, total),
    keptLatestPct: pct(keptLatest, total),
    revisedPct: pct(revised, total),
    avgDaysLateWhenLate:
      lateCount === 0 ? (total === 0 ? null : 0) : Math.round((lateDaysTotal / lateCount) * 10) / 10,
    simulatedPct: pct(simulated, total),
  };
}
