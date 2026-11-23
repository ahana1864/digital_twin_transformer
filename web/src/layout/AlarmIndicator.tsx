import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useDataset } from "../context/DatasetContext";
import { formatIst, humanise } from "../lib/format";
import { STATUS_META, type Status } from "../lib/status";
import { useUi } from "../state/ui";
import { ALERT_TO_PART, PART_LABEL } from "../components/twin/parts";

interface Props {
  status: Status;
  /** Why the status is what it is; shown as a tooltip */
  reason?: string;
}

/**
 * Worst part status (FRONTEND_HANDOFF §15.1, §15.4). Grey "NO DATA" when the backend is offline.
 * Click opens a dropdown of recent alerts; clicking one focuses that part on the Overview twin.
 */
export default function AlarmIndicator({ status, reason }: Props) {
  const { word, colour, Icon } = STATUS_META[status];
  const { seenAlerts } = useDataset();
  const focusPart = useUi((s) => s.focusPart);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const recent = seenAlerts.slice(-8).reverse();

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Alarm: ${word}. Show recent alerts.`}
        title={reason}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-2 rounded-full border pl-2 pr-3 text-xs font-semibold tracking-wide ${
          status === "red" ? "alarm-pulse" : ""
        }`}
        style={{
          borderColor: colour,
          background: `color-mix(in srgb, ${colour} 12%, var(--panel))`,
        }}
      >
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-panel"
          style={{ background: colour }}
        >
          <Icon size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <span>ALARM: {word}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Recent alerts"
          className="glass absolute left-0 top-full z-30 mt-2 max-h-96 w-80 overflow-y-auto p-2"
        >
          {recent.length === 0 ? (
            <p className="p-2 text-sm text-muted-2">No alerts at this point in the replay.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((a) => {
                const part = ALERT_TO_PART(a);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!part}
                      onClick={() => {
                        if (!part) return;
                        navigate("/");
                        focusPart(part);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col gap-0.5 rounded-control px-2 py-1.5 text-left text-sm hover:bg-panel-2 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{humanise(a.type)}</span>
                        <span className="num text-xs text-muted-2">{formatIst(a.timestamp)}</span>
                      </span>
                      <span className="text-xs text-muted-2">
                        {a.origin === "sensor" ? "Data fault" : a.severity.toUpperCase()}
                        {" · "}
                        {part ? PART_LABEL[part] : "General"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
