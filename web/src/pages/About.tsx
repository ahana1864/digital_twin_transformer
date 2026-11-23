import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useDataset } from "../context/DatasetContext";

/** Content taken from FINAL_PRD so the page is not empty; the final wording is still the backend team's. */
function Draft({ source }: { source: string }) {
  return (
    <span className="rounded-sm border border-banner-text px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-banner-text">
      Draft from {source}: backend text still needed
    </span>
  );
}

function Section({ title, draft, children }: { title: string; draft?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {draft && <Draft source={draft} />}
      </div>
      {children}
    </section>
  );
}

const STAGES = [
  { name: "Data in", detail: "CSV/Excel upload or a built-in scenario, mapped and cleaned (ingest/)" },
  { name: "Digital twin", detail: "IEC 60076-7 thermal + ageing model of Transformer-1 (twin/)" },
  { name: "Analytics", detail: "Alerts, Health Index, remaining life (analytics/)" },
  { name: "API", detail: "FastAPI: one endpoint per function (server/)" },
  { name: "This dashboard", detail: "3D twin, charts, reports (web/)" },
];

type Tag = "Confirmed" | "Calculated" | "Assumed" | "To verify";
interface AssumptionRow {
  group: string;
  field: string;
  value: string;
  tag: Tag;
}

// Pulled directly from the config the backend actually runs on (config/*.yaml), not retyped by
// hand — the tag on each row is the one in that file. The full write-up behind each scenario and
// analytics choice (27 entries, with the numbers that led to them) is docs/assumptions.md.
const ASSUMPTIONS: AssumptionRow[] = [
  { group: "Nameplate", field: "Rated power", value: "1000 kVA", tag: "Confirmed" },
  { group: "Nameplate", field: "LV voltage", value: "415 V", tag: "Confirmed" },
  { group: "Nameplate", field: "Rated current (LV)", value: "1391 A", tag: "Calculated" },
  { group: "Nameplate", field: "HV voltage", value: "11000 V", tag: "Assumed" },
  { group: "Nameplate", field: "Vector group / cooling", value: "Dyn11 / ONAN", tag: "Assumed" },
  { group: "Nameplate", field: "Load loss / no-load loss", value: "10000 W / 1100 W", tag: "Assumed" },
  { group: "Operating thresholds", field: "Loading", value: "warning 90% · alarm 100%", tag: "Assumed" },
  { group: "Operating thresholds", field: "Top-oil", value: "warning 85 °C · critical 95 °C", tag: "Assumed" },
  { group: "Operating thresholds", field: "Hot-spot", value: "warning 98 °C · critical 120 °C", tag: "Assumed" },
  { group: "Operating thresholds", field: "Current unbalance", value: "warning 10% · alarm 20%", tag: "Assumed" },
  { group: "Operating thresholds", field: "Voltage unbalance", value: "alarm 2%", tag: "Assumed" },
  { group: "Operating thresholds", field: "Oil level", value: "low 85%", tag: "Assumed" },
  { group: "Operating thresholds", field: "Residual alert", value: "mean + 4σ of Normal, persistent 2 h", tag: "Assumed" },
  { group: "Health Index", field: "Weights", value: "thermal 30 · ageing 25 · loading 15 · electrical 15 · integrity 10 · fault stress 5", tag: "Assumed" },
  { group: "Health Index", field: "Bands", value: "Green ≥ 80 · Yellow 60–79 · Red < 60", tag: "Assumed" },
  { group: "Health Index", field: "Weakest-link cap", value: "40, while a critical asset alert is within 24 h", tag: "Assumed" },
  { group: "Twin & RUL", field: "Fidelity window", value: "rolling 24 h RMSE of the residual", tag: "Assumed" },
  { group: "Twin & RUL", field: "Drift alert", value: "fidelity RMSE above 3.0 °C", tag: "Assumed" },
  { group: "Twin & RUL", field: "Reference insulation life", value: "180,000 h (≈ 20.6 y), IEC 60076-7 normal paper", tag: "To verify" },
  { group: "Twin & RUL", field: "RUL display", value: "capped at “> 40 years”", tag: "Assumed" },
  { group: "Scenario magnitudes", field: "S1 Overload", value: "1.10–1.25 pu, 1.5–3 h/day (softened from 1.15–1.35 pu × 6–10 h)", tag: "Assumed" },
  { group: "Scenario magnitudes", field: "S2 Cooling degradation", value: "rise ×1.25, ramped over 7 days from day 20", tag: "Assumed" },
  { group: "Scenario magnitudes", field: "S3 Unbalance", value: "+12–18% / −8%, from day 25", tag: "Assumed" },
  { group: "Scenario magnitudes", field: "S4a Oil leak", value: "−22% over 5 days, from day 21", tag: "Assumed" },
  { group: "Scenario magnitudes", field: "S4b Oil theft", value: "−10 to −15% step, day 25", tag: "Assumed" },
];
const ASSUMPTION_GROUPS = [...new Set(ASSUMPTIONS.map((a) => a.group))];
const TAG_STYLE: Record<Tag, string> = {
  Confirmed: "border-health-green text-health-green",
  Calculated: "border-twin text-twin",
  Assumed: "border-banner-text text-banner-text",
  "To verify": "border-health-red text-health-red",
};

const SOURCES: { name: string; use: string; licence: string }[] = [
  { name: "Generated campus data", use: "Primary demo scenarios N and S1 to S5 (simulated)", licence: "Generated by the team; always labelled SIMULATED" },
  { name: "Kaggle “Distributed Transformer Monitoring” (sreshta140)", use: "Real field data page: a different, unrated transformer", licence: "Check the dataset's own terms" },
  { name: "Open-Meteo (Bengaluru hourly temperature and humidity)", use: "Ambient and humidity, cached for offline use", licence: "Permission to download still open in FINAL_PRD" },
  { name: "ETT (Zhou et al., AAAI 2021)", use: "Optional realism check of oil-temperature dynamics", licence: "CC BY-ND 4.0: validation only, no modified copies" },
  { name: "transformer-thermal-model v0.6.0", use: "Thermal model library behind the twin", licence: "MPL-2.0" },
  { name: "“High voltage power transformer” by Showdoze (Sketchfab)", use: "Representative 3D model", licence: "CC-BY-NC 4.0" },
];

const CITATIONS: { text: string; status: string }[] = [
  { text: "Prabakaran et al., Power Research 19(1), 2023, doi:10.33686/pwj.v19i1.1109: short circuits, insulation breakdown and prolonged overloading as prime outage causes of distribution transformers.", status: "Confirmed from the abstract" },
  { text: "IEC 60076-7: loading guide, ageing rate 2^((θh − 98)/6) for normal paper and a 180,000 h reference life.", status: "To verify against the standard text" },
  { text: "IS 1180: short-circuit impedance change limits used by the through-fault recommendation.", status: "Taken from a CPRI Bhopal presentation; to verify against the standard text" },
  { text: "CIGRE JWG A2/D2.65: the “reality gap” framing of a digital twin.", status: "Framing as used in FINAL_PRD" },
];

export default function About() {
  const { run } = useDataset();
  const tags = run ? Object.entries(run.asset.tags) : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">About</h1>
        <p className="text-sm text-muted-2">What this twin is, how it is built and what it assumes.</p>
      </div>

      <Section title="What a digital twin is">
        <p className="text-sm">
          A digital twin keeps a live software model running alongside the real asset, fed the same measurements, so
          the two can be compared continuously rather than checked by hand. CIGRE JWG A2/D2.65 frames the difference
          between model and measurement as the &ldquo;reality gap&rdquo; — this dashboard reports that gap directly,
          as <em>fidelity</em>, instead of treating the twin&apos;s output as ground truth.
        </p>
        <p className="mt-2 text-sm">
          For Transformer-1 specifically: an IEC 60076-7 thermal and ageing model runs on the same load and ambient
          data the real unit sees. Physics says what the oil and hot-spot temperature should be; the measurement says
          what they are; the gap between them (the residual) is what drives the cooling-degradation alert and the
          ageing-rate split between &ldquo;expected&rdquo; and &ldquo;actual&rdquo; life consumed.
        </p>
      </Section>

      <Section title="Architecture">
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="Data flow">
          {STAGES.map((s, i) => (
            <li key={s.name} className="flex items-center gap-2">
              <div className="rounded-control border border-border bg-panel-2 px-3 py-2">
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="max-w-40 text-xs text-muted-2">{s.detail}</div>
              </div>
              {i < STAGES.length - 1 && <ArrowRight size={16} aria-hidden className="text-muted-2" />}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-muted-2">
          One backend (FastAPI) serves both the API and this built React app from the same origin; the browser never
          talks to anything else. Built-in scenarios and an uploaded file go through the same pipeline, so the
          Overview, Alerts and Data Health pages behave the same way regardless of where the data came from.
        </p>
      </Section>

      <Section title="Assumptions register">
        {tags.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-muted-2">Asset values of the selected dataset and how sure we are of each (from the API):</p>
            <ul className="flex flex-wrap gap-1.5">
              {tags.map(([k, tag]) => (
                <li key={k} className="rounded-sm border border-border px-2 py-0.5 text-xs">
                  {k.replace(/_/g, " ")}: <span className="font-semibold">{tag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className={`text-sm text-muted-2 ${tags.length > 0 ? "mt-3" : ""}`}>
          The values behind the thresholds, Health Index and built-in scenarios — read from the backend&apos;s own
          config, with its own tag on each row:
        </p>
        <div className="flex flex-col gap-4">
          {ASSUMPTION_GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-2">{group}</h3>
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <tbody>
                    {ASSUMPTIONS.filter((a) => a.group === group).map((a) => (
                      <tr key={a.field} className="border-t border-border first:border-t-0 align-top">
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium">{a.field}</td>
                        <td className="px-3 py-1.5 text-muted-2">{a.value}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded-sm border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${TAG_STYLE[a.tag]}`}>
                            {a.tag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-2">
          Full write-up of every scenario-design and analytics-tuning decision, with the numbers that drove each one:{" "}
          <code className="rounded-sm bg-panel-2 px-1 py-px">docs/assumptions.md</code> (27 entries).
        </p>
      </Section>

      <Section title="Data sources and licences" draft="FINAL_PRD §4 and §20">
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-panel-2 text-xs text-muted-2">
              <tr>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Used for</th>
                <th className="px-3 py-2 font-medium">Licence or terms</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.use}</td>
                  <td className="px-3 py-2">{s.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Citations" draft="FINAL_PRD §8 and §9">
        <ul className="flex flex-col gap-2 text-sm">
          {CITATIONS.map((c) => (
            <li key={c.text} className="rounded-control border border-border p-2">
              {c.text}
              <span className="mt-1 block text-xs font-medium text-muted-2">{c.status}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="How fidelity works" draft="FINAL_PRD §5 and §7">
        <ul className="list-disc pl-5 text-sm">
          <li>The twin predicts the oil and hot-spot temperatures from the load and the ambient temperature.</li>
          <li>The residual is the measured oil temperature minus the twin&apos;s, and fidelity is its rolling 24-hour RMSE.</li>
          <li>
            In the generated data, the simulated plant deliberately differs from the twin, so fidelity is not circular.
          </li>
          <li>A fidelity above its limit means the model has drifted: check the cooling or recalibrate.</li>
        </ul>
        <p className="mt-3 text-sm">
          In plain terms: if the twin is doing its job, the measured oil temperature and the twin&apos;s prediction
          should track each other closely, because the twin was told about the same load and the same weather. The
          residual is just that gap in °C at each sample — small and noisy on a healthy unit, growing steadily if
          something changed that the twin doesn&apos;t know about (dirty radiators, a blocked fan, degraded oil).
          Fidelity smooths that gap over the last 24 hours (one RMSE number, not a spike-chasing one) so a single
          noisy sample doesn&apos;t trigger an alert, but a real multi-hour drift does. On this dashboard, fidelity
          above <strong>3.0 °C</strong> is the line: below it, the twin is tracking the asset; above it, the gap is
          big enough and lasted long enough that it&apos;s worth a cooling-system check rather than noise. The
          orange line on Loading &amp; Temperatures is the measurement, the blue line is the twin — fidelity is how
          far apart they&apos;ve been running, not a single reading.
        </p>
      </Section>
    </div>
  );
}
