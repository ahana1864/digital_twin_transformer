import { FileSpreadsheet } from "lucide-react";
import { errorDetail } from "../api/client";
import { SimulatedTag } from "../components/AlertList";
import Metric from "../components/cards/Metric";
import DownloadReport from "../components/DownloadReport";
import Skeleton from "../components/Skeleton";
import StatusChip from "../components/StatusChip";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { downloadText, runToCsv } from "../lib/csv";
import { fmt, formatIst, humanise } from "../lib/format";

const th = "px-3 py-2 text-left text-xs font-medium text-muted-2";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-card border border-border bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Downloads, key figures and the lead-time table for the whole run (FRONTEND_HANDOFF §6.10). */
export default function Reports() {
  const { run, datasetsLoading, datasetsError, runLoading, runError } = useDataset();

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (datasetsError || runError) {
    return (
      <div className="p-6">
        <Unavailable reason={`Not available: ${errorDetail(datasetsError ?? runError)}`} />
      </div>
    );
  }
  if (!run) {
    return (
      <div className="p-6">
        <Unavailable reason="Not available: no dataset selected." />
      </div>
    );
  }

  const timeSeries = run.series.timestamp.length > 0;
  const alerts = run.alerts;
  const count = (f: (a: (typeof alerts)[number]) => boolean) => alerts.filter(f).length;
  const leadTimes = alerts.filter((a) => a.lead_time_h !== null).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const fault = run.gt_markers;
  const h = run.health;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Reports</h1>
        <span className="text-sm text-muted-2">{run.dataset.label}</span>
        {run.dataset.simulated && <SimulatedTag />}
      </div>
      <p className="-mt-2 text-sm text-muted-2">Everything here covers the whole run, not the replay position.</p>

      <Card title="Downloads">
        <div className="flex flex-wrap items-center gap-3">
          <DownloadReport />
          <button
            type="button"
            disabled={!timeSeries}
            onClick={() => downloadText(`${run.dataset.id}_run.csv`, runToCsv(run))}
            title={timeSeries ? "Every column of the run, one row per sample" : "This dataset has no time series to export"}
            className="inline-flex h-9 items-center gap-2 rounded-control border border-border bg-text px-3 text-sm font-medium text-panel disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-muted-2"
          >
            <FileSpreadsheet size={16} aria-hidden />
            {timeSeries ? "Export CSV" : "CSV: no time series"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-2">
          The PDF comes from the backend and stays disabled until it is ready. The CSV is built in the browser from the
          loaded run{run.dataset.simulated ? ", with a simulated column on every row" : ""}.
        </p>
      </Card>

      <Card title="Key figures">
        {!timeSeries ? (
          <Unavailable reason="Not available: this dataset has no time series, so there are no run-level figures." />
        ) : (
          <div className="grid gap-x-10 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-3 py-0.5 text-sm">
                <span className="text-muted-2">Health index (end of run)</span>
                {h ? (
                  <span className="flex items-center gap-2">
                    <span className="num font-medium">{fmt.pct(h.score)} / 100</span>
                    <StatusChip status={h.band} />
                  </span>
                ) : (
                  <span className="num text-muted-2">—</span>
                )}
              </div>
              {h?.capped && <p className="text-xs text-muted-2">Capped by a critical asset alarm.</p>}
              <Metric label="Remaining useful life" value={run.rul?.display ?? null} reason="Not available for this dataset" />
              <Metric label="Risk" value={run.rul ? humanise(run.rul.risk) : null} reason="Not available for this dataset" />
              <Metric label="Life consumed, expected" value={fmt.days(run.rul?.life_consumed_expected_days)} unit="days" reason="Not available for this dataset" />
              <Metric label="Life consumed, actual" value={fmt.days(run.rul?.life_consumed_actual_days)} unit="days" reason="Not available for this dataset" />
            </div>
            <div>
              <Metric label="Alerts" value={String(alerts.length)} />
              <Metric label="Critical" value={String(count((a) => a.severity === "critical"))} />
              <Metric label="Warning" value={String(count((a) => a.severity === "warning"))} />
              <Metric label="Asset-origin / sensor-origin" value={`${count((a) => a.origin === "asset")} / ${count((a) => a.origin === "sensor")}`} />
              <Metric label="Through-fault events" value={String(run.events.length)} />
              <Metric
                label="Span"
                value={run.data_health.span ? `${formatIst(run.data_health.span.start)} → ${formatIst(run.data_health.span.end)}` : null}
                reason="No timestamps"
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="Lead time">
        {!fault ? (
          <Unavailable reason="Not available: lead time is measured against an injected fault, and this dataset has none (only scenarios with a fault have one)." />
        ) : leadTimes.length === 0 ? (
          <Unavailable reason="No alert in this run carries a lead time." />
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-2">
              Injected fault: {fault.fault_label}, from <span className="num">{formatIst(fault.fault_start)}</span>. Lead time is how
              many hours before a plain-threshold alarm the twin raised the alert.
            </p>
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-panel-2">
                  <tr>
                    <th className={th}>Alert</th>
                    <th className={th}>Detector</th>
                    <th className={th}>Raised</th>
                    <th className={`${th} text-right`}>Lead time</th>
                  </tr>
                </thead>
                <tbody>
                  {leadTimes.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {humanise(a.type)} <span className="font-normal text-muted-2">({a.severity})</span>
                      </td>
                      <td className="px-3 py-2">{a.detector}</td>
                      <td className="num whitespace-nowrap px-3 py-2">{formatIst(a.timestamp)}</td>
                      <td className="num px-3 py-2 text-right">{a.lead_time_h!.toFixed(1)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
