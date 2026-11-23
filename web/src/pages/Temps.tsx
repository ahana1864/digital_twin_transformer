import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { errorDetail } from "../api/client";
import Metric from "../components/cards/Metric";
import { EstimatedTag } from "../components/cards/Card";
import { AlertRows, Chart, reasonFor, Section } from "../components/module/shared";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { fmt } from "../lib/format";
import { at, hasCap } from "../lib/series";

/** Full version of the Overview's summary (FRONTEND_HANDOFF §6.4): every channel, with thresholds. */
export default function Temps() {
  const { run, datasetsLoading, datasetsError, runLoading, runError, seenAlerts, active, cursor, steps } = useDataset();
  const [showAll, setShowAll] = useState(false);
  const scope = useMemo(() => (run ? (showAll ? run.alerts : seenAlerts) : []), [run, showAll, seenAlerts]);
  const upTo = showAll ? Math.max(0, steps - 1) : cursor;

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
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
  if (!run) {
    return (
      <div className="p-6">
        <Unavailable reason="Not available: no dataset selected." />
      </div>
    );
  }

  const base = reasonFor(run);
  const meterOnly = run.dataset.mode === "meter_only";
  const hasOti = run.series.OTI_C !== undefined;
  const residualReason = reasonFor(run, "residual_fidelity") ?? (run.series.residual_oil_C ? null : "Not available: no oil temperature sensor.");
  const voltageReason = reasonFor(run, "voltage_quality") ?? (run.series.VR ? null : "Not available: dataset has no voltage channels.");
  const neutralMeasured = hasCap(run, "neutral_current") && run.series.IN !== undefined;
  const drifting = active.some((a) => a.type === "residual_drift" && a.origin === "asset");
  const noDeviceNote = "Not available: no oil temperature sensor.";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Loading &amp; Temperatures</h1>
          <p className="text-sm text-muted-2">{showAll ? "The whole run." : "Data up to the replay position."}</p>
        </div>
        <label className="ml-auto flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show the whole run (ignore the replay position)
        </label>
      </div>

      {!base && (
        <section aria-label="At the replay position" className="rounded-card border border-border bg-panel p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-2">At the replay position</h2>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Loading" value={fmt.pct(at(run, "loading_pct", cursor))} unit="%" reason="Missing value" />
            <Metric label={meterOnly ? "Top-oil (estimated by twin)" : "Top-oil, measured"} tone={meterOnly ? "twin" : "measured"} value={fmt.temp(at(run, meterOnly ? "twin_oil_C" : "OTI_C", cursor))} unit="°C" reason={hasOti || meterOnly ? "Missing value" : noDeviceNote} />
            {!meterOnly && <Metric label="Top-oil, twin" tone="twin" value={fmt.temp(at(run, "twin_oil_C", cursor))} unit="°C" reason="Missing value" />}
            <Metric label={meterOnly ? "Hot-spot (estimated)" : "Hot-spot (twin)"} tone="twin" value={fmt.temp(at(run, "twin_hs_C", cursor))} unit="°C" reason="Missing value" />
            <Metric label="Ambient" value={fmt.temp(at(run, "amb_C", cursor))} unit="°C" reason="Missing value" />
            <Metric label="Residual" value={residualReason ? null : fmt.temp(at(run, "residual_oil_C", cursor))} unit="°C" reason={residualReason ?? "Missing value"} />
            <Metric label="Fidelity RMSE (24 h)" value={residualReason ? null : fmt.temp(at(run, "fidelity_rmse_C", cursor))} unit="°C" reason={residualReason ?? "Not enough history yet"} />
          </div>
        </section>
      )}

      <Section title="Loading" reason={base} note="Thresholds are the ones the API reports on its loading alerts.">
        <Chart title="Loading (%)" lines={[{ key: "loading_pct", name: "Loading", tone: "neutral" }]} unit="%" alerts={scope.filter((a) => ["overload", "loading"].includes(a.type))} thresholdTypes={["overload", "loading"]} upTo={upTo} />
      </Section>

      <Section title="Phase currents" reason={base}>
        <Chart
          title={neutralMeasured ? "R / Y / B currents and measured neutral (A)" : "R / Y / B currents (A)"}
          lines={[
            { key: "IR", name: "R", tone: "neutral", dash: "solid" },
            { key: "IY", name: "Y", tone: "neutral", dash: "dash" },
            { key: "IB", name: "B", tone: "neutral", dash: "dot" },
            ...(neutralMeasured ? [{ key: "IN" as const, name: "Neutral (measured)", tone: "twin" as const }] : []),
          ]}
          unit="A"
          upTo={upTo}
        />
        {!neutralMeasured && <p className="text-xs text-muted-2">Neutral current is not measured here, and its proxy is not provided by the API.</p>}
      </Section>

      <Section title="Phase voltages" reason={base ?? voltageReason}>
        <Chart
          title="R / Y / B voltages, line to neutral (V)"
          lines={[
            { key: "VR", name: "R", tone: "neutral", dash: "solid" },
            { key: "VY", name: "Y", tone: "neutral", dash: "dash" },
            { key: "VB", name: "B", tone: "neutral", dash: "dot" },
          ]}
          unit="V"
          upTo={upTo}
        />
      </Section>

      <Section
        title={meterOnly ? "Top-oil: estimated by twin" : "Top-oil: measured vs twin"}
        tag={meterOnly ? <EstimatedTag /> : undefined}
        reason={base}
        note={meterOnly ? "Running on meter data only: there is no measured oil temperature to compare with." : undefined}
      >
        <Chart
          title="Top-oil temperature (°C)"
          lines={[
            { key: "twin_oil_C", name: meterOnly ? "Twin (estimated)" : "Twin", tone: "twin" },
            ...(meterOnly || !hasOti ? [] : [{ key: "OTI_C" as const, name: "Measured (OTI)", tone: "measured" as const }]),
          ]}
          unit="°C"
          alerts={scope.filter((a) => a.type === "top_oil")}
          thresholdTypes={["top_oil"]}
          upTo={upTo}
        />
      </Section>

      <Section title="Residual" reason={base ?? residualReason} note="Measured minus twin. The dotted lines are the residual-drift alert levels the API reports.">
        <Chart
          title="Residual, measured − twin (°C)"
          lines={[{ key: "residual_oil_C", name: "Residual", tone: "measured" }]}
          unit="°C"
          alerts={scope.filter((a) => a.type === "residual_drift")}
          thresholdTypes={["residual_drift"]}
          upTo={upTo}
        />
        <AlertRows alerts={scope.filter((a) => a.type === "residual_drift")} empty="No residual-drift alerts at this point." />
      </Section>

      <Section title="Hot-spot" tag={meterOnly ? <EstimatedTag /> : undefined} reason={base}>
        <Chart title={meterOnly ? "Hot-spot, estimated by twin (°C)" : "Hot-spot, twin (°C)"} lines={[{ key: "twin_hs_C", name: "Hot-spot", tone: "twin" }]} unit="°C" alerts={scope.filter((a) => a.type === "hot_spot")} thresholdTypes={["hot_spot"]} upTo={upTo} />
      </Section>

      <Section title="Ambient" reason={base}>
        <Chart title="Ambient temperature (°C)" lines={[{ key: "amb_C", name: "Ambient", tone: "neutral" }]} unit="°C" upTo={upTo} height={200} />
      </Section>

      <Section title="Fidelity (RMSE)" reason={base ?? residualReason}>
        <Chart title="Rolling 24 h RMSE of the residual (°C)" lines={[{ key: "fidelity_rmse_C", name: "Fidelity RMSE", tone: "neutral" }]} unit="°C" upTo={upTo} height={200} />
        {drifting ? (
          <p role="alert" className="flex items-start gap-2 rounded-control border border-health-yellow bg-banner-bg p-3 text-sm font-semibold text-banner-text">
            <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
            Model drift — check cooling / recalibrate.
          </p>
        ) : (
          <p className="text-sm text-muted-2">No model drift reported at this point.</p>
        )}
        <p className="text-xs text-muted-2">
          The drift limit is not provided by the API, so this message follows the backend&apos;s residual-drift alert.
        </p>
      </Section>
    </div>
  );
}
