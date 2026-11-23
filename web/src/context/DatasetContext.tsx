import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useDatasets, useRun } from "../api/client";
import type { Alert, DatasetListItem, Run } from "../api/types";
import { activeAlerts, visibleAlerts } from "../lib/alerts";

interface DatasetContextValue {
  datasets: DatasetListItem[] | undefined;
  datasetsLoading: boolean;
  datasetsError: unknown;
  /** Selected dataset (from GET /datasets); null until the list has loaded */
  dataset: DatasetListItem | null;
  selectDataset: (id: string) => void;
  /** GET /runs/{id}, fetched once per dataset and replayed client-side */
  run: Run | undefined;
  runLoading: boolean;
  runError: unknown;
  /** Replay cursor: index into run.series.timestamp */
  cursor: number;
  setCursor: (index: number) => void;
  /** Number of steps in the loaded run (0 when there is no time series) */
  steps: number;
  /** Timestamp at the cursor, or null when there is no time series */
  cursorTime: string | null;
  /** Alerts with timestamp <= cursor, oldest first */
  seenAlerts: Alert[];
  /** Alerts still active at the cursor (FRONTEND_HANDOFF §15.4) */
  active: Alert[];
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<{ id: string | null; cursor: number }>({ id: null, cursor: 0 });
  const datasetsQuery = useDatasets();
  const datasets = datasetsQuery.data;

  // Until the user picks one (or if their pick disappears), fall back to the first dataset.
  const dataset = datasets?.find((d) => d.id === selection.id) ?? datasets?.[0] ?? null;
  const runQuery = useRun(dataset?.id ?? null);
  const run = runQuery.data;

  const steps = run?.series.timestamp.length ?? 0;
  const cursor = Math.min(selection.cursor, Math.max(0, steps - 1));

  const selectDataset = useCallback((id: string) => setSelection({ id, cursor: 0 }), []);
  const setCursor = useCallback(
    (index: number) => setSelection((s) => ({ ...s, cursor: Math.max(0, Math.round(index)) })),
    [],
  );

  const cursorTime = run?.series.timestamp[cursor] ?? null;
  // Sorted once per run: replay moves the cursor many times a second.
  const sortedAlerts = useMemo(
    () => (run ? [...run.alerts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) : []),
    [run],
  );
  const { seenAlerts, active } = useMemo(() => {
    const timeSeries = run && run.dataset.mode !== "snapshot" && run.dataset.mode !== "data_only";
    if (!run || !cursorTime || !timeSeries) return { seenAlerts: [] as Alert[], active: [] as Alert[] };
    const now = Date.parse(cursorTime);
    const seen = visibleAlerts(sortedAlerts, now);
    const act = activeAlerts(seen, now);
    return { seenAlerts: seen, active: act };
  }, [run, cursorTime, sortedAlerts]);

  const value = useMemo<DatasetContextValue>(
    () => ({
      datasets,
      datasetsLoading: datasetsQuery.isPending,
      datasetsError: datasetsQuery.error,
      dataset,
      selectDataset,
      run,
      runLoading: dataset !== null && runQuery.isPending,
      runError: runQuery.error,
      cursor,
      setCursor,
      steps,
      cursorTime,
      seenAlerts,
      active,
    }),
    [datasets, datasetsQuery.isPending, datasetsQuery.error, dataset, selectDataset, run, runQuery.isPending, runQuery.error, cursor, setCursor, steps, cursorTime, seenAlerts, active],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used inside DatasetProvider");
  return ctx;
}
