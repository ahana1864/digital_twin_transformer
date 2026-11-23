import type { ReactNode } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { errorDetail } from "../api/client";
import type { Mode, Plausibility } from "../api/types";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";
import { flagText } from "../lib/flags";
import { formatIst, MODE_LABEL } from "../lib/format";

// What each mode means (FRONTEND_HANDOFF §5).
const MODE_TEXT: Record<Mode, string> = {
  full: "Measured oil temperature is available: every analysis can run.",
  meter_only: "No oil temperature sensor: temperatures are estimated by the twin, and residual and fidelity are off.",
  snapshot: "Records have no timestamps: no time charts and no replay. See Snapshot records.",
  data_only: "The twin cannot run on this dataset (for example no current): only this page and the raw data are available.",
};

// Readable names for the capability flags the mock and handoff §5 use. Unknown flags show as-is.
const CAPABILITY_LABEL: Record<string, string> = {
  residual_fidelity: "Residual and fidelity",
  unbalance: "Current unbalance",
  voltage_quality: "Voltage quality",
  neutral_current: "Measured neutral current",
  oil_leak_theft: "Oil leak / theft",
  through_fault: "Through-fault log",
  ageing_rul: "Ageing and remaining life",
  breathing: "Moisture exposure (experimental)",
};

const VERDICT: Record<Plausibility, { word: string; cls: string }> = {
  plausible: { word: "PLAUSIBLE", cls: "border-health-green text-text" },
  suspect: { word: "SUSPECT", cls: "border-health-yellow text-text" },
  not_checked: { word: "NOT CHECKED", cls: "border-border text-muted-2" },
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-panel p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-2">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-2">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

const None = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-2">{children}</p>;

export default function DataHealth() {
  const { dataset, run, datasetsLoading, datasetsError, runLoading, runError } = useDataset();

  if (datasetsLoading || runLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
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

  const h = run.data_health;
  const caps = Object.entries(run.capabilities);
  const estimated = h.nameplate_source === "Estimated";
  const sensors = Object.entries(run.plausibility) as [string, Plausibility][];
  const flags = Object.entries(h.flag_counts).sort(([, a], [, b]) => b - a);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Data Health</h1>
        <span className="text-sm text-muted-2">{run.dataset.label}</span>
      </div>

      {estimated && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-health-red bg-panel p-3 text-sm font-medium text-health-red">
          <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          Nameplate estimated from the data: the rating is not confirmed. Rated current and everything derived from it
          are estimates.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Mode">
          <div className="flex items-center gap-2">
            <span className="rounded-control border border-border bg-panel-2 px-2 py-0.5 text-xs font-semibold tracking-wide">
              {MODE_LABEL[h.mode]}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-2">{MODE_TEXT[h.mode]}</p>
        </Card>

        <Card title="Data">
          <Stat label="Rows read" value={h.rows_read} />
          <Stat label="Rows after cleaning" value={h.rows_clean} />
          <Stat label="Span" value={h.span ? `${formatIst(h.span.start)} → ${formatIst(h.span.end)}` : "—"} />
          <Stat label="Interval" value={h.interval_min !== null ? `${h.interval_min} min` : "—"} />
          {!h.span && <None>No time span: the records have no timestamps.</None>}
        </Card>

        <Card title="Nameplate source">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                estimated ? "border-health-red text-health-red" : "border-border text-text"
              }`}
            >
              {h.nameplate_source.toUpperCase()}
            </span>
            <span className="num text-muted-2">
              {run.asset.rated_kva} kVA · {run.asset.lv_v} V · rated {Math.round(run.asset.i_rated_a)} A
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(run.asset.tags).map(([k, tag]) => (
              <li key={k} className="rounded-sm border border-border px-1.5 py-px text-[11px] text-muted-2">
                {k.replace(/_/g, " ")}: {tag}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sensor plausibility">
          {sensors.length === 0 ? (
            <None>No plausibility checks for this dataset.</None>
          ) : (
            <ul className="flex flex-col gap-2">
              {sensors.map(([sensor, verdict]) => (
                <li key={sensor} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="num font-medium">{sensor}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${VERDICT[verdict].cls}`}>
                      {VERDICT[verdict].word}
                    </span>
                  </div>
                  {h.plausibility_notes[sensor] && <p className="text-xs text-muted-2">{h.plausibility_notes[sensor]}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Capability matrix">
        <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          {caps.map(([name, on]) => (
            <li key={name} className="flex items-start gap-2 py-1 text-sm">
              {on ? (
                <Check size={16} aria-label="Available" className="mt-0.5 shrink-0 text-health-green" />
              ) : (
                <X size={16} aria-label="Not available" className="mt-0.5 shrink-0 text-muted-2" />
              )}
              <div>
                <span className={on ? "" : "text-muted-2"}>{CAPABILITY_LABEL[name] ?? name.replace(/_/g, " ")}</span>
                {!on && <p className="text-xs text-muted-2">{h.capability_reasons[name] ?? "No reason given by the backend"}</p>}
              </div>
            </li>
          ))}
        </ul>
        {caps.length === 0 && <None>The backend sent no capability flags.</None>}
      </Card>

      <Card title="Mapping used">
        {h.mapping.length === 0 ? (
          <None>No column mapping was recorded.</None>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted-2">
                <tr>
                  <th className="py-1 pr-3 font-medium">Source column</th>
                  <th className="py-1 pr-3 font-medium">Canonical name</th>
                  <th className="py-1 pr-3 font-medium">Confidence</th>
                  <th className="py-1 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {h.mapping.map((m) => (
                  <tr key={m.source} className="border-t border-border">
                    <td className="py-1 pr-3">{m.source}</td>
                    <td className="py-1 pr-3">{m.canonical ?? <span className="text-muted-2">Ignored</span>}</td>
                    <td className="num py-1 pr-3">{Math.round(m.confidence * 100)} %</td>
                    <td className="py-1">{m.unit ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Unit conversions">
          {h.conversions.length === 0 ? (
            <None>None applied.</None>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {h.conversions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Derived channels">
          {h.derived.length === 0 ? (
            <None>None: every channel came from the file.</None>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {h.derived.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Data-quality flags">
        {flags.length === 0 ? (
          <None>No flags: the data passed every check.</None>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-2">
              <tr>
                <th className="py-1 pr-3 font-medium">Code</th>
                <th className="py-1 pr-3 font-medium">Meaning</th>
                <th className="py-1 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(([code, n]) => (
                <tr key={code} className="border-t border-border">
                  <td className="num py-1 pr-3">{code}</td>
                  <td className="py-1 pr-3 text-muted-2">{flagText(code) || "—"}</td>
                  <td className="num py-1 text-right">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
