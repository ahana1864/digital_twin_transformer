interface Props {
  label: string;
  /** Formatted number, or null when missing */
  value: string | null | undefined;
  unit?: string;
  /** Measured = orange, twin = blue, everywhere (FRONTEND_HANDOFF §7.4) */
  tone?: "measured" | "twin";
  /** Shown under the label when the value is missing */
  reason?: string;
}

/** One reading: label, value + unit. Missing values show "—" and the reason, never a blank. */
export default function Metric({ label, value, unit, tone, reason }: Props) {
  const missing = value === null || value === undefined;
  return (
    <div className="py-0.5" title={missing ? reason : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-2">
          {tone && (
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: tone === "measured" ? "var(--measured)" : "var(--twin)" }}
            />
          )}
          <span>{label}</span>
        </span>
        {missing ? (
          <span className="num shrink-0 text-sm text-muted-2">—</span>
        ) : (
          <span className="num shrink-0 text-sm font-medium">
            {value}
            {unit && <span className="ml-1 text-xs font-normal text-muted-2">{unit}</span>}
          </span>
        )}
      </div>
      {missing && reason && <p className="text-xs leading-snug text-muted-2">{reason}</p>}
    </div>
  );
}
