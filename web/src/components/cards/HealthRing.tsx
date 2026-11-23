import type { Band } from "../../api/types";
import { fmt } from "../../lib/format";
import { STATUS_META } from "../../lib/status";

const R = 46;
const C = 2 * Math.PI * R;

/** Health index as a ring: the arc is the score out of 100, coloured by the band the backend gives. */
export default function HealthRing({ score, band }: { score: number; band: Band }) {
  const frac = Math.min(1, Math.max(0, score / 100));
  const colour = STATUS_META[band].colour;
  return (
    <svg viewBox="0 0 120 120" width={112} height={112} role="img" aria-label={`Health index ${fmt.pct(score)} out of 100`} className="shrink-0">
      <circle cx={60} cy={60} r={R} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle
        cx={60}
        cy={60}
        r={R}
        fill="none"
        stroke={colour}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${C * frac} ${C}`}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 300ms ease-out" }}
      />
      <text x={60} y={62} textAnchor="middle" fontSize={25} fontWeight={600} fill="var(--text)" style={{ fontFamily: "var(--font-mono)" }}>
        {fmt.pct(score)}
      </text>
      <text x={60} y={80} textAnchor="middle" fontSize={11} fill="var(--muted-2)">
        / 100
      </text>
    </svg>
  );
}
