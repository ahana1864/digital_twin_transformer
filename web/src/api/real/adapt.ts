// Maps the real backend's shapes (rawTypes.ts, docs/openapi.json) onto the frontend's canonical
// types (../types), the same role api/mock/index.ts plays for the mock. Kept in one file so every
// "the real API calls it X, we call it Y" decision is in one place.

import type {
  Alert,
  Asset,
  ColumnMapping,
  DataHealthReport,
  DatasetKind,
  DatasetListItem,
  GtMarkers,
  Health,
  HealthComponent,
  ImportLoadResponse,
  InspectProposal,
  Mode,
  Plausibility,
  Recommendation,
  Rul,
  SelfTest,
  SnapshotRecord,
  SourceTableInfo,
  Tag,
  ThroughFaultEvent,
} from "../types";
import type {
  RawAlert,
  RawAsset,
  RawDatasetInfo,
  RawHealth,
  RawInspectResult,
  RawLoadResult,
  RawRecommendation,
  RawRul,
  RawTable,
} from "./rawTypes";

const MODES: readonly Mode[] = ["full", "meter_only", "snapshot", "data_only"];
export const asMode = (m: string | null): Mode => (MODES as readonly string[]).includes(m ?? "") ? (m as Mode) : "data_only";

export const asBand = (b: string) => b.toLowerCase() as Health["band"];

export function datasetKind(source: string): DatasetKind {
  if (source === "generated_sim") return "scenario";
  if (source === "kaggle_real") return "real";
  return "imported";
}

export function toDatasetListItem(d: RawDatasetInfo): DatasetListItem {
  return { id: d.dataset_id, label: d.name, kind: datasetKind(d.source), simulated: d.simulated, mode: asMode(d.mode) };
}

const HEALTH_COMPONENTS: readonly HealthComponent[] = [
  "thermal",
  "ageing",
  "loading",
  "electrical",
  "integrity",
  "fault_stress",
];
function pickComponents(raw: Record<string, number>): Partial<Record<HealthComponent, number>> {
  const out: Partial<Record<HealthComponent, number>> = {};
  for (const k of HEALTH_COMPONENTS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
}

export function toHealth(h: RawHealth): Health {
  return {
    score: h.score,
    band: asBand(h.band),
    capped: h.capped,
    components: pickComponents(h.components),
    weights: pickComponents(h.weights),
  };
}

const RISK: Record<string, string> = { Low: "low", Med: "medium", High: "high" };

/** `summary` is the free-form dict on RunModel: {rul_display, life_consumed_days: {expected, actual}, ...}. */
export function toRul(r: RawRul, summary: Record<string, unknown>): Rul {
  const lifeConsumed = summary.life_consumed_days as { expected?: number; actual?: number } | undefined;
  const display = typeof summary.rul_display === "string" ? summary.rul_display : `${r.years_low}–${r.years_high} years`;
  return {
    display,
    years_low: r.years_low,
    years_high: r.years_high,
    risk: RISK[r.risk] ?? r.risk.toLowerCase(),
    life_consumed_expected_days: lifeConsumed?.expected ?? r.consumed_days,
    life_consumed_actual_days: lifeConsumed?.actual ?? r.consumed_days,
    ageing_rate_recent: r.recent_rate,
  };
}

export function toAlert(a: RawAlert): Alert {
  return a as unknown as Alert; // field names and value vocab match 1:1 (verified against openapi.json)
}

export function toRecommendation(r: RawRecommendation): Recommendation {
  return r as unknown as Recommendation; // same: 1:1 field match
}

export function toAsset(a: RawAsset): Asset {
  const tag: Tag = a.nameplate_source === "asset.yaml" ? "Confirmed" : "Estimated";
  return {
    rated_kva: a.rating_kVA,
    lv_v: a.lv_voltage_V,
    i_rated_a: a.i_rated_A,
    tags: { rated_kva: tag, lv_v: tag, i_rated_a: tag },
  };
}

export function toEvents(t: RawTable): ThroughFaultEvent[] {
  return t.rows.map((r) => ({
    timestamp: String(r.timestamp),
    event_type: String(r.event_type),
    phase: String(r.phase),
    peak_pu: (r.peak_pu as number | null) ?? null,
    duration_ms: (r.duration_ms as number | null) ?? null,
    i2t_pu2s: (r.i2t_pu2s as number | null) ?? null,
    simulated: Boolean(r.simulated),
  }));
}

/** `summary.plausibility` is `{OTI_C: "plausible"|"suspect", ...}` — no ATI equivalent is exposed. */
export function toPlausibility(summary: Record<string, unknown>): { OTI: Plausibility; ATI: Plausibility } {
  const p = summary.plausibility as { OTI_C?: string } | undefined;
  const OTI = (p?.OTI_C as Plausibility | undefined) ?? "not_checked";
  return { OTI, ATI: "not_checked" };
}

/** Sum of each source table's row count before dedup, from `health_report.dedupe`, when present. */
function sumRowsIn(dedupe: unknown): number | null {
  if (!dedupe || typeof dedupe !== "object") return null;
  const vals = Object.values(dedupe as Record<string, { rows_in?: number }>).map((d) => d.rows_in ?? 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

/**
 * `health_report` is rich for a dataset loaded through Import (mapping, unit_conversions,
 * derived, flag_counts, dedupe — verified against a live POST /api/datasets response), but just
 * `{source, scenario}` for a generated or kaggle dataset: there's no per-run ingestion report for
 * those, only for the upload that created them (never, for the built-in ones). Use the rich
 * fields when present; otherwise the honest minimum rather than invented mapping/conversions.
 */
/** `;`-joined per-row flag codes (dq_flags series) -> counts, same codes the mock always used. */
function countFlags(dqFlags: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of dqFlags) {
    if (!cell) continue;
    for (const code of cell.split(";")) counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

export function toDataHealth(
  mode: Mode,
  rows: number,
  start: string | null,
  end: string | null,
  intervalMin: number | null,
  asset: RawAsset,
  summary: Record<string, unknown>,
  healthReport: Record<string, unknown>,
  dqFlags: readonly string[],
): DataHealthReport {
  const plausibility = summary.plausibility as { OTI_C?: string } | undefined;

  const rawMapping = healthReport.mapping as
    | { source: string; canonical: string | null; unit: string | null; confidence: number | string }[]
    | undefined;
  const mapping: ColumnMapping[] = (rawMapping ?? []).map((m) => ({
    source: m.source,
    canonical: m.canonical,
    // The real mapping audit's "confidence" is provenance ("schema" = matched by column header),
    // not a score: 1 reads as "exact match" wherever the UI shows it as a percentage.
    confidence: typeof m.confidence === "number" ? m.confidence : 1,
    unit: m.unit,
  }));
  const conversions = Array.isArray(healthReport.unit_conversions)
    ? (healthReport.unit_conversions as unknown[]).map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
    : [];
  const derived = Array.isArray(healthReport.derived) ? (healthReport.derived as unknown[]).map(String) : [];
  // health_report.flag_counts only exists for a dataset loaded through Import; for a generated or
  // kaggle dataset, count the per-row dq_flags series directly instead (now that /run exposes it).
  const flagCounts = (healthReport.flag_counts as Record<string, number> | undefined) ?? countFlags(dqFlags);
  const rowsIn = sumRowsIn(healthReport.dedupe);
  const rowsClean = typeof healthReport.rows_after_cleaning === "number" ? healthReport.rows_after_cleaning : rows;

  return {
    rows_read: rowsIn ?? rowsClean,
    rows_clean: rowsClean,
    span: start && end ? { start, end } : null,
    interval_min: intervalMin,
    mapping,
    conversions,
    derived,
    flag_counts: flagCounts,
    capability_reasons: {},
    mode: typeof healthReport.mode === "string" ? asMode(healthReport.mode) : mode,
    nameplate_source:
      (healthReport.nameplate_source as string | undefined) === "asset.yaml" || asset.nameplate_source === "asset.yaml"
        ? "Confirmed"
        : "Estimated",
    plausibility_notes: plausibility?.OTI_C ? { OTI: plausibility.OTI_C } : {},
  };
}

/**
 * Fallback only: the real API now reports gt_markers directly on /run (server/app.py, from the
 * generator's own gt_fault/gt_type columns) — api/real/index.ts uses that first. This proxy (the
 * earliest asset-origin alert) only kicks in for a cached run.json built before that field
 * existed; it's a stand-in; not as exact as the real injected-fault start.
 */
export function toGtMarkers(datasetId: string, simulated: boolean, alerts: Alert[]): GtMarkers | undefined {
  if (!simulated) return undefined;
  const first = [...alerts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).find((a) => a.origin === "asset");
  if (!first) return undefined;
  return { scenario_id: datasetId, fault_label: first.type.replace(/_/g, " "), fault_start: first.timestamp };
}

const SECTION_LABEL: Record<string, string> = {
  current_trip: "Overcurrent trip",
  temperature_trip: "Temperature trip",
  software_trip_check: "Software trip check",
};

/** Self-test is a generic columns+rows table server-side; the frontend wants it pre-grouped. */
export function toSelfTest(t: RawTable): SelfTest {
  const rows: SelfTest["rows"] = [];
  const trips: SelfTest["trips"] = [];
  let oil_level: SelfTest["oil_level"] = null;

  for (const r of t.rows) {
    const section = String(r.section);
    if (section === "measurement") {
      const item = String(r.item); // "CHANNEL-A IR" / "CHANNEL-A VR" etc: quantity+phase are the last 2 chars
      const quantity = item.slice(-2, -1) as "I" | "V";
      const phase = item.slice(-1) as "R" | "Y" | "B";
      rows.push({
        quantity,
        phase,
        unit: String(r.unit),
        reference: Number(r.reference),
        software: Number(r.software),
        difference: Number(r.diff),
        pct: Number(r.diff_pct),
        pass: Boolean(r.pass),
      });
    } else if (section === "oil_level") {
      oil_level = { reference: Number(r.reference), software: Number(r.software), unit: String(r.unit), pass: Boolean(r.pass) };
    } else if (section in SECTION_LABEL) {
      trips.push({
        test: `${SECTION_LABEL[section]} — ${String(r.item)}`,
        setting: Number(r.setting ?? 0),
        unit: String(r.unit),
        applied: Number(r.software),
        tripped: Boolean(r.pass),
      });
    }
  }
  return { rows, trips, oil_level };
}

export function toSnapshotRecords(t: RawTable): SnapshotRecord[] {
  return t.rows.map((r) => ({
    record_id: String(r.record_id),
    health_score: Number(r.score),
    band: asBand(String(r.band)),
    load_pu: Number(r.load_pu),
    oti_C: (r.OTI_C as number | null) ?? null,
    twin_oil_steady_C: Number(r.twin_oil_C),
    residual_C: (r.residual_oil_C as number | null) ?? null,
    plausibility: r.implausible_rise === true ? "suspect" : r.implausible_rise === false ? "plausible" : "not_checked",
    // No per-record "worst alert" field on the real table; left honestly null (dq_flags is a data-
    // quality code, not an alert, so it isn't substituted in here).
    top_alert: null,
  }));
}

const TABLE_ROLES: readonly SourceTableInfo["role"][] = ["trend", "events", "nameplate", "records", "other"];

/** POST /api/inspect is stateless (no upload_id) — ColumnProposal/TimestampInfo already match 1:1. */
export function toInspectProposal(r: RawInspectResult): InspectProposal {
  return {
    tables: r.tables.map((t) => ({
      name: t.name,
      role: (TABLE_ROLES as readonly string[]).includes(t.role) ? (t.role as SourceTableInfo["role"]) : "other",
      rows: t.rows,
      columns: t.columns,
    })),
    timestamp: r.timestamp,
    proposals: r.proposals,
    preview: r.preview as unknown as InspectProposal["preview"], // same shape; values are JSON scalars at runtime
    warnings: r.warnings,
  };
}

export function toImportLoadResponse(r: RawLoadResult): ImportLoadResponse {
  return { dataset_id: r.dataset_id, mode: asMode(r.mode), rows: r.rows, capabilities: r.capabilities };
}
