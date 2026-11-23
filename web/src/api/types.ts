// TEMPORARY until docs/openapi.json exists. Then generate schema.d.ts with openapi-typescript
// (`npx openapi-typescript ../docs/openapi.json -o src/api/schema.d.ts`), re-export from there
// and delete this file. Shapes follow FRONTEND_HANDOFF §4.1 and §4.2.

export type Mode = "full" | "meter_only" | "snapshot" | "data_only";
export type DatasetKind = "scenario" | "real" | "imported";
export type Band = "green" | "yellow" | "red";
export type Tag = "Confirmed" | "Assumed" | "Estimated" | "To verify";
export type Plausibility = "plausible" | "suspect" | "not_checked";

// ---- §4 table: GET /api/datasets ----
export interface DatasetListItem {
  id: string;
  label: string;
  kind: DatasetKind;
  simulated: boolean;
  mode: Mode;
}

// ---- §4.2 core objects ----
export interface Alert {
  id: string;
  timestamp: string;
  module: "overloading" | "insulation" | "short_circuit" | "electrical" | "oil" | "moisture" | "data";
  type: string;
  severity: "info" | "warning" | "critical";
  origin: "asset" | "sensor";
  detector: "rule" | "residual" | "ml" | "physics";
  value: number | null;
  threshold: number | null;
  explanation: string;
  recommendation_id: string | null;
  simulated: boolean;
  lead_time_h: number | null;
  /** FRONTEND_HANDOFF §15.3/§15.9: optional, requested from P3. When set, the twin places the
   *  alert here instead of using the ALERT_TO_PART table (twin/parts.ts). */
  part?: string | null;
}

export interface Recommendation {
  id: string;
  action: string;
  test: string | null;
  urgency: "immediate" | "24h" | "7d" | "next_scheduled";
  rationale: string;
  alert_id: string;
  standard_ref: string | null;
}

export type HealthComponent =
  | "thermal"
  | "ageing"
  | "loading"
  | "electrical"
  | "integrity"
  | "fault_stress";

export interface Health {
  score: number;
  band: Band;
  capped: boolean;
  /** A missing key means that sub-score is not available. */
  components: Partial<Record<HealthComponent, number>>;
  weights: Partial<Record<HealthComponent, number>>;
}

// ---- §4.1 GET /api/runs/{id} ----
export interface Asset {
  rated_kva: number;
  lv_v: number;
  i_rated_a: number;
  tags: Record<string, Tag>;
}

/** Column arrays, same length as `timestamp`. `null` = missing value: draw a gap. */
export interface RunSeries {
  timestamp: string[];
  IR: number[];
  IY: number[];
  IB: number[];
  I_mean: number[];
  IN?: (number | null)[];
  VR?: number[];
  VY?: number[];
  VB?: number[];
  loading_pct: number[];
  amb_C: number[];
  OTI_C?: (number | null)[];
  twin_oil_C: number[];
  twin_hs_C: number[];
  residual_oil_C?: (number | null)[];
  fidelity_rmse_C?: (number | null)[];
  ageing_rate_expected: number[];
  ageing_rate_actual?: number[];
  OLI_pct?: (number | null)[];
  health_score: number[];
  dq_flags: string[];
}

export interface Rul {
  display: string;
  years_low: number;
  years_high: number;
  risk: string;
  life_consumed_expected_days: number;
  life_consumed_actual_days: number;
  ageing_rate_recent: number;
}

export interface GtMarkers {
  scenario_id: string;
  fault_label: string;
  fault_start: string;
}

export interface Run {
  dataset: { id: string; label: string; simulated: boolean; mode: Mode };
  asset: Asset;
  capabilities: Record<string, boolean>;
  series: RunSeries;
  alerts: Alert[];
  recommendations: Recommendation[];
  /** null is a guess for modes where the twin cannot run (snapshot, data_only) */
  health: Health | null;
  rul: Rul | null;
  plausibility: { OTI: Plausibility; ATI: Plausibility };
  events: ThroughFaultEvent[];
  data_health: DataHealthReport;
  gt_markers?: GtMarkers;
}

export interface RunParams {
  start?: string;
  end?: string;
  max_points?: number;
}

// ---- GUESSED: named in §4 / §6 but not spelled out. Confirm against openapi.json. ----

export interface HealthCheck {
  status: string;
  version: string;
}

/** DATA_INGESTION_SPEC §3.2 */
export interface ThroughFaultEvent {
  timestamp: string;
  event_type: string;
  phase: string;
  peak_pu: number | null;
  duration_ms: number | null;
  i2t_pu2s: number | null;
  simulated: boolean;
}

export interface ColumnMapping {
  source: string;
  canonical: string | null;
  confidence: number;
  unit: string | null;
}

/** DATA_INGESTION_SPEC §3.3, FRONTEND_HANDOFF §6.2 */
export interface DataHealthReport {
  rows_read: number;
  rows_clean: number;
  span: { start: string; end: string } | null;
  interval_min: number | null;
  mapping: ColumnMapping[];
  conversions: string[];
  derived: string[];
  flag_counts: Record<string, number>;
  /** Reason text for capabilities that are false */
  capability_reasons: Record<string, string>;
  mode: Mode;
  nameplate_source: "Confirmed" | "Assumed" | "Estimated";
  plausibility_notes: Record<string, string>;
}

/** GET /api/runs/{id}/state?t= */
export interface RunState {
  timestamp: string;
  values: Record<string, number | null>;
  active_alerts: Alert[];
  health: Health;
}

/** GET /api/runs/{id}/snapshot-table (§6.9), worst health first */
export interface SnapshotRecord {
  record_id: string;
  health_score: number;
  band: Band;
  load_pu: number;
  oti_C: number | null;
  twin_oil_steady_C: number;
  residual_C: number | null;
  plausibility: Plausibility;
  top_alert: string | null;
}

/** POST /api/inspect (docs/API.md "inspect_file"). Stateless: nothing is stored server-side —
 *  there's no upload_id, so the actual File objects must be held client-side and re-sent to
 *  POST /api/datasets to load. */
export interface ColumnProposal {
  source: string;
  /** The backend's auto-pick, already gated by confidence >= 0.6; null means "left for you". */
  canonical: string | null;
  /** The backend's best guess regardless of confidence (shown even when canonical is null). */
  proposed: string | null;
  confidence: number;
  unit: string | null;
  unit_options: string[];
}

export interface TimestampInfo {
  column: string | null;
  format: string | null;
  parsed_ok_pct: number | null;
}

export interface SourceTableInfo {
  name: string;
  role: "trend" | "events" | "nameplate" | "records" | "other";
  rows: number;
  columns: string[];
}

export interface InspectProposal {
  tables: SourceTableInfo[];
  timestamp: TimestampInfo;
  proposals: ColumnProposal[];
  preview: { columns: string[]; rows: Record<string, string | number | null>[] };
  warnings: string[];
}

/** POST /api/datasets (docs/API.md "load_file"): uploads, maps, runs the twin, registers the dataset. */
export interface ImportLoadRequest {
  files: File[];
  name?: string;
  /** Keyed by source column name; a column left out of the mapping is dropped. */
  mapping?: Record<string, { to: string; unit?: string }>;
  /** Omit for config/asset.yaml (Transformer-1); "estimate" to estimate from the data (red banner). */
  asset?: { rating_kVA?: number; lv_voltage_V?: number } | "estimate";
  /** Records with no timestamp column: spacing to assign, e.g. "15min" (ASSUMED_TIME). Omit for snapshot mode. */
  interval?: string;
}

export interface ImportLoadResponse {
  dataset_id: string;
  mode: Mode;
  rows: number;
  capabilities: Record<string, boolean>;
}

/** GET /api/selftest (§6.8). Bench settings, shown on the Self-Test page only. */
export interface SelfTest {
  rows: {
    quantity: "I" | "V";
    phase: "R" | "Y" | "B";
    unit: string;
    reference: number;
    software: number;
    difference: number;
    pct: number;
    pass: boolean;
  }[];
  trips: { test: string; setting: number; unit: string; applied: number; tripped: boolean }[];
  oil_level: { reference: number; software: number; unit: string; pass: boolean } | null;
}

/** POST /api/alerts/send */
export interface SendAlertResponse {
  delivered: boolean;
  fallback: boolean;
}
