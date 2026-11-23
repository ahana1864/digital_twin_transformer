// TanStack Query hooks for the endpoints in FRONTEND_HANDOFF §4. VITE_USE_MOCK=true swaps in the
// frontend-only mock (api/mock); otherwise calls go to the real backend (api/real), adapted from
// its actual shapes (docs/openapi.json) onto ../types — see api/real/adapt.ts for the mapping and
// api/real/windowedFetch.ts for why /run takes more than one HTTP call.

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";
import type { Backend } from "./backend";
import type { ImportLoadRequest, RunParams } from "./types";

export { ApiError };
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Dynamic import keeps each backend's own module (and the mock's generator code) out of the
// other build.
const backend: Promise<Backend> = USE_MOCK
  ? import("./mock").then((m) => m.mockBackend)
  : import("./real").then((m) => m.realBackend);

const call =
  <K extends keyof Backend>(method: K) =>
  (...args: Parameters<Backend[K]>): ReturnType<Backend[K]> =>
    backend.then((b) => (b[method] as (...a: unknown[]) => unknown)(...args)) as ReturnType<Backend[K]>;

export const api: Backend = {
  health: call("health"),
  datasets: call("datasets"),
  importInspect: call("importInspect"),
  importLoad: call("importLoad"),
  run: call("run"),
  runState: call("runState"),
  snapshotTable: call("snapshotTable"),
  reportPdf: call("reportPdf"),
  selfTest: call("selfTest"),
  sendAlert: call("sendAlert"),
};

/** Message to show the user for any query/mutation error. */
export const errorDetail = (e: unknown) =>
  e instanceof ApiError ? e.detail : e instanceof Error ? e.message : "Unexpected error";

// The run is fetched once and replayed client-side (§8), so ask for more points than the
// 2000 default: built-in scenarios are 2880 rows.
const RUN_PARAMS: RunParams = { max_points: 3000 };

export const keys = {
  health: ["health"] as const,
  datasets: ["datasets"] as const,
  run: (id: string) => ["run", id] as const,
  state: (id: string, t: string) => ["run", id, "state", t] as const,
  snapshotTable: (id: string) => ["run", id, "snapshot-table"] as const,
  selfTest: ["selftest"] as const,
};

/** Polls the backend; drives the "Backend offline" banner. */
export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, retry: false, refetchInterval: 10_000, staleTime: 0 });

export const useDatasets = () => useQuery({ queryKey: keys.datasets, queryFn: api.datasets });

export const useRun = (id: string | null) =>
  useQuery({
    queryKey: keys.run(id ?? ""),
    queryFn: () => api.run(id!, RUN_PARAMS),
    enabled: id !== null,
  });

export const useRunState = (id: string | null, t: string | null) =>
  useQuery({
    queryKey: keys.state(id ?? "", t ?? ""),
    queryFn: () => api.runState(id!, t!),
    enabled: id !== null && t !== null,
    placeholderData: keepPreviousData,
  });

export const useSnapshotTable = (id: string | null, enabled = true) =>
  useQuery({
    queryKey: keys.snapshotTable(id ?? ""),
    queryFn: () => api.snapshotTable(id!),
    enabled: id !== null && enabled,
  });

/** Fetched once so the Download button can be disabled ("Coming soon") while the report is a stub. */
export const useReport = (id: string | null) =>
  useQuery({
    queryKey: ["run", id ?? "", "report"] as const,
    queryFn: () => api.reportPdf(id!),
    enabled: id !== null,
    retry: false,
    staleTime: 10 * 60_000,
  });

export const useSelfTest = () => useQuery({ queryKey: keys.selfTest, queryFn: api.selfTest });

export const useImportInspect = () => useMutation({ mutationFn: (files: File[]) => api.importInspect(files) });

export const useImportLoad = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ImportLoadRequest) => api.importLoad(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.datasets }),
  });
};

export const useSendAlert = () => useMutation({ mutationFn: api.sendAlert });
