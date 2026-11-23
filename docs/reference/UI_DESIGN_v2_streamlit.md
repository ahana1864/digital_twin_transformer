# UI Design v2: Streamlit Dashboard + 3D Twin Component

Owner: **P4 Product (Ahana)**. Status: build spec, 2026-10-10.
Source of truth: **`FINAL_PRD.md`** (+ `DATA_INGESTION_SPEC.md`). This file details §10 (Dashboard) of the final PRD and adds the 3D twin. Old docs are in `docs/superseded/` and must not be used.

---

## 1. Concept

A **Streamlit multipage app** (FINAL_PRD §10) with one addition: the **Overview page is built around a live 3D model of Transformer-1**.

- Parts of the model take green, yellow or red from the analytics, and hovering shows their status.
- Clicking a part (or a new alert) opens a detail box with the alert, its explanation, readings, lead time and the recommended test.
- Everything else uses native Streamlit widgets and Plotly.

Demo story (FINAL_PRD §16):
1. Pick a scenario.
2. Press play.
3. The replay advances.
4. The twin detects the problem and the affected part turns red.
5. The box explains it and names the test to run.

---

## 2. Hard constraints

| Rule | Detail |
|---|---|
| Stack | Python 3.12, Streamlit, Plotly. The 3D twin is a **Streamlit custom component** written in plain HTML/JS (no React, no npm build). |
| Offline | Everything works with the network off: three.js, fonts and icons are vendored inside the component folder. No CDN. |
| Honesty | **SIMULATED banner** whenever simulated rows are shown. Every alert shows `origin` (asset / sensor). Nothing on screen is hard-coded for show. Missing data turns a feature off, with a short note, and never crashes a page (capability matrix). |
| Modes | Every page renders in `full`, `meter_only` and `data_only` modes (FINAL_PRD §13 P4 acceptance). |
| Contracts | The UI uses only the frozen interfaces in FINAL_PRD §12 (`Dataset`, `TwinState`, `AnalysisResult`, `Alert`, `Recommendation`, `Health`, `RUL`). It does not edit other owners' modules. |
| Colours | Green, yellow and red are used **only for health state** (FINAL_PRD §10). |
| Footer | On every page: "SIMULATED data is labelled. 3D model: Showdoze (Sketchfab), CC-BY-NC 4.0." |

---

## 3. App structure

```
app/
  streamlit_app.py          entry: page config, theme, sidebar, session state, navigation
  state.py                  load dataset, build replay timeline, current index, caching
  twin_view.py              builds the TwinView dict for the 3D component (§6) from AnalysisResult + row
  ui.py                     shared bits: SIMULATED banner, badges, health colours, footer, empty-state notes
  pages/
    1_Overview.py
    2_Loading_and_Temperatures.py
    3_Failure_Modules.py
    4_Alerts_and_Maintenance.py
    5_Import.py
    6_Data_Health.py
    7_Real_Field_Data.py
    8_Self_Test.py
    9_Reports.py
    10_About.py
  components/twin3d/
    __init__.py             declare_component(path=frontend/) + twin3d(view, key) wrapper
    frontend/
      index.html            Streamlit protocol + mounts the scene
      js/                   protocol.js, scene.js, model.js, partMap.js, overlay.js
      css/style.css
      vendor/               three.module.js, GLTFLoader.js, OrbitControls.js, BufferGeometryUtils.js
      models/transformer_parts.glb
      fonts/ icons/
  mock/
    mock_data.py            mock canonical trend + mock AnalysisResult timeline until real modules land
.streamlit/config.toml      light theme
```

Run: `streamlit run app/streamlit_app.py`.

---

## 4. Global layout (every page)

**Sidebar**
1. **Dataset / scenario selector:** N, S1–S5 generated, Kaggle real field data, or an imported dataset.
2. Replay controls: ▶/⏸, speed (e.g. 1 step/s, 4, 16, 96 = 1 day/s), a timeline slider to jump, and a timestamp readout.
3. **Meter-only toggle** (FINAL_PRD §7.3). It is disabled with a note when the data has no OTI, because the mode is then automatic.
4. **Mode badge:** `full` / `meter_only` / `data_only`.
5. Health mini-pill (score + band) and active alert count.

**Top of every page**
- **SIMULATED banner** (amber strip, "SIMULATED — generated scenario S2: cooling degradation") whenever `simulated` rows are shown.
- A red banner if the nameplate was estimated from data.

**Replay mechanics (recommended)**
- When a dataset loads, run the twin and `StreamAnalyzer` once over all rows and cache one snapshot per row: row, twin values, `AnalysisResult`. About 2,880 rows for 30 days at 15 min.
- Replay then only moves an index in `st.session_state`, inside an `@st.fragment(run_every=…)` block. This is fast, offline and identical every run.

---

## 5. Pages

| Page | Contents (FINAL_PRD §10) | Notes |
|---|---|---|
| **Overview** | **3D twin component (hero)**; HI gauge + 6 sub-score bars; risk class; RUL range (years low–high); active alerts list; small trends (loading, measured vs twin oil). | Layout in §5.1 |
| **Loading & Temperatures** | Loading % with 90 / 100 % lines; R/Y/B currents and voltages; **measured vs twin oil temp** with the residual below; hot-spot; ambient; rolling fidelity RMSE with a "model drift" warning. | Plotly, shared x-axis, current replay time marked |
| **Failure Modules** | Tabs: **Overloading · Insulation · Short circuit**, plus Oil leak/theft, Unbalance, Moisture/breathing ("experimental"), through-fault event log with cumulative I²t. | Each tab shows "needs X" when that capability is missing |
| **Alerts & Maintenance** | Alert feed: time, module, type, severity, **origin badge (asset / sensor)**, detector, value vs threshold, **lead time**, SIMULATED tag. Recommendation table: action, test, urgency, reason, standard ref. | Clicking an alert jumps the replay to that time |
| **Import** | Upload file(s) → auto-mapping table with confidence (dropdown per column), 10-row preview, detected units, Save mapping, Load. | Uses P1's `inspect()` / `load()` |
| **Data Health** | Rows, span, interval, flag counts, conversions, derived channels, **capability matrix** (✓/✕ table), mode, nameplate source. | From `Dataset.health_report` |
| **Real Field Data** | Kaggle unit: fitted twin vs measured OTI, data-quality flags on the timeline, sensor-fault alerts. Banner: "different transformer, fitted twin". | |
| **Self-Test** | CPRI Excel format: reference vs software, % diff, pass ≤ 1 %, 50 A / 60 °C trip tests, oil channel, "status to master number" (Telegram + in-app fallback). | Bench values only here |
| **Reports** | Download PDF summary (with Data Health appendix), CSV export, lead-time table. | HTML/CSV fallback if PDF fails |
| **About** | Twin definition (CIGRE JWG A2/D2.65), architecture diagram, assumptions register, citations, fidelity explanation. | |

### 5.1 Overview layout (wide mode)

```
┌ SIMULATED — scenario S2: cooling degradation ──────────────────────────────┐
├──────────────────────────────────────────────┬─────────────────────────────┤
│                                              │  Health 72  ● Yellow        │
│        3D TWIN COMPONENT (≈ 620 px tall)     │  [gauge] + 6 sub-score bars │
│   hover = tooltip, click = detail box,       │  Risk: Medium               │
│   X-ray toggle, parts coloured by status     │  RUL 14–17 yrs              │
│                                              ├─────────────────────────────┤
│                                              │  Active alerts (newest)     │
│                                              │  ▲ residual_drift · asset   │
│                                              │    lead time 9.5 h  [→ box] │
├──────────────────────────────────────────────┴─────────────────────────────┤
│ Loading % (sparkline)     |  Measured vs twin oil temp + residual (small)  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 3D twin component

### 6.1 Model
- `frontend/models/transformer_parts.glb`: about 4.6 MB, about 12k triangles, textured. "High voltage power transformer" by **Showdoze** (Sketchfab), **CC-BY-NC 4.0**, credited in the footer.
- It has been split into 28 named meshes by `tools/split_glb.py`. Previews: `docs/model_preview.png` and `docs/model_parts_preview.png`.
- Mesh prefixes: `tank*` (tank + fittings), `conservator`, `radiator*` (6 banks + headers + pipes), `bushing*` (6 bushings + 6 bases).
- Base at y = 0, about 5.5 × 4.4 × 3 units, conservator at −x.
- **Windings (`winding_r/y/b`, copper coils named by phase) and a core are built in code** inside the tank. They are visible in **X-ray mode**, which fades `tank*` to about 15 % opacity.
- If the `.glb` fails to load, a primitive fallback model with the same part ids is built in code.
- In the pitch: "representative 3D model" (power-transformer style). The twin itself models the 1000 kVA distribution transformer.

### 6.2 Parts, data and alert mapping

| Part id | Meshes | Readings shown (canonical / twin columns) | Alert types mapped here |
|---|---|---|---|
| `windings` | `winding_r/y/b` | `IR, IY, IB, I_mean, loading_pct, WTI_C` (if present), `twin_hs_C`, `aging_rate` | overload, hot_spot, loading, unbalance, neutral, through_fault (short_circuit), insulation / ageing |
| `tank` | `tank*` | `OTI_C` vs `twin_oil_C`, `amb_C` | top_oil high, OTI sensor faults (`jump_oti`, stuck), fidelity / model drift |
| `radiators` | `radiator*` | `residual_oil_C`, `fidelity_rmse_C`, `OTI_C`, `twin_oil_C` | residual_drift (cooling degradation) |
| `conservator` | `conservator` | `OLI_pct` (+ slope), `RH_pct`, breathing index | oil_leak, oil_theft, oil_level_low, moisture / breathing |
| `bushings` | `bushing*` | `VR, VY, VB`, voltage unbalance %, `PF`, `freq_Hz` | voltage high / low, voltage_unbalance |
| `core` | `core` (X-ray only) | — | **Not monitored.** Tooltip says "Core: not monitored (no sensor)". Always neutral grey, never green. |

- The mapping lives in **`app/twin_view.py` as `ALERT_TO_PART`**, keyed by `Alert.type` with a fallback on `Alert.module`: `overloading`/`short_circuit`/`insulation` → windings, `oil`/`moisture` → conservator, `electrical` → windings (current) or bushings (voltage), `data` → the part owning that channel.
- Unknown types go to the part owning the alert's channel, else to "General" in the alert list. Nothing is ever dropped silently.
- The frontend only *places* alerts on parts. Detection and severity come from P3's analytics, unchanged.

### 6.3 Part status rules
- **Status** = worst active alert severity on the part: `critical` → red, `warning` → yellow, `info` or none → green.
- **Sensor-origin alerts** (`origin = sensor`) don't paint the part red. They show a **sensor badge** (blue-grey ⓘ icon) with "Check the device, not the transformer". This matches FINAL_PRD §8.6.
- **Unavailable** (capability off, e.g. no `OLI_pct`) → grey, tooltip "No data: oil level not in this dataset".
- **Meter-only mode:** the tank and radiators show "Estimated (meter-only)". The residual-based status is off, so the radiators are grey.
- **HI cap:** if `Health.capped` is true, the health gauge shows "capped at 40 by critical alarm".
- **Bands** for health colours (FINAL_PRD §8.8): **Green ≥ 80, Yellow 60–79, Red < 60**.

### 6.4 Interaction (inside the component)
| Trigger | Result |
|---|---|
| Hover part | Highlight the whole part (all its meshes) + tooltip: label · status word · one key reading |
| Click part | Detail box (§6.5) anchored by a leader line that follows the part while rotating |
| New alert on a part | Box opens automatically and the camera eases to the part (800 ms). It does not reopen after the user closes it for the same alert id. Max 2 boxes. |
| Windings alert | X-ray switches on automatically |
| X-ray button | Toggle (top-right corner of the component) |
| Idle | Slow auto-rotate, paused on hover/drag, resumes after 10 s |
| `Esc` / ✕ / empty click | Close boxes |

### 6.5 Detail box
```
┌ ✕ Critical · Radiators ──────────────────── SIMULATED ┐
│ residual_drift · detector: residual · origin: asset   │
│ Since 2026-04-21 14:15 · lead time 9.5 h vs baseline  │
│ "Measured oil temp 6.2 °C above twin for 3 h"         │  ← Alert.explanation
│ Readings          measured   twin                     │
│  Top oil          78.4 °C    72.2 °C   (+6.2)         │
│  Fidelity RMSE    2.9 °C                              │
│ [mini chart: OTI vs twin_oil, last 48 h of replay]    │
│ Recommended: Inspect radiators/cooling; check oil     │
│ level · Urgency 7 d · ref: IEC 60076-7                │  ← Recommendation
└───────────────────────────────────────────────────────┘
```
A healthy part shows its readings and "Operating normally".

**Glass style (detail boxes and hover tooltip).** The boxes float over the 3D canvas as frosted glass, so the model stays faintly visible behind them.
```css
.glass {
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-left: 4px solid var(--status-colour);   /* green / yellow / red / sensor */
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
@supports not (backdrop-filter: blur(1px)) { .glass { background: rgba(255, 255, 255, 0.95); } }
```
- **Readability first:** text stays `--text` (#0F172A) at full strength, and numbers use the mono font. If text over a busy part of the model drops below 4.5:1 contrast, raise the background opacity to 0.75. Check this on the projector.
- The status colour shows as the left border plus a faint tint at the top: a gradient of the status colour at 8 % fading to transparent over 40 px.
- Mini charts inside the box use a transparent background.
- The status chip and SIMULATED tag stay solid (not glass), so they remain legible.
- With `prefers-reduced-transparency`, use the solid fallback.
- Blueprint callouts (§6.7) stay solid blueprint style, not glass, so the two modes look distinct.

### 6.6 Component contract (Python → JS), sent on every replay tick

`twin3d(view: dict, key="twin")`. `view` is built by `twin_view.build(snapshot, dataset)`:

```json
{
  "timestamp": "2026-04-21T14:15:00+05:30",
  "simulated": true,
  "mode": "full",
  "source_label": "Scenario S2 — cooling degradation",
  "health": {"score": 72.0, "band": "yellow", "capped": false},
  "parts": {
    "radiators": {
      "status": "red", "available": true, "estimated": false,
      "readings": [{"label": "Top oil", "value": 78.4, "unit": "°C", "twin": 72.2}],
      "alert_ids": ["A-0012"], "sensor_alert_ids": []
    }
  },
  "alerts": [{
    "id": "A-0012", "timestamp": "...", "part": "radiators", "module": "insulation",
    "type": "residual_drift", "severity": "critical", "origin": "asset", "detector": "residual",
    "value": 6.2, "threshold": 4.1, "explanation": "...", "lead_time_h": 9.5, "simulated": true,
    "recommendation": {"action": "...", "test": "...", "urgency": "7d", "standard_ref": "..."}
  }],
  "history": {"radiators": {"t": ["..."], "measured": [78.1], "twin": [72.0]}},
  "asset": {
    "rating_kVA": {"value": 1000, "tag": "Confirmed"},
    "lv_V": {"value": 415, "tag": "Confirmed"},
    "rated_current_A": {"value": 1391, "tag": "Calculated"},
    "hv_kV": {"value": 11, "tag": "Assumed"},
    "vector_group": {"value": "Dyn11", "tag": "Assumed"},
    "cooling": {"value": "ONAN", "tag": "Assumed"},
    "insulation": {"value": "Normal Kraft paper", "tag": "Assumed"}
  },
  "capabilities": {"OTI_C": true, "WTI_C": false, "OLI_pct": true, "RH_pct": false}
}
```

- It must include all 6 part ids every tick. `asset` comes from `Dataset.asset` (tags preserved) and `capabilities` from `Dataset.capabilities`; both are only needed for blueprint mode (§6.7).
- `history` covers the last 48 h of replay for parts with a measured-vs-twin pair.
- **JS → Python:** `{"selected_part": "radiators"}` or `null`. This is optional; Overview can use it to filter its alert list.
- **Performance:** the iframe stays mounted (stable `key`). Each tick only sends new `view` args, and the model never reloads. JSON stays under about 50 KB per tick.


### 6.7 Blueprint mode (P1: build after the core flow, first to cut)

A **"Blueprint" toggle** sits next to X-ray in the component corner. While it is on, the model behaves like a technical drawing.

**On hover:**
- The rest of the model fades to about 10 % opacity.
- The hovered part is redrawn as **blue line art**: edges only, via `EdgesGeometry`, colour `#1D4ED8`, about 1.5 px. It sits over a faint blueprint grid on a pale blue tint (`#EFF6FF`).
- **Callouts** are drawn with thin leader lines to the part. Each shows a label in mono uppercase plus the value with its source tag.
- A small status chip shows the part's live status, so status stays visible.
- The callouts stay in place for 300 ms after the pointer leaves, so they don't flicker.

**Click** still opens the alert detail box as usual. **Blueprint off** returns to normal hover tooltips. Blueprint mode works with X-ray, so the windings and core can be drawn as blueprints too.

**Callout content per part.** Static text lives in `partMap.js`; live values come from `view.asset` and `view.parts`:

| Part | Function (static text) | Specs (from `view.asset`, with tags) | Watched by (from capabilities) |
|---|---|---|---|
| windings | Carry load current; R/Y/B phases; hot-spot sets insulation ageing | rating kVA, LV V, rated current A, vector group, insulation type | IR/IY/IB, WTI (if present), twin hot-spot |
| tank | Holds core, windings and insulating oil | cooling type, oil volume (if known) | OTI, twin top-oil |
| radiators | Dissipate oil heat to air (ONAN) | cooling type, rated top-oil rise | residual (OTI − twin) |
| conservator | Oil expansion reservoir; breathes via silica-gel breather | breather type | OLI, RH |
| bushings | Insulated HV/LV terminals | HV kV, LV V | VR/VY/VB |
| core | Magnetic circuit (laminated steel) | no-load loss | "Not monitored" |

**Honesty rules:**
- **No invented dimensions or values.** Show only fields present in `asset`, each with its tag: [Confirmed], [Assumed] or [Calculated].
- A missing field shows "— (nameplate pending)".
- The model's geometry is not to scale, so no mm dimension lines.
- The corner of the blueprint shows "Representative model · specs per asset.yaml".

---

## 7. Visual style (light mode)

`.streamlit/config.toml`:
```
[theme]
base = "light"
primaryColor = "#0284C7"
backgroundColor = "#F4F6F9"
secondaryBackgroundColor = "#FFFFFF"
textColor = "#0F172A"
font = "sans serif"
```

Component and custom CSS tokens:
```
--bg #F4F6F9 · --canvas #EEF1F5 · --panel #FFFFFF · --border #E2E8F0
--text #0F172A · --muted #64748B · --accent #0284C7 (twin / predicted, dashed)
--ok #16A34A · --warn #CA8A04 · --crit #DC2626 · --stale #94A3B8 · --sensor #475569
--simulated #B45309 (amber banner / tags)
```

- **Status:** always icon + word + colour (✓ Normal, ▲ Warning, ✕ Critical, ? No data, ⓘ Sensor).
- **Plotly:** `plotly_white` template. Measured is solid `--text`, twin is dashed `--accent`, the residual is a filled area, and threshold lines are dotted in the status colour. No transition animations on replay ticks.
- **Fonts:** Inter and JetBrains Mono (numbers, tabular). They are vendored in the component, and Streamlit itself uses its default sans.

---

## 8. Mock-first build

Until P1–P3 merge real modules, `app/mock/mock_data.py` provides:
- A canonical trend DataFrame matching DATA_INGESTION_SPEC §3.1 (30 days, 15 min, `simulated=True`) for scenarios N and S1–S5, with roughly plausible shapes.
- A per-row snapshot timeline with `AnalysisResult` objects built from the **real dataclasses in `contracts/models.py`**. If that file isn't merged yet, the mock creates temporary copies with identical fields.

A single switch, `USE_MOCK` in `app/state.py`, swaps mock ↔ real. No page code changes.

---

## 9. Build order and cut list

1. Migrate: create `app/` structure, move vendor/fonts/icons/model into `components/twin3d/frontend/`, set the theme, retire `static/`
2. `mock_data.py` + `state.py` (replay timeline, fragment tick) + sidebar
3. 3D component: Streamlit protocol, model load, hover, tooltip, X-ray, windings + core
4. `twin_view.py` + part colours + sensor badges + unavailable/estimated states
5. Detail box + leader lines + auto-open
5b. *(P1)* Blueprint mode (§6.7)
6. Overview page complete (gauge, sub-scores, RUL, alerts, trends)
7. Loading & Temperatures, Alerts & Maintenance
8. Import + Data Health (on P1's API)
9. Failure Modules, Real Field Data
10. Self-Test, Reports, About
11. Swap mock → real modules; run all modes

**Cut order:** Blueprint mode first, then FINAL_PRD §14: Telegram → PDF (CSV + HTML fallback) → Real Field Data fitted twin → self-test polish. **Never cut:** Import, Overview, Data Health.

If the 3D component blocks progress for over 2 hours, Overview falls back to a Plotly/SVG transformer diagram with the same part statuses. The rest of the app is unaffected.

---

## 10. Done = all pass

- [ ] `streamlit run app/streamlit_app.py` works on a fresh clone with the network off
- [ ] Each scenario N, S1–S5 colours the expected part (N: all green, zero alerts)
- [ ] Sensor-origin alerts show the sensor badge, not red
- [ ] Meter-only toggle: tank/radiators show "Estimated", radiators grey, no crash
- [ ] A data-only fixture: every page renders with "needs X" notes
- [ ] Model never reloads during replay; leader lines stay attached while rotating
- [ ] SIMULATED banner on every page showing simulated data; footer credit present
- [ ] Every number traces to `Dataset` / `AnalysisResult` / twin columns
