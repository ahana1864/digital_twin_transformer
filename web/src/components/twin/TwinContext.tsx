import { createContext, useContext, type MutableRefObject } from "react";
import type { Box3 } from "three";
import type { PartId } from "./parts";

/** What TwinModel exposes to the camera rig. */
export interface TwinApi {
  /** World-space bounds of a part, or null if it has no meshes */
  partBox: (part: PartId) => Box3 | null;
  /** World-space bounds of each mesh of a part, with its name */
  meshBoxes: (part: PartId) => { name: string; box: Box3 }[];
}

export const TwinContext = createContext<MutableRefObject<TwinApi | null> | null>(null);

export function useTwinApi() {
  const ctx = useContext(TwinContext);
  if (!ctx) throw new Error("useTwinApi must be used inside TwinContext");
  return ctx;
}
