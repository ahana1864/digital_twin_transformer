import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { useDataset } from "../../context/DatasetContext";
import { SENSOR_NOTE } from "../../lib/alerts";
import { STATUS_META } from "../../lib/status";
import { useUi } from "../../state/ui";
import StatusChip from "../StatusChip";
import { PART_LABEL } from "./parts";
import { keyReading } from "./readings";
import { useTwinStatus } from "./TwinStatusContext";

const WIDTH = 260;

/**
 * Glass tooltip next to the pointer (FRONTEND_HANDOFF §15.5, §15.6): part name, status chip and
 * one key reading from the series at the cursor.
 */
export default function PartTooltip({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const part = useUi((s) => s.hoveredPart);
  const { run, cursor } = useDataset();
  const status = useTwinStatus();
  const [pos, setPos] = useState({ x: 0, y: 0, w: 0 });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setPos({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
    };
    el.addEventListener("pointermove", move);
    return () => el.removeEventListener("pointermove", move);
  }, [container]);

  if (!part) return null;
  const reading = keyReading(part, run, cursor);
  const st = status[part];
  const left = pos.x + 16 + WIDTH > pos.w ? pos.x - 16 - WIDTH : pos.x + 16;
  const style: CSSProperties & { "--status-colour"?: string } = {
    left: Math.max(8, left),
    top: pos.y + 16,
    width: WIDTH,
    "--status-colour": STATUS_META[st.status].colour,
  };

  return (
    <div role="tooltip" className="glass glass-readable pointer-events-none absolute z-10 px-3 py-2" style={style}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{PART_LABEL[part]}</span>
        <StatusChip status={st.status} />
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted-2">
          {reading.tone && (
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: reading.tone === "measured" ? "var(--measured)" : "var(--twin)" }}
            />
          )}
          {reading.label}
        </span>
        {reading.value !== null && <span className="num font-medium">{reading.value}</span>}
      </div>
      {reading.value === null && reading.reason && <p className="text-xs text-muted-2">{reading.reason}</p>}
      {st.sensorFault && <p className="mt-1 text-xs font-medium text-sensor">{SENSOR_NOTE}</p>}
    </div>
  );
}
