const W = 160;
const H = 32;

/** Tiny line of the given values; null breaks the line. Used for the Import preview. */
export default function Sparkline({ label, values }: { label: string; values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) {
    return (
      <p className="py-1 text-xs text-muted-2">
        {label}: not enough numeric rows to plot
      </p>
    );
  }
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (W - 4);
  const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6);
  const runs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (cur.length) runs.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) runs.push(cur.join(" "));
  return (
    <figure className="mt-1">
      <figcaption className="num flex justify-between text-[11px] text-muted-2">
        <span>{label}</span>
        <span>
          {lo.toFixed(1)}–{hi.toFixed(1)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${label} from ${lo} to ${hi}`}>
        {runs.map((pts, k) => (
          <polyline key={k} points={pts} fill="none" stroke="var(--muted-2)" strokeWidth={1.5} />
        ))}
      </svg>
    </figure>
  );
}
