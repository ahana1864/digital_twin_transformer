import type { Run } from "../api/types";

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV of the run's time series, built from what the page already holds (FRONTEND_HANDOFF §4 has no
 * CSV endpoint). Missing values are empty cells. A `simulated` column keeps the honesty label
 * with the data, as in the canonical trend table (DATA_INGESTION_SPEC §3.1).
 */
export function runToCsv(run: Run): string {
  const cols = Object.entries(run.series).filter(([, v]) => Array.isArray(v) && v.length > 0) as [string, unknown[]][];
  const n = run.series.timestamp.length;
  const lines = [[...cols.map(([k]) => k), "simulated"].join(",")];
  for (let i = 0; i < n; i++) {
    lines.push([...cols.map(([, v]) => cell(v[i])), String(run.dataset.simulated)].join(","));
  }
  return lines.join("\n") + "\n";
}

/** Save text as a file through a temporary link. */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
