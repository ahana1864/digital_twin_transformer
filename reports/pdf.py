"""PDF report generation (dt/api.py:report_pdf, FINAL_PRD.md §10 "PDF summary incl. Data Health
appendix"). reportlab: pure Python, no system dependencies (unlike e.g. weasyprint's Cairo/Pango).

    build_report_pdf(run: contracts.models.Run) -> bytes
"""
from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

from contracts.models import Run

# Same palette as the dashboard (FRONTEND_HANDOFF §9): never colour alone, but a PDF has no icons,
# so pairing colour with the word (band name, severity name) in the same cell carries that rule.
BAND_COLOUR = {
    "Green": colors.HexColor("#16a34a"),
    "Yellow": colors.HexColor("#ca8a04"),
    "Red": colors.HexColor("#dc2626"),
}
SEVERITY_COLOUR = {
    "critical": colors.HexColor("#dc2626"),
    "warning": colors.HexColor("#ca8a04"),
    "info": colors.HexColor("#64748b"),
}
MUTED = colors.HexColor("#64748b")
BORDER = colors.HexColor("#e2e8f0")
HEADER_BG = colors.HexColor("#f1f5f9")

MAX_ALERTS = 40  # keeps the PDF a reasonable size; the appendix says how many were cut
MAX_RECS = 20
MAX_SNAPSHOT_ROWS = 30


def _styles() -> dict:
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", parent=ss["Heading1"], fontSize=18, spaceAfter=2))
    ss.add(ParagraphStyle("Sub", parent=ss["Normal"], fontSize=10, textColor=MUTED, spaceAfter=10))
    ss.add(ParagraphStyle("H2", parent=ss["Heading2"], fontSize=13, spaceBefore=12, spaceAfter=6))
    ss.add(ParagraphStyle("Body", parent=ss["Normal"], fontSize=9, leading=12))
    ss.add(ParagraphStyle("Small", parent=ss["Normal"], fontSize=8, textColor=MUTED, leading=11))
    ss.add(ParagraphStyle("Cell", parent=ss["Normal"], fontSize=8, leading=10))
    return ss


def _table(rows: list[list], col_widths=None, header: bool = True) -> Table:
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    t.setStyle(TableStyle(style))
    return t


def _fmt(v, nd=1) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return "—"
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def _fmt_ts(ts) -> str:
    if ts is None or (isinstance(ts, float) and pd.isna(ts)):
        return "—"
    t = pd.Timestamp(ts)
    return t.strftime("%d %b %Y, %H:%M IST") if not pd.isna(t) else "—"


def _header(run: Run, ss: dict) -> list:
    simulated = bool(run.trend["simulated"].any()) if "simulated" in run.trend.columns else False
    tag = "SIMULATED — generated data" if simulated else "Measured field data"
    story = [
        Paragraph(run.name, ss["H1"]),
        Paragraph(
            f"{tag} · mode {run.mode.upper()} · generated {datetime.now().strftime('%d %b %Y, %H:%M')}",
            ss["Sub"],
        ),
    ]
    return story


def _asset_section(run: Run, ss: dict) -> list:
    a = run.asset
    rows = [["Field", "Value"]]
    pairs = [
        ("Name", a.get("name")), ("Site", a.get("site")),
        ("Rated power", f"{_fmt(a.get('rating_kVA'), 0)} kVA" if a.get("rating_kVA") is not None else None),
        ("LV voltage", f"{_fmt(a.get('lv_voltage_V'), 0)} V" if a.get("lv_voltage_V") is not None else None),
        ("Rated current", f"{_fmt(a.get('i_rated_A'), 0)} A" if a.get("i_rated_A") is not None else None),
        ("HV voltage", f"{_fmt(a.get('hv_voltage_V'), 0)} V" if a.get("hv_voltage_V") is not None else None),
        ("Vector group", a.get("vector_group")), ("Cooling", a.get("cooling")),
        ("Years in service", a.get("years_in_service")),
        ("Nameplate source", a.get("nameplate_source")),
    ]
    for label, v in pairs:
        if v is not None:
            rows.append([label, str(v)])
    return [Paragraph("Asset", ss["H2"]), _table(rows, col_widths=[45 * mm, 100 * mm])]


def _health_section(run: Run, ss: dict) -> list:
    h = run.analysis.health
    colour = BAND_COLOUR.get(h.band, colors.black)
    story = [Paragraph("Health Index", ss["H2"])]
    # One consistent font size per paragraph: mixing wildly different inline <font size> runs in a
    # single reportlab Paragraph miscomputes the line's height against the style's base leading,
    # which let this line overlap the table below it. Two same-size lines instead.
    score_style = ParagraphStyle("Score", parent=ss["Body"], fontSize=20, leading=24, textColor=colour)
    band_style = ParagraphStyle("Band", parent=ss["Body"], fontSize=10, textColor=MUTED, spaceAfter=6)
    story.append(Paragraph(f"<b>{h.score:.1f}</b> / 100", score_style))
    band_line = f"<b>{h.band.upper()}</b>"
    if h.capped:
        band_line += ' <font color="#dc2626">— capped: a critical alert limits the index</font>'
    story.append(Paragraph(band_line, band_style))
    rows = [["Sub-score", "Value"]] + [[k.replace("_", " ").title(), f"{v:.1f}"] for k, v in h.components.items()]
    story.append(_table(rows, col_widths=[60 * mm, 30 * mm]))

    rul = run.analysis.rul
    if rul:
        story.append(Spacer(1, 8))
        display = run.summary.get("rul_display") or f"{rul.years_low:.1f}–{rul.years_high:.1f} years"
        story.append(Paragraph(f"<b>Remaining life:</b> {display} · risk {rul.risk} (whole run)", ss["Body"]))
        lcd = run.summary.get("life_consumed_days") or {}
        if lcd:
            story.append(
                Paragraph(
                    f"Life consumed — expected {_fmt(lcd.get('expected'), 2)} d, "
                    f"actual {_fmt(lcd.get('actual'), 2)} d, "
                    f"ageing rate now {rul.recent_rate:.2f}× the reference rate.",
                    ss["Small"],
                )
            )
    fidelity = run.analysis.fidelity_rmse_C
    if fidelity is not None:
        story.append(Paragraph(f"Twin fidelity (measured vs twin top-oil, rolling 24 h RMSE): {fidelity:.2f} °C", ss["Small"]))
    drift = run.summary.get("drift_message")
    if drift:
        story.append(Paragraph(f"⚠ {drift}", ss["Small"]))
    return story


def _alerts_section(run: Run, ss: dict) -> list:
    alerts = sorted(run.analysis.alerts, key=lambda a: a.timestamp)
    story = [Paragraph(f"Alerts ({len(alerts)})", ss["H2"])]
    if not alerts:
        story.append(Paragraph("No alerts: every part stayed NORMAL for this run.", ss["Body"]))
        return story
    shown = alerts[-MAX_ALERTS:]
    rows = [["Time", "Severity", "Module", "Type", "Origin", "Explanation"]]
    for a in shown:
        colour = SEVERITY_COLOUR.get(a.severity, colors.black)
        sev = Paragraph(f'<font color="{colour.hexval()}"><b>{a.severity.upper()}</b></font>', ss["Cell"])
        rows.append([
            Paragraph(_fmt_ts(a.timestamp), ss["Cell"]), sev, a.module, a.type.replace("_", " "), a.origin,
            Paragraph(a.explanation, ss["Cell"]),
        ])
    story.append(_table(rows, col_widths=[22 * mm, 18 * mm, 18 * mm, 22 * mm, 12 * mm, 50 * mm]))
    if len(alerts) > MAX_ALERTS:
        story.append(Paragraph(f"+{len(alerts) - MAX_ALERTS} earlier alerts not shown.", ss["Small"]))
    return story


def _recommendations_section(run: Run, ss: dict) -> list:
    recs = run.analysis.recommendations
    story = [Paragraph(f"Recommendations ({len(recs)})", ss["H2"])]
    if not recs:
        story.append(Paragraph("None raised.", ss["Body"]))
        return story
    rows = [["Urgency", "Action", "Test", "Standard"]]
    for r in recs[:MAX_RECS]:
        rows.append([
            r.urgency,
            Paragraph(r.action, ss["Cell"]),
            Paragraph(r.test or "—", ss["Cell"]),
            Paragraph(r.standard_ref or "—", ss["Cell"]),
        ])
    story.append(_table(rows, col_widths=[16 * mm, 56 * mm, 46 * mm, 28 * mm]))
    if len(recs) > MAX_RECS:
        story.append(Paragraph(f"+{len(recs) - MAX_RECS} more not shown.", ss["Small"]))
    return story


def _data_health_section(run: Run, ss: dict) -> list:
    story = [Paragraph("Data Health appendix", ss["H2"])]
    hr = run.health_report or {}
    rows_total = len(run.trend)
    span = ""
    if "timestamp" in run.trend.columns and rows_total:
        span = f"{_fmt_ts(run.trend['timestamp'].min())} → {_fmt_ts(run.trend['timestamp'].max())}"
    rows_clean = hr.get("rows_after_cleaning", rows_total)
    story.append(
        Paragraph(
            f"Mode: <b>{run.mode}</b> · rows: {rows_clean} · span: {span or '—'} · "
            f"nameplate source: {hr.get('nameplate_source', run.asset.get('nameplate_source', '—'))}",
            ss["Body"],
        )
    )

    caps = run.capabilities or {}
    if caps:
        story.append(Spacer(1, 4))
        cap_rows = [["Capability", "Available"]] + [[k.replace("_", " "), _fmt(v)] for k, v in sorted(caps.items())]
        half = (len(cap_rows) + 1) // 2
        left = _table([cap_rows[0]] + cap_rows[1:half], col_widths=[45 * mm, 20 * mm])
        right = _table([cap_rows[0]] + cap_rows[half:], col_widths=[45 * mm, 20 * mm]) if len(cap_rows) > half else None
        story.append(_table([[left, right or ""]], col_widths=[70 * mm, 70 * mm], header=False))

    mapping = hr.get("mapping")
    if mapping:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Column mapping used", ss["Body"]))
        rows = [["Source", "Canonical", "Unit"]] + [
            [m.get("source", "—"), m.get("canonical") or "—", m.get("unit") or "—"] for m in mapping
        ]
        story.append(_table(rows, col_widths=[60 * mm, 40 * mm, 20 * mm]))

    flags = hr.get("flag_counts")
    if flags:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Data-quality flags", ss["Body"]))
        rows = [["Code", "Count"]] + [[k, str(v)] for k, v in sorted(flags.items(), key=lambda kv: -kv[1])]
        story.append(_table(rows, col_widths=[60 * mm, 20 * mm]))

    return story


def _snapshot_section(run: Run, ss: dict) -> list:
    """Snapshot mode (no replay): the worst-health records instead of a time series."""
    story = [Paragraph(f"Records ({len(run.trend)})", ss["H2"])]
    t = run.trend.sort_values("score").head(MAX_SNAPSHOT_ROWS) if "score" in run.trend.columns else run.trend.head(MAX_SNAPSHOT_ROWS)
    cols = [c for c in ("record_id", "score", "band", "load_pu", "OTI_C", "residual_oil_C") if c in t.columns]
    rows = [[c.replace("_", " ") for c in cols]]
    for _, r in t.iterrows():
        rows.append([_fmt(r[c]) for c in cols])
    story.append(_table(rows))
    if len(run.trend) > MAX_SNAPSHOT_ROWS:
        story.append(Paragraph(f"Worst {MAX_SNAPSHOT_ROWS} of {len(run.trend)} records shown.", ss["Small"]))
    return story


def build_report_pdf(run: Run) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, title=f"{run.name} report",
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
    )
    ss = _styles()
    story: list = []
    story += _header(run, ss)
    story += _asset_section(run, ss)
    story.append(KeepTogether(_health_section(run, ss)))
    story.append(PageBreak())
    if run.mode == "snapshot":
        story += _snapshot_section(run, ss)
    else:
        story += _alerts_section(run, ss)
        story += _recommendations_section(run, ss)
    story += _data_health_section(run, ss)
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Generated by the Digital Twin dashboard. Everything marked SIMULATED is generated data, not a "
            "real measurement. 3D model: Showdoze (Sketchfab), CC-BY-NC 4.0.",
            ss["Small"],
        )
    )
    doc.build(story)
    return buf.getvalue()
