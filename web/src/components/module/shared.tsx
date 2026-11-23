import { lazy, Suspense, type ReactNode } from "react";
import type { Alert, Run } from "../../api/types";
import Skeleton from "../Skeleton";
import Unavailable from "../Unavailable";
import { OriginBadge, SeverityChip, SimulatedTag } from "../AlertList";
import { SENSOR_NOTE } from "../../lib/alerts";
import { formatIst, humanise } from "../../lib/format";
import { hasCap } from "../../lib/series";

// Plotly stays out of the main bundle (shared lazy chunk with the Overview chart).
const SeriesChart = lazy(() => import("../SeriesChart"));

/** Why a section is unavailable, or null when it can be shown (FRONTEND_HANDOFF §5). */
export function reasonFor(run: Run, cap?: string): string | null {
  if (run.dataset.mode === "snapshot") return "Not available: records have no timestamps, so there is no time series.";
  if (run.dataset.mode === "data_only") return "Not available: the twin cannot run on this dataset. See Data Health.";
  if (cap && !hasCap(run, cap)) {
    return `Not available: ${run.data_health.capability_reasons[cap] ?? "the dataset lacks the channels this module needs"}.`;
  }
  return null;
}

export function Section({
  title,
  tag,
  status,
  reason,
  note,
  children,
}: {
  title: string;
  tag?: ReactNode;
  status?: ReactNode;
  reason: string | null;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-card border border-border bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {tag}
        <span className="ml-auto">{reason ? null : status}</span>
      </div>
      {reason ? (
        <Unavailable reason={reason} />
      ) : (
        <div className="flex flex-col gap-3">
          {children}
          {note && <p className="text-xs text-muted-2">{note}</p>}
        </div>
      )}
    </section>
  );
}

export function Chart({ title, ...props }: { title: string } & React.ComponentProps<typeof SeriesChart>) {
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-muted-2">{title}</figcaption>
      <div className="rounded-control border border-border">
        <Suspense fallback={<Skeleton className="h-[240px] w-full" />}>
          <SeriesChart {...props} />
        </Suspense>
      </div>
    </figure>
  );
}

export function AlertRows({ alerts, empty }: { alerts: Alert[]; empty: string }) {
  if (alerts.length === 0) return <p className="text-sm text-muted-2">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {[...alerts].reverse().slice(0, 5).map((a) => (
        <li
          key={a.id}
          className={`rounded-control border p-2 text-sm ${a.origin === "sensor" ? "border-dashed border-sensor bg-panel-2" : "border-border"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip alert={a} />
            <span className="font-medium">{humanise(a.type)}</span>
            <OriginBadge origin={a.origin} />
            {a.simulated && <SimulatedTag />}
            <span className="num ml-auto text-xs text-muted-2">{formatIst(a.timestamp)}</span>
          </div>
          <p className="mt-1">{a.explanation}</p>
          {a.origin === "sensor" && <p className="mt-0.5 font-medium text-sensor">{SENSOR_NOTE}</p>}
        </li>
      ))}
      {alerts.length > 5 && <li className="text-xs text-muted-2">{alerts.length - 5} earlier alerts are on Alerts &amp; Maintenance.</li>}
    </ul>
  );
}

