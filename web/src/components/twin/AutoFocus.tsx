import { useEffect, useRef } from "react";
import { useDataset } from "../../context/DatasetContext";
import { useUi } from "../../state/ui";
import { ALERT_TO_PART, type PartId } from "./parts";

const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 } as const;

/**
 * When the replay cursor moves forward past a new alert's timestamp (FRONTEND_HANDOFF §15.5), ease
 * the camera to the part it is on. A windings alert turns
 * X-ray on. Nothing pops up over the model: the details are in the panel and the alert lists.
 * Renders nothing. Only alerts that appear *during* a forward move count, so loading a dataset or
 * jumping backwards never moves the camera.
 */
export default function AutoFocus() {
  const { run, cursorTime, seenAlerts } = useDataset();
  const last = useRef<{ runId: string; ms: number } | null>(null);

  useEffect(() => {
    if (!run || !cursorTime) {
      last.current = null;
      return;
    }
    const ms = Date.parse(cursorTime);
    const prev = last.current;
    last.current = { runId: run.dataset.id, ms };
    if (!prev || prev.runId !== run.dataset.id || ms <= prev.ms) return;

    // The most severe new alert (latest on a tie) that sits on a part.
    let best: { part: PartId; rank: number; at: number } | null = null;
    for (const a of seenAlerts) {
      const at = Date.parse(a.timestamp);
      if (at <= prev.ms || at > ms) continue;
      const part = ALERT_TO_PART(a);
      if (!part) continue;
      const rank = SEVERITY_RANK[a.severity];
      if (!best || rank > best.rank || (rank === best.rank && at >= best.at)) best = { part, rank, at };
    }
    if (!best) return;

    useUi.getState().focusPart(best.part);
    if (best.part === "windings") useUi.setState({ xray: true });
  }, [run, cursorTime, seenAlerts]);

  return null;
}
