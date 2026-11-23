// Part status for the 3D twin (FRONTEND_HANDOFF §15.4). Mirrors lib/modules.ts for the module
// strip, but keyed by part and with the extra capability/mode gating §15.3 describes per part.

import type { Alert, Run } from "../../api/types";
import { SENSOR_NOTE, worstStatus } from "../../lib/alerts";
import { hasCap } from "../../lib/series";
import type { Status } from "../../lib/status";
import { ALERT_TO_PART, PART_IDS, type PartId } from "./parts";

export interface PartState {
  part: PartId;
  /** Health colour. A sensor-origin alert never sets this — it only sets `sensorFault`. */
  status: Status;
  /** An active sensor-origin alert on this part: show the ⓘ badge and SENSOR_NOTE, never red. */
  sensorFault: boolean;
  /** Why it's grey, the sensor note, or the active asset alert type(s). */
  reason: string;
  /** meter_only mode: the tank is showing the twin's estimate, not a measurement. */
  estimated?: boolean;
}

const dedupe = (v: string[]) => v.filter((t, i, all) => all.indexOf(t) === i);
const grey = (part: PartId, reason: string): PartState => ({ part, status: "grey", sensorFault: false, reason });

/** Part status from active alerts and capabilities (FRONTEND_HANDOFF §15.3, §15.4). Presentation only. */
export function partStates(run: Run | undefined, active: Alert[]): Record<PartId, PartState> {
  const timeSeries = run && run.dataset.mode !== "data_only" && run.dataset.mode !== "snapshot";
  const meterOnly = run?.dataset.mode === "meter_only";

  return Object.fromEntries(
    PART_IDS.map((part): [PartId, PartState] => {
      if (part === "core") return [part, grey(part, "Not monitored (no sensor)")];
      if (!run || !timeSeries) return [part, grey(part, "Not available — no time series loaded")];

      if (part === "radiators" && (meterOnly || !hasCap(run, "residual_fidelity"))) {
        return [
          part,
          grey(
            part,
            meterOnly
              ? "Not available — running on meter data only: no measured oil temperature"
              : "Not available: no oil temperature sensor",
          ),
        ];
      }
      if (part === "conservator" && !hasCap(run, "oil_leak_theft")) {
        return [part, grey(part, "Not available: dataset has no oil level channel")];
      }
      if (part === "bushings" && !hasCap(run, "voltage_quality")) {
        return [part, grey(part, "Not available: dataset has no voltage channels")];
      }

      const mine = active.filter((a) => ALERT_TO_PART(a) === part);
      const status = worstStatus(mine);
      const sensorFault = mine.some((a) => a.origin === "sensor");
      const assetTypes = dedupe(mine.filter((a) => a.origin === "asset").map((a) => a.type.replace(/_/g, " ")));
      const reason = status !== "green" ? assetTypes.join(", ") : sensorFault ? SENSOR_NOTE : "Operating normally";
      return [part, { part, status, sensorFault, reason, estimated: part === "tank" && meterOnly }];
    }),
  ) as Record<PartId, PartState>;
}

/**
 * Alarm = worst part status (FRONTEND_HANDOFF §15.1, §15.4). Grey when no part has data.
 * Parts with a sensor fault stay green/grey here: a data fault never raises the alarm.
 */
export function alarmOf(parts: Record<PartId, PartState>): Status {
  const all = PART_IDS.map((p) => parts[p].status);
  if (all.includes("red")) return "red";
  if (all.includes("yellow")) return "yellow";
  return all.includes("green") ? "green" : "grey";
}
