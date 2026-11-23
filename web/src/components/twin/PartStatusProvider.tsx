import type { ReactNode } from "react";
import { TwinStatusContext } from "./TwinStatusContext";
import { usePartStatus } from "./usePartStatus";

/**
 * Stabilised part status for the whole app (FRONTEND_HANDOFF §15.4 anti-flicker). It lives above
 * the router so the header alarm, the twin and its tooltips all read the same value, on every
 * page, whether or not the canvas is mounted.
 */
export default function PartStatusProvider({ children }: { children: ReactNode }) {
  const status = usePartStatus();
  return <TwinStatusContext.Provider value={status}>{children}</TwinStatusContext.Provider>;
}
