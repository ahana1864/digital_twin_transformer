import { Check, FlaskConical, Loader2, Send, X } from "lucide-react";
import { errorDetail, useSelfTest, useSendAlert } from "../api/client";
import type { SelfTest as SelfTestData } from "../api/types";
import Skeleton from "../components/Skeleton";
import Unavailable from "../components/Unavailable";
import { useDataset } from "../context/DatasetContext";

const th = "px-3 py-2 text-left text-xs font-medium text-muted-2";
const num = (v: number, dp = 2) => v.toFixed(dp);

/** Pass/fail by icon and word. Not a health state, so no green/red (FRONTEND_HANDOFF §7.3). */
function Verdict({ pass, pass_word = "PASS", fail_word = "FAIL" }: { pass: boolean; pass_word?: string; fail_word?: string }) {
  const Icon = pass ? Check : X;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tracking-wide ${pass ? "" : "underline decoration-2 underline-offset-2"}`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      {pass ? pass_word : fail_word}
    </span>
  );
}

function Table({ title, children, minWidth = 640 }: { title: string; children: React.ReactNode; minWidth?: number }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-panel">
        <table className="w-full text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </section>
  );
}

function Results({ data }: { data: SelfTestData }) {
  const groups = (["I", "V"] as const).map((q) => ({ q, rows: data.rows.filter((r) => r.quantity === q) }));
  return (
    <>
      <Table title="Readings: reference vs software (pass when the difference is 1 % or less)">
        <thead className="bg-panel-2">
          <tr>
            <th className={th}>Quantity</th>
            <th className={th}>Phase</th>
            <th className={`${th} text-right`}>Reference</th>
            <th className={`${th} text-right`}>Software</th>
            <th className={`${th} text-right`}>Difference</th>
            <th className={`${th} text-right`}>%</th>
            <th className={th}>Pass (≤ 1 %)</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap(({ q, rows }) =>
            rows.map((r, i) => (
              <tr key={`${q}${r.phase}`} className={`border-t border-border ${i === 0 ? "border-t-2" : ""}`}>
                <td className="px-3 py-2 font-medium">{i === 0 ? (q === "I" ? "Current (I)" : "Voltage (V)") : ""}</td>
                <td className="px-3 py-2">{r.phase}</td>
                <td className="num px-3 py-2 text-right">
                  {num(r.reference)} {r.unit}
                </td>
                <td className="num px-3 py-2 text-right">
                  {num(r.software)} {r.unit}
                </td>
                <td className="num px-3 py-2 text-right">
                  {r.difference > 0 ? "+" : ""}
                  {num(r.difference)} {r.unit}
                </td>
                <td className="num px-3 py-2 text-right">{num(r.pct)} %</td>
                <td className="px-3 py-2">
                  <Verdict pass={r.pass} />
                </td>
              </tr>
            )),
          )}
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-3 text-muted-2">
                The backend returned no readings.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Table title="Trip tests" minWidth={560}>
        <thead className="bg-panel-2">
          <tr>
            <th className={th}>Test</th>
            <th className={`${th} text-right`}>Bench setting</th>
            <th className={`${th} text-right`}>Applied</th>
            <th className={th}>Result</th>
          </tr>
        </thead>
        <tbody>
          {data.trips.map((t) => (
            <tr key={t.test} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{t.test}</td>
              <td className="num px-3 py-2 text-right">
                {t.setting} {t.unit}
              </td>
              <td className="num px-3 py-2 text-right">
                {t.applied} {t.unit}
              </td>
              <td className="px-3 py-2">
                <Verdict pass={t.tripped} pass_word="TRIPPED" fail_word="DID NOT TRIP" />
              </td>
            </tr>
          ))}
          {data.trips.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-3 text-muted-2">
                The backend returned no trip tests.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Table title="Oil level channel" minWidth={480}>
        <thead className="bg-panel-2">
          <tr>
            <th className={`${th} text-right`}>Reference</th>
            <th className={`${th} text-right`}>Software</th>
            <th className={th}>Pass</th>
          </tr>
        </thead>
        <tbody>
          {data.oil_level ? (
            <tr className="border-t border-border">
              <td className="num px-3 py-2 text-right">
                {num(data.oil_level.reference, 1)} {data.oil_level.unit}
              </td>
              <td className="num px-3 py-2 text-right">
                {num(data.oil_level.software, 1)} {data.oil_level.unit}
              </td>
              <td className="px-3 py-2">
                <Verdict pass={data.oil_level.pass} />
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={3} className="px-3 py-3 text-muted-2">
                Not available: the backend has no oil level channel to test.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}

function StatusMessage() {
  const send = useSendAlert();
  const { run } = useDataset();
  return (
    <section aria-label="Status message to master number" className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold">Status message to master number</h2>
      <p className="text-sm text-muted-2">
        Sends the transformer&apos;s status to the master number through Telegram. If Telegram cannot be reached, the
        backend falls back to an in-app message and says so here.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate({ dataset_id: run?.dataset.id, message: "Test message from the Transformer digital twin dashboard" })}
          className="inline-flex h-10 items-center gap-2 rounded-control bg-text px-4 text-sm font-semibold text-panel disabled:opacity-60"
        >
          {send.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
          Send test message
        </button>
        <div aria-live="polite" className="text-sm">
          {send.data?.delivered && (
            <p className="flex items-center gap-1.5 font-medium">
              <Check size={16} aria-hidden /> Delivered to the master number.
            </p>
          )}
          {send.data && !send.data.delivered && send.data.fallback && (
            <p className="font-medium">Not delivered by Telegram: shown in the app instead (fallback).</p>
          )}
          {send.data && !send.data.delivered && !send.data.fallback && (
            <p className="font-medium">The message was neither delivered nor shown as a fallback.</p>
          )}
          {send.isError && (
            <p role="alert" className="font-medium text-health-red">
              {errorDetail(send.error)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function SelfTest() {
  const test = useSelfTest();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Self-Test</h1>
        <p className="mt-2 inline-flex items-center gap-2 rounded-control border border-border bg-panel-2 px-3 py-1.5 text-sm font-semibold">
          <FlaskConical size={16} aria-hidden />
          Bench settings — not operating alarms.
        </p>
        <p className="mt-2 text-sm text-muted-2">
          The same checks as the organisers&apos; acceptance sheet: readings compared with a reference, and the lab trip
          tests. These bench values are used only on this page; the operating alarms use their own thresholds.
        </p>
      </div>

      {test.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : test.isError ? (
        <Unavailable reason={`Not available: ${errorDetail(test.error)}`} />
      ) : (
        <Results data={test.data} />
      )}

      <StatusMessage />
    </div>
  );
}
