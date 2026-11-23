import type { ReactNode } from "react";

export default function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-2">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Small inline reason for something that is hidden or missing. */
export function Reason({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-snug text-muted-2">{children}</p>;
}

/** "Estimated by twin" tag (FRONTEND_HANDOFF §5, §7.7). */
export function EstimatedTag() {
  return (
    <span className="rounded-sm border border-border px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
      Estimated by twin
    </span>
  );
}
