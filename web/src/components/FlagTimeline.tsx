import { useMemo } from "react";
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { useDataset } from "../context/DatasetContext";
import { istAxis } from "../lib/format";

const Plot = createPlotlyComponent(Plotly);
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Data-quality flags over time: one row per flag code, a mark at every sample carrying it, up to
 * `upTo`. dq_flags holds ";"-separated codes per sample (FRONTEND_HANDOFF §4.1). Flags are data
 * issues, not health states, so they use the neutral sensor colour.
 */
export default function FlagTimeline({ upTo }: { upTo: number }) {
  const { run } = useDataset();

  const base = useMemo(() => {
    if (!run) return null;
    const t = run.series.timestamp.map(istAxis);
    const perCode = new Map<string, number[]>();
    run.series.dq_flags.forEach((cell, i) => {
      for (const code of cell.split(";").map((c) => c.trim()).filter(Boolean)) {
        perCode.set(code, [...(perCode.get(code) ?? []), i]);
      }
    });
    return { t, perCode };
  }, [run]);

  if (!run || !base) return null;
  const { t, perCode } = base;
  if (perCode.size === 0) return <p className="p-4 text-sm text-muted-2">No flagged samples in the time series.</p>;

  const codes = [...perCode.keys()].sort();
  const colour = css("--sensor");
  const grid = css("--border");
  const height = 70 + 34 * codes.length;
  const cur = t[Math.min(upTo, t.length - 1)];
  const data = codes.map((code) => {
    const idx = (perCode.get(code) ?? []).filter((i) => i <= upTo);
    return {
      type: "scatter",
      mode: "markers",
      name: code,
      x: idx.map((i) => t[i]),
      y: idx.map(() => code),
      marker: { symbol: "square", size: 8, color: colour },
      hovertemplate: `${code}<br>%{x|%d %b %H:%M}<extra></extra>`,
      showlegend: false,
    };
  });
  const layout = {
    autosize: true,
    height,
    margin: { l: 130, r: 12, t: 8, b: 32 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: '"IBM Plex Sans", system-ui, sans-serif', size: 12, color: css("--text") },
    uirevision: run.dataset.id,
    xaxis: { type: "date", range: [t[0], t[t.length - 1]], gridcolor: grid, linecolor: grid },
    yaxis: { type: "category", categoryorder: "array", categoryarray: [...codes].reverse(), gridcolor: grid, automargin: true },
    hovermode: "closest",
    shapes: [{ type: "line", xref: "x", yref: "paper", x0: cur, x1: cur, y0: 0, y1: 1, line: { color: grid, width: 2 } }],
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
