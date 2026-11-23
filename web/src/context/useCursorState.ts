import { useEffect, useState } from "react";
import { useRunState } from "../api/client";
import { useDataset } from "./DatasetContext";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Server-computed state (health index and sub-scores) at the cursor: GET /runs/{id}/state?t= */
export function useCursorState() {
  const { run, cursorTime } = useDataset();
  const t = useDebounced(cursorTime, 150);
  const timeSeries = run && run.dataset.mode !== "snapshot" && run.dataset.mode !== "data_only";
  return useRunState(timeSeries ? run.dataset.id : null, timeSeries ? t : null);
}
