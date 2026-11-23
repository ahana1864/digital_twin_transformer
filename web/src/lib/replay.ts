import type { Run } from "../api/types";

const DAY_MS = 24 * 3600_000;

/** Index of the first sample at or after `ms`, or -1. */
export const indexAtOrAfter = (run: Run, ms: number) => run.series.timestamp.findIndex((t) => Date.parse(t) >= ms);

/**
 * "Jump to injected fault" (FRONTEND_HANDOFF §8): 1 day before gt_markers.fault_start.
 * Null when the dataset has no injected fault (N, real data, imported files).
 */
export function faultJumpIndex(run: Run): number | null {
  if (!run.gt_markers) return null;
  const i = indexAtOrAfter(run, Date.parse(run.gt_markers.fault_start) - DAY_MS);
  return i < 0 ? 0 : i;
}
