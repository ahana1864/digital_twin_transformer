import { CircleSlash } from "lucide-react";

/** A panel that cannot be shown, with the short reason why (FRONTEND_HANDOFF §5, §10). */
export default function Unavailable({ reason, className = "" }: { reason: string; className?: string }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-card border border-dashed border-border bg-panel-2 p-4 text-sm text-muted-2 ${className}`}
    >
      <CircleSlash size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>{reason}</span>
    </div>
  );
}
