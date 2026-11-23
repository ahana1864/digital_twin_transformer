// Raw shapes returned by the real backend (docs/openapi.json). These are NOT the frontend's
// canonical types in ../types — adapt.ts converts a response of these into those. Kept separate
// because the real API's shape (per-column timestamps, "aging"/US spelling, capitalised health
// bands, a generic columns+rows table for events/snapshot/self-test) differs enough from the
// frontend's contract that a 1:1 rename isn't enough; see api/real/adapt.ts for why.

export interface RawSeries {
  /** Sample times, ISO 8601 with offset. Shorter than a "full" column when leading/trailing
   *  values are missing (e.g. a rolling-window metric's warm-up) — never null-padded. */
  t: string[];
  /** Numeric for every column except dq_flags, which is a ";"-separated code string ("" = clean). */
  v: (number | string | null)[];
}

export interface RawGtMarkers {
  scenario_id: string;
  fault_label: string;
  fault_start: string;
}

export interface RawDatasetInfo {
  dataset_id: string;
  name: string;
  mode: string | null;
  rows: number;
  start: string | null;
  end: string | null;
  simulated: boolean;
  source: string;
  health_score: number | null;
  health_band: string | null;
  cached: boolean;
  files?: string[] | null;
}

export interface RawHealth {
  score: number;
  band: string; // "Green" | "Yellow" | "Red"
  components: Record<string, number>;
  weights: Record<string, number>;
  capped: boolean;
}

export interface RawRul {
  years_low: number;
  years_high: number;
  risk: string; // "Low" | "Med" | "High"
  consumed_days: number;
  recent_rate: number;
}

export interface RawAlert {
  id: string;
  timestamp: string;
  module: string;
  type: string;
  severity: string;
  origin: string;
  detector: string;
  value: number | null;
  threshold: number | null;
  explanation: string;
  recommendation_id: string | null;
  simulated: boolean;
  lead_time_h: number | null;
}

export interface RawRecommendation {
  id: string;
  action: string;
  test: string | null;
  urgency: string;
  rationale: string;
  alert_id: string;
  standard_ref: string | null;
}

export interface RawAnalysis {
  alerts: RawAlert[];
  recommendations: RawRecommendation[];
  health: RawHealth;
  rul: RawRul | null;
  fidelity_rmse_C: number | null;
}

export interface RawTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface RawAsset {
  asset_id: string;
  name: string;
  site?: string;
  rating_kVA: number;
  lv_voltage_V: number;
  i_rated_A: number;
  hv_voltage_V?: number;
  vector_group?: string;
  cooling?: string;
  load_loss_W?: number;
  no_load_loss_W?: number;
  insulation?: string;
  years_in_service?: number;
  breather?: string;
  nameplate_source?: string;
}

export interface RawRun {
  dataset_id: string;
  name: string;
  mode: string;
  capabilities: Record<string, boolean>;
  health_report: Record<string, unknown>;
  asset: RawAsset;
  summary: Record<string, unknown>;
  analysis: RawAnalysis;
  series: Record<string, RawSeries>;
  health_series: Record<string, RawSeries>;
  bands: Record<string, unknown[]>;
  events: RawTable;
  records: RawTable | null;
  start: string | null;
  end: string | null;
  rows_in_range: number;
  max_points: number;
  downsampled: boolean;
  gt_markers: RawGtMarkers | null;
}

export interface RawState {
  timestamp: string;
  row: Record<string, number | null>;
  twin: Record<string, number | null>;
  mode: string;
  health: RawHealth;
  alerts: RawAlert[];
  simulated: boolean;
}

// ---- POST /api/inspect, POST /api/datasets (docs/API.md "inspect_file" / "load_file") ----

export interface RawProposal {
  source: string;
  canonical: string | null;
  proposed: string | null;
  confidence: number;
  unit: string | null;
  unit_options: string[];
}

export interface RawTimestampInfo {
  column: string | null;
  format: string | null;
  parsed_ok_pct: number | null;
}

export interface RawTableInfo {
  name: string;
  role: string; // "trend" | "events" | "nameplate" | "records" | "other"
  rows: number;
  columns: string[];
}

export interface RawInspectResult {
  tables: RawTableInfo[];
  timestamp: RawTimestampInfo;
  proposals: RawProposal[];
  preview: RawTable;
  warnings: string[];
}

/** DatasetModel: the 201 response from POST /api/datasets. */
export interface RawLoadResult {
  dataset_id: string;
  mode: string;
  rows: number;
  capabilities: Record<string, boolean>;
  health_report: Record<string, unknown>;
  asset: RawAsset;
}
