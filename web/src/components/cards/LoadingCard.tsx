import { useDataset } from "../../context/DatasetContext";
import { fmt } from "../../lib/format";
import { at, hasCap } from "../../lib/series";
import Card, { Reason } from "./Card";
import Metric from "./Metric";

const PHASES = [
  { phase: "R", i: "IR", v: "VR" },
  { phase: "Y", i: "IY", v: "VY" },
  { phase: "B", i: "IB", v: "VB" },
] as const;

export default function LoadingCard() {
  const { run, cursor } = useDataset();
  const loading = at(run, "loading_pct", cursor);
  const volts = hasCap(run, "voltage_quality") && run?.series.VR !== undefined;
  const neutralMeasured = hasCap(run, "neutral_current") && run?.series.IN !== undefined;
  const ratedA = run?.asset.i_rated_a;
  const estimated = Object.values(run?.asset.tags ?? {}).includes("Estimated");

  return (
    <Card title="Loading R / Y / B">
      <Metric label="Loading" value={fmt.pct(loading)} unit="%" reason="Missing value" />
      <Metric
        label="Loading (per unit)"
        value={loading === null || loading === undefined ? null : fmt.pu(loading / 100)}
        unit="pu"
        reason="Missing value"
      />
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-2">
            <th className="py-0.5 font-medium">Phase</th>
            <th className="py-0.5 text-right font-medium">Current</th>
            <th className="py-0.5 text-right font-medium">Voltage (L-N)</th>
          </tr>
        </thead>
        <tbody>
          {PHASES.map(({ phase, i, v }) => (
            <tr key={phase} className="border-t border-border">
              <th scope="row" className="py-0.5 text-left font-medium">
                {phase}
              </th>
              <td className="num py-0.5 text-right">
                {fmt.amps(at(run, i, cursor)) ?? "—"} <span className="text-xs text-muted-2">A</span>
              </td>
              <td className="num py-0.5 text-right">
                {volts ? (fmt.volts(at(run, v, cursor)) ?? "—") : "—"}{" "}
                <span className="text-xs text-muted-2">V</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ratedA !== undefined && (
        <div className="mt-1">
          <Reason>
            Rated current <span className="num">{Math.round(ratedA)} A</span>
            {estimated && " (estimated)"}.
          </Reason>
        </div>
      )}
      {!volts && <Reason>Voltage not available: dataset has no voltage channels.</Reason>}
      <div className="mt-2 border-t border-border pt-1">
        {neutralMeasured ? (
          <Metric label="Neutral (measured)" value={fmt.amps(at(run, "IN", cursor))} unit="A" reason="Missing value" />
        ) : (
          <Metric label="Neutral (proxy)" value={null} reason="not provided by the API" />
        )}
        <Metric
          label="Current unbalance"
          value={null}
          reason={hasCap(run, "unbalance") ? "not provided by the API" : "Not available: needs per-phase currents"}
        />
        <Metric label="Power factor" value={null} reason="not provided by the API" />
      </div>
    </Card>
  );
}
