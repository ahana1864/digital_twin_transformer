import type { Plausibility } from "../api/types";

const VERDICT: Record<Plausibility, { word: string; cls: string }> = {
  plausible: { word: "PLAUSIBLE", cls: "border-health-green" },
  suspect: { word: "SUSPECT", cls: "border-health-yellow" },
  not_checked: { word: "NOT CHECKED", cls: "border-border text-muted-2" },
};

/** Sensor plausibility verdict: always a word, never colour alone. */
export default function PlausibilityBadge({ verdict }: { verdict: Plausibility }) {
  const v = VERDICT[verdict];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${v.cls}`}>{v.word}</span>
  );
}
