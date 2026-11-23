// The real /run endpoint caps max_points at 2000 and, above that cap, downsamples each series
// column *independently* — so two columns in the same downsampled response can report different
// sample times (verified against the live backend: e.g. fidelity_rmse_C drops its rolling-window
// warm-up rows, other columns don't). That breaks the frontend's shared-timestamp-index
// assumption (RunSeries: one `timestamp` array, every other column a parallel value array at the
// same index).
//
// Fix: never let a single request get downsampled. Fetch the dataset in time windows small
// enough that `downsampled` comes back false (confirmed empirically: within such a window every
// column's `t` is either identical to the longest column's, or a *subsequence* of it with no
// internal gaps — i.e. only ever missing a warm-up prefix/suffix, never a hole in the middle).
// Reindex each column onto that window's longest column by timestamp (not position — the warm-up
// trim means position would misalign), then stitch the windows together in order.
//
// Windows are requested in parallel: `rowsHint` (the dataset's total row count, from the metadata
// call) sizes an even grid of windows up front, instead of discovering each window's end from the
// previous one's last timestamp (which would force one request to wait for the last). A window
// whose estimate was still too wide (irregular real-world spacing) self-corrects with the same
// shrink loop, independently of its neighbours; the final stitch de-dupes on timestamp in case an
// estimate landed a sample on both sides of a boundary.
//
// `series` and `health_series` are two independent dicts on the same /run response; both get
// collected from the same HTTP calls (one shrink loop per window, driven by `series`'s longest
// column, which — verified — is always present and always the fullest column on this API).

import type { RawSeries } from "./rawTypes";

const MAX_POINTS = 2000;

export interface MultiSeriesPage {
  dicts: Record<string, Record<string, RawSeries>>;
  rows_in_range: number;
  downsampled: boolean;
}

export interface AlignedSeries {
  timestamp: string[];
  columns: Record<string, (number | string | null)[]>;
}

/** Reindex one column onto `canonical` timestamps: exact match only, null where absent. */
function reindex(col: RawSeries | undefined, canonical: string[]): (number | string | null)[] {
  if (!col) return canonical.map(() => null);
  const byT = new Map(col.t.map((t, i) => [t, col.v[i]]));
  return canonical.map((t) => byT.get(t) ?? null);
}

/** The longest column in a dict — the canonical timestamp grid for that dict in that window. */
function longestColumn(dict: Record<string, RawSeries>): string[] {
  let best: string[] = [];
  for (const col of Object.values(dict)) if (col.t.length > best.length) best = col.t;
  return best;
}

/** One window's dicts, reindexed onto their own canonical timestamps. Empty when the window held nothing. */
async function fetchWindow(
  start: string,
  end: string,
  dictNames: string[],
  fetchPage: (start: string, end: string) => Promise<MultiSeriesPage>,
): Promise<Record<string, AlignedSeries>> {
  let windowEnd = end;
  let page = await fetchPage(start, windowEnd);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  // Shrink the window proportionally until it fits (2 tries is enough for a regular interval; a
  // third, conservative try covers irregular/real-world data).
  for (let tries = 0; page.downsampled && tries < 3; tries++) {
    const spanMs = Date.parse(windowEnd) - startMs;
    const ratio = Math.max(0.02, (MAX_POINTS * 0.97) / page.rows_in_range);
    const shrunkMs = startMs + Math.max(1, Math.floor(spanMs * ratio));
    windowEnd = new Date(Math.min(shrunkMs, endMs)).toISOString();
    page = await fetchPage(start, windowEnd);
  }

  const out: Record<string, AlignedSeries> = {};
  for (const name of dictNames) {
    const canonical = longestColumn(page.dicts[name] ?? {});
    const columns: Record<string, (number | string | null)[]> = {};
    for (const key of Object.keys(page.dicts[name] ?? {})) columns[key] = reindex(page.dicts[name][key], canonical);
    out[name] = { timestamp: canonical, columns };
  }
  return out;
}

/** Appends a window's aligned series onto the accumulator, skipping any leading timestamp already present. */
function stitch(acc: AlignedSeries, win: AlignedSeries, seen: Set<string>): void {
  const freshFrom = win.timestamp.findIndex((t) => !seen.has(t));
  if (freshFrom === -1) return;
  const fresh = win.timestamp.slice(freshFrom);
  for (const t of fresh) seen.add(t);
  const startIndex = acc.timestamp.length;
  acc.timestamp.push(...fresh);
  for (const key of Object.keys(win.columns)) {
    if (!(key in acc.columns)) acc.columns[key] = new Array(startIndex).fill(null);
    acc.columns[key].push(...win.columns[key].slice(freshFrom));
  }
  for (const key of Object.keys(acc.columns)) {
    if (acc.columns[key].length < acc.timestamp.length) acc.columns[key].push(...fresh.map(() => null));
  }
}

/**
 * Fetches `[start, end]` (inclusive, ISO strings) in undownsampled windows, in parallel, and
 * stitches each named series dict onto one canonical timestamp array per dict. `rowsHint` (the
 * dataset's known row count) sizes the window grid. `fetchPage(start, end)` must request at most
 * MAX_POINTS points for that range and report back `downsampled` / `rows_in_range`.
 */
export async function fetchAlignedMulti(
  start: string,
  end: string,
  rowsHint: number,
  dictNames: string[],
  fetchPage: (start: string, end: string) => Promise<MultiSeriesPage>,
): Promise<Record<string, AlignedSeries>> {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const n = Math.max(1, Math.ceil(rowsHint / MAX_POINTS));
  const stepMs = (endMs - startMs) / n;

  const windows = await Promise.all(
    Array.from({ length: n }, (_, k) => {
      const wStart = new Date(Math.round(startMs + k * stepMs) + (k === 0 ? 0 : 1)).toISOString();
      const wEnd = new Date(k === n - 1 ? endMs : Math.round(startMs + (k + 1) * stepMs)).toISOString();
      return fetchWindow(wStart, wEnd, dictNames, fetchPage);
    }),
  );

  const out: Record<string, AlignedSeries> = Object.fromEntries(dictNames.map((name) => [name, { timestamp: [], columns: {} }]));
  const seen: Record<string, Set<string>> = Object.fromEntries(dictNames.map((name) => [name, new Set<string>()]));
  for (const win of windows) for (const name of dictNames) if (win[name]) stitch(out[name], win[name], seen[name]);

  return out;
}
