import { useDataset } from "../../context/DatasetContext";
import { fmt, humanise } from "../../lib/format";
import { at, hasCap } from "../../lib/series";
import Card, { EstimatedTag, Reason } from "./Card";
import Metric from "./Metric";

export default function LifeCard() {
  const { run, cursor } = useDataset();
  const rul = run?.rul;
  const meterOnly = run?.dataset.mode === "meter_only";

  if (!hasCap(run, "ageing_rul") || !rul) {
    return (
      <Card title="Life / RUL">
        <Reason>Not available: dataset has no ageing / remaining-life estimate.</Reason>
      </Card>
    );
  }
  return (
    <Card title="Life / RUL" aside={meterOnly && <EstimatedTag />}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="num text-xl font-semibold leading-tight">{rul.display}</div>
          <div className="text-xs text-muted-2">Remaining useful life, end of run</div>
        </div>
        <span
          className="shrink-0 rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          title="Risk class from the backend"
        >
          Risk: {humanise(rul.risk)}
        </span>
      </div>
      <div className="mt-2">
        <Metric
          label="Ageing rate now"
          value={fmt.rate(at(run, "ageing_rate_actual", cursor) ?? at(run, "ageing_rate_expected", cursor))}
          unit="×"
          reason="Missing value"
        />
        <Metric label="Ageing rate, recent" value={fmt.rate(rul.ageing_rate_recent)} unit="×" />
        <Metric label="Life consumed, expected" value={fmt.days(rul.life_consumed_expected_days)} unit="days" />
        <Metric label="Life consumed, actual" value={fmt.days(rul.life_consumed_actual_days)} unit="days" />
      </div>
      <div className="mt-1">
        <Reason>
          Recent rate, life consumed and RUL cover the whole run, not the replay position. 1.00 × = ageing at the
          reference hot-spot temperature.
        </Reason>
      </div>
    </Card>
  );
}
