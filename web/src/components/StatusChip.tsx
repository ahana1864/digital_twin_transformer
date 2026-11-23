import { STATUS_META, type Status } from "../lib/status";

/** NORMAL / WATCH / CRITICAL / NO DATA: icon and word, never colour alone (FRONTEND_HANDOFF §9). */
export default function StatusChip({ status, word }: { status: Status; word?: string }) {
  const { word: w, colour, Icon } = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide text-text"
      style={{ borderColor: colour, background: `color-mix(in srgb, ${colour} 14%, var(--panel))` }}
    >
      <Icon size={12} strokeWidth={2.5} aria-hidden style={{ color: colour }} />
      {word ?? w}
    </span>
  );
}
