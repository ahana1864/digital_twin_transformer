import { create } from "zustand";
import type { PartId } from "../components/twin/parts";

interface UiState {
  /** X-ray: tank fades, windings and core show (FRONTEND_HANDOFF §15.2) */
  xray: boolean;
  toggleXray: () => void;

  /** Snapshot mode: the record picked in Snapshot records (the 3D view will colour parts for it) */
  selectedRecord: string | null;
  setSelectedRecord: (id: string | null) => void;

  /** Part under the pointer in the 3D view */
  hoveredPart: PartId | null;
  setHoveredPart: (part: PartId | null) => void;

  /** Part under the pointer in the panel's part list: highlights it on the model, without a tooltip */
  listHover: PartId | null;
  setListHover: (part: PartId | null) => void;

  /** focusPart(id): ask the camera rig to ease to a part. `nonce` makes repeat requests fire. */
  focusRequest: { part: PartId; nonce: number } | null;
  focusPart: (part: PartId) => void;

  /** Reset view: ease back to the default framing of the whole model */
  resetNonce: number;
  resetView: () => void;

  /** The .glb is still loading (shown as a DOM note: drei <Html> must not be used in a Suspense fallback) */
  modelLoading: boolean;
  setModelLoading: (loading: boolean) => void;

  /** The .glb failed to load and the primitive fallback is shown */
  modelFailed: boolean;
  setModelFailed: (failed: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  xray: false,
  toggleXray: () => set((s) => ({ xray: !s.xray })),

  selectedRecord: null,
  setSelectedRecord: (id) => set({ selectedRecord: id }),

  hoveredPart: null,
  setHoveredPart: (part) => set((s) => (s.hoveredPart === part ? s : { hoveredPart: part })),

  listHover: null,
  setListHover: (part) => set((s) => (s.listHover === part ? s : { listHover: part })),

  focusRequest: null,
  focusPart: (part) => set((s) => ({ focusRequest: { part, nonce: (s.focusRequest?.nonce ?? 0) + 1 } })),

  resetNonce: 0,
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),

  modelLoading: false,
  setModelLoading: (loading) => set({ modelLoading: loading }),

  modelFailed: false,
  setModelFailed: (failed) => set({ modelFailed: failed }),
}));
