import type { Alert, Run } from "../api/types";
import { worstStatus } from "./alerts";
import { hasCap } from "./series";
import type { Status } from "./status";

// Failure module strip (FRONTEND_HANDOFF §6.3). Placement by Alert.module is presentation only.
const MODULES = [
  { id: "overloading", label: "Overloading", modules: ["overloading"], cap: null, reason: "" },
  {
    id: "insulation",
    label: "Insulation",
    modules: ["insulation"],
    cap: "ageing_rul",
    reason: "Not available — dataset has no ageing / life estimate",
  },
  {
    id: "short_circuit",
    label: "Short circuit",
    modules: ["short_circuit"],
    cap: "through_fault",
    reason: "Not available — needs an event log",
  },
  {
    id: "oil",
    label: "Oil level",
    modules: ["oil", "moisture"],
    cap: "oil_leak_theft",
    reason: "Not available — dataset has no oil level channel",
  },
] as const;

export interface ModuleState {
  id: string;
  label: string;
  status: Status;
  /** Why it is grey, or the latest active alert */
  detail: string;
}

export function moduleStates(run: Run | undefined, active: Alert[]): ModuleState[] {
  return MODULES.map((m) => {
    if (!run || run.dataset.mode === "data_only" || run.dataset.mode === "snapshot") {
      return { id: m.id, label: m.label, status: "grey", detail: "Not available — no time series loaded" };
    }
    if (m.cap && !hasCap(run, m.cap)) return { id: m.id, label: m.label, status: "grey", detail: m.reason };
    const mine = active.filter((a) => (m.modules as readonly string[]).includes(a.module));
    const status = worstStatus(mine);
    const asset = mine.filter((a) => a.origin === "asset");
    const detail =
      status === "green"
        ? "Operating normally"
        : asset.map((a) => a.type.replace(/_/g, " ")).filter((t, i, all) => all.indexOf(t) === i).join(", ");
    return { id: m.id, label: m.label, status, detail };
  });
}
