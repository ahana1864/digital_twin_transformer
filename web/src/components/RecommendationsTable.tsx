import { useMemo } from "react";
import { useDataset } from "../context/DatasetContext";
import { formatIst, humanise, URGENCY_LABEL } from "../lib/format";
import Unavailable from "./Unavailable";

/** Recommendations for the alerts seen so far (newest first, repeats merged). */
export default function RecommendationsTable({ limit = 6 }: { limit?: number }) {
  const { run, seenAlerts } = useDataset();

  const rows = useMemo(() => {
    if (!run) return [];
    const byId = new Map(run.recommendations.map((r) => [r.id, r]));
    const seen = new Set<string>();
    const out: { rec: NonNullable<ReturnType<typeof byId.get>>; type: string; timestamp: string }[] = [];
    for (const a of [...seenAlerts].reverse()) {
      const rec = a.recommendation_id ? byId.get(a.recommendation_id) : undefined;
      if (!rec) continue;
      const key = `${rec.action}|${rec.test}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rec, type: a.type, timestamp: a.timestamp });
      if (out.length === limit) break;
    }
    return out;
  }, [run, seenAlerts, limit]);

  if (rows.length === 0) return <Unavailable reason="No recommendations at this point in the replay." />;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-panel">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-panel-2 text-xs text-muted-2">
          <tr>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Test</th>
            <th className="px-3 py-2 font-medium">Urgency</th>
            <th className="px-3 py-2 font-medium">Why</th>
            <th className="px-3 py-2 font-medium">Linked alert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ rec, type, timestamp }) => (
            <tr key={rec.id} className="border-t border-border align-top">
              <td className="px-3 py-2 font-medium">{rec.action}</td>
              <td className="px-3 py-2">{rec.test ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{URGENCY_LABEL[rec.urgency] ?? rec.urgency}</td>
              <td className="px-3 py-2">
                {rec.rationale}
                {rec.standard_ref && <span className="block text-xs text-muted-2">Ref: {rec.standard_ref}</span>}
              </td>
              <td className="px-3 py-2">
                {humanise(type)}
                <span className="num block text-xs text-muted-2">{formatIst(timestamp)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
