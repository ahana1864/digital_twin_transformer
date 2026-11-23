import { useMemo, useState } from "react";
import { errorDetail } from "../api/client";
import type { Alert } from "../api/types";
import { EstimatedTag } from "../components/cards/Card";
import Metric from "../components/cards/Metric";
import type { ChartLine } from "../components/SeriesChart";
import Skeleton from "../components/Skeleton";
import StatusChip from "../components/StatusChip";
import Unavailable from "../components/Unavailable";
import { AlertRows, Chart, reasonFor, Section } from "../components/module/shared";
import { SimulatedTag } from "../components/AlertList";
import { useDataset } from "../context/DatasetContext";
import { fmt, formatIst, humanise } from "../lib/format";
import { moduleStates } from "../lib/modules";
import { hasCap } from "../lib/series";

export default function Modules() {
  const { run, datasetsLoading, datasetsError, runLoading, runError, seenAlerts, active, cursor, steps } = useDataset();
  const [showAll, setShowAll] = useState(false);

  const scope = useMemo(() => (run ? (showAll ? run.alerts : seenAlerts) : []), [run, showAll, seenAlerts]);
  const upTo = showAll ? Math.max(0, steps - 1) : cursor;
  const states = useMemo(() => Object.fromEntries(moduleStates(run, active).map((m) => [m.id, m])), [run, active]);

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-56" />
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

  const meterOnly = run.dataset.mode === "meter_only";
  const chip = (id: string) => (states[id] ? <StatusChip status={states[id].status} /> : null);
  const byModule = (...modules: string[]) => scope.filter((a) => modules.includes(a.module));
  const byType = (...types: string[]) => scope.filter((a) => types.includes(a.type));
  const byTime = (a: Alert, b: Alert) => Date.parse(a.timestamp) - Date.parse(b.timestamp);
  // Sensor faults carry module "data": place them by type, next to the measurement they concern.
  const overloadAlerts = [...byModule("overloading"), ...byType("jump_oti", "range_oti")].sort(byTime);
  const oilAlerts = [...byModule("oil"), ...byType("oli_drift")].sort(byTime);
  const cutoff = showAll ? Infinity : cursor >= 0 && run.series.timestamp[cursor] ? Date.parse(run.series.timestamp[cursor]) : Infinity;
  const events = run.events.filter((e) => Date.parse(e.timestamp) <= cutoff);
  const rul = run.rul;

  const loadingLines: ChartLine[] = [{ key: "loading_pct", name: "Loading", tone: "neutral" }];
  const hotLines: ChartLine[] = [{ key: "twin_hs_C", name: meterOnly ? "Hot-spot (estimated by twin)" : "Hot-spot (twin)", tone: "twin" }];
  const ageLines: ChartLine[] = [
    { key: "ageing_rate_expected", name: meterOnly ? "Ageing rate (estimated by twin)" : "Expected (twin)", tone: "twin" },
    ...(meterOnly ? [] : [{ key: "ageing_rate_actual", name: "Actual", tone: "measured" } satisfies ChartLine]),
  ];
  const phaseLines: ChartLine[] = [
    { key: "IR", name: "R", tone: "neutral", dash: "solid" },
    { key: "IY", name: "Y", tone: "neutral", dash: "dash" },
    { key: "IB", name: "B", tone: "neutral", dash: "dot" },
  ];

  const evReason = reasonFor(run, "through_fault");
  const unbReason = reasonFor(run, "unbalance");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold">Failure Modules</h1>
          <p className="text-sm text-muted-2">
            {showAll ? "The whole run." : "Data up to the replay position."} Each module shows what the twin and analytics
            report for it.
          </p>
        </div>
        <label className="ml-auto flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show the whole run (ignore the replay position)
        </label>
      </div>

      <h2 className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-2">
        Headline failure modes (named after CPRI&apos;s prime causes of outage)
      </h2>

      <Section
        title="Overloading"
        status={chip("overloading")}
        reason={reasonFor(run)}
        note="Loading against the alarm thresholds, and the hot-spot temperature that drives ageing. Thresholds are the ones the API reports on its alerts."
      >
        <Chart title="Loading (%)" lines={loadingLines} unit="%" alerts={byType("overload", "loading")} thresholdTypes={["overload", "loading"]} upTo={upTo} />
        <Chart title={meterOnly ? "Hot-spot, estimated by twin (°C)" : "Hot-spot, twin (°C)"} lines={hotLines} unit="°C" alerts={byType("hot_spot")} thresholdTypes={["hot_spot"]} upTo={upTo} />
        <AlertRows alerts={overloadAlerts} empty="No overloading alerts at this point." />
      </Section>

      <Section
        title="Insulation"
        status={chip("insulation")}
        tag={meterOnly && hasCap(run, "ageing_rul") ? <EstimatedTag /> : undefined}
        reason={reasonFor(run, "ageing_rul")}
        note="Thermal ageing only: no moisture, partial-discharge or gas-in-oil data, and no breakdown-date claims. RUL and life consumed cover the whole run."
      >
        <Chart title="Ageing rate (× reference; 1.00 = ageing at the reference hot-spot temperature)" lines={ageLines} unit="×" upTo={upTo} height={200} />
        {rul ? (
          <div className="grid gap-x-8 sm:grid-cols-2">
            <Metric label="Remaining useful life" value={rul.display} />
            <Metric label="Risk" value={humanise(rul.risk)} />
            <Metric label="Life consumed, expected" value={fmt.days(rul.life_consumed_expected_days)} unit="days" />
            <Metric label="Life consumed, actual" value={fmt.days(rul.life_consumed_actual_days)} unit="days" />
          </div>
        ) : (
          <p className="text-sm text-muted-2">No remaining-life estimate for this run.</p>
        )}
        <AlertRows alerts={byModule("insulation")} empty="No insulation alerts at this point." />
      </Section>

      <Section
        title="Short circuit"
        status={chip("short_circuit")}
        reason={reasonFor(run, "through_fault")}
        note="A 15-minute trend cannot show a short circuit, so this module works from the through-fault event log below."
      >
        <Metric label="Through-fault events so far" value={String(events.length)} />
        <AlertRows alerts={byModule("short_circuit")} empty="No short-circuit alerts at this point." />
      </Section>

      <h2 className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-2">Other modules</h2>

      <Section title="Oil leak / theft" status={chip("oil")} reason={reasonFor(run, "oil_leak_theft")}>
        <Chart title="Oil level (%)" lines={[{ key: "OLI_pct", name: "Oil level", tone: "measured" }]} unit="%" alerts={oilAlerts} thresholdTypes={["oil_level_low"]} upTo={upTo} />
        <AlertRows alerts={oilAlerts} empty="No oil alerts at this point." />
      </Section>

      <Section
        title="Unbalance"
        reason={unbReason}
        note="Current unbalance % and the neutral-current proxy are not provided by the API yet, so the phase currents themselves are shown."
      >
        <Chart
          title="Phase currents (A)"
          lines={hasCap(run, "neutral_current") && run.series.IN ? [...phaseLines, { key: "IN", name: "Neutral (measured)", tone: "twin" }] : phaseLines}
          unit="A"
          alerts={byType("unbalance")}
          upTo={upTo}
        />
        <AlertRows alerts={byType("unbalance", "voltage_unbalance")} empty="No unbalance alerts at this point." />
      </Section>

      <Section
        title="Moisture exposure"
        tag={
          <span className="rounded-sm border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-2">
            experimental
          </span>
        }
        reason={reasonFor(run, "breathing")}
        note="Experimental and not validated: an uncalibrated index of daily oil-temperature swing and humidity, for breathing units only."
      >
        <AlertRows alerts={byModule("moisture")} empty="No moisture alerts at this point." />
      </Section>

      <Section title="Through-fault event log" reason={evReason}>
        {events.length === 0 ? (
          <Unavailable
            reason={showAll ? "No through-fault events in this run." : "No through-fault events up to the replay position."}
          />
        ) : (
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-panel-2 text-xs text-muted-2">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Phase</th>
                  <th className="px-3 py-2 text-right font-medium">Peak (pu)</th>
                  <th className="px-3 py-2 text-right font-medium">Duration (ms)</th>
                  <th className="px-3 py-2 text-right font-medium">I²t (pu²·s)</th>
                </tr>
              </thead>
              <tbody>
                {[...events].reverse().map((e) => (
                  <tr key={`${e.timestamp}|${e.phase}`} className="border-t border-border">
                    <td className="num whitespace-nowrap px-3 py-2">
                      {formatIst(e.timestamp)}
                      {e.simulated && <span className="ml-2 align-middle"><SimulatedTag /></span>}
                    </td>
                    <td className="px-3 py-2">{e.phase}</td>
                    <td className="num px-3 py-2 text-right">{fmt.pu(e.peak_pu) ?? "—"}</td>
                    <td className="num px-3 py-2 text-right">{e.duration_ms === null ? "—" : Math.round(e.duration_ms)}</td>
                    <td className="num px-3 py-2 text-right">{fmt.pu(e.i2t_pu2s) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
