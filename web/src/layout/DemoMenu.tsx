import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, Clapperboard, Play } from "lucide-react";
import { useHealth } from "../api/client";
import { useDataset } from "../context/DatasetContext";
import { at } from "../lib/series";
import { faultJumpIndex, indexAtOrAfter } from "../lib/replay";
import { demoToken, stopDemo, useDemo } from "../state/demo";
import { useReplay } from "../state/replay";

/**
 * Fault shortcuts (FRONTEND_HANDOFF §15.8): label, and the built-in scenario each one opens. The
 * backend runs leak and theft as two separate 30-day scenarios (S4a, S4b), not one dataset with
 * both phases, so that's two shortcuts here too.
 */
const SHORTCUTS = [
  { label: "Overload", id: "S1" },
  { label: "Cooling", id: "S2" },
  { label: "Unbalance", id: "S3" },
  { label: "Leak", id: "S4a" },
  { label: "Theft", id: "S4b" },
  { label: "Through-faults", id: "S5" },
] as const;

class Cancelled extends Error {}

type Ctx = ReturnType<typeof useDataset>;

const sleep = async (ms: number, token: number) => {
  await new Promise((r) => setTimeout(r, ms));
  if (token !== demoToken.current) throw new Cancelled();
};
async function until(cond: () => boolean, token: number, timeoutMs: number) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) return false;
    await sleep(100, token);
  }
  return true;
}

/** Select a built-in scenario and optionally jump to its injected fault. Uses only existing actions. */
async function openScenario(ref: { current: Ctx }, id: string, token: number, jump: boolean) {
  ref.current.selectDataset(id);
  const ok = await until(() => ref.current.run?.dataset.id === id && ref.current.steps > 0, token, 15_000);
  if (!ok) throw new Error(`Scenario ${id} did not load`);
  const run = ref.current.run!;
  const index = jump ? faultJumpIndex(run) : null;
  if (index !== null) ref.current.setCursor(index);
  await sleep(300, token); // let the replay clock see the new run before anything plays
  return run;
}

const play = (daySeconds: number) => useReplay.setState({ daySeconds, playing: true });
const pause = () => useReplay.getState().setPlaying(false);
const say = (step: number, title: string, caption: string) => useDemo.setState({ running: true, step, title, caption, note: null });

/** Sections of the guided demo, with the longest time each can take (seconds): well under 4 minutes. */
const STEPS = 5;
export const DEMO_MAX_SECONDS = 14 + 55 + 42 + 60 + 10 + 6;

async function guidedDemo(ref: { current: Ctx }, navigate: (to: string) => void, token: number) {
  useDemo.setState({ running: true, step: 1, steps: STEPS, title: "", caption: "Loading", note: null });

  // 1. N: healthy
  let run = await openScenario(ref, "N", token, false);
  navigate("/");
  say(
    1,
    "Scenario N: normal operation",
    run.alerts.length === 0 ? "Every part stays NORMAL and the twin raises no alerts at all." : `The twin raised ${run.alerts.length} alerts.`,
  );
  play(1);
  await sleep(12_000, token);
  pause();

  // 2. S2: cooling degradation, residual alert and lead time
  run = await openScenario(ref, "S2", token, true);
  navigate("/");
  say(2, "Scenario S2: cooling degradation", "The radiators slowly lose efficiency. Watch the residual (measured minus twin) grow.");
  const first = [...run.alerts].filter((a) => a.lead_time_h !== null).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  const firstIdx = first ? indexAtOrAfter(run, Date.parse(first.timestamp)) : -1;
  play(15);
  if (first && firstIdx >= 0) {
    await until(() => ref.current.cursor >= firstIdx, token, 40_000);
    pause();
    say(2, "Scenario S2: caught early", `The residual alert fires ${first.lead_time_h!.toFixed(1)} h before a plain temperature threshold would. ${first.explanation}`);
    await sleep(10_000, token);
  } else {
    await sleep(25_000, token);
    pause();
  }

  // 3. S1: overload, ageing up, RUL down
  run = await openScenario(ref, "S1", token, true);
  navigate("/");
  say(3, "Scenario S1: overload", "Daytime load climbs into overload. Watch the hot-spot, the alerts and the health index.");
  // Stop at the first critical alert, so the ageing rate shown is the overload's, not a quiet night's.
  const critical = [...run.alerts].filter((a) => a.severity === "critical").sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  const critIdx = critical ? indexAtOrAfter(run, Date.parse(critical.timestamp)) : -1;
  play(15);
  if (critIdx >= 0) await until(() => ref.current.cursor >= critIdx, token, 30_000);
  else await sleep(20_000, token);
  pause();
  await sleep(1_500, token);
  const rate = at(ref.current.run, "ageing_rate_actual", ref.current.cursor) ?? at(ref.current.run, "ageing_rate_expected", ref.current.cursor);
  const rul = ref.current.run?.rul;
  say(
    3,
    "Scenario S1: ageing up, life down",
    `${rate != null ? `Right now the insulation is ageing at ${rate.toFixed(2)}× the reference rate. ` : ""}${rul ? `Remaining life: ${rul.display} (${rul.risk} risk, whole run).` : "No remaining-life estimate for this run."}`,
  );
  await sleep(8_000, token);

  // 4. S4a: slow leak, then S4b: a sudden theft step (two separate scenarios on this backend)
  run = await openScenario(ref, "S4a", token, true);
  navigate("/");
  say(4, "Scenario S4a: oil leak", "The oil level falls slowly over days, with no sudden step: the signature of a leak.");
  play(15);
  await sleep(22_000, token);
  pause();
  await sleep(2_000, token);

  run = await openScenario(ref, "S4b", token, true);
  navigate("/");
  const theft = [...run.alerts].filter((a) => a.type === "oil_theft").sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
  if (theft) {
    const i = indexAtOrAfter(run, Date.parse(theft.timestamp) - 24 * 3600_000);
    if (i >= 0) ref.current.setCursor(i);
  }
  say(4, "Scenario S4b: oil theft", "A sudden night-time drop with no thermal cause: a different signature from the leak, so a different alert and recommendation.");
  await sleep(300, token);
  play(15);
  await sleep(22_000, token);
  pause();
  await sleep(6_000, token);

  // 5. Data Health
  navigate("/data-health");
  say(5, "Data Health", "How the adapter read, cleaned and checked the data, and which analyses it was able to run.");
  await sleep(10_000, token);
}

/** "Demo" menu in the header: fault shortcuts and the guided demo (FRONTEND_HANDOFF §15.8). */
export default function DemoMenu() {
  const ctx = useDataset();
  const ref = useRef(ctx);
  ref.current = ctx;
  const navigate = useNavigate();
  const offline = useHealth().isError;
  const running = useDemo((s) => s.running);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const have = (id: string) => ctx.datasets?.some((d) => d.id === id) ?? false;
  const ready = !offline && !ctx.datasetsLoading && !ctx.datasetsError;

  const shortcut = async (id: string) => {
    setOpen(false);
    setProblem(null);
    stopDemo();
    const token = demoToken.current;
    try {
      await openScenario(ref, id, token, true);
      navigate("/");
    } catch (e) {
      if (!(e instanceof Cancelled)) setProblem(e instanceof Error ? e.message : "Could not open the scenario");
    }
  };

  const start = async () => {
    setOpen(false);
    setProblem(null);
    stopDemo();
    const token = demoToken.current;
    try {
      await guidedDemo(ref, navigate, token);
      if (token === demoToken.current) stopDemo("Guided demo finished.");
    } catch (e) {
      if (e instanceof Cancelled) return;
      stopDemo(`Guided demo stopped: ${e instanceof Error ? e.message : "something went wrong"}.`);
    }
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-control border border-border bg-panel px-2.5 text-sm font-medium hover:bg-bg"
      >
        <Clapperboard size={15} aria-hidden />
        Demo
        <ChevronDown size={14} aria-hidden />
      </button>
      {problem && <span role="alert" className="absolute left-0 top-full mt-1 whitespace-nowrap text-xs font-medium text-health-red">{problem}</span>}

      {open && (
        <div role="menu" aria-label="Demo helpers" className="glass absolute left-0 top-full z-40 mt-2 w-[22rem] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-2">Fault shortcuts</p>
          <p className="mb-2 text-xs text-muted-2">
            Shortcuts over the built-in simulated scenarios: each opens the scenario and jumps to 1 day before its injected
            fault. Nothing is injected live.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SHORTCUTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                disabled={!ready || !have(s.id)}
                onClick={() => shortcut(s.id)}
                title={have(s.id) ? `Scenario ${s.id}` : `Scenario ${s.id} is not available`}
                className="h-8 rounded-control border border-border bg-panel px-2.5 text-sm font-medium hover:bg-bg disabled:cursor-not-allowed disabled:text-muted"
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-2">Guided demo</p>
          <p className="mb-2 text-xs text-muted-2">
            Normal operation, cooling degradation, overload, leak vs theft, then Data Health, with a caption for each. About{" "}
            {Math.ceil(DEMO_MAX_SECONDS / 60)} minutes at most; stop it any time.
          </p>
          <button
            type="button"
            role="menuitem"
            disabled={!ready || running || !["N", "S1", "S2", "S4a", "S4b"].every(have)}
            onClick={start}
            className="flex h-9 items-center gap-2 rounded-control bg-text px-3 text-sm font-semibold text-panel disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={15} aria-hidden />
            {running ? "Demo is running" : "Start guided demo"}
          </button>
        </div>
      )}
    </div>
  );
}
