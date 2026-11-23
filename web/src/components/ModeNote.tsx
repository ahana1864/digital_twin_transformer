import { Info } from "lucide-react";
import type { Mode } from "../api/types";
import { useDataset } from "../context/DatasetContext";

// FRONTEND_HANDOFF §5: what each reduced mode means for the UI.
const NOTES: Partial<Record<Mode, string>> = {
  meter_only: "Running on meter data only — temperatures are estimated by the twin; residual and fidelity are hidden.",
  snapshot: "Records have no timestamps — no time charts and no replay. See Snapshot records.",
  data_only: "The twin cannot run on this dataset — only Data Health and raw data are available.",
};

export default function ModeNote() {
  const { dataset } = useDataset();
  const note = dataset ? NOTES[dataset.mode] : undefined;
  if (!note) return null;
  return (
    <div
      role="note"
      className="flex h-banner shrink-0 items-center gap-2 border-b border-border bg-accent-bg px-4 text-xs font-medium text-text"
    >
      <Info size={14} aria-hidden className="shrink-0" />
      <span className="truncate">{note}</span>
    </div>
  );
}
