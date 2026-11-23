import { errorDetail } from "../api/client";
import type { DatasetKind } from "../api/types";
import Skeleton from "../components/Skeleton";
import { useDataset } from "../context/DatasetContext";

const GROUPS: { kind: DatasetKind; label: string }[] = [
  { kind: "scenario", label: "Built-in" },
  { kind: "real", label: "Real field data" },
  { kind: "imported", label: "Imported" },
];

/** Dataset selector fed by GET /datasets (FRONTEND_HANDOFF §8). */
export default function DatasetSelect() {
  const { datasets, datasetsLoading, datasetsError, dataset, selectDataset } = useDataset();

  if (datasetsLoading) return <Skeleton className="h-9 w-56" />;
  if (datasetsError || !datasets) {
    return (
      <span className="text-sm text-muted-2" title={`Datasets not available — ${errorDetail(datasetsError)}`}>
        Dataset —
      </span>
    );
  }
  return (
    <select
      aria-label="Dataset"
      value={dataset?.id ?? ""}
      onChange={(e) => selectDataset(e.target.value)}
      className="h-9 w-56 min-w-0 rounded-control border border-border bg-panel px-2 text-sm"
    >
      {GROUPS.map(({ kind, label }) => {
        const items = datasets.filter((d) => d.kind === kind);
        if (items.length === 0) return null;
        return (
          <optgroup key={kind} label={label}>
            {items.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
