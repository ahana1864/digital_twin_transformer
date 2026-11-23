import { createContext, useContext } from "react";
import type { PartId } from "./parts";
import type { PartState } from "./status";

/** The twin's stabilised per-part status (usePartStatus), shared by TwinModel, PartBadges and
 *  PartTooltip so they never disagree about what colour a part is this frame. */
export const TwinStatusContext = createContext<Record<PartId, PartState> | null>(null);

export function useTwinStatus(): Record<PartId, PartState> {
  const ctx = useContext(TwinStatusContext);
  if (!ctx) throw new Error("useTwinStatus must be used inside TwinStatusContext");
  return ctx;
}
