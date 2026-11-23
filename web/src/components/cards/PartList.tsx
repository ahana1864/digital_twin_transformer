import { Info } from "lucide-react";
import { useUi } from "../../state/ui";
import StatusChip from "../StatusChip";
import { PART_IDS, PART_LABEL } from "../twin/parts";
import { useTwinStatus } from "../twin/TwinStatusContext";

/**
 * Status of every part with a one-line reason. Hovering (or focusing) a row lights that part up on
 * the 3D model; nothing opens, and the model is not touched otherwise.
 */
export default function PartList() {
  const status = useTwinStatus();
  const setListHover = useUi((s) => s.setListHover);

  return (
    <ul aria-label="Part status" className="flex flex-col">
      {PART_IDS.map((part) => {
        const st = status[part];
        return (
          <li
            key={part}
            tabIndex={0}
            onMouseEnter={() => setListHover(part)}
            onMouseLeave={() => setListHover(null)}
            onFocus={() => setListHover(part)}
            onBlur={() => setListHover(null)}
            className="flex items-start justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-bg focus-visible:bg-bg"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                {PART_LABEL[part]}
                {st.sensorFault && (
                  <span
                    title="A sensor-origin alert is active on this part"
                    className="inline-flex items-center gap-1 rounded-sm bg-sensor px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-panel"
                  >
                    <Info size={10} aria-hidden />
                    sensor
                  </span>
                )}
                {st.estimated && (
                  <span className="rounded-sm border border-border px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
                    Estimated by twin
                  </span>
                )}
              </div>
              <p className="text-xs leading-snug text-muted-2">{st.reason}</p>
            </div>
            <StatusChip status={st.status} />
          </li>
        );
      })}
    </ul>
  );
}
