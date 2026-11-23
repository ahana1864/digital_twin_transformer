import type { Mode } from "../api/types";

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "21 Apr 2026, 14:15 IST" (FRONTEND_HANDOFF §7.8: always Asia/Kolkata). */
export function formatIst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(IST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} IST`;
}

export const MODE_LABEL: Record<Mode, string> = {
  full: "FULL",
  meter_only: "METER-ONLY",
  snapshot: "SNAPSHOT",
  data_only: "DATA-ONLY",
};

const num = (v: number | null | undefined, dp: number) =>
  v === null || v === undefined || Number.isNaN(v) ? null : v.toFixed(dp);

// FRONTEND_HANDOFF §7.5: units always shown; temperatures 1 decimal, currents whole amps, pu 2 decimals.
export const fmt = {
  temp: (v: number | null | undefined) => num(v, 1),
  amps: (v: number | null | undefined) => num(v, 0),
  volts: (v: number | null | undefined) => num(v, 0),
  pct: (v: number | null | undefined) => num(v, 1),
  pu: (v: number | null | undefined) => num(v, 2),
  days: (v: number | null | undefined) => num(v, 1),
  rate: (v: number | null | undefined) => num(v, 2),
};

/** Health weights come as points (30) or fractions (0.3). */
export const fmtWeight = (w: number) => `${Math.round(w <= 1 ? w * 100 : w)} %`;

/** Asia/Kolkata wall-clock string for Plotly date axes (it ignores UTC offsets): "2026-04-21 14:15:00". */
export function istAxis(iso: string): string {
  const d = new Date(Date.parse(iso) + 5.5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
}

export const URGENCY_LABEL: Record<string, string> = {
  immediate: "Immediate",
  "24h": "Within 24 h",
  "7d": "Within 7 days",
  next_scheduled: "Next scheduled",
};

export const humanise = (s: string) => s.replace(/_/g, " ");
