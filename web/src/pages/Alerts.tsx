import { useEffect, useMemo, useState } from "react";
import { errorDetail } from "../api/client";
import type { Alert } from "../api/types";
import { OriginBadge, SeverityChip, SimulatedTag } from "../components/AlertList";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { SENSOR_NOTE } from "../lib/alerts";
import { formatIst, humanise, URGENCY_LABEL } from "../lib/format";

type Filters = { severity: string; module: string; origin: string; detector: string };
const NO_FILTERS: Filters = { severity: "", module: "", origin: "", detector: "" };

const field = "h-9 rounded-control border border-border bg-panel px-2 text-sm";
const th = "px-3 py-2 text-left text-xs font-medium text-muted-2";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-2">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} min-w-32 text-text`}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {humanise(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

const unique = (v: string[]) => [...new Set(v)].sort();
const fmtNum = (v: number | null) => (v === null ? "—" : String(Number.isInteger(v) ? v : Number(v.toFixed(2))));

export default function Alerts() {
  const { run, datasetsLoading, datasetsError, runLoading, runError, seenAlerts, cursorTime, dataset } = useDataset();
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [highlight, setHighlight] = useState<string | null>(null);
  // Alert a recommendation click is waiting to scroll to, once the table has re-rendered.
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const all = useMemo(
    () => (run ? [...run.alerts].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)) : []),
    [run],
  );
  // Replay cursor: only alerts with timestamp <= cursor, unless "show all".
  const inScope = useMemo(() => {
    if (showAll) return all;
    const seen = new Set(seenAlerts.map((a) => a.id));
    return all.filter((a) => seen.has(a.id));
  }, [all, showAll, seenAlerts]);
  const rows = useMemo(
    () =>
      inScope.filter(
        (a) =>
          (!filters.severity || a.severity === filters.severity) &&
          (!filters.module || a.module === filters.module) &&
          (!filters.origin || a.origin === filters.origin) &&
          (!filters.detector || a.detector === filters.detector),
      ),
    [inScope, filters],
  );
  const options = useMemo(
    () => ({
      severity: unique(all.map((a) => a.severity)),
      module: unique(all.map((a) => a.module)),
      origin: unique(all.map((a) => a.origin)),
      detector: unique(all.map((a) => a.detector)),
    }),
    [all],
  );

  const recs = useMemo(() => {
    if (!run) return [];
    const alertOf = new Map<string, Alert>();
    for (const a of run.alerts) {
      alertOf.set(a.id, a);
      if (a.recommendation_id) alertOf.set(a.recommendation_id, a);
    }
    const visible = new Set(inScope.map((a) => a.id));
    return run.recommendations
      .map((rec) => ({ rec, alert: alertOf.get(rec.alert_id) ?? alertOf.get(rec.id) }))
      .filter(({ alert }) => !alert || showAll || visible.has(alert.id))
      .sort((a, b) => Date.parse(b.alert?.timestamp ?? "0") - Date.parse(a.alert?.timestamp ?? "0"));
  }, [run, inScope, showAll]);

  const goToAlert = (id: string) => {
    // If the linked alert is hidden by the cursor or a filter, show it: reset both first.
    if (!rows.some((a) => a.id === id)) {
      setShowAll(true);
      setFilters(NO_FILTERS);
    }
    setHighlight(id);
    setPendingScroll(id);
  };
  useEffect(() => {
    if (!pendingScroll) return;
    document.getElementById(`alert-${pendingScroll}`)?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    setPendingScroll(null);
  }, [pendingScroll, rows]);
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 3500);
    return () => clearTimeout(t);
  }, [highlight]);

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
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
  if (!run || !dataset) {
    return (
      <div className="p-6">
        <Unavailable reason="Not available: no dataset selected." />
      </div>
    );
  }
  if (run.dataset.mode === "snapshot" || run.dataset.mode === "data_only") {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-3 text-xl font-semibold">Alerts &amp; Maintenance</h1>
        <Unavailable
          reason={
            run.dataset.mode === "snapshot"
              ? "Not available: records have no timestamps, so there is no alert timeline. See Snapshot records."
              : "Not available: the twin cannot run on this dataset, so no alerts are produced. See Data Health."
          }
        />
      </div>
    );
  }

  const filtered = Object.values(filters).some(Boolean);
  const leadCount = all.filter((a) => a.lead_time_h !== null).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Alerts &amp; Maintenance</h1>
        <p className="text-sm text-muted-2">
          {showAll
            ? "Every alert in this run."
            : `Alerts up to the replay position${cursorTime ? ` (${formatIst(cursorTime)})` : ""}.`}
        </p>
      </div>

      <section aria-label="Alerts" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Severity" value={filters.severity} options={options.severity} onChange={(v) => setFilters({ ...filters, severity: v })} />
          <FilterSelect label="Module" value={filters.module} options={options.module} onChange={(v) => setFilters({ ...filters, module: v })} />
          <FilterSelect label="Origin" value={filters.origin} options={options.origin} onChange={(v) => setFilters({ ...filters, origin: v })} />
          <FilterSelect label="Detector" value={filters.detector} options={options.detector} onChange={(v) => setFilters({ ...filters, detector: v })} />
          {filtered && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="h-9 text-sm font-medium text-twin underline">
              Clear filters
            </button>
          )}
          <label className="ml-auto flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all alerts (ignore the replay position)
          </label>
        </div>

        <p className="text-sm text-muted-2" aria-live="polite">
          Showing <span className="num font-medium text-text">{rows.length}</span> of{" "}
          <span className="num">{all.length}</span> alerts
          {leadCount > 0 && <> · {leadCount} with a lead time</>}
        </p>

        {rows.length === 0 ? (
          <Unavailable
            reason={
              all.length === 0
                ? "No alerts in this run."
                : filtered
                  ? "No alerts match these filters."
                  : "No alerts at this point in the replay. Move the replay forward or show all alerts."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-panel">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-panel-2">
                <tr>
                  <th className={th}>Time</th>
                  <th className={th}>Module</th>
                  <th className={th}>Type</th>
                  <th className={th}>Severity</th>
                  <th className={th}>Origin</th>
                  <th className={th}>Detector</th>
                  <th className={`${th} text-right`}>Value / threshold</th>
                  <th className={th}>Explanation</th>
                  <th className={`${th} text-right`}>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const sensor = a.origin === "sensor";
                  return (
                    <tr
                      key={a.id}
                      id={`alert-${a.id}`}
                      data-origin={a.origin}
                      data-highlight={highlight === a.id ? "true" : undefined}
                      className={`border-t border-border align-top ${sensor ? "bg-panel-2" : ""} ${
                        highlight === a.id ? "outline outline-2 -outline-offset-2 outline-twin" : ""
                      }`}
                    >
                      <td className={`num whitespace-nowrap px-3 py-2 ${sensor ? "border-l-4 border-dashed border-l-sensor" : "border-l-4 border-l-transparent"}`}>
                        {formatIst(a.timestamp)}
                      </td>
                      <td className="px-3 py-2">{humanise(a.module)}</td>
                      <td className="px-3 py-2 font-medium">{humanise(a.type)}</td>
                      <td className="px-3 py-2">
                        <SeverityChip alert={a} />
                      </td>
                      <td className="px-3 py-2">
                        <OriginBadge origin={a.origin} />
                      </td>
                      <td className="px-3 py-2">{a.detector}</td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">
                        {fmtNum(a.value)} / {fmtNum(a.threshold)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{a.explanation}</span>
                          {a.simulated && <SimulatedTag />}
                        </div>
                        {sensor && <p className="mt-1 font-medium text-sensor">{SENSOR_NOTE}</p>}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-right">
                        {a.lead_time_h === null ? "—" : `${a.lead_time_h.toFixed(1)} h`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Recommendations" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Recommendations</h2>
        {recs.length === 0 ? (
          <Unavailable
            reason={
              run.recommendations.length === 0
                ? "No recommendations in this run."
                : "No recommendations at this point in the replay. Move the replay forward or show all alerts."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-panel">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-panel-2">
                <tr>
                  <th className={th}>Action</th>
                  <th className={th}>Test</th>
                  <th className={th}>Urgency</th>
                  <th className={th}>Rationale</th>
                  <th className={th}>Standard</th>
                  <th className={th}>Linked alert</th>
                </tr>
              </thead>
              <tbody>
                {recs.map(({ rec, alert }) => (
                  <tr
                    key={rec.id}
                    onClick={() => alert && goToAlert(alert.id)}
                    className={`border-t border-border align-top ${alert ? "cursor-pointer hover:bg-bg" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium">{rec.action}</td>
                    <td className="px-3 py-2">{rec.test ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{URGENCY_LABEL[rec.urgency] ?? rec.urgency}</td>
                    <td className="px-3 py-2">{rec.rationale}</td>
                    <td className="px-3 py-2">{rec.standard_ref ?? "—"}</td>
                    <td className="px-3 py-2">
                      {alert ? (
                        <button
                          type="button"
                          onClick={() => goToAlert(alert.id)}
                          className="text-left text-twin underline underline-offset-2"
                          title="Scroll to this alert in the table above"
                        >
                          {humanise(alert.type)}
                          <span className="num block text-xs text-muted-2 no-underline">{formatIst(alert.timestamp)}</span>
                        </button>
                      ) : (
                        <span className="text-muted-2">Alert {rec.alert_id} not found</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
