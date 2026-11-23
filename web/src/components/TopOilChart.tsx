import { useMemo } from "react";
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { useDataset } from "../context/DatasetContext";
import { istAxis } from "../lib/format";
import { humanise } from "../lib/format";
import type { Run } from "../api/types";

const Plot = createPlotlyComponent(Plotly);

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Index of the sample nearest to `ms` (series timestamps are sorted). */
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

/** Baseline alarm lines: top-oil thresholds the API reports on its rule alerts (no value is hard-coded). */
function baselineLevels(run: Run): number[] {
  const levels = run.alerts
    .filter((a) => a.type === "top_oil" && a.detector === "rule" && a.threshold !== null)
    .map((a) => a.threshold as number);
  return [...new Set(levels)].sort((a, b) => a - b);
}

/** Measured (orange) vs twin (blue) top-oil up to the cursor (FRONTEND_HANDOFF §6.3). */
export default function TopOilChart() {
  const { run, cursor, seenAlerts } = useDataset();

  const base = useMemo(() => {
    if (!run) return null;
    const t = run.series.timestamp.map(istAxis);
    const ms = run.series.timestamp.map((x) => Date.parse(x));
    const measured = run.series.OTI_C;
    const twin = run.series.twin_oil_C;
    const levels = baselineLevels(run);
    const all = [...twin, ...(measured ?? []), ...levels].filter((v): v is number => typeof v === "number");
    const range: [number, number] = [Math.floor(Math.min(...all)) - 2, Math.ceil(Math.max(...all)) + 3];
    return { t, ms, measured, twin, levels, range };
  }, [run]);

  if (!run || !base) return null;
  const { t, ms, measured, twin, levels, range } = base;
  const upto = cursor + 1;
  const meterOnly = run.dataset.mode === "meter_only";
  const colours = {
    measured: css("--measured"),
    twin: css("--twin"),
    text: css("--text"),
    muted: css("--muted-2"),
    grid: css("--border"),
    sensor: css("--sensor"),
    warn: css("--health-yellow"),
    crit: css("--health-red"),
  };

  // Alert markers up to the cursor, placed on the measured line (twin when there is no measurement).
  const marker = (a: (typeof seenAlerts)[number]) => {
    const i = nearest(ms, Date.parse(a.timestamp));
    return { x: t[i], y: measured?.[i] ?? twin[i] };
  };
  const assetAlerts = seenAlerts.filter((a) => a.origin === "asset");
  const sensorAlerts = seenAlerts.filter((a) => a.origin === "sensor");
  const hover = (a: (typeof seenAlerts)[number]) =>
    `${humanise(a.type)} · ${a.severity}<br>origin: ${a.origin} · detector: ${a.detector}` +
    (a.simulated ? "<br>SIMULATED" : "");

  const data: unknown[] = [];
  if (measured) {
    data.push({
      type: "scatter",
      mode: "lines",
      name: "Measured (OTI)",
      x: t.slice(0, upto),
      y: measured.slice(0, upto),
      connectgaps: false,
      line: { color: colours.measured, width: 1.6 },
      hovertemplate: "%{y:.1f} °C<extra>Measured</extra>",
    });
  }
  data.push({
    type: "scatter",
    mode: "lines",
    name: meterOnly ? "Twin (estimated by twin)" : "Twin",
    x: t.slice(0, upto),
    y: twin.slice(0, upto),
    line: { color: colours.twin, width: 1.6, dash: "dash" },
    hovertemplate: "%{y:.1f} °C<extra>Twin</extra>",
  });
  levels.forEach((level, k) => {
    data.push({
      type: "scatter",
      mode: "lines",
      name: k === 0 ? `Baseline alarm (${level} °C)` : `Baseline alarm (${level} °C)`,
      x: [t[0], t[t.length - 1]],
      y: [level, level],
      line: { color: colours.muted, width: 1, dash: "dot" },
      hoverinfo: "skip",
    });
  });
  if (assetAlerts.length) {
    const pts = assetAlerts.map(marker);
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Alert (asset)",
      x: pts.map((p) => p.x),
      y: pts.map((p) => p.y),
      text: assetAlerts.map(hover),
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        symbol: assetAlerts.map((a) => (a.severity === "critical" ? "x" : "triangle-up")),
        size: 9,
        color: assetAlerts.map((a) => (a.severity === "critical" ? colours.crit : a.severity === "warning" ? colours.warn : colours.muted)),
        line: { width: 1, color: colours.text },
      },
    });
  }
  if (sensorAlerts.length) {
    const pts = sensorAlerts.map(marker);
    data.push({
      type: "scatter",
      mode: "markers",
      name: "Sensor fault",
      x: pts.map((p) => p.x),
      y: pts.map((p) => p.y),
      text: sensorAlerts.map((a) => `${hover(a)}<br>Data fault: check the device, not the transformer`),
      hovertemplate: "%{text}<extra></extra>",
      marker: { symbol: "diamond", size: 9, color: colours.sensor, line: { width: 1, color: colours.text } },
    });
  }

  // Injected fault (scenarios only): drawn once the replay has reached it, like the data.
  const fault = run.gt_markers;
  const faultReached = fault !== undefined && Date.parse(fault.fault_start) <= ms[cursor];
  const shapes: unknown[] = [
    { type: "line", xref: "x", yref: "paper", x0: t[cursor], x1: t[cursor], y0: 0, y1: 1, line: { color: colours.grid, width: 2 } },
  ];
  const annotations: unknown[] = [];
  if (fault && faultReached) {
    const fx = istAxis(fault.fault_start);
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: fx, x1: fx, y0: 0, y1: 1, line: { color: colours.text, width: 1.5, dash: "dash" } });
    annotations.push({
      x: fx, y: 1, xref: "x", yref: "paper", yanchor: "bottom", xanchor: "left", showarrow: false,
      text: `injected fault: ${fault.fault_label}`, font: { size: 11, color: colours.text },
    });
  }

  const layout = {
    autosize: true,
    height: 340,
    margin: { l: 56, r: 16, t: 28, b: 40 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: '"IBM Plex Sans", system-ui, sans-serif', size: 12, color: colours.text },
    uirevision: run.dataset.id,
    xaxis: { type: "date", range: [t[0], t[t.length - 1]], gridcolor: colours.grid, linecolor: colours.grid, hoverformat: "%d %b %H:%M" },
    yaxis: { title: { text: "Top-oil temperature (°C)" }, range, gridcolor: colours.grid, zeroline: false },
    legend: { orientation: "h", x: 0, y: -0.18 },
    hovermode: "closest",
    shapes,
    annotations,
  };

  return (
    <Plot
      data={data}
      layout={layout}
      config={{ displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtonsToRemove: ["select2d", "lasso2d"] }}
      useResizeHandler
      style={{ width: "100%", height: 340 }}
    />
  );
}
