import type { Run } from "../../api/types";
import { fmt } from "../../lib/format";
import { at, hasCap } from "../../lib/series";
import type { PartId } from "./parts";

export interface KeyReading {
  label: string;
  /** Formatted value with unit, or null when missing */
  value: string | null;
  tone?: "measured" | "twin";
  /** Why the value is missing */
  reason?: string;
}

const withUnit = (v: string | null, unit: string) => (v === null ? null : `${v} ${unit}`);

/** One key reading per part from the series at the cursor (FRONTEND_HANDOFF §15.3). */
export function keyReading(part: PartId, run: Run | undefined, i: number): KeyReading {
  if (!run) return { label: "Reading", value: null, reason: "No data loaded" };
  const meterOnly = run.dataset.mode === "meter_only";
  switch (part) {
    case "windings":
      return { label: "Loading", value: withUnit(fmt.pct(at(run, "loading_pct", i)), "%"), reason: "Missing value" };
    case "tank":
      return meterOnly || run.series.OTI_C === undefined
        ? {
            label: "Top-oil (estimated by twin)",
            value: withUnit(fmt.temp(at(run, "twin_oil_C", i)), "°C"),
            tone: "twin",
            reason: "Missing value",
          }
        : {
            label: "Top-oil (measured)",
            value: withUnit(fmt.temp(at(run, "OTI_C", i)), "°C"),
            tone: "measured",
            reason: "Missing value",
          };
    case "radiators":
      return hasCap(run, "residual_fidelity") && run.series.residual_oil_C !== undefined
        ? { label: "Residual", value: withUnit(fmt.temp(at(run, "residual_oil_C", i)), "°C"), reason: "Missing value" }
        : { label: "Residual", value: null, reason: "Not available: no oil temperature sensor" };
    case "conservator":
      return hasCap(run, "oil_leak_theft") && run.series.OLI_pct !== undefined
        ? { label: "Oil level", value: withUnit(fmt.pct(at(run, "OLI_pct", i)), "%"), reason: "Missing value" }
        : { label: "Oil level", value: null, reason: "Not available: dataset has no oil level channel" };
    case "bushings": {
      if (!hasCap(run, "voltage_quality") || run.series.VR === undefined) {
        return { label: "Voltage", value: null, reason: "Not available: dataset has no voltage channels" };
      }
      const v = (["VR", "VY", "VB"] as const).map((k) => fmt.volts(at(run, k, i)));
      return {
        label: "Voltage R / Y / B",
        value: v.every((x) => x !== null) ? `${v.join(" / ")} V` : null,
        reason: "Missing value",
      };
    }
    case "core":
      return { label: "Core", value: null, reason: "Not monitored (no sensor)" };
  }
}
