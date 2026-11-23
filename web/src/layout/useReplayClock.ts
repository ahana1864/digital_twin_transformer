import { useEffect, useRef } from "react";
import { useDataset } from "../context/DatasetContext";
import { useReplay } from "../state/replay";

const DAY_MS = 24 * 3600_000;
const TICK_MS = 100;

/**
 * Advances the replay cursor while playing (FRONTEND_HANDOFF §8). Client-side: the run is already
 * in memory. Mounted once in the shell, so replay keeps going on every page. Pauses at the end and
 * whenever the dataset changes.
 */
export function useReplayClock() {
  const { run, steps, cursor, setCursor } = useDataset();
  const playing = useReplay((s) => s.playing);
  const daySeconds = useReplay((s) => s.daySeconds);
  const live = useRef({ cursor, steps });
  live.current = { cursor, steps };

  const runId = run?.dataset.id ?? null;
  useEffect(() => {
    useReplay.getState().setPlaying(false);
  }, [runId]);

  const stepMs =
    run && run.series.timestamp.length > 1
      ? Date.parse(run.series.timestamp[1]) - Date.parse(run.series.timestamp[0])
      : 0;

  useEffect(() => {
    if (!playing || steps < 2 || stepMs <= 0) return;
    // Starting play at the end restarts from the beginning.
    if (live.current.cursor >= live.current.steps - 1) {
      setCursor(0);
      live.current.cursor = 0;
    }
    const stepsPerSecond = DAY_MS / daySeconds / stepMs;
    let acc = 0;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      acc += ((now - last) / 1000) * stepsPerSecond;
      last = now;
      const whole = Math.floor(acc);
      if (whole < 1) return;
      acc -= whole;
      const { cursor: c, steps: n } = live.current;
      const next = Math.min(c + whole, n - 1);
      setCursor(next);
      live.current.cursor = next;
      if (next >= n - 1) useReplay.getState().setPlaying(false);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, daySeconds, steps, stepMs, setCursor]);
}
