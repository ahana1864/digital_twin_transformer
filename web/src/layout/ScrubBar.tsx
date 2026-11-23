import { useMemo } from "react";
import { SkipForward, TriangleAlert } from "lucide-react";
import { useDataset } from "../context/DatasetContext";
import { formatIst, humanise } from "../lib/format";
import { faultJumpIndex, indexAtOrAfter } from "../lib/replay";

const button =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-border bg-panel px-2.5 text-sm disabled:cursor-not-allowed disabled:text-muted";

/** Scrub bar (FRONTEND_HANDOFF §15.1): slider, jump to injected fault, jump to next alert. Play is in the header. */
export default function ScrubBar() {
  const { run, steps, cursor, setCursor, cursorTime } = useDataset();
  const fault = run?.gt_markers;

  const alertTimes = useMemo(
    () => (run ? run.alerts.map((a) => ({ ms: Date.parse(a.timestamp), alert: a })).sort((a, b) => a.ms - b.ms) : []),
    [run],
  );
  // First alert (any origin) later than the cursor.
  const nextAlert = cursorTime ? alertTimes.find((a) => a.ms > Date.parse(cursorTime))?.alert : undefined;

  // "Jump to injected fault": 1 day before gt_markers.fault_start (§8).
  const jumpToFault = () => {
    const index = run ? faultJumpIndex(run) : null;
    if (index !== null) setCursor(index);
  };
  const jumpToNextAlert = () => {
    if (!run || !nextAlert) return;
    const index = indexAtOrAfter(run, Date.parse(nextAlert.timestamp));
    if (index >= 0) setCursor(index);
  };

  if (steps === 0) return null;
  return (
    <div
      role="group"
      aria-label="Replay position"
      className="flex h-scrub shrink-0 items-center gap-3 border-t border-border bg-panel px-4"
    >
      <input
        type="range"
        aria-label="Replay position"
        min={0}
        max={steps - 1}
        value={cursor}
        onChange={(e) => setCursor(Number(e.target.value))}
        className="min-w-0 flex-1 accent-(--text)"
      />
      <span className="num w-48 shrink-0 text-right text-sm">{cursorTime ? formatIst(cursorTime) : "—"}</span>
      {fault && (
        <button type="button" onClick={jumpToFault} className={button} title={`Injected fault: ${fault.fault_label}`}>
          <SkipForward size={15} aria-hidden />
          Jump to injected fault
        </button>
      )}
      <button
        type="button"
        onClick={jumpToNextAlert}
        disabled={!nextAlert}
        className={button}
        title={
          nextAlert
            ? `Next: ${humanise(nextAlert.type)} at ${formatIst(nextAlert.timestamp)}`
            : "No later alert in this run"
        }
      >
        <TriangleAlert size={15} aria-hidden />
        Next alert
      </button>
    </div>
  );
}
