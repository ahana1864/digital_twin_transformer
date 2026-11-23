import { errorDetail } from "../../api/client";
import type { HealthComponent } from "../../api/types";
import { useDataset } from "../../context/DatasetContext";
import { useCursorState } from "../../context/useCursorState";
import { fmt, fmtWeight } from "../../lib/format";
import { at } from "../../lib/series";
import Skeleton from "../Skeleton";
import StatusChip from "../StatusChip";
import HealthRing from "./HealthRing";
import PartList from "./PartList";
import Card, { Reason } from "./Card";

const COMPONENTS: { key: HealthComponent; label: string }[] = [
  { key: "thermal", label: "Thermal" },
  { key: "ageing", label: "Ageing" },
  { key: "loading", label: "Loading" },
  { key: "electrical", label: "Electrical quality" },
  { key: "integrity", label: "Integrity" },
  { key: "fault_stress", label: "Fault stress" },
];

export default function HealthCard() {
  const { run, cursor } = useDataset();
  const state = useCursorState();
  const health = state.data?.health;
  const seriesScore = at(run, "health_score", cursor);

  return (
    <Card title="Health Index">
      {health ? (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <HealthRing score={health.score} band={health.band} />
            <StatusChip status={health.band} />
            {health.capped && <Reason>Score capped by a critical asset alarm.</Reason>}
          </div>
          <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-2">Parts</h3>
          <PartList />
          <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted-2">Sub-scores</h3>
          <ul className="flex flex-col gap-2">
            {COMPONENTS.map(({ key, label }) => {
              const v = health.components[key];
              const w = health.weights[key];
              return (
                <li key={key} className={v === undefined ? "opacity-60" : ""}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted-2">
                      {label}
                      {w !== undefined && <span className="ml-1">· weight {fmtWeight(w)}</span>}
                    </span>
                    <span className="num font-medium">{v === undefined ? "Not available" : fmt.pct(v)}</span>
                  </div>
                  <div
                    role="meter"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={v}
                    title={v === undefined ? "Not available: the dataset lacks the channels for this sub-score" : undefined}
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-border"
                  >
                    {v !== undefined && (
                      <div
                        className="h-full rounded-full bg-muted-2"
                        style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : state.isError ? (
        <>
          <div className="num text-3xl font-semibold leading-none">
            {fmt.pct(seriesScore) ?? "—"}
            <span className="ml-1 text-sm font-normal text-muted-2">/ 100</span>
          </div>
          <div className="mt-1">
            <Reason>Band and sub-scores not available at this time: {errorDetail(state.error)}.</Reason>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </Card>
  );
}
