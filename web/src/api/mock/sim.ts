// Mock plant + twin generator. Stands in for the backend's sim/ and twin/ modules until the real
// API is reachable. Parameters are the [Assumed] defaults from FINAL_PRD §3, §5 and §7.

import type { ThroughFaultEvent } from "../types";

// M = S1 overload with no oil-temperature sensor (meter-only fixture).
export type SimId = "N" | "S1" | "S2" | "S3" | "S4" | "S5" | "K" | "M";

export const N_STEPS = 2880; // 30 days at 15 min
export const INTERVAL_MIN = 15;
export const DAY = 96;
const HOUR = 4;

const pad = (n: number) => String(n).padStart(2, "0");

export interface SimConfig {
  id: SimId;
  seed: number;
  /** Local (IST) start date, midnight */
  start: [year: number, month: number, day: number];
  iRated: number;
  /** Rated top-oil rise of the twin (K) */
  riseRated: number;
  /** Natural phase spread (fraction) */
  spread: number;
  measuredNeutral: boolean;
}

export const CONFIGS: Record<SimId, SimConfig> = Object.fromEntries(
  (["N", "S1", "S2", "S3", "S4", "S5", "M"] as const).map((id) => [
    id,
    { id, seed: 2026, start: [2026, 4, 1], iRated: 1391, riseRated: 60, spread: 0.012, measuredNeutral: false },
  ]),
) as Record<SimId, SimConfig>;
// Kaggle-like field unit: different transformer, rating and rise fitted from data.
CONFIGS.K = { id: "K", seed: 2019, start: [2019, 7, 1], iRated: 216, riseRated: 22, spread: 0.05, measuredNeutral: true };

/** Step index of a 1-based day (as in the PRD scenario table) at a given hour. */
export const at = (day: number, hour = 0) => (day - 1) * DAY + Math.round(hour * HOUR);

// FINAL_PRD §5.2 injection start (ground truth).
export const FAULTS: Partial<Record<SimId, { label: string; start: number }>> = {
  S1: { label: "overload", start: at(24, 9) },
  M: { label: "overload", start: at(24, 9) },
  S2: { label: "cooling degradation", start: at(20) },
  S3: { label: "phase unbalance", start: at(25) },
  S4: { label: "oil loss (leak, then theft)", start: at(18) },
  S5: { label: "through-faults", start: at(27, 10.25) },
};

export interface Sim {
  cfg: SimConfig;
  n: number;
  timestamp: string[];
  IR: number[];
  IY: number[];
  IB: number[];
  I_mean: number[];
  IN: number[];
  VR: number[];
  VY: number[];
  VB: number[];
  loading_pct: number[];
  unbalance_pct: number[];
  v_unbalance_pct: number[];
  amb_C: number[];
  OTI_C: (number | null)[];
  /** Raw OTI reading including sensor glitches */
  OTI_raw: number[];
  twin_oil_C: number[];
  twin_hs_C: number[];
  hs_actual_C: number[];
  residual_oil_C: (number | null)[];
  fidelity_rmse_C: (number | null)[];
  ageing_rate_expected: number[];
  ageing_rate_actual: number[];
  OLI_pct: number[];
  dq_flags: string[];
  events: (ThroughFaultEvent & { index: number })[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
export const round = (x: number, dp: number) => {
  const p = 10 ** dp;
  return Math.round(x * p) / p;
};

export function simulate(cfg: SimConfig): Sim {
  const { id } = cfg;
  const n = N_STEPS;
  const rnd = mulberry32(cfg.seed);
  // The noise stream is consumed identically for every scenario, so S1–S5 match N before the fault.
  const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

  const startMs = Date.UTC(cfg.start[0], cfg.start[1] - 1, cfg.start[2]);
  const startDow = new Date(startMs).getUTCDay();
  const days = n / DAY;
  const peak: number[] = [];
  const ambMax: number[] = [];
  const ambMin: number[] = [];
  for (let d = 0; d <= days; d++) {
    const dow = (startDow + d) % 7;
    peak.push(dow === 0 || dow === 6 ? 0.36 + 0.08 * rnd() : 0.57 + 0.15 * rnd());
    ambMax.push(32 + (3 * d) / days + 0.6 * g());
    ambMin.push(ambMax[d] - 11 + 0.5 * g());
  }

  const R = 10000 / 1100; // load loss / no-load loss
  const ultRise = (K: number, mult: number) =>
    mult * cfg.riseRated * ((1 + R * K * K) / (1 + R)) ** 0.8;
  const alpha = 1 - Math.exp(-INTERVAL_MIN / 180); // oil time constant 180 min
  // Plant ≠ twin on purpose (FINAL_PRD §5.1): a small offset plus sensor noise, so fidelity is
  // not circular but the residual stays small whenever the twin explains the load.
  const PLANT_OFFSET_C = 0.8;
  const H_GR = 1.2 * 23; // hot-spot factor × winding-oil gradient

  const s: Sim = {
    cfg, n, timestamp: [], IR: [], IY: [], IB: [], I_mean: [], IN: [], VR: [], VY: [], VB: [],
    loading_pct: [], unbalance_pct: [], v_unbalance_pct: [], amb_C: [], OTI_C: [], OTI_raw: [],
    twin_oil_C: [], twin_hs_C: [], hs_actual_C: [], residual_oil_C: [], fidelity_rmse_C: [],
    ageing_rate_expected: [], ageing_rate_actual: [], OLI_pct: [], dq_flags: [], events: [],
  };

  const isoAt = (i: number) => {
    const d = new Date(startMs + i * INTERVAL_MIN * 60_000);
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00+05:30`
    );
  };

  let twinRise = 0;
  let plantRise = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.floor(i / DAY);
    const h = (i % DAY) / HOUR;
    const f = (i % DAY) / DAY;
    const noise = Array.from({ length: 12 }, g);

    const aMax = lerp(ambMax[d], ambMax[d + 1], f);
    const aMin = lerp(ambMin[d], ambMin[d + 1], f);
    const ambTrue = (aMax + aMin) / 2 + ((aMax - aMin) / 2) * Math.cos((2 * Math.PI * (h - 15)) / 24);
    const day = sig((h - 8) / 0.7) * sig((18 - h) / 0.9);

    // Load (pu), then amps on the LV side.
    let K = 0.28 + (peak[d] - 0.28) * day + (0.02 * day * (ambTrue - 28)) / 6 + 0.012 * noise[0];
    if ((id === "S1" || id === "M") && d >= 23 && d <= 25 && h >= 9 && h < 17) {
      K = 1.15 + 0.2 * Math.sin((Math.PI * (h - 9)) / 8) + 0.012 * noise[0];
    }
    let fR = 1 + cfg.spread;
    let fY = 1 - cfg.spread / 2;
    const fB = 1 - cfg.spread / 2;
    if (id === "S3") {
      const r = clamp01((i - at(25)) / 8);
      fR += 0.18 * r;
      fY -= 0.08 * r;
    }
    if (id === "K" && d >= 11 && d <= 12) fR += 0.16 * day; // single-phase load picked up on R
    const IR = K * cfg.iRated * fR * (1 + 0.003 * noise[1]);
    const IY = K * cfg.iRated * fY * (1 + 0.003 * noise[2]);
    const IB = K * cfg.iRated * fB * (1 + 0.003 * noise[3]);
    const Imean = (IR + IY + IB) / 3;
    const Kpu = Imean / cfg.iRated;
    const unb = (Math.max(Math.abs(IR - Imean), Math.abs(IY - Imean), Math.abs(IB - Imean)) / Imean) * 100;

    const vBase = (415 / Math.sqrt(3)) * (1.015 - 0.035 * Kpu);
    const VR = vBase * (1 + 0.003 * noise[4]);
    const VY = vBase * (1 + 0.003 * noise[5]);
    const VB = vBase * (1 + 0.003 * noise[6]);
    const Vmean = (VR + VY + VB) / 3;
    const vunb = (Math.max(Math.abs(VR - Vmean), Math.abs(VY - Vmean), Math.abs(VB - Vmean)) / Vmean) * 100;

    const amb = ambTrue + 0.2 * noise[7];

    // Twin: nominal parameters. Plant: perturbed dynamics plus injected faults.
    let mult = 1;
    if (id === "S2") mult *= 1 + 0.25 * clamp01((i - at(20)) / (4 * DAY));
    if (i === 0) {
      twinRise = ultRise(Kpu, 1);
      plantRise = ultRise(Kpu, mult);
    } else {
      twinRise += alpha * (ultRise(Kpu, 1) - twinRise);
      plantRise += alpha * (ultRise(Kpu, mult) - plantRise);
    }
    const twinOil = amb + twinRise;
    const oilTrue = ambTrue + plantRise + PLANT_OFFSET_C;
    let otiRaw = oilTrue + 0.4 * noise[8];
    let flag = "";
    if (id === "S2" && (i === at(19, 10) || i === at(19, 10) + 1)) {
      otiRaw += 9; // sensor glitch: impossible rate of change for a 180 min oil time constant
      flag = "JUMP_OTI";
    }
    if (id === "K" && ((i >= at(8, 13) && i < at(8, 13) + 6) || (i >= at(21, 2) && i < at(21, 2) + 10))) {
      otiRaw = 250; // stuck-high plateau seen in the field data
      flag = "RANGE_OTI_C";
    }
    const oti = flag ? null : otiRaw;

    const grad = H_GR * Kpu ** 1.6;
    const twinHs = twinOil + grad;
    // Meter-only: no measurement, so "actual" is the twin estimate.
    const hsActual = id === "M" ? twinHs : (oti ?? twinOil) + grad;

    let oli = 94 + 0.1 * (oilTrue - 45) + 0.15 * noise[9];
    if (id === "S4") {
      oli -= 22 * clamp01((i - at(18)) / (5 * DAY)); // leak
      oli -= 12 * clamp01((i - at(26, 2) + 1) / 2); // night theft step
    }
    if (id === "K") oli -= 9 * clamp01((i - at(10)) / (14 * DAY)); // gauge drift

    s.timestamp.push(isoAt(i));
    s.IR.push(round(IR, 1));
    s.IY.push(round(IY, 1));
    s.IB.push(round(IB, 1));
    s.I_mean.push(round(Imean, 1));
    s.IN.push(round(Math.sqrt(Math.max(0, IR * IR + IY * IY + IB * IB - IR * IY - IY * IB - IB * IR)), 1));
    s.VR.push(round(VR, 1));
    s.VY.push(round(VY, 1));
    s.VB.push(round(VB, 1));
    s.loading_pct.push(round(Kpu * 100, 2));
    s.unbalance_pct.push(round(unb, 2));
    s.v_unbalance_pct.push(round(vunb, 2));
    s.amb_C.push(round(amb, 2));
    s.OTI_raw.push(round(otiRaw, 2));
    s.OTI_C.push(oti === null || id === "M" ? null : round(oti, 2));
    s.twin_oil_C.push(round(twinOil, 2));
    s.twin_hs_C.push(round(twinHs, 2));
    s.hs_actual_C.push(round(hsActual, 2));
    s.residual_oil_C.push(oti === null || id === "M" ? null : round(oti - twinOil, 2));
    s.ageing_rate_expected.push(round(2 ** ((twinHs - 98) / 6), 4));
    s.ageing_rate_actual.push(round(2 ** ((hsActual - 98) / 6), 4));
    s.OLI_pct.push(round(oli, 2));
    s.dq_flags.push(flag);
  }

  // Fidelity: rolling 24 h RMSE of the residual (flagged samples excluded).
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const add = s.residual_oil_C[i];
    if (add !== null) {
      sumSq += add * add;
      count++;
    }
    const drop = i >= DAY ? s.residual_oil_C[i - DAY] : null;
    if (drop !== null) {
      sumSq -= drop * drop;
      count--;
    }
    s.fidelity_rmse_C.push(count > 0 ? round(Math.sqrt(Math.max(0, sumSq) / count), 2) : null);
  }

  // Short circuits live only in the event table (15-min averages cannot show them).
  if (id === "S5") {
    const ev = (hour: number, phase: string, peak_pu: number, duration_ms: number) => {
      const index = at(27, hour);
      s.events.push({
        index,
        timestamp: s.timestamp[index],
        event_type: "through_fault",
        phase,
        peak_pu,
        duration_ms,
        i2t_pu2s: round((peak_pu * peak_pu * duration_ms) / 1000, 2),
        simulated: true,
      });
    };
    ev(10.25, "R", 6.1, 300);
    ev(14.75, "3ph", 10.2, 500);
    ev(16, "Y", 3.6, 200);
  }
  return s;
}

const cache = new Map<SimId, Sim>();
export function getSim(id: SimId): Sim {
  let sim = cache.get(id);
  if (!sim) {
    sim = simulate(CONFIGS[id]);
    cache.set(id, sim);
  }
  return sim;
}
