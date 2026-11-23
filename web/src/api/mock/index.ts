// Mock backend: every endpoint in FRONTEND_HANDOFF §4 with the shapes in ../types.
// Used only with VITE_USE_MOCK=true, until the real API is reachable.

import { ApiError, type Backend } from "../backend";
import type {
  ColumnMapping,
  ColumnProposal,
  DataHealthReport,
  DatasetListItem,
  Health,
  Run,
  RunParams,
  RunSeries,
  SnapshotRecord,
} from "../types";
import { analyse, type Analysis } from "./analytics";
import { CONFIGS, FAULTS, getSim, INTERVAL_MIN, round, type Sim, type SimId } from "./sim";

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const SIM_DATASETS: (DatasetListItem & { id: SimId })[] = [
  { id: "N", label: "N · Normal", kind: "scenario", simulated: true, mode: "full" },
  { id: "S1", label: "S1 · Overload", kind: "scenario", simulated: true, mode: "full" },
  { id: "S2", label: "S2 · Cooling degradation", kind: "scenario", simulated: true, mode: "full" },
  { id: "S3", label: "S3 · Unbalance", kind: "scenario", simulated: true, mode: "full" },
  { id: "S4", label: "S4 · Oil leak vs theft", kind: "scenario", simulated: true, mode: "full" },
  { id: "S5", label: "S5 · Through-faults", kind: "scenario", simulated: true, mode: "full" },
  { id: "M", label: "S1 · Overload, meter-only", kind: "scenario", simulated: true, mode: "meter_only" },
  { id: "K", label: "Field unit, Kaggle-like (mock data)", kind: "real", simulated: false, mode: "full" },
];
const SNAPSHOT: DatasetListItem = {
  id: "SNAP",
  label: "Snapshot records (mock fixture)",
  kind: "scenario",
  simulated: true,
  mode: "snapshot",
};

const imported = new Map<string, Run>();
let sendCalls = 0;

const CAPABILITY_REASONS = {
  residual_fidelity: "No oil temperature sensor in this dataset",
  neutral_current: "No measured neutral current; proxy from unbalance",
  breathing: "No humidity channel",
  through_fault: "Needs event log",
};

const EMPTY_SERIES: RunSeries = {
  timestamp: [], IR: [], IY: [], IB: [], I_mean: [], loading_pct: [], amb_C: [],
  twin_oil_C: [], twin_hs_C: [], ageing_rate_expected: [], health_score: [], dq_flags: [],
};

const analysisCache = new Map<SimId, Analysis>();
function getAnalysis(id: SimId): Analysis {
  let a = analysisCache.get(id);
  if (!a) {
    a = analyse(getSim(id));
    analysisCache.set(id, a);
  }
  return a;
}

function simDataHealth(sim: Sim, capabilities: Record<string, boolean>, mode: Run["dataset"]["mode"]): DataHealthReport {
  const flag_counts: Record<string, number> = {};
  for (const f of sim.dq_flags) if (f) flag_counts[f] = (flag_counts[f] ?? 0) + 1;
  const field = sim.cfg.id === "K";
  if (field) flag_counts.DUP_IDENT = 14;
  const cols = ["timestamp", "IR", "IY", "IB", "VR", "VY", "VB", ...(mode === "meter_only" ? [] : ["OTI_C"]), "OLI_pct", ...(field ? ["IN"] : [])];
  return {
    rows_read: sim.n + (field ? 14 : 0),
    rows_clean: sim.n,
    span: { start: sim.timestamp[0], end: sim.timestamp[sim.n - 1] },
    interval_min: INTERVAL_MIN,
    mapping: cols.map((c) => ({ source: c, canonical: c, confidence: 1, unit: null })),
    conversions: [],
    derived: ["I_mean", "loading_pct", ...(field ? [] : ["amb_C (generated ambient)"])],
    flag_counts,
    capability_reasons: Object.fromEntries(
      Object.entries(CAPABILITY_REASONS).filter(([k]) => capabilities[k] === false),
    ),
    mode,
    nameplate_source: field ? "Estimated" : "Assumed",
    plausibility_notes: field ? { OTI: "Suspect: rise too small for an oil-filled transformer" } : {},
  };
}

function simRun(item: DatasetListItem & { id: SimId }): Run {
  const sim = getSim(item.id);
  const an = getAnalysis(item.id);
  const field = item.id === "K";
  const meter = item.mode === "meter_only";
  const fault = FAULTS[item.id];
  const capabilities = {
    residual_fidelity: !meter,
    unbalance: true,
    voltage_quality: true,
    neutral_current: field,
    oil_leak_theft: true,
    through_fault: !field,
    ageing_rul: true,
    breathing: false,
  };
  const { iRated } = CONFIGS[item.id];
  return {
    dataset: { id: item.id, label: item.label, simulated: item.simulated, mode: item.mode },
    asset: field
      ? { rated_kva: 155, lv_v: 415, i_rated_a: iRated, tags: { rated_kva: "Estimated", lv_v: "Assumed", i_rated_a: "Estimated" } }
      : { rated_kva: 1000, lv_v: 415, i_rated_a: iRated, tags: { rated_kva: "Confirmed", lv_v: "Confirmed", i_rated_a: "Confirmed" } },
    capabilities,
    series: {
      timestamp: sim.timestamp,
      IR: sim.IR,
      IY: sim.IY,
      IB: sim.IB,
      I_mean: sim.I_mean,
      ...(field ? { IN: sim.IN } : {}),
      VR: sim.VR,
      VY: sim.VY,
      VB: sim.VB,
      loading_pct: sim.loading_pct,
      amb_C: sim.amb_C,
      ...(meter ? {} : { OTI_C: sim.OTI_C }),
      twin_oil_C: sim.twin_oil_C,
      twin_hs_C: sim.twin_hs_C,
      ...(meter ? {} : { residual_oil_C: sim.residual_oil_C, fidelity_rmse_C: sim.fidelity_rmse_C }),
      ageing_rate_expected: sim.ageing_rate_expected,
      ageing_rate_actual: sim.ageing_rate_actual,
      OLI_pct: sim.OLI_pct,
      health_score: an.health_score,
      dq_flags: sim.dq_flags,
    },
    alerts: an.alerts.map((m) => m.alert),
    recommendations: an.recommendations,
    health: an.healthAt(sim.n - 1),
    rul: an.rul,
    plausibility: field
      ? { OTI: "suspect", ATI: "plausible" }
      : { OTI: meter ? "not_checked" : "plausible", ATI: "not_checked" },
    events: sim.events.map(({ index: _index, ...e }) => e),
    data_health: simDataHealth(sim, capabilities, item.mode),
    ...(fault
      ? { gt_markers: { scenario_id: item.id, fault_label: fault.label, fault_start: sim.timestamp[fault.start] } }
      : {}),
  };
}

/** `start` / `end` window, then stride downsampling to at most `max_points` (default 2000). */
function windowed(run: Run, params: RunParams = {}): Run {
  const t = run.series.timestamp;
  const ms = t.map((x) => Date.parse(x));
  const from = params.start ? Date.parse(params.start) : -Infinity;
  const to = params.end ? Date.parse(params.end) : Infinity;
  const keep: number[] = [];
  for (let i = 0; i < t.length; i++) if (ms[i] >= from && ms[i] <= to) keep.push(i);
  const stride = Math.max(1, Math.ceil(keep.length / (params.max_points ?? 2000)));
  if (keep.length === t.length && stride === 1) return run;
  const idx = keep.filter((_, k) => k % stride === 0);
  const series = Object.fromEntries(
    Object.entries(run.series).map(([k, v]) => [k, idx.map((i) => (v as unknown[])[i])]),
  ) as unknown as RunSeries;
  return { ...run, series };
}

// ---- snapshot-mode fixture: records without timestamps ----
function snapshotRecords(): SnapshotRecord[] {
  let a = 15;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const R = 10000 / 1100;
  const rows: SnapshotRecord[] = [];
  for (let k = 1; k <= 24; k++) {
    const load_pu = round(0.3 + 0.75 * rnd(), 2);
    const amb = 24 + 10 * rnd();
    const rise = 60 * ((1 + R * load_pu * load_pu) / (1 + R)) ** 0.8;
    const twin = round(amb + rise, 1);
    const missing = k === 7;
    const suspect = k === 19;
    const degraded = k % 6 === 0;
    const oti = missing ? null : round(suspect ? amb + 2 : amb + rise * (degraded ? 1.25 : 1.04) + rnd() - 0.5, 1);
    const residual = oti === null ? null : round(oti - twin, 1);
    const overload = load_pu >= 0.9;
    let score = 100 - Math.max(0, load_pu - 0.7) * 80 - (degraded ? 25 : 0);
    if (load_pu >= 1) score = Math.min(score, 40);
    score = round(score, 1);
    rows.push({
      record_id: `REC-${String(k).padStart(3, "0")}`,
      health_score: score,
      band: score >= 80 ? "green" : score >= 60 ? "yellow" : "red",
      load_pu,
      oti_C: oti,
      twin_oil_steady_C: twin,
      residual_C: suspect ? null : residual,
      plausibility: missing ? "not_checked" : suspect ? "suspect" : "plausible",
      top_alert: load_pu >= 1 ? "overload" : degraded ? "residual_drift" : overload ? "loading" : null,
    });
  }
  return rows.sort((x, y) => x.health_score - y.health_score);
}

function staticDataHealth(mode: Run["dataset"]["mode"], rows: number, mapping: ColumnMapping[], reason: string): DataHealthReport {
  return {
    rows_read: rows,
    rows_clean: rows,
    span: null,
    interval_min: null,
    mapping,
    conversions: [],
    derived: [],
    flag_counts: {},
    capability_reasons: {
      residual_fidelity: reason, unbalance: reason, voltage_quality: reason, neutral_current: reason,
      oil_leak_theft: reason, through_fault: reason, ageing_rul: reason, breathing: reason,
    },
    mode,
    nameplate_source: "Assumed",
    plausibility_notes: {},
  };
}

const TRANSFORMER_1 = {
  rated_kva: 1000,
  lv_v: 415,
  i_rated_a: 1391,
  tags: { rated_kva: "Confirmed", lv_v: "Confirmed", i_rated_a: "Confirmed" },
} as const;

function staticRun(item: DatasetListItem, rows: number, mapping: ColumnMapping[], reason: string, health: Health | null): Run {
  return {
    dataset: { id: item.id, label: item.label, simulated: item.simulated, mode: item.mode },
    asset: { ...TRANSFORMER_1, tags: { ...TRANSFORMER_1.tags } },
    capabilities: {
      residual_fidelity: false, unbalance: false, voltage_quality: false, neutral_current: false,
      oil_leak_theft: false, through_fault: false, ageing_rul: false, breathing: false,
    },
    series: EMPTY_SERIES,
    alerts: [],
    recommendations: [],
    health,
    rul: null,
    plausibility: { OTI: "not_checked", ATI: "not_checked" },
    events: [],
    data_health: staticDataHealth(item.mode, rows, mapping, reason),
  };
}

function findRun(id: string): Run {
  const item = SIM_DATASETS.find((d) => d.id === id);
  if (item) return simRun(item);
  if (id === SNAPSHOT.id) {
    return staticRun(SNAPSHOT, 24, [], "Not available: records have no timestamps (snapshot mode)", null);
  }
  const imp = imported.get(id);
  if (imp) return imp;
  throw new ApiError(404, `Dataset '${id}' not found`);
}

// DATA_INGESTION_SPEC §2.4, cut down to exact names and a few common synonyms.
const SYNONYMS: Record<string, string[]> = {
  timestamp: ["timestamp", "time", "datetime", "date"],
  IR: ["ir", "i_r", "il1", "current_r"],
  IY: ["iy", "i_y", "il2", "current_y"],
  IB: ["ib", "i_b", "il3", "current_b"],
  IN: ["in", "i_n", "inut", "neutral_current"],
  VR: ["vr", "v_r", "vl1", "voltage_r"],
  VY: ["vy", "v_y", "vl2", "voltage_y"],
  VB: ["vb", "v_b", "vl3", "voltage_b"],
  S_kVA: ["kva", "s_kva", "apparent_power"],
  loading_pct: ["loading", "loading_pct", "load_pct"],
  OTI_C: ["oti", "oti_c", "top_oil", "oil_temp"],
  WTI_C: ["wti", "wti_c", "winding_temp"],
  ATI_C: ["ati", "ati_c", "ambient", "amb_c"],
  OLI_pct: ["oli", "oli_pct", "oil_level"],
};

const UNIT_OPTIONS: Record<string, string[]> = {
  IR: ["A", "kA"], IY: ["A", "kA"], IB: ["A", "kA"], IN: ["A", "kA"],
  VR: ["V", "kV"], VY: ["V", "kV"], VB: ["V", "kV"],
  OTI_C: ["°C", "°F", "K"], WTI_C: ["°C", "°F", "K"], ATI_C: ["°C", "°F", "K"],
  loading_pct: ["%", "fraction"], OLI_pct: ["%", "fraction"],
};

/** CSV only (DATA_INGESTION_SPEC Tier 1 subset the mock reads); real Excel/Tier-2 needs the real backend. */
async function readCsv(files: File[]) {
  if (files.length === 0) throw new ApiError(400, "No file uploaded");
  const file = files[0];
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
    throw new ApiError(415, `The mock backend reads CSV only; '${file.name}' needs the real server`);
  }
  const lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new ApiError(400, `'${file.name}' has no data rows`);
  const sep = [",", ";", "\t"].sort((x, y) => lines[0].split(y).length - lines[0].split(x).length)[0];
  const header = lines[0].split(sep).map((h) => h.trim());
  const dataLines = lines.slice(1);
  const previewRows = dataLines.slice(0, 10).map((l) => {
    const cells = l.split(sep);
    return Object.fromEntries(
      header.map((h, k) => {
        const raw = (cells[k] ?? "").trim();
        const num = Number(raw);
        return [h, raw === "" ? null : Number.isNaN(num) ? raw : num];
      }),
    );
  });
  return { header, dataLines, previewRows };
}

export const mockBackend: Backend = {
  async health() {
    await delay();
    return { status: "ok", version: "mock" };
  },

  async datasets() {
    await delay();
    const imports = [...imported.values()].map((r) => ({ ...r.dataset, kind: "imported" as const }));
    return [...SIM_DATASETS, SNAPSHOT, ...imports];
  },

  async run(id, params) {
    await delay();
    return windowed(findRun(id), params);
  },

  async runState(id, t) {
    await delay(40);
    const sim = SIM_DATASETS.some((d) => d.id === id) ? getSim(id as SimId) : null;
    if (!sim) throw new ApiError(400, `Dataset '${id}' has no time series: state at a time is not available`);
    const target = Date.parse(t);
    if (Number.isNaN(target)) throw new ApiError(400, `Invalid time '${t}'`);
    const start = Date.parse(sim.timestamp[0]);
    const i = Math.min(sim.n - 1, Math.max(0, Math.floor((target - start) / (INTERVAL_MIN * 60_000))));
    const an = getAnalysis(sim.cfg.id);
    const series = simRun(SIM_DATASETS.find((d) => d.id === id)!).series;
    const values: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(series)) {
      const x = (v as unknown[])[i];
      if (typeof x === "number" || x === null) values[k] = x;
    }
    return {
      timestamp: sim.timestamp[i],
      values,
      active_alerts: an.alerts.filter((m) => !m.repeat && m.start <= i && (m.end === null || i < m.end)).map((m) => m.alert),
      health: an.healthAt(i),
    };
  },

  async snapshotTable(id) {
    await delay();
    if (id !== SNAPSHOT.id) throw new ApiError(400, `Dataset '${id}' is not in snapshot mode`);
    return snapshotRecords();
  },

  async reportPdf() {
    await delay();
    throw new ApiError(501, "PDF report is not available from the mock backend");
  },

  async selfTest() {
    await delay();
    const row = (quantity: "I" | "V", phase: "R" | "Y" | "B", reference: number, software: number) => {
      const difference = round(software - reference, 2);
      const pct = round((Math.abs(difference) / reference) * 100, 2);
      return { quantity, phase, unit: quantity === "I" ? "A" : "V", reference, software, difference, pct, pass: pct <= 1 };
    };
    return {
      rows: [
        row("I", "R", 25, 25.08), row("I", "Y", 25, 24.91), row("I", "B", 25, 25.12),
        row("V", "R", 240, 240.6), row("V", "Y", 240, 239.5), row("V", "B", 240, 240.9),
      ],
      trips: [
        { test: "Overcurrent trip", setting: 50, unit: "A", applied: 50.4, tripped: true },
        { test: "Temperature trip", setting: 60, unit: "°C", applied: 60.3, tripped: true },
      ],
      oil_level: { reference: 80, software: 79.6, unit: "%", pass: true },
    };
  },

  async sendAlert() {
    await delay();
    // The mock alternates (fallback, then delivered) so both outcomes can be seen in the UI.
    sendCalls += 1;
    return sendCalls % 2 === 1 ? { delivered: false, fallback: true } : { delivered: true, fallback: false };
  },

  async importInspect(files) {
    await delay();
    const { header, dataLines, previewRows } = await readCsv(files);
    const proposals: ColumnProposal[] = header.map((source) => {
      const unit = /[([]\s*([^)\]]+)\s*[)\]]/.exec(source)?.[1] ?? null;
      const norm = source.replace(/[([].*$/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const hit = Object.entries(SYNONYMS).find(([, names]) => names.includes(norm));
      const exact = hit && hit[0].toLowerCase() === norm;
      const confidence = hit ? (exact ? 0.95 : 0.8) : 0;
      const proposed = hit?.[0] ?? null;
      return {
        source,
        canonical: confidence >= 0.6 ? proposed : null,
        proposed,
        confidence,
        unit,
        unit_options: proposed ? (UNIT_OPTIONS[proposed] ?? []) : [],
      };
    });
    const timestampCol = proposals.find((p) => p.canonical === "timestamp")?.source ?? null;
    const warnings = previewRows
      .flatMap((row) =>
        proposals.flatMap((p) => {
          const v = p.canonical === "loading_pct" ? Number(row[p.source]) : NaN;
          return v > 150 ? [`Loading ${v}%: check units`] : [];
        }),
      )
      .filter((w, i, all) => all.indexOf(w) === i);
    if (!timestampCol) warnings.push("No time column: loads in snapshot mode (or pass an interval to assign times)");
    return {
      tables: [{ name: files[0].name, role: timestampCol ? "trend" : "records", rows: dataLines.length, columns: header }],
      timestamp: { column: timestampCol, format: timestampCol ? "iso" : null, parsed_ok_pct: timestampCol ? 100 : 0 },
      proposals,
      preview: { columns: header, rows: previewRows },
      warnings,
    };
  },

  async importLoad(req) {
    await delay();
    const { header, dataLines } = await readCsv(req.files);
    const mapping: ColumnMapping[] = header.map((source) => {
      const m = req.mapping?.[source];
      return { source, canonical: m?.to ?? null, confidence: m ? 1 : 0, unit: m?.unit ?? null };
    });
    const hasTime = mapping.some((m) => m.canonical === "timestamp");
    const id = `imp-${imported.size + 1}`;
    // The mock has no adapter or twin: a file with a time column (or assigned times) still can't
    // run the twin, so it's data-only; one without a time column and no assigned interval is
    // snapshot mode instead.
    const mode: Run["dataset"]["mode"] = hasTime || req.interval ? "data_only" : "snapshot";
    imported.set(
      id,
      staticRun(
        { id, label: `${req.name ?? req.files[0].name} (mock import)`, kind: "imported", simulated: false, mode },
        dataLines.length,
        mapping,
        "Not available: the mock backend cannot run the twin on imported files",
        null,
      ),
    );
    return { dataset_id: id, mode, rows: dataLines.length, capabilities: imported.get(id)!.capabilities };
  },
};
