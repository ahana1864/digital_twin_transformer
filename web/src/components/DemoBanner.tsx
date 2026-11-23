import { Clapperboard, Square } from "lucide-react";
import { stopDemo, useDemo } from "../state/demo";

/** Caption bar while the guided demo runs (FRONTEND_HANDOFF §15.8). */
export default function DemoBanner() {
  const { running, step, steps, title, caption, note } = useDemo();

  if (!running) {
    if (!note) return null;
    return (
      <div role="status" className="flex items-center gap-2 border-b border-border bg-accent-bg px-4 py-1.5 text-sm">
        <Clapperboard size={14} aria-hidden />
        <span>{note}</span>
        <button type="button" onClick={() => useDemo.setState({ note: null })} className="ml-auto text-xs font-medium underline">
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex shrink-0 items-center gap-3 border-b border-twin bg-accent-bg px-4 py-2">
      <span className="flex shrink-0 items-center gap-1.5 rounded-sm bg-text px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-panel">
        <Clapperboard size={12} aria-hidden />
        Guided demo {step}/{steps}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm">{caption}</p>
      </div>
      <span className="hidden shrink-0 text-xs text-muted-2 xl:block">Replays built-in scenarios. Nothing is injected live.</span>
      <button
        type="button"
        onClick={() => stopDemo("Guided demo stopped.")}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-border bg-panel px-2.5 text-sm font-medium hover:bg-bg"
      >
        <Square size={13} aria-hidden />
        Stop
      </button>
    </div>
  );
}
