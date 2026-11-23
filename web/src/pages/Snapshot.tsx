import { useMemo } from "react";
import { X } from "lucide-react";
import { errorDetail, useSnapshotTable } from "../api/client";
import type { SnapshotRecord } from "../api/types";
import Metric from "../components/cards/Metric";
import PlausibilityBadge from "../components/PlausibilityBadge";
import Skeleton from "../components/Skeleton";
import StatusChip from "../components/StatusChip";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { fmt, humanise } from "../lib/format";
import { useUi } from "../state/ui";

const th = "px-3 py-2 text-left text-xs font-medium text-muted-2";
const NOTE = "Steady-state estimate — thermal lag ignored.";

function Panel({ r, onClose }: { r: SnapshotRecord; onClose: () => void }) {
  return (
    <aside aria-label={`Record ${r.record_id}`} className="rounded-card border border-border bg-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{r.record_id}</h2>
          <p className="text-xs text-muted-2">Record detail</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close record detail" className="rounded-control p-1 hover:bg-bg">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="mb-2 flex items-center gap-3">
        <span className="num text-2xl font-semibold">
          {fmt.pct(r.health_score)}
          <span className="ml-1 text-sm font-normal text-muted-2">/ 100</span>
        </span>
        <StatusChip status={r.band} />
      </div>
      <Metric label="Load" value={fmt.pu(r.load_pu)} unit="pu" />
      <Metric label="Top-oil, measured" tone="measured" value={fmt.temp(r.oti_C)} unit="°C" reason="No measurement for this record" />
      <Metric label="Top-oil, steady-state twin" tone="twin" value={fmt.temp(r.twin_oil_steady_C)} unit="°C" />
      <Metric
        label="Residual"
        value={fmt.temp(r.residual_C)}
        unit="°C"
        reason={r.plausibility === "suspect" ? "Not used: the measurement looks implausible" : "No measurement to compare"}
      />
      <div className="flex items-center justify-between py-1 text-sm">
        <span className="text-muted-2">Plausibility</span>
        <PlausibilityBadge verdict={r.plausibility} />
      </div>
      <Metric label="Top alert" value={r.top_alert ? humanise(r.top_alert) : null} reason="None" />
      <p className="mt-3 text-xs text-muted-2">{NOTE}</p>
    </aside>
  );
}

/** Records without timestamps, worst health first (FRONTEND_HANDOFF §6.9). Snapshot mode only. */
export default function Snapshot() {
  const { dataset, datasetsLoading, datasetsError } = useDataset();
  const isSnapshot = dataset?.mode === "snapshot";
  const table = useSnapshotTable(dataset?.id ?? null, isSnapshot);
  const selected = useUi((s) => s.selectedRecord);
  const select = useUi((s) => s.setSelectedRecord);

  // Worst health first, whatever order the backend sent.
  const rows = useMemo(() => [...(table.data ?? [])].sort((a, b) => a.health_score - b.health_score), [table.data]);
  const current = rows.find((r) => r.record_id === selected) ?? null;

  if (datasetsLoading) {
    return (
      <div className="mx-auto max-w-6xl p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (datasetsError) {
    return (
      <div className="p-6">
        <Unavailable reason={`Not available: ${errorDetail(datasetsError)}`} />
      </div>
    );
  }
  if (!isSnapshot) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-3 text-xl font-semibold">Snapshot records</h1>
        <Unavailable reason="Not available: this page is for datasets whose records have no timestamps (snapshot mode). The selected dataset has a time series; use the Overview and the other pages." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Snapshot records</h1>
        <p className="text-sm text-muted-2">Worst health first. Select a record for its detail. {NOTE}</p>
      </div>

      {table.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : table.isError ? (
        <Unavailable reason={`Not available: ${errorDetail(table.error)}`} />
      ) : rows.length === 0 ? (
        <Unavailable reason="The backend returned no records." />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
          <div className="overflow-x-auto rounded-card border border-border bg-panel">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-panel-2">
                <tr>
                  <th className={th}>Record</th>
                  <th className={th}>Health index</th>
                  <th className={`${th} text-right`}>Load (pu)</th>
                  <th className={`${th} text-right`}>Top-oil: measured vs steady-state twin (°C)</th>
                  <th className={`${th} text-right`}>Residual (°C)</th>
                  <th className={th}>Plausibility</th>
                  <th className={th}>Top alert</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.record_id}
                    tabIndex={0}
                    aria-selected={current?.record_id === r.record_id}
                    onClick={() => select(r.record_id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(r.record_id);
                      }
                    }}
                    className={`cursor-pointer border-t border-border hover:bg-bg ${
                      current?.record_id === r.record_id ? "bg-accent-bg" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">{r.record_id}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="num w-12 text-right">{fmt.pct(r.health_score)}</span>
                        <StatusChip status={r.band} />
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">{fmt.pu(r.load_pu)}</td>
                    <td className="num px-3 py-2 text-right">
                      <span style={{ color: "var(--measured)" }} className="font-medium">
                        {fmt.temp(r.oti_C) ?? "—"}
                      </span>
                      <span className="text-muted-2"> vs </span>
                      <span style={{ color: "var(--twin)" }} className="font-medium">
                        {fmt.temp(r.twin_oil_steady_C) ?? "—"}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right">{fmt.temp(r.residual_C) ?? "—"}</td>
                    <td className="px-3 py-2">
                      <PlausibilityBadge verdict={r.plausibility} />
                    </td>
                    <td className="px-3 py-2">{r.top_alert ? humanise(r.top_alert) : <span className="text-muted-2">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current ? (
            <Panel r={current} onClose={() => select(null)} />
          ) : (
            <Unavailable reason="Select a record to see its detail." />
          )}
        </div>
      )}
      <p className="text-xs text-muted-2">{NOTE}</p>
    </div>
  );
}
