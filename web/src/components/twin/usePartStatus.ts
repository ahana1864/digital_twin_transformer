import { useEffect, useRef, useState } from "react";
import { useDataset } from "../../context/DatasetContext";
import type { Status } from "../../lib/status";
import { PART_IDS, type PartId } from "./parts";
import { partStates, type PartState } from "./status";

const RANK: Record<Status, number> = { grey: 0, green: 1, yellow: 2, red: 3 };
const DOWNGRADE_STEPS = 3;

type Streak = { status: Status; count: number };
const freshStreak = (raw: Record<PartId, PartState>) =>
  Object.fromEntries(PART_IDS.map((p) => [p, { status: raw[p].status, count: 0 }])) as Record<PartId, Streak>;

/**
 * Stabilised part status for the 3D twin (FRONTEND_HANDOFF §15.4): colour upgrades (status gets
 * worse) show on the next cursor step; downgrades (status improves) show only once the better
 * value has held for 3 cursor steps, so one noisy sample never flickers the model. A dataset
 * switch resets immediately — that's a new context, not noise.
 */
export function usePartStatus(): Record<PartId, PartState> {
  const { run, active, cursor } = useDataset();
  const raw = partStates(run, active);
  const datasetId = run?.dataset.id ?? null;

  const lastDatasetId = useRef(datasetId);
  const shown = useRef<Record<PartId, PartState>>(raw);
  const streak = useRef<Record<PartId, Streak>>(freshStreak(raw));
  const [, setTick] = useState(0);

  if (datasetId !== lastDatasetId.current) {
    lastDatasetId.current = datasetId;
    shown.current = raw;
    streak.current = freshStreak(raw);
  }

  useEffect(() => {
    // Copy-on-write: consumers (TwinModel, tooltip, alarm) depend on the object's identity changing.
    const nextShown = { ...shown.current };
    let changed = false;
    for (const part of PART_IDS) {
      const next = raw[part];
      const prev = shown.current[part];
      if (RANK[next.status] >= RANK[prev.status]) {
        // Upgrade (or same severity, e.g. a sensor fault toggling): show immediately.
        streak.current[part] = { status: next.status, count: 0 };
        if (next.status !== prev.status || next.sensorFault !== prev.sensorFault || next.reason !== prev.reason) {
          nextShown[part] = next;
          changed = true;
        }
        continue;
      }
      // Downgrade: only commit once the better status has held for 3 cursor steps.
      const s = streak.current[part];
      streak.current[part] = s.status === next.status ? { status: s.status, count: s.count + 1 } : { status: next.status, count: 1 };
      if (streak.current[part].count >= DOWNGRADE_STEPS) {
        nextShown[part] = next;
        changed = true;
      }
    }
    if (changed) {
      shown.current = nextShown;
      setTick((t) => t + 1);
    }
    // `raw` is derived from run/active each render; cursor is what actually steps the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, run, active]);

  return shown.current;
}
