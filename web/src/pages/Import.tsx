import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";
import { CircleAlert, FileUp, Loader2 } from "lucide-react";
import { errorDetail, useImportInspect, useImportLoad } from "../api/client";
import type { ImportLoadRequest, InspectProposal } from "../api/types";
import Sparkline from "../components/Sparkline";
import Skeleton from "../components/Skeleton";
import { useDataset } from "../context/DatasetContext";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls";
/** Confidence below this is left for the user (DATA_INGESTION_SPEC §2.4). */
const LOW_CONFIDENCE = 0.6;

// Canonical trend columns the backend recognises (docs/API.md "series"). Not every file will map
// to most of these — it's the option list for the mapping dropdown, not a requirement.
const CANONICAL_OPTIONS = [
  "IR", "IY", "IB", "IN", "VR", "VY", "VB", "S_kVA", "P_kW", "Q_kVAr", "PF", "freq_Hz",
  "loading_pct", "OTI_C", "WTI_C", "ATI_C", "amb_C", "RH_pct", "OLI_pct",
];

// Columns worth a small plot in the preview (FRONTEND_HANDOFF §6.1), by canonical name.
const PLOTS: { title: string; keys: string[]; unit: string }[] = [
  { title: "Current", keys: ["IR", "IY", "IB", "I_mean"], unit: "A" },
  { title: "Loading", keys: ["loading_pct"], unit: "%" },
  { title: "Temperatures", keys: ["OTI_C", "WTI_C", "ATI_C"], unit: "°C" },
];

const field = "h-9 rounded-control border border-border bg-panel px-2 text-sm";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-panel p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-text text-[11px] text-panel">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-health-red">
      <CircleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

type AssetMode = "default" | "custom" | "estimate";

/**
 * Review form for one inspected upload (FRONTEND_HANDOFF §6.1), adapted to the real backend's
 * contract: POST /api/inspect is stateless (no upload_id, no server-side sheet/role editing), so
 * the files are held here and re-sent to POST /api/datasets on submit, and the mapping/asset/
 * interval shapes match that endpoint's form fields exactly (docs/API.md "load_file").
 */
function Review({ files, proposal, onLoaded }: { files: File[]; proposal: InspectProposal; onLoaded: (id: string) => void }) {
  const load = useImportLoad();
  const [mapping, setMapping] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(proposal.proposals.map((p) => [p.source, p.canonical])),
  );
  const [units, setUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(proposal.proposals.filter((p) => p.unit).map((p) => [p.source, p.unit as string])),
  );
  const [name, setName] = useState("");
  const [interval, setInterval] = useState("15min");
  const [assetMode, setAssetMode] = useState<AssetMode>("default");
  const [kva, setKva] = useState(1000);
  const [lv, setLv] = useState(415);

  const hasTime = proposal.timestamp.column !== null;
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const canLoad = mappedCount > 0;

  const submit = () => {
    const req: ImportLoadRequest = {
      files,
      name: name.trim() || undefined,
      mapping: Object.fromEntries(
        Object.entries(mapping)
          .filter((e): e is [string, string] => e[1] !== null)
          .map(([source, canonical]) => [source, { to: canonical, unit: units[source] }]),
      ),
      asset: assetMode === "custom" ? { rating_kVA: kva, lv_voltage_V: lv } : assetMode === "estimate" ? "estimate" : undefined,
      interval: !hasTime && interval.trim() ? interval.trim() : undefined,
    };
    load.mutate(req, { onSuccess: ({ dataset_id }) => onLoaded(dataset_id) });
  };

  return (
    <div className="flex flex-col gap-4">
      {proposal.warnings.length > 0 && (
        <div role="alert" className="rounded-card border border-health-yellow bg-banner-bg p-3 text-sm text-banner-text">
          <p className="mb-1 font-semibold">Check these before loading</p>
          <ul className="list-disc pl-5">
            {proposal.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Step n={2} title="What the backend found">
        <ul className="flex flex-col gap-1.5 text-sm">
          {proposal.tables.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.name}</span>
              <span className="rounded-sm border border-border px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                {t.role}
              </span>
              <span className="text-muted-2">
                {t.rows} rows · {t.columns.length} columns
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-2">
          {hasTime ? (
            <>
              Timestamp column: <span className="font-medium text-text">{proposal.timestamp.column}</span>
              {proposal.timestamp.format && ` (${proposal.timestamp.format})`}
              {proposal.timestamp.parsed_ok_pct !== null && ` — ${proposal.timestamp.parsed_ok_pct.toFixed(0)}% parsed`}
            </>
          ) : (
            "No timestamp column found — loads as records (snapshot mode) unless you assign a spacing below."
          )}
        </p>
      </Step>

      <Step n={3} title="Map columns">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted-2">
              <tr>
                <th className="py-1 pr-3 font-medium">Source column</th>
                <th className="py-1 pr-3 font-medium">Canonical name</th>
                <th className="py-1 pr-3 font-medium">Confidence</th>
                <th className="py-1 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {proposal.proposals.map((p) => {
                const chosen = mapping[p.source];
                const low = p.confidence < LOW_CONFIDENCE;
                return (
                  <tr key={p.source} className={`border-t border-border ${low ? "bg-banner-bg/60" : ""}`}>
                    <td className="py-1.5 pr-3 font-medium">{p.source}</td>
                    <td className="py-1.5 pr-3">
                      <select
                        aria-label={`Canonical name for ${p.source}`}
                        value={chosen ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [p.source]: e.target.value || null })}
                        className={`${field} w-44`}
                      >
                        <option value="">Ignore</option>
                        {CANONICAL_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num py-1.5 pr-3">
                      {Math.round(p.confidence * 100)} %
                      {low && <span className="ml-2 text-xs font-semibold text-banner-text">LOW: please check</span>}
                    </td>
                    <td className="py-1.5">
                      {p.unit_options.length > 0 ? (
                        <select
                          aria-label={`Unit for ${p.source}`}
                          value={units[p.source] ?? p.unit_options[0]}
                          onChange={(e) => setUnits({ ...units, [p.source]: e.target.value })}
                          className={`${field} w-24`}
                        >
                          {p.unit_options.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Step>

      <Step n={4} title="Time and asset">
        <div className="grid gap-6 md:grid-cols-2">
          {!hasTime && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Assign timestamps, spaced
              <input
                type="text"
                placeholder="e.g. 15min (blank = snapshot mode)"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className={`${field} font-normal`}
              />
              <span className="text-xs font-normal text-muted-2">
                pandas offset string (15min, 1h, …). Leave blank to load as records with no replay.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm font-medium">
            Dataset name (optional)
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${field} font-normal`} />
          </label>

          <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3 text-sm md:col-span-2">
            <legend className="px-1 text-xs font-semibold text-muted-2">Nameplate</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked={assetMode === "default"} onChange={() => setAssetMode("default")} />
              Use the default nameplate (Transformer-1, 1000 kVA / 415 V)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={assetMode === "custom"} onChange={() => setAssetMode("custom")} />
              Enter values
            </label>
            {assetMode === "custom" && (
              <div className="flex flex-wrap items-center gap-3 pl-6">
                <label className="flex items-center gap-1.5">
                  Rated power
                  <input type="number" min={1} value={kva} onChange={(e) => setKva(Number(e.target.value))} className={`${field} num w-24`} />
                  kVA
                </label>
                <label className="flex items-center gap-1.5">
                  LV voltage
                  <input type="number" min={1} value={lv} onChange={(e) => setLv(Number(e.target.value))} className={`${field} num w-24`} />
                  V
                </label>
              </div>
            )}
            <label className="flex items-center gap-2">
              <input type="radio" checked={assetMode === "estimate"} onChange={() => setAssetMode("estimate")} />
              Estimate from the data <span className="text-xs text-muted-2">(shown with a red "Estimated" banner)</span>
            </label>
          </fieldset>
        </div>
      </Step>

      <Step n={5} title="Preview">
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          {PLOTS.map((p) => {
            const cols = Object.entries(mapping).filter(([, c]) => c && p.keys.includes(c));
            return (
              <div key={p.title} className="rounded-control border border-border p-2">
                <div className="text-xs font-medium text-muted-2">
                  {p.title} ({p.unit})
                </div>
                {cols.length === 0 ? (
                  <p className="py-4 text-xs text-muted-2">Not mapped</p>
                ) : (
                  cols.map(([source]) => (
                    <Sparkline
                      key={source}
                      label={source}
                      values={proposal.preview.rows.map((r) => (typeof r[source] === "number" ? (r[source] as number) : null))}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted-2">
              <tr>
                {proposal.preview.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proposal.preview.rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {proposal.preview.columns.map((c) => (
                    <td key={c} className="num whitespace-nowrap px-2 py-1">
                      {row[c] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-2">First {proposal.preview.rows.length} rows.</p>
      </Step>

      <div className="flex flex-wrap items-center gap-3 pb-6">
        <button
          type="button"
          onClick={submit}
          disabled={!canLoad || load.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-control bg-text px-4 text-sm font-semibold text-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          {load.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          Load dataset
        </button>
        {!canLoad && <span className="text-sm text-muted-2">Map at least one column first.</span>}
        {load.isError && <ErrorLine message={errorDetail(load.error)} />}
      </div>
    </div>
  );
}

export default function Import() {
  const inspect = useImportInspect();
  const navigate = useNavigate();
  const { selectDataset } = useDataset();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[] | null>(null);

  const take = (list: FileList | null) => {
    if (list && list.length > 0) {
      const f = [...list];
      setFiles(f);
      inspect.mutate(f);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  };
  const onLoaded = (id: string) => {
    selectDataset(id);
    navigate("/data-health");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Import</h1>
        <p className="text-sm text-muted-2">Load your own data: drop a file, check the proposed mapping, and load it.</p>
      </div>

      <Step n={1} title="Upload">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center gap-2 rounded-card border-2 border-dashed p-8 text-center ${
            dragging ? "border-twin bg-accent-bg" : "border-border bg-panel-2"
          }`}
        >
          <FileUp size={28} className="text-muted-2" aria-hidden />
          <p className="text-sm">Drag a CSV or Excel file here, or</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={inspect.isPending}
            className="h-9 rounded-control border border-border bg-panel px-3 text-sm font-medium hover:bg-bg disabled:opacity-60"
          >
            Choose a file
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label="Choose a file to import"
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-2">One trend or records file at a time.</p>
        </div>
        {inspect.isPending && (
          <div className="mt-3 flex flex-col gap-2" aria-busy="true" aria-label="Reading the file">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {inspect.isError && <ErrorLine message={errorDetail(inspect.error)} />}
        {inspect.data && files && <p className="mt-2 text-sm text-muted-2">Read: {files.map((f) => f.name).join(", ")}</p>}
      </Step>

      {inspect.data && files && !inspect.isPending && (
        <Review key={files.map((f) => f.name).join("|")} files={files} proposal={inspect.data} onLoaded={onLoaded} />
      )}
    </div>
  );
}
