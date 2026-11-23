import { create } from "zustand";

/**
 * Replay speeds (FRONTEND_HANDOFF §8), labelled in transformer time. The handoff lists
 * "60x / 240x / 1440x" but also "1 day = 1 min / 15 s / 1 s", which do not agree (1440x is one day
 * per minute). The labels are what the user sees and demos, so `daySeconds` follows them.
 */
export const SPEEDS = [
  { daySeconds: 60, label: "1 day/min" },
  { daySeconds: 15, label: "1 day/15 s" },
  { daySeconds: 1, label: "1 day/s" },
] as const;

interface ReplayState {
  playing: boolean;
  /** Wall-clock seconds one day of transformer time takes */
  daySeconds: number;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (daySeconds: number) => void;
}

export const useReplay = create<ReplayState>((set) => ({
  playing: false,
  daySeconds: 60,
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (daySeconds) => set({ daySeconds }),
}));
