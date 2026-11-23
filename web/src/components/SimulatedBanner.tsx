import { useDataset } from "../context/DatasetContext";

/** Shown on every page whenever dataset.simulated is true (FRONTEND_HANDOFF §7.1). */
export default function SimulatedBanner() {
  const { dataset } = useDataset();
  if (!dataset?.simulated) return null;
  return (
    <div
      role="note"
      className="flex h-banner shrink-0 items-center gap-2 border-b border-banner-text/20 bg-banner-bg px-4 text-xs text-banner-text"
    >
      <span className="rounded-sm bg-banner-text px-1.5 py-px font-semibold tracking-wider text-banner-bg">
        SIMULATED
      </span>
      <span className="truncate font-medium">{dataset.label}</span>
    </div>
  );
}
