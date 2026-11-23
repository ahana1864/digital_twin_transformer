import { useDataset } from "../../context/DatasetContext";
import { fmt } from "../../lib/format";
import { at, flagAt, hasCap } from "../../lib/series";
import Card, { EstimatedTag } from "./Card";
import Metric from "./Metric";

export default function TopOilCard() {
  const { run, cursor } = useDataset();
  const meterOnly = run?.dataset.mode === "meter_only";
  const hasOti = run?.series.OTI_C !== undefined;
  const residualOn = hasCap(run, "residual_fidelity");
  const flag = flagAt(run, cursor);
  const noSensor = "Not available: no oil temperature sensor";
  const gap = flag ? `Missing: sensor flag ${flag}` : "Missing value";

  return (
    <Card title="Top-oil" aside={meterOnly && <EstimatedTag />}>
      <Metric
        label="Measured"
        tone="measured"
        value={hasOti ? fmt.temp(at(run, "OTI_C", cursor)) : null}
        unit="°C"
        reason={hasOti ? gap : noSensor}
      />
      <Metric
        label={meterOnly ? "Twin (estimated)" : "Twin"}
        tone="twin"
        value={fmt.temp(at(run, "twin_oil_C", cursor))}
        unit="°C"
        reason="Missing value"
      />
      {residualOn ? (
        <Metric
          label="Residual (measured − twin)"
          value={fmt.temp(at(run, "residual_oil_C", cursor))}
          unit="°C"
          reason={gap}
        />
      ) : (
        <Metric label="Residual" value={null} reason={noSensor} />
      )}
      <Metric
        label={meterOnly ? "Hot-spot (estimated)" : "Hot-spot (twin)"}
        tone="twin"
        value={fmt.temp(at(run, "twin_hs_C", cursor))}
        unit="°C"
        reason="Missing value"
      />
      {residualOn ? (
        <Metric
          label="Fidelity RMSE (24 h)"
          value={fmt.temp(at(run, "fidelity_rmse_C", cursor))}
          unit="°C"
          reason="Not enough history yet"
        />
      ) : (
        <Metric label="Fidelity RMSE" value={null} reason={noSensor} />
      )}
      <Metric label="Ambient" value={fmt.temp(at(run, "amb_C", cursor))} unit="°C" reason="Missing value" />
    </Card>
  );
}
