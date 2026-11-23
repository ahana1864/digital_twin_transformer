import { errorDetail } from "../../api/client";
import { useDataset } from "../../context/DatasetContext";
import Skeleton from "../Skeleton";
import Unavailable from "../Unavailable";
import HealthCard from "./HealthCard";
import LifeCard from "./LifeCard";
import LoadingCard from "./LoadingCard";
import TopOilCard from "./TopOilCard";

/**
 * The four Overview cards (FRONTEND_HANDOFF §6.3). `stack` fills the right drawer; `row` is the
 * fallback layout above the chart when the 3D twin is cut.
 */
export default function OverviewCards({ layout }: { layout: "stack" | "row" }) {
  const { dataset, run, datasetsLoading, datasetsError, runLoading, runError } = useDataset();

  if (datasetsLoading || runLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (datasetsError || runError) {
    return <Unavailable reason={`Not available — ${errorDetail(datasetsError ?? runError)}`} />;
  }
  if (!run || !dataset) return <Unavailable reason="Not available — no dataset selected." />;
  if (dataset.mode === "snapshot") {
    return (
      <Unavailable reason="Not available — records have no timestamps, so there are no values at a replay time. See Snapshot records." />
    );
  }
  if (dataset.mode === "data_only") {
    return <Unavailable reason="Not available — the twin cannot run on this dataset. See Data Health." />;
  }
  return (
    <div className={layout === "row" ? "grid grid-cols-2 items-start gap-3 xl:grid-cols-4" : "flex flex-col gap-3"}>
      <HealthCard />
      <TopOilCard />
      <LoadingCard />
      <LifeCard />
    </div>
  );
}
