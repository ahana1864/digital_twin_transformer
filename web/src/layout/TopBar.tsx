import { useHealth } from "../api/client";
import Skeleton from "../components/Skeleton";
import { useDataset } from "../context/DatasetContext";
import { formatIst, MODE_LABEL } from "../lib/format";
import { alarmOf } from "../components/twin/status";
import { useTwinStatus } from "../components/twin/TwinStatusContext";
import AlarmIndicator from "./AlarmIndicator";
import DatasetSelect from "./DatasetSelect";
import DemoMenu from "./DemoMenu";
import ReplayControls from "./ReplayControls";

function AssetIdentity() {
  const { run, runLoading, datasetsLoading } = useDataset();
  if (runLoading || datasetsLoading) {
    return (
      <div className="flex w-40 flex-col gap-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="text-sm text-muted-2" title="Asset details come with the dataset">
        Transformer —
      </div>
    );
  }
  const { asset } = run;
  // §7.7: estimated values are labelled.
  const estimated = Object.values(asset.tags).includes("Estimated");
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 truncate text-sm font-semibold leading-tight">
        <span className="num">{asset.rated_kva} kVA</span> transformer
        {estimated && (
          <span
            className="rounded-sm border border-border px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-2"
            title="Rating estimated from data, not from a nameplate"
          >
            Estimated
          </span>
        )}
      </div>
      <div className="num truncate text-xs leading-tight text-muted-2">
        {asset.lv_v} V · rated {Math.round(asset.i_rated_a)} A
      </div>
    </div>
  );
}

export default function TopBar() {
  const { dataset, cursorTime, runLoading } = useDataset();
  const alarm = alarmOf(useTwinStatus());
  const offline = useHealth().isError;

  return (
    <header className="flex h-header shrink-0 items-center gap-4 border-b border-border bg-panel px-4">
      <AlarmIndicator
        status={offline ? "grey" : alarm}
        reason={
          offline ? "Backend offline" : alarm === "grey" ? "No time series loaded" : "Worst part status"
        }
      />
      <AssetIdentity />
      <div className="h-6 w-px shrink-0 bg-border" />
      <DatasetSelect />
      <DemoMenu />
      {dataset && (
        <span
          className="shrink-0 rounded-control border border-border bg-panel-2 px-2 py-0.5 text-xs font-semibold tracking-wide text-muted-2"
          title="Dataset mode, set by the backend from the channels available"
        >
          {MODE_LABEL[dataset.mode]}
        </span>
      )}
      <ReplayControls />
      <div className="ml-auto shrink-0">
        {runLoading ? (
          <Skeleton className="h-4 w-44" />
        ) : cursorTime ? (
          <time dateTime={cursorTime} className="num text-sm" title="Replay position (Asia/Kolkata)">
            {formatIst(cursorTime)}
          </time>
        ) : (
          <span className="num text-sm text-muted-2" title="No timestamp — no time series loaded">
            —
          </span>
        )}
      </div>
    </header>
  );
}
