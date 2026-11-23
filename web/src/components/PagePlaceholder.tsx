import { errorDetail } from "../api/client";
import { useDataset } from "../context/DatasetContext";
import Skeleton from "./Skeleton";
import Unavailable from "./Unavailable";

interface Props {
  title: string;
  /** Row in FRONTEND_HANDOFF §12 that builds this page */
  priority: number;
  contents: string;
  /** What the page needs from the selected dataset */
  needs?: "timeseries" | "snapshot" | "run" | "none";
}

/** Stand-in for pages built in later steps. Already handles loading, errors and modes. */
export default function PagePlaceholder({ title, priority, contents, needs = "run" }: Props) {
  const { dataset, datasetsLoading, datasetsError, runLoading, runError } = useDataset();

  let body;
  if (needs === "none") {
    body = null;
  } else if (datasetsLoading || runLoading) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (datasetsError || runError) {
    body = <Unavailable reason={`Not available — ${errorDetail(datasetsError ?? runError)}`} />;
  } else if (!dataset) {
    body = <Unavailable reason="Not available — no dataset selected." />;
  } else if (needs === "timeseries" && dataset.mode === "snapshot") {
    body = <Unavailable reason="Not available — records have no timestamps, so there are no time charts. See Snapshot records." />;
  } else if (needs === "timeseries" && dataset.mode === "data_only") {
    body = <Unavailable reason="Not available — the twin cannot run on this dataset. See Data Health." />;
  } else if (needs === "snapshot" && dataset.mode !== "snapshot") {
    body = <Unavailable reason="Not available — this page is for snapshot-mode datasets (records without timestamps)." />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      {body}
      <div className="rounded-card border border-dashed border-border bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-2">
          Placeholder · priority {priority}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-2">{contents}</p>
      </div>
    </div>
  );
}
