import { useMemo } from "react";
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import type { Alert, RunSeries } from "../api/types";
import { useDataset } from "../context/DatasetContext";
import { humanise, istAxis } from "../lib/format";

const Plot = createPlotlyComponent(Plotly);
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface ChartLine {
  /** Column of `run.series` */
  key: keyof RunSeries;
  name: string;
  /** Measured = orange, twin = blue (FRONTEND_HANDOFF §7.4); neutral for anything else */
  tone: "measured" | "twin" | "neutral";
  dash?: "solid" | "dash" | "dot";
}

interface Props {
  lines: ChartLine[];
  unit: string;
  /** Alerts drawn as markers (already limited to the ones to show) */
  alerts?: Alert[];
  /** Alert types whose thresholds (reported by the API on their alerts) are drawn as dotted lines */
  thresholdTypes?: string[];
  /** Last sample to draw: the replay cursor, or the end of the run */
  upTo: number;
  height?: number;
}

function nearest(ms: number[], target: number): number {
  let lo = 0;
  let hi = ms.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(ms[lo - 1] - target) <= Math.abs(ms[lo] - target) ? lo - 1 : lo;
}

/** A time series up to `upTo`, with thresholds, alert markers and a cursor line. Plotly, as the handoff prefers. */
export default function SeriesChart({ lines, unit, alerts = [], thresholdTypes = [], upTo, height = 240 }: Props) {
  const { run } = useDataset();

  const base = useMemo(() => {
    if (!run) return null;
    const t = run.series.timestamp.map(istAxis);
    const ms = run.series.timestamp.map((x) => Date.parse(x));
    const cols = lines.map((l) => ({ line: l, values: run.series[l.key] as (number | null)[] | undefined }));
    const levels = [
      ...new Set(
        run.alerts
          .filter((a) => thresholdTypes.includes(a.type) && a.threshold !== null)
          .map((a) => a.threshold as number),
      ),
    ].sort((a, b) => a - b);
    const all = [...cols.flatMap((c) => c.values ?? []), ...levels].filter((v): v is number => typeof v === "number");
    if (all.length === 0) return null;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo || 1) * 0.08;
    return { t, ms, cols, levels, range: [lo - pad, hi + pad] as [number, number] };
  }, [run, lines, thresholdTypes]);

  if (!run || !base) return <p className="p-4 text-sm text-muted-2">Not enough data to draw this chart.</p>;
  const { t, ms, cols, levels, range } = base;
  const end = Math.min(upTo, t.length - 1) + 1;
  const colours = {
    measured: css("--measured"),
    twin: css("--twin"),
    neutral: css("--text"),
    muted: css("--muted-2"),
    grid: css("--border"),
    sensor: css("--sensor"),
    warn: css("--health-yellow"),
    crit: css("--health-red"),
  };

  const data: unknown[] = [];
  for (const { line, values } of cols) {
    if (!values) continue;
    data.push({
      type: "scatter",
      mode: "lines",
      name: line.name,
      x: t.slice(0, end),
      y: values.slice(0, end),
      connectgaps: false,
      line: { color: colours[line.tone], width: 1.6, dash: line.dash ?? (line.tone === "twin" ? "dash" : "solid") },
      hovertemplate: `%{y:.1f} ${unit}<extra>${line.name}</extra>`,
    });
  }
  for (const level of levels) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: `Threshold (${level} ${unit})`,
      x: [t[0], t[t.length - 1]],
      y: [level, level],
      line: { color: colours.muted, width: 1, dash: "dot" },
      hoverinfo: "skip",
    });
  }
  const first = cols.find((c) => c.values)?.values;
  const place = (a: Alert) => {
    const i = nearest(ms, Date.parse(a.timestamp));
    return { x: t[i], y: first?.[i] ?? null };
  };
  const hover = (a: Alert) => `${humanise(a.type)} · ${a.severity}<br>origin: ${a.origin} · detector: ${a.detector}`;
  const marked = alerts.filter((a) => Date.parse(a.timestamp) <= ms[Math.min(upTo, ms.length - 1)]);
  for (const [origin, name] of [["asset", "Alert (asset)"], ["sensor", "Sensor fault"]] as const) {
    const list = marked.filter((a) => a.origin === origin).map((a) => ({ a, p: place(a) })).filter((m) => m.p.y !== null);
    if (list.length === 0) continue;
    data.push({
      type: "scatter",
      mode: "markers",
      name,
      x: list.map((m) => m.p.x),
      y: list.map((m) => m.p.y),
      text: list.map((m) => hover(m.a)),
      hovertemplate: "%{text}<extra></extra>",
      marker:
        origin === "sensor"
          ? { symbol: "diamond", size: 9, color: colours.sensor, line: { width: 1, color: colours.neutral } }
          : {
              symbol: list.map((m) => (m.a.severity === "critical" ? "x" : "triangle-up")),
              size: 9,
              color: list.map((m) => (m.a.severity === "critical" ? colours.crit : m.a.severity === "warning" ? colours.warn : colours.muted)),
              line: { width: 1, color: colours.neutral },
            },
    });
  }

  const layout = {
    autosize: true,
    height,
    margin: { l: 52, r: 12, t: 12, b: 36 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: '"IBM Plex Sans", system-ui, sans-serif', size: 12, color: colours.neutral },
    uirevision: `${run.dataset.id}|${lines.map((l) => l.key).join()}`,
    xaxis: { type: "date", range: [t[0], t[t.length - 1]], gridcolor: colours.grid, linecolor: colours.grid, hoverformat: "%d %b %H:%M" },
    yaxis: { title: { text: unit }, range, gridcolor: colours.grid, zeroline: false },
    legend: { orientation: "h", x: 0, y: -0.22 },
    hovermode: "closest",
    shapes: [
      { type: "line", xref: "x", yref: "paper", x0: t[Math.min(upTo, t.length - 1)], x1: t[Math.min(upTo, t.length - 1)], y0: 0, y1: 1, line: { color: colours.grid, width: 2 } },
    ],
  };

  return (
    <Plot
      data={data}
      layout={layout}
      config={{ displaylogo: false, responsive: true, displayModeBar: false }}
      useResizeHandler
      style={{ width: "100%", height }}
    />
  );
}
