import { Pause, Play } from "lucide-react";
import { useDataset } from "../context/DatasetContext";
import { SPEEDS, useReplay } from "../state/replay";

const control = "h-9 rounded-control border border-border bg-panel text-sm";

/** Play/pause and speed (FRONTEND_HANDOFF §8). Hidden when the dataset has no time series. */
export default function ReplayControls() {
  const { steps } = useDataset();
  const playing = useReplay((s) => s.playing);
  const daySeconds = useReplay((s) => s.daySeconds);
  const toggle = useReplay((s) => s.togglePlaying);
  const setSpeed = useReplay((s) => s.setSpeed);

  if (steps === 0) return null;
  return (
    <div role="group" aria-label="Replay" className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        aria-pressed={playing}
        onClick={toggle}
        className={`${control} flex w-9 items-center justify-center hover:bg-bg`}
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      <select
        aria-label="Replay speed"
        value={daySeconds}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className={`${control} px-2`}
      >
        {SPEEDS.map((s) => (
          <option key={s.daySeconds} value={s.daySeconds}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
