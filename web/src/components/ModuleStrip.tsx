import { useMemo } from "react";
import { useDataset } from "../context/DatasetContext";
import { moduleStates } from "../lib/modules";
import StatusChip from "./StatusChip";

/** Failure module strip under the 3D view (FRONTEND_HANDOFF §6.3). */
export default function ModuleStrip() {
  const { run, active } = useDataset();
  const modules = useMemo(() => moduleStates(run, active), [run, active]);
  return (
    <ul
      aria-label="Failure modules"
      className="grid shrink-0 grid-cols-4 divide-x divide-border border-y border-border bg-panel"
    >
      {modules.map((m) => (
        <li key={m.id} className="min-w-0 px-3 py-2" title={m.detail}>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{m.label}</span>
            <StatusChip status={m.status} />
          </div>
          <div className="truncate text-xs text-muted-2">{m.detail}</div>
        </li>
      ))}
    </ul>
  );
}
