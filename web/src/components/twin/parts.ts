// Part map for the 3D twin (FRONTEND_HANDOFF §15.2, §15.3). Presentation only.

import type { Alert } from "../../api/types";

export type PartId = "windings" | "tank" | "radiators" | "conservator" | "bushings" | "core";

export const PART_IDS: PartId[] = ["windings", "tank", "radiators", "conservator", "bushings", "core"];

export const PART_LABEL: Record<PartId, string> = {
  windings: "Windings (R/Y/B)",
  tank: "Tank",
  radiators: "Radiators",
  conservator: "Conservator",
  bushings: "Bushings",
  core: "Core",
};

/** Mesh name prefixes in transformer_parts.glb (28 named meshes, tools/split_glb.py). */
const PREFIXES: [prefix: string, part: PartId][] = [
  ["tank", "tank"], // tank + tank_fitting_*
  ["conservator", "conservator"],
  ["radiator", "radiators"], // banks, headers, pipes
  ["bushing", "bushings"], // hv, lv, bases
  ["winding_", "windings"], // built in code
  ["core", "core"], // built in code
];

/** Part for a mesh name, or null for nodes that are not part meshes (groups, roots). */
export function partOfMesh(name: string): PartId | null {
  const n = name.toLowerCase();
  for (const [prefix, part] of PREFIXES) if (n.startsWith(prefix)) return part;
  return null;
}

/**
 * Alert.type → part (FRONTEND_HANDOFF §15.3 table), for the types that need more precision than
 * the module (e.g. "electrical" covers both winding current and bushing voltage).
 */
const TYPE_TO_PART: Record<string, PartId> = {
  // Overloading / insulation: windings carry the current and the hot-spot that drives ageing.
  overload: "windings",
  loading: "windings",
  hot_spot: "windings",
  // Electrical, current side (unbalance, neutral proxy).
  unbalance: "windings",
  neutral: "windings",
  // Short circuit: through-faults stress the windings.
  through_fault: "windings",
  // Top-oil, measured or twin, and OTI sensor faults: tank.
  top_oil: "tank",
  jump_oti: "tank",
  range_oti: "tank",
  // Residual drift / cooling degradation: radiators.
  residual_drift: "radiators",
  // Oil level (leak, theft, low level) and its sensor faults: conservator.
  oil_leak: "conservator",
  oil_theft: "conservator",
  oil_level_low: "conservator",
  oli_drift: "conservator",
  // Electrical, voltage side: bushings.
  voltage_unbalance: "bushings",
  voltage_high: "bushings",
  voltage_low: "bushings",
  voltage_deviation: "bushings",
};

/** Alert.module → part, used when `type` is not in the table above. */
const MODULE_TO_PART: Record<Alert["module"], PartId> = {
  overloading: "windings",
  insulation: "windings",
  short_circuit: "windings",
  electrical: "windings",
  oil: "conservator",
  moisture: "conservator",
  data: "tank",
};

/**
 * Part an alert is placed on (FRONTEND_HANDOFF §15.3). `alert.part` wins when the backend sends
 * one we recognise; otherwise `type`, then `module`. Presentation only: never changes severity or
 * creates alerts. Returns null for an alert that matches no known part — it still shows in the
 * alert list (as "General"), it is just not placed on the twin.
 */
export function ALERT_TO_PART(alert: Alert): PartId | null {
  if (alert.part && (PART_IDS as readonly string[]).includes(alert.part)) return alert.part as PartId;
  return TYPE_TO_PART[alert.type] ?? MODULE_TO_PART[alert.module] ?? null;
}
