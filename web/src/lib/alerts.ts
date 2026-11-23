import type { Alert } from "../api/types";
import type { Status } from "./status";

/** An alert stays active for 24 h of replay time (FRONTEND_HANDOFF §15.4). [Open: confirm with P3] */
export const ACTIVE_WINDOW_MS = 24 * 3600_000;

/**
 * Alerts visible at `nowMs`: timestamp <= cursor. `alerts` must be sorted by time.
 * If the backend adds an alert end time, change only this file and `activeAlerts`.
 */
export function visibleAlerts(alerts: Alert[], nowMs: number): Alert[] {
  const out: Alert[] = [];
  for (const a of alerts) {
    if (Date.parse(a.timestamp) > nowMs) break;
    out.push(a);
  }
  return out;
}

/**
 * Active alerts: the latest alert of each type (and origin) within the 24 h window.
 * A later alert of the same type supersedes the earlier one.
 */
export function activeAlerts(visible: Alert[], nowMs: number): Alert[] {
  const latest = new Map<string, Alert>();
  for (const a of visible) latest.set(`${a.type}|${a.origin}`, a);
  return [...latest.values()].filter((a) => nowMs - Date.parse(a.timestamp) < ACTIVE_WINDOW_MS);
}

/** Part/module status from asset-origin alerts only; sensor-origin never counts (§15.4). */
export function worstStatus(alerts: Alert[]): Exclude<Status, "grey"> {
  let status: Exclude<Status, "grey"> = "green";
  for (const a of alerts) {
    if (a.origin !== "asset") continue;
    if (a.severity === "critical") return "red";
    if (a.severity === "warning") status = "yellow";
  }
  return status;
}

export const SENSOR_NOTE = "Data fault — check the device, not the transformer.";
