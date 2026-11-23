import { Info } from "lucide-react";
import type { Alert } from "../api/types";
import { useDataset } from "../context/DatasetContext";
import { SENSOR_NOTE } from "../lib/alerts";
import { formatIst, humanise } from "../lib/format";
import StatusChip from "./StatusChip";
import Unavailable from "./Unavailable";

export function OriginBadge({ origin }: { origin: Alert["origin"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
        origin === "sensor" ? "bg-sensor text-panel" : "border border-border text-muted-2"
      }`}
      title={origin === "sensor" ? "Sensor-origin alert" : "Asset-origin alert"}
    >
      {origin === "sensor" && <Info size={11} aria-hidden />}
      {origin}
    </span>
  );
}

export function SimulatedTag() {
  return (
    <span className="rounded-sm bg-banner-text px-1.5 py-px text-[10px] font-semibold tracking-wider text-banner-bg">
      SIMULATED
    </span>
  );
}

/** Severity chip. Sensor-origin alerts never take a health colour (FRONTEND_HANDOFF §15.4). */
export function SeverityChip({ alert }: { alert: Alert }) {
  if (alert.origin === "sensor") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sensor px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sensor">
        <Info size={12} aria-hidden />
        DATA FAULT
      </span>
    );
  }
  if (alert.severity === "critical") return <StatusChip status="red" />;
  if (alert.severity === "warning") return <StatusChip status="yellow" />;
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-2">
      INFO
    </span>
  );
}

/** Latest alerts up to the replay cursor, newest first. */
export default function AlertList({ limit = 5 }: { limit?: number }) {
  const { seenAlerts } = useDataset();
  const latest = seenAlerts.slice(-limit).reverse();

  if (latest.length === 0) {
    return <Unavailable reason="No alerts at this point in the replay." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {latest.map((a) => (
        <li
          key={a.id}
          className={`rounded-card border bg-panel p-3 ${a.origin === "sensor" ? "border-dashed border-sensor" : "border-border"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <SeverityChip alert={a} />
            <span className="text-sm font-semibold">{humanise(a.type)}</span>
            <OriginBadge origin={a.origin} />
            <span className="text-xs text-muted-2">detector: {a.detector}</span>
            {a.simulated && <SimulatedTag />}
            <span className="num ml-auto text-xs text-muted-2">{formatIst(a.timestamp)}</span>
          </div>
          <p className="mt-1.5 text-sm">{a.explanation}</p>
          {a.origin === "sensor" && <p className="mt-1 text-sm font-medium text-sensor">{SENSOR_NOTE}</p>}
          {a.lead_time_h !== null && (
            <p className="num mt-1 text-xs text-muted-2">Lead time {a.lead_time_h.toFixed(1)} h before the plain-threshold baseline</p>
          )}
        </li>
      ))}
    </ul>
  );
}
