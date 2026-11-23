import { lazy, Suspense, type ReactNode } from "react";
import { errorDetail } from "../api/client";
import AlertList from "../components/AlertList";
import OverviewCards from "../components/cards/OverviewCards";
import DownloadReport from "../components/DownloadReport";
import Drawer from "../layout/Drawer";
import ModuleStrip from "../components/ModuleStrip";
import RecommendationsTable from "../components/RecommendationsTable";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { TWIN_3D } from "../features";

// Plotly is large: load it only when the Overview is shown.
const TopOilChart = lazy(() => import("../components/TopOilChart"));
// three.js is large too: the 3D canvas is its own chunk.
const TwinCanvas = lazy(() => import("../components/twin/TwinCanvas"));

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function Overview() {
  const { dataset, run, datasetsLoading, datasetsError, runLoading, runError } = useDataset();

  if (datasetsLoading || runLoading) {
    return (
      <div className="flex h-full flex-col gap-3 bg-canvas p-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="min-h-0 w-full flex-1" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (datasetsError || runError) {
    return (
      <div className="p-8">
        <Unavailable reason={`Not available — ${errorDetail(datasetsError ?? runError)}`} />
      </div>
    );
  }
  if (dataset?.mode === "snapshot" || dataset?.mode === "data_only") {
    return (
      <div className="p-8">
        <Unavailable
          reason={
            dataset.mode === "snapshot"
              ? "Not available — records have no timestamps. The 3D view will colour parts for a record selected in Snapshot records."
              : "Not available — the twin cannot run on this dataset. See Data Health."
          }
        />
      </div>
    );
  }

  const meterOnly = run?.dataset.mode === "meter_only";
  return (
    <div className="h-full overflow-y-auto">
      {TWIN_3D ? (
        // Stage: the 3D view on the left (about 60 %), the panel on the right (about 40 %); on narrow
        // screens the panel drops under the 3D view. Everything else is below the fold.
        <section aria-label="3D twin" className="flex min-h-[440px] flex-col xl:h-full xl:flex-row">
          <div className="flex min-h-[460px] min-w-0 flex-1 flex-col xl:min-h-0">
            <div className="min-h-0 flex-1">
              <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                <TwinCanvas />
              </Suspense>
            </div>
            <ModuleStrip />
          </div>
          <Drawer />
        </section>
      ) : (
        // Fallback when the 3D twin is cut: module strip, then the four cards in a row above the chart.
        <>
          <ModuleStrip />
          <div className="p-4">
            <OverviewCards layout="row" />
          </div>
        </>
      )}

      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 pb-8">
        <Section
          title={meterOnly ? "Top-oil: estimated by twin" : "Top-oil: measured vs twin"}
          aside={
            <span className="text-xs text-muted-2">
              Data up to the replay position
              {meterOnly && " · running on meter data only: no measured oil temperature"}
            </span>
          }
        >
          <div className="rounded-card border border-border bg-panel p-2">
            <Suspense fallback={<Skeleton className="h-[340px] w-full" />}>
              <TopOilChart />
            </Suspense>
          </div>
        </Section>

        <Section title="Latest alerts">
          <AlertList limit={5} />
        </Section>

        <Section title="Recommendations">
          <RecommendationsTable />
        </Section>

        <div>
          <DownloadReport />
        </div>
      </div>
    </div>
  );
}
