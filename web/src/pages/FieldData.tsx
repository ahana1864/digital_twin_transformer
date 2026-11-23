import { lazy, Suspense, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { errorDetail } from "../api/client";
import type { Plausibility } from "../api/types";
import Metric from "../components/cards/Metric";
import { AlertRows, Chart, Section } from "../components/module/shared";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { flagText } from "../lib/flags";
import { fmt } from "../lib/format";
import { at, hasCap } from "../lib/series";

const FlagTimeline = lazy(() => import("../components/FlagTimeline"));

const VERDICT: Record<Plausibility, { word: string; cls: string }> = {
  plausible: { word: "PLAUSIBLE", cls: "border-health-green" },
  suspect: { word: "SUSPECT", cls: "border-health-yellow" },
  not_checked: { word: "NOT CHECKED", cls: "border-border text-muted-2" },
};

export default function FieldData() {
  const { dataset, datasets, run, datasetsLoading, datasetsError, runLoading, runError, seenAlerts, cursor, steps, selectDataset } =
    useDataset();
  const [showAll, setShowAll] = useState(false);
  const scope = useMemo(() => (run ? (showAll ? run.alerts : seenAlerts) : []), [run, showAll, seenAlerts]);
  const upTo = showAll ? Math.max(0, steps - 1) : cursor;

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (datasetsError || runError) {
    return (
      <div className="p-6">
        <Unavailable reason={`Not available: ${errorDetail(datasetsError ?? runError)}`} />
      </div>
    );
  }

  // This page is about real measurements: ask for a real dataset instead of guessing.
  if (!dataset || dataset.kind !== "real" || !run) {
    const real = (datasets ?? []).filter((d) => d.kind === "real");
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        <h1 className="text-xl font-semibold">Real Field Data</h1>
        {real.length === 0 ? (
          <Unavailable reason="Not available: there is no real field dataset to show. Load one from Import, or ask the backend team to add it." />
        ) : (
          <div className="rounded-card border border-border bg-panel p-4">
            <p className="text-sm">
              This page shows real measurements from a field unit, not a simulated scenario. The selected dataset
              ({dataset?.label ?? "none"}) is not one.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {real.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => selectDataset(d.id)}
                  className="h-9 rounded-control bg-text px-3 text-sm font-semibold text-panel"
                >
                  Show {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const unusableReason =
    run.dataset.mode === "snapshot"
      ? "Not available: records have no timestamps, so there is no time series."
      : run.dataset.mode === "data_only"
        ? "Not available: the twin cannot run on this dataset. See Data Health."
        : null;

  const a = run.asset;
  const estimated = a.tags.rated_kva === "Estimated";
  const kva = Math.round(a.rated_kva);
  const h = run.data_health;
  const flags = Object.entries(h.flag_counts).sort(([, x], [, y]) => y - x);
  const sensorAlerts = scope.filter((x) => x.origin === "sensor");
  const hasOilDrift = run.alerts.some((x) => x.origin === "sensor" && x.type === "oli_drift");
  const neutralMeasured = hasCap(run, "neutral_current") && run.series.IN !== undefined;
  const voltage = hasCap(run, "voltage_quality") && run.series.VR !== undefined;
  const sensors = Object.entries(run.plausibility) as [string, Plausibility][];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-xl font-semibold">Real Field Data</h1>
        <label className="ml-auto flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show the whole run (ignore the replay position)
        </label>
      </div>

      <div role="note" className="flex items-start gap-3 rounded-card border-2 border-twin bg-accent-bg p-4">
        <Info size={20} aria-hidden className="mt-0.5 shrink-0" />
        <p className="text-base font-semibold">
          Different transformer ({estimated ? `~${kva} kVA, rating estimated from data` : `${kva} kVA`}). Real
          measurements.
        </p>
      </div>

      <Section title="Data-quality flags" reason={unusableReason}>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <div className="rounded-control border border-border">
            <FlagTimeline upTo={upTo} />
          </div>
        </Suspense>
        {flags.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-2">
              <tr>
                <th className="py-1 pr-3 font-medium">Code</th>
                <th className="py-1 pr-3 font-medium">Meaning</th>
                <th className="py-1 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(([code, n]) => (
                <tr key={code} className="border-t border-border">
                  <td className="num py-1 pr-3">{code}</td>
                  <td className="py-1 pr-3 text-muted-2">{flagText(code) || "—"}</td>
                  <td className="num py-1 text-right">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-2">
          Flagged values are kept, not deleted. Duplicate rows were removed before the timeline, so they appear in the
          table only.
        </p>
      </Section>

      <Section title="Sensor faults" reason={unusableReason}>
        <Chart
          title="Top-oil: measured vs twin (°C). Flagged readings are left as gaps, not drawn as 250 °C."
          lines={[
            { key: "twin_oil_C", name: "Twin", tone: "twin" },
            { key: "OTI_C", name: "Measured (OTI)", tone: "measured" },
          ]}
          unit="°C"
          alerts={sensorAlerts}
          upTo={upTo}
        />
        {hasOilDrift && (
          <Chart
            title="Oil level gauge (%). Checked for a gauge fault: this dataset has no leak or theft."
            lines={[{ key: "OLI_pct", name: "Oil level", tone: "measured" }]}
            unit="%"
            alerts={sensorAlerts.filter((x) => x.type === "oli_drift")}
            upTo={upTo}
            height={200}
          />
        )}
        <AlertRows alerts={sensorAlerts} empty="No sensor faults at this point in the replay." />
      </Section>

      <Section title="Sensor plausibility" reason={null}>
        {sensors.length === 0 ? (
          <p className="text-sm text-muted-2">No plausibility checks for this dataset.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sensors.map(([sensor, verdict]) => (
              <li key={sensor} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="num font-medium">{sensor}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${VERDICT[verdict].cls}`}>
                    {VERDICT[verdict].word}
                  </span>
                </div>
                {h.plausibility_notes[sensor] && <p className="text-xs text-muted-2">{h.plausibility_notes[sensor]}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Electrical analytics"
        reason={unusableReason}
        note="Unbalance % and power factor are not provided by the API yet, so the phase quantities themselves are shown."
      >
        <div className="grid gap-x-8 sm:grid-cols-2">
          <Metric
            label={neutralMeasured ? "Neutral current (measured)" : "Neutral current (proxy)"}
            value={neutralMeasured ? fmt.amps(at(run, "IN", cursor)) : null}
            unit="A"
            reason="Not measured in this dataset, and the proxy is not provided by the API"
          />
          <Metric label="Loading" value={fmt.pct(at(run, "loading_pct", cursor))} unit="%" reason="Missing value" />
        </div>
        <Chart
          title="Phase currents (A)"
          lines={[
            { key: "IR", name: "R", tone: "neutral", dash: "solid" },
            { key: "IY", name: "Y", tone: "neutral", dash: "dash" },
            { key: "IB", name: "B", tone: "neutral", dash: "dot" },
            ...(neutralMeasured ? [{ key: "IN" as const, name: "Neutral (measured)", tone: "twin" as const }] : []),
          ]}
          unit="A"
          alerts={scope.filter((x) => x.type === "unbalance")}
          upTo={upTo}
        />
        {voltage ? (
          <Chart
            title="Phase voltages, line to neutral (V)"
            lines={[
              { key: "VR", name: "R", tone: "neutral", dash: "solid" },
              { key: "VY", name: "Y", tone: "neutral", dash: "dash" },
              { key: "VB", name: "B", tone: "neutral", dash: "dot" },
            ]}
            unit="V"
            upTo={upTo}
            height={200}
          />
        ) : (
          <p className="text-sm text-muted-2">Voltage not available: dataset has no voltage channels.</p>
        )}
        <AlertRows alerts={scope.filter((x) => x.origin === "asset" && ["unbalance", "voltage_unbalance"].includes(x.type))} empty="No unbalance alerts at this point in the replay." />
      </Section>
    </div>
  );
}
