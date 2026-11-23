// Real backend (server/app.py). Talks to the actual REST API and adapts its shapes (rawTypes.ts)
// onto the frontend's canonical types (../types) via adapt.ts, the same role api/mock/index.ts
// plays for the mock. See api/real/windowedFetch.ts for why /run needs more than one HTTP call.

import { http, json, query } from "../http";
import type { Backend } from "../backend";
import type {
  DataHealthReport,
  HealthCheck,
  ImportLoadRequest,
  ImportLoadResponse,
  InspectProposal,
  Run,
  RunParams,
  RunSeries,
  RunState,
  SelfTest,
  SendAlertResponse,
  SnapshotRecord,
} from "../types";
import {
  asMode,
  toAlert,
  toAsset,
  toDataHealth,
  toDatasetListItem,
  toEvents,
  toGtMarkers,
  toHealth,
  toImportLoadResponse,
  toInspectProposal,
  toPlausibility,
  toRecommendation,
  toRul,
  toSelfTest,
  toSnapshotRecords,
} from "./adapt";
import type { RawDatasetInfo, RawInspectResult, RawLoadResult, RawRun, RawState, RawTable } from "./rawTypes";
import { fetchAlignedMulti, type AlignedSeries } from "./windowedFetch";

const MAX_POINTS = 2000;

function dictToAligned(dict: Record<string, { t: string[]; v: (number | string | null)[] }>): AlignedSeries {
  let longest: string[] = [];
  for (const col of Object.values(dict)) if (col.t.length > longest.length) longest = col.t;
  const columns: Record<string, (number | string | null)[]> = {};
  for (const [key, col] of Object.entries(dict)) {
    const byT = new Map(col.t.map((t, i) => [t, col.v[i]]));
    columns[key] = longest.map((t) => byT.get(t) ?? null);
  }
  return { timestamp: longest, columns };
}

const fetchRunPage = (id: string, start?: string, end?: string, maxPoints = MAX_POINTS) =>
  http<RawRun>(`/datasets/${encodeURIComponent(id)}/run${query({ start, end, max_points: maxPoints })}`);

/** Interval between samples, in minutes, from the first two canonical timestamps. */
function intervalMinutes(t: string[]): number | null {
  if (t.length < 2) return null;
  const ms = Date.parse(t[1]) - Date.parse(t[0]);
  return ms > 0 ? Math.round(ms / 60_000) : null;
}

async function run(id: string, _params: RunParams = {}): Promise<Run> {
  // The frontend always wants the whole run (RUN_PARAMS only sets max_points, never a window) —
  // this ignores `_params`. `analysis`/`asset`/`capabilities`/`summary`/`start`/`end`/
  // `rows_in_range` are the same regardless of the requested window or max_points (verified
  // against the live backend), but the *series payload* isn't used when it'll be downsampled
  // anyway — and that payload is most of the response time (measured on the live backend:
  // max_points=2000 ~3s, max_points=2 ~0.2s, same 2880-row dataset). So probe with a tiny
  // max_points first just for the metadata, then fetch series only once we know how.
  const PROBE_POINTS = 10; // server minimum for max_points
  const meta = await fetchRunPage(id, undefined, undefined, PROBE_POINTS);

  let seriesAligned: AlignedSeries;
  let healthAligned: AlignedSeries;
  if (meta.rows_in_range <= MAX_POINTS || !meta.start || !meta.end) {
    // Small enough for one undownsampled call — re-fetch with the real series this time.
    const full = meta.rows_in_range === PROBE_POINTS ? meta : await fetchRunPage(id);
    seriesAligned = dictToAligned(full.series);
    healthAligned = dictToAligned(full.health_series);
  } else {
    const aligned = await fetchAlignedMulti(meta.start, meta.end, meta.rows_in_range, ["series", "health_series"], async (s, e) => {
      const page = await fetchRunPage(id, s, e);
      return {
        dicts: { series: page.series, health_series: page.health_series },
        rows_in_range: page.rows_in_range,
        downsampled: page.downsampled,
      };
    });
    seriesAligned = aligned.series;
    healthAligned = aligned.health_series;
  }

  const timestamp = seriesAligned.timestamp;
  const col = seriesAligned.columns;
  const healthScoreByT = new Map(healthAligned.timestamp.map((t, i) => [t, healthAligned.columns.score?.[i] ?? null]));

  const series = {
    timestamp,
    IR: col.IR ?? [],
    IY: col.IY ?? [],
    IB: col.IB ?? [],
    I_mean: col.I_mean ?? [],
    IN: col.IN,
    VR: col.VR,
    VY: col.VY,
    VB: col.VB,
    loading_pct: col.loading_pct ?? [],
    amb_C: col.amb_C ?? [],
    OTI_C: col.OTI_C,
    twin_oil_C: col.twin_oil_C ?? [],
    twin_hs_C: col.twin_hs_C ?? [],
    residual_oil_C: col.residual_oil_C,
    fidelity_rmse_C: col.fidelity_rmse_C,
    // US spelling on the wire ("aging"); the frontend's contract spells it "ageing" throughout.
    ageing_rate_expected: col.aging_rate ?? [],
    ageing_rate_actual: col.aging_rate_actual,
    OLI_pct: col.OLI_pct,
    health_score: timestamp.map((t) => healthScoreByT.get(t) ?? null),
    dq_flags: (col.dq_flags as (string | null)[] | undefined)?.map((v) => v ?? "") ?? timestamp.map(() => ""),
  } as unknown as RunSeries;

  // RunModel has no `simulated` flag of its own (only DatasetInfoModel does) — one extra, cheap,
  // server-cached call rather than guessing from alerts (a clean "all normal" dataset has none).
  const list = await http<RawDatasetInfo[]>("/datasets");
  const info = list.find((d) => d.dataset_id === id);
  const simulated = info?.simulated ?? meta.health_report?.scenario !== undefined;

  const alerts = meta.analysis.alerts.map(toAlert);
  const mode = asMode(meta.mode);

  return {
    dataset: { id: meta.dataset_id, label: meta.name, simulated, mode },
    asset: toAsset(meta.asset),
    capabilities: meta.capabilities,
    series,
    alerts,
    recommendations: meta.analysis.recommendations.map(toRecommendation),
    health: toHealth(meta.analysis.health),
    rul: meta.analysis.rul ? toRul(meta.analysis.rul, meta.summary) : null,
    plausibility: toPlausibility(meta.summary),
    events: toEvents(meta.events),
    data_health: toDataHealth(
      mode,
      meta.rows_in_range,
      meta.start,
      meta.end,
      intervalMinutes(timestamp),
      meta.asset,
      meta.summary,
      meta.health_report,
      series.dq_flags,
    ) satisfies DataHealthReport,
    // The real API now reports this directly (the generator's own gt_fault/gt_type columns);
    // fall back to the alert-based proxy only if an older cached run.json predates that field.
    gt_markers: meta.gt_markers ?? toGtMarkers(meta.dataset_id, simulated, alerts),
  };
}

async function runState(id: string, t: string): Promise<RunState> {
  const s = await http<RawState>(`/datasets/${encodeURIComponent(id)}/state${query({ t })}`);
  return {
    timestamp: s.timestamp,
    values: { ...s.row, ...s.twin },
    active_alerts: s.alerts.map(toAlert),
    health: toHealth(s.health),
  };
}

async function snapshotTable(id: string): Promise<SnapshotRecord[]> {
  const t = await http<RawTable>(`/datasets/${encodeURIComponent(id)}/snapshot`);
  return toSnapshotRecords(t);
}

async function selfTest(): Promise<SelfTest> {
  const t = await http<RawTable>("/self-test");
  return toSelfTest(t);
}

// POST /api/inspect is stateless: nothing is kept server-side, so there's no upload_id — the
// actual File objects are held in Import.tsx's state and re-sent here on import.importLoad.
async function importInspect(files: File[]): Promise<InspectProposal> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const raw = await http<RawInspectResult>("/inspect", { method: "POST", body: form });
  return toInspectProposal(raw);
}

async function importLoad(req: ImportLoadRequest): Promise<ImportLoadResponse> {
  const form = new FormData();
  for (const f of req.files) form.append("files", f);
  if (req.name) form.append("name", req.name);
  if (req.mapping) {
    const mapping = Object.fromEntries(
      Object.entries(req.mapping).map(([source, m]) => [source, { to: m.to, ...(m.unit ? { unit: m.unit } : {}) }]),
    );
    form.append("mapping", JSON.stringify(mapping));
  }
  if (req.asset) form.append("asset", req.asset === "estimate" ? "estimate" : JSON.stringify(req.asset));
  if (req.interval) form.append("interval", req.interval);
  const raw = await http<RawLoadResult>("/datasets", { method: "POST", body: form });
  return toImportLoadResponse(raw);
}

export const realBackend: Backend = {
  health: () => http<{ status: string }>("/health").then((h) => ({ status: h.status, version: "" }) satisfies HealthCheck),
  datasets: () => http<RawDatasetInfo[]>("/datasets").then((list) => list.map(toDatasetListItem)),
  run,
  runState,
  snapshotTable,
  selfTest,
  reportPdf: (id) => http<Blob>(`/datasets/${encodeURIComponent(id)}/report.pdf`, undefined, "blob"),
  importInspect,
  importLoad,
  sendAlert: (body) => http<SendAlertResponse>("/alerts/send", json(body)),
};
