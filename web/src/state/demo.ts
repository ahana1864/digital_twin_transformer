import { create } from "zustand";
import { useReplay } from "./replay";

interface DemoState {
  running: boolean;
  /** 1-based step shown in the banner */
  step: number;
  steps: number;
  title: string;
  caption: string;
  /** Guided demo bookkeeping, for a "finished" or "could not run" note */
  note: string | null;
}

export const useDemo = create<DemoState>(() => ({ running: false, step: 0, steps: 0, title: "", caption: "", note: null }));

/** Bumped on every start and stop: a running script ends as soon as its token is stale. */
export const demoToken = { current: 0 };

/** Stop the guided demo (or invalidate any shortcut still loading) and pause replay. */
export function stopDemo(note: string | null = null) {
  demoToken.current += 1;
  useReplay.getState().setPlaying(false);
  useDemo.setState({ running: false, step: 0, steps: 0, title: "", caption: "", note });
}
