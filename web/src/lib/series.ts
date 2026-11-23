import type { Run, RunSeries } from "../api/types";

type NumericKey = {
  [K in keyof RunSeries]-?: RunSeries[K] extends (number | null)[] | undefined ? K : never;
}[keyof RunSeries];

/** Value of a series column at the cursor. `undefined` = the column is not in this run. */
export function at(run: Run | undefined, key: NumericKey, i: number): number | null | undefined {
  const col = run?.series[key] as (number | null)[] | undefined;
  return col ? col[i] : undefined;
}

/** Data-quality flag at the cursor, "" when clean. */
export const flagAt = (run: Run | undefined, i: number): string => run?.series.dq_flags[i] ?? "";

/** A capability counts as missing only when the backend says `false`. */
export const hasCap = (run: Run | undefined, name: string): boolean => run?.capabilities[name] !== false;
