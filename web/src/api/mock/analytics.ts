// Mock analytics. Stands in for the backend's analytics/ pipeline (alerts, recommendations,
// health index, RUL) until the real API is reachable. Thresholds: FINAL_PRD §9; recommendations:
// §8.10; health index: §8.8; RUL: §8.9. Anything not in the PRD is marked "mock assumption".

import type { Alert, Health, HealthComponent, Recommendation, Rul } from "../types";
import { DAY, getSim, round, type Sim } from "./sim";

const T = {
  loading_warn_pct: 90,
  loading_alarm_pct: 100,
  top_oil_warn_C: 85,
  top_oil_crit_C: 95,
  hot_spot_warn_C: 98,
  hot_spot_crit_C: 120,
  unbalance_warn_pct: 10,
  unbalance_alarm_pct: 20,
  v_unbalance_alarm_pct: 2,
  oil_level_low_pct: 85,
  theft_step_points: 8,
  leak_points_per_day: 2, // mock assumption
  residual_sigma: 4,
  residual_persist_steps: 8, // 2 h
  residual_crit_factor: 2, // mock assumption: critical at 2× the alert level
  moderate_pu: 3,
  severe_pu: 8,
  fault_count: 3,
  hysteresis: 0.95,
};

/** Internal alert: the API shape plus the episode window the mock uses for health and /state. */
export interface MockAlert {
  alert: Alert;
  start: number;
  /** Exclusive; null = still active at the end of the run */
  end: number | null;
  /** Re-fire of a persisting condition: in the alert list, but not a separate episode */
  repeat?: boolean;
}

export interface Analysis {
  alerts: MockAlert[];
  recommendations: Recommendation[];
  healthAt: (i: number) => Health;
  health_score: number[];
  rul: Rul;
  residualThreshold: number;
}

type Rec = Omit<Recommendation, "id" | "alert_id">;
const REC = {
  overload: {
    action: "Review load and transfer where possible; check cooling",
    test: "Inspection",
    urgency: "24h",
    rationale: "Sustained overload raises hot-spot temperature and ageing rate",
    standard_ref: "IEC 60076-7",
  },
  cooling: {
    action: "Inspect radiators/cooling; check oil level",
    test: null,
    urgency: "7d",
    rationale: "Measured top-oil stays above the twin at the same load and ambient",
    standard_ref: "IEC 60076-7",
  },
  unbalance: {
    action: "Rebalance single-phase loads; check connections and neutral",
    test: null,
    urgency: "7d",
    rationale: "Phase current unbalance above limit",
    standard_ref: null,
  },
  leak: {
    action: "Oil leakage check",
    test: "Insulation resistance test",
    urgency: "24h",
    rationale: "Oil level falling steadily over hours/days",
    standard_ref: null,
  },
  theft: {
    action: "Site inspection for theft/tampering",
    test: null,
    urgency: "immediate",
    rationale: "Sudden night-time oil level drop with no thermal cause",
    standard_ref: null,
  },
  throughFault: {
    action: "Measure short-circuit impedance (%X) and compare with the IS 1180 acceptance limit",
    test: "Short-circuit impedance (%X) measurement",
    urgency: "7d",
    rationale: "Through-fault stress count crossed",
    standard_ref: "IS 1180",
  },
  sensor: {
    action: "Check sensor wiring/calibration; not the transformer",
    test: null,
    urgency: "24h",
    rationale: "Reading is physically implausible for the asset",
    standard_ref: null,
  },
} satisfies Record<string, Rec>;

/** Hysteresis episodes: trips at `trip`, clears at `clear`. */
function episodes(n: number, trip: (i: number) => boolean, clear: (i: number) => boolean) {
  const out: [start: number, end: number | null][] = [];
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (start < 0 && trip(i)) start = i;
    else if (start >= 0 && clear(i)) {
      out.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, null]);
  return out;
}

function rollingMean(v: (number | null)[], w: number) {
  const out: (number | null)[] = [];
  let sum = 0;
  let count = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    if (a !== null) {
      sum += a;
      count++;
    }
    const d = i >= w ? v[i - w] : null;
    if (d !== null) {
      sum -= d;
      count--;
    }
    out.push(count >= w / 2 ? sum / count : null);
  }
  return out;
}

function residualThreshold(baseline: Sim) {
  const m = rollingMean(baseline.residual_oil_C, T.residual_persist_steps).filter(
    (x): x is number => x !== null,
  );
  const mean = m.reduce((a, b) => a + b, 0) / m.length;
  const sd = Math.sqrt(m.reduce((a, b) => a + (b - mean) ** 2, 0) / m.length);
  return mean + T.residual_sigma * sd;
}

const lin = (x: number, good: number, bad: number) =>
  Math.min(100, Math.max(0, ((x - bad) / (good - bad)) * 100));

export function analyse(sim: Sim): Analysis {
  const { n } = sim;
  const ds = sim.cfg.id;
  const simulated = ds !== "K";
  const alerts: MockAlert[] = [];
  const recommendations: Recommendation[] = [];
  const counts: Record<string, number> = {};

  const add = (
    start: number,
    end: number | null,
    a: Pick<Alert, "module" | "type" | "severity" | "detector" | "value" | "threshold" | "explanation"> &
      Partial<Pick<Alert, "origin">>,
    rec: Rec | null,
  ) => {
    counts[a.type] = (counts[a.type] ?? 0) + 1;
    const id = `${ds}-${a.type}-${counts[a.type]}`;
    const recommendation_id = rec ? `R-${id}` : null;
    if (rec) recommendations.push({ id: recommendation_id!, alert_id: id, ...rec });
    alerts.push({
      start,
      end,
      alert: {
        id,
        timestamp: sim.timestamp[start],
        origin: "asset",
        ...a,
        recommendation_id,
        simulated,
        lead_time_h: null,
      },
    });
  };

  /** Two-level "high is bad" rule with hysteresis. */
  const highRule = (
    v: (number | null)[],
    levels: { thr: number; severity: "warning" | "critical"; type: string }[],
    meta: { module: Alert["module"]; what: string; unit: string; rec: Rec },
  ) => {
    for (const { thr, severity, type } of levels) {
      for (const [start, end] of episodes(
        n,
        (i) => (v[i] ?? -Infinity) >= thr,
        (i) => v[i] !== null && v[i]! < thr * T.hysteresis,
      )) {
        add(
          start,
          end,
          {
            module: meta.module,
            type,
            severity,
            detector: "rule",
            value: round(v[start]!, 1),
            threshold: thr,
            explanation: `${meta.what} ${round(v[start]!, 1)} ${meta.unit} reached the ${severity} limit of ${thr} ${meta.unit}`,
          },
          meta.rec,
        );
      }
    }
  };

  highRule(
    sim.loading_pct,
    [
      { thr: T.loading_warn_pct, severity: "warning", type: "loading" },
      { thr: T.loading_alarm_pct, severity: "critical", type: "overload" },
    ],
    { module: "overloading", what: "Loading", unit: "%", rec: REC.overload },
  );
  highRule(
    sim.hs_actual_C,
    [
      { thr: T.hot_spot_warn_C, severity: "warning", type: "hot_spot" },
      { thr: T.hot_spot_crit_C, severity: "critical", type: "hot_spot" },
    ],
    { module: "overloading", what: "Hot-spot temperature", unit: "°C", rec: REC.overload },
  );
  highRule(
    sim.OTI_C,
    [
      { thr: T.top_oil_warn_C, severity: "warning", type: "top_oil" },
      { thr: T.top_oil_crit_C, severity: "critical", type: "top_oil" },
    ],
    { module: "overloading", what: "Top-oil temperature", unit: "°C", rec: REC.overload },
  );
  highRule(
    sim.unbalance_pct,
    [
      { thr: T.unbalance_warn_pct, severity: "warning", type: "unbalance" },
      { thr: T.unbalance_alarm_pct, severity: "critical", type: "unbalance" },
    ],
    { module: "electrical", what: "Current unbalance", unit: "%", rec: REC.unbalance },
  );
  highRule(
    sim.v_unbalance_pct,
    [{ thr: T.v_unbalance_alarm_pct, severity: "warning", type: "voltage_unbalance" }],
    { module: "electrical", what: "Voltage unbalance", unit: "%", rec: REC.unbalance },
  );

  // Residual drift: rolling 2 h mean of (measured − twin) against a level set from the baseline.
  const thr = round(residualThreshold(ds === "K" ? sim : getSim("N")), 2);
  const resid = rollingMean(sim.residual_oil_C, T.residual_persist_steps);
  const persist = T.residual_persist_steps;
  // Persistent: the 2 h mean has been above the level for a further 2 h.
  const above = (i: number, level: number) => {
    for (let j = i - persist; j <= i; j++) if ((resid[j] ?? -Infinity) <= level) return false;
    return true;
  };
  for (const [factor, severity] of [
    [1, "warning"],
    [T.residual_crit_factor, "critical"],
  ] as const) {
    for (const [start, end] of episodes(
      n,
      (i) => i >= persist && above(i, thr * factor),
      (i) => resid[i] !== null && resid[i]! < thr * factor * T.hysteresis,
    )) {
      add(
        start,
        end,
        {
          module: "overloading",
          type: "residual_drift",
          severity,
          detector: "residual",
          value: round(resid[start]!, 1),
          threshold: round(thr * factor, 1),
          explanation: `Measured oil ${round(resid[start]!, 1)} °C above twin for 2 h (alert level ${round(thr * factor, 1)} °C)`,
        },
        REC.cooling,
      );
    }
  }

  if (ds !== "K") {
    // Theft: step of ≥ 8 points within 1 h with no thermal cause.
    const oli = sim.OLI_pct;
    for (const [start] of episodes(
      n,
      (i) => i >= 4 && oli[i - 4] - oli[i] >= T.theft_step_points && Math.abs(sim.OTI_raw[i - 4] - sim.OTI_raw[i]) < 5,
      (i) => i >= 4 && oli[i - 4] - oli[i] < T.theft_step_points,
    )) {
      add(
        start,
        null,
        {
          module: "oil",
          type: "oil_theft",
          severity: "critical",
          detector: "rule",
          value: round(oli[start - 4] - oli[start], 1),
          threshold: T.theft_step_points,
          explanation: `Oil level dropped ${round(oli[start - 4] - oli[start], 1)} points within 1 h with no thermal cause: possible theft/tampering`,
        },
        REC.theft,
      );
    }
    // Leak: slow slope over 24 h on the level with thermal expansion and step losses taken out,
    // so a weekend load drop or a theft step is not read as a leak.
    const comp: number[] = [];
    let steps = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0 && oli[i - 1] - oli[i] > 3) steps += oli[i - 1] - oli[i];
      comp.push(oli[i] + steps - 0.1 * (sim.OTI_raw[i] - 45));
    }
    const smooth = rollingMean(comp, 8);
    const drop = (i: number) => (i >= DAY ? (smooth[i - DAY] ?? comp[i - DAY]) - (smooth[i] ?? comp[i]) : 0);
    for (const [start, end] of episodes(
      n,
      (i) => drop(i) >= T.leak_points_per_day,
      (i) => drop(i) < T.leak_points_per_day * T.hysteresis,
    )) {
      add(
        start,
        end,
        {
          module: "oil",
          type: "oil_leak",
          severity: "warning",
          detector: "rule",
          value: round(drop(start), 1),
          threshold: T.leak_points_per_day,
          explanation: `Oil level fell ${round(drop(start), 1)} points in 24 h: slow loss consistent with a leak`,
        },
        REC.leak,
      );
    }
    for (const [start, end] of episodes(
      n,
      (i) => oli[i] < T.oil_level_low_pct,
      (i) => oli[i] > T.oil_level_low_pct / T.hysteresis,
    )) {
      add(
        start,
        end,
        {
          module: "oil",
          type: "oil_level_low",
          severity: "warning",
          detector: "rule",
          value: round(oli[start], 1),
          threshold: T.oil_level_low_pct,
          explanation: `Oil level ${round(oli[start], 1)} % is below the low-level limit of ${T.oil_level_low_pct} %`,
        },
        REC.leak,
      );
    }
  } else {
    // Field unit: the oil-level trend has no thermal or load cause, so it is treated as gauge drift.
    const start = 14 * DAY;
    add(
      start,
      null,
      {
        module: "data",
        type: "oli_drift",
        severity: "warning",
        origin: "sensor",
        detector: "physics",
        value: round(sim.OLI_pct[start], 1),
        threshold: null,
        explanation: "Oil level drifts down steadily with no matching thermal or load change: gauge drift suspected",
      },
      REC.sensor,
    );
  }

  // Through-faults: from the event table only.
  let moderate = 0;
  let severe = 0;
  for (const e of sim.events) {
    const peak = e.peak_pu ?? 0;
    if (peak < T.moderate_pu) continue;
    const isSevere = peak >= T.severe_pu;
    if (isSevere) severe++;
    else moderate++;
    const crossed = severe >= 1 || moderate >= T.fault_count;
    add(
      e.index,
      null,
      {
        module: "short_circuit",
        type: "through_fault",
        severity: isSevere ? "critical" : "warning",
        detector: "rule",
        value: peak,
        threshold: isSevere ? T.severe_pu : T.moderate_pu,
        explanation:
          `Through-fault ${peak} pu for ${e.duration_ms} ms on ${e.phase} (I²t ${e.i2t_pu2s} pu²s); ` +
          `${severe} severe, ${moderate} moderate since reset`,
      },
      crossed ? REC.throughFault : null,
    );
  }

  // Sensor faults from dq_flags (FINAL_PRD §8.6).
  for (const [start, end] of episodes(
    n,
    (i) => sim.dq_flags[i] !== "",
    (i) => sim.dq_flags[i] === "",
  )) {
    const jump = sim.dq_flags[start] === "JUMP_OTI";
    const step = round(Math.abs(sim.OTI_raw[start] - sim.OTI_raw[Math.max(0, start - 1)]), 1);
    add(
      start,
      (end ?? n) + 12 * 4, // mock assumption: held 12 h after the last bad sample
      {
        module: "data",
        type: jump ? "jump_oti" : "range_oti",
        severity: "warning",
        origin: "sensor",
        detector: "physics",
        value: jump ? step : sim.OTI_raw[start],
        threshold: jump ? 5 : 150,
        explanation: jump
          ? `Top-oil reading jumped ${step} °C in 15 min; the oil time constant is 180 min, so this is not a real temperature change`
          : `Top-oil reading stuck at ${sim.OTI_raw[start]} °C, outside the physical range`,
      },
      REC.sensor,
    );
  }

  // Persisting conditions re-fire once per 24 h. The API gives alerts no end time, and the
  // frontend treats an alert as active for 24 h (FRONTEND_HANDOFF §15.4), so a long episode needs
  // a fresh alert each day to stay active. Mock assumption: the real backend may differ.
  const ONE_SHOT = ["through_fault", "oil_theft", "jump_oti", "range_oti"];
  for (const m of [...alerts]) {
    if (ONE_SHOT.includes(m.alert.type)) continue;
    const last = m.end ?? n;
    for (let k = 1, t = m.start + DAY; t < last; k++, t = m.start + k * DAY) {
      alerts.push({
        ...m,
        start: t,
        repeat: true,
        alert: { ...m.alert, id: `${m.alert.id}~${k}`, timestamp: sim.timestamp[t], recommendation_id: null, lead_time_h: null },
      });
    }
  }
  alerts.sort((a, b) => a.start - b.start);

  // Lead time (FINAL_PRD §11a): hours between a residual alert and the first plain-threshold crossing.
  const baseline = alerts.find(
    (m) => m.alert.detector === "rule" && ["top_oil", "hot_spot"].includes(m.alert.type),
  );
  if (baseline) {
    for (const m of alerts) {
      if (m.alert.type === "residual_drift" && m.start < baseline.start) {
        m.alert.lead_time_h = round((baseline.start - m.start) * 0.25, 1);
      }
    }
  }

  // ---- Health index ----
  const hasOil = ds !== "K";
  const weights: Partial<Record<HealthComponent, number>> = hasOil
    ? { thermal: 30, ageing: 25, loading: 15, electrical: 15, integrity: 10, fault_stress: 5 }
    : { thermal: 30, ageing: 25, loading: 15, electrical: 15 };
  const agePrefix = [0];
  for (let i = 0; i < n; i++) agePrefix.push(agePrefix[i] + sim.ageing_rate_actual[i]);
  const recentAgeing = (i: number) => {
    const from = Math.max(0, i + 1 - 7 * DAY);
    return (agePrefix[i + 1] - agePrefix[from]) / (i + 1 - from);
  };
  const activeAt = (i: number) => alerts.filter((m) => m.start <= i && (m.end === null || i < m.end));

  const healthAt = (i: number): Health => {
    const active = activeAt(i);
    let maxLoad = 0;
    for (let j = Math.max(0, i - DAY + 1); j <= i; j++) maxLoad = Math.max(maxLoad, sim.loading_pct[j]);
    const components: Partial<Record<HealthComponent, number>> = {
      thermal: Math.min(lin(sim.hs_actual_C[i], 90, 130), lin(sim.OTI_C[i] ?? sim.twin_oil_C[i], 75, 105)),
      ageing: lin(recentAgeing(i), 0.5, 4),
      loading: lin(maxLoad, 85, 125),
      electrical: Math.min(lin(sim.unbalance_pct[i], 5, 25), lin(sim.v_unbalance_pct[i], 1, 3)),
    };
    if (hasOil) {
      const theft = active.some((m) => m.alert.type === "oil_theft");
      components.integrity = Math.min(lin(sim.OLI_pct[i], 88, 65), theft ? 30 : 100);
      const ev = sim.events.filter((e) => e.index <= i && (e.peak_pu ?? 0) >= T.moderate_pu);
      const sev = ev.filter((e) => (e.peak_pu ?? 0) >= T.severe_pu).length;
      components.fault_stress = Math.max(0, 100 - 20 * (ev.length - sev) - 60 * sev);
    }
    let total = 0;
    let wsum = 0;
    for (const k of Object.keys(weights) as HealthComponent[]) {
      components[k] = round(components[k]!, 1);
      total += components[k]! * weights[k]!;
      wsum += weights[k]!;
    }
    let score = total / wsum;
    // Weakest-link cap: any critical asset alarm caps the index at 40.
    const critical = active.some((m) => m.alert.origin === "asset" && m.alert.severity === "critical");
    const capped = critical && score > 40;
    if (capped) score = 40;
    score = round(score, 1);
    return { score, band: score >= 80 ? "green" : score >= 60 ? "yellow" : "red", capped, components, weights };
  };
  const health_score = Array.from({ length: n }, (_, i) => healthAt(i).score);

  // ---- RUL (range, FINAL_PRD §8.9) ----
  const stepDays = 15 / 1440;
  const actualDays = agePrefix[n] * stepDays;
  const expectedDays = sim.ageing_rate_expected.reduce((a, b) => a + b, 0) * stepDays;
  const recent = recentAgeing(n - 1);
  const remainingYears = (180000 / 24 - 3 * 365 - actualDays) / 365;
  const years_low = round(remainingYears / Math.max(recent * 1.25, 1), 1);
  const years_high = round(remainingYears / Math.max(recent * 0.75, 0.5), 1);
  const rul: Rul = {
    display: `${years_low}–${years_high} years`,
    years_low,
    years_high,
    risk: years_low >= 10 ? "low" : years_low >= 3 ? "medium" : "high",
    life_consumed_expected_days: round(expectedDays, 2),
    life_consumed_actual_days: round(actualDays, 2),
    ageing_rate_recent: round(recent, 3),
  };

  return { alerts, recommendations, healthAt, health_score, rul, residualThreshold: thr };
}
