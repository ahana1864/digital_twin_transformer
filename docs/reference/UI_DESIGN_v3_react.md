# UI Design v3: React Frontend + 3D Twin

Owner: **P4 Product (Ahana)**. Status: build spec, 2026-10-10.
Source of truth for data and requirements: **`FINAL_PRD.md`** + **`DATA_INGESTION_SPEC.md`**. This file replaces the Streamlit dashboard in FINAL_PRD §10 with a **React** app, keeping its page list and honesty rules. Older designs are in `docs/reference/` (for ideas only).

**Assumptions (confirm with team):**
- P4 also builds the thin **FastAPI layer** (`api/`) that wraps the team's Python modules.
- Everything else in FINAL_PRD is unchanged.

---

## 1. Concept

The app opens on a **full-screen 3D model of Transformer-1**:
- **Hover** a part to see its status. In **blueprint mode**, hovering shows a technical drawing of the part instead.
- **Click** a part to open a **glass detail box** with the anomaly: time, reason, readings, lead time and recommended test.
- An **Alarm indicator** in the top bar shows the worst status: green, yellow or red.
- A **right drawer** (opened with the `‹` arrow) holds the health score ring, part statuses, RUL and alerts. It **opens automatically when the alarm rises**.
- A **bottom replay dock** holds the scenario selector, ▶/⏸, speed, timeline and "Jump to fault".
- A slim **left nav rail** leads to the other pages (Loading & Temps, Failure Modules, Alerts, Import, Data Health, Real Field Data, Self-Test, Reports, About).

Demo story: pick S2 → play at 1 day/s → jump to fault → watch at 1 h/s → the residual grows → the radiators turn yellow then red → the box opens: "cooling degradation, lead time 9.5 h, inspect radiators".

---

## 2. Stack and constraints

| Item | Choice |
|---|---|
| Build | **Vite + React + TypeScript** |
| Styling | **Tailwind CSS** with design tokens as CSS variables (§9) |
| 3D | `three` + **`@react-three/fiber`** + **`@react-three/drei`** (useGLTF, Bounds, OrbitControls, Html, Edges, Outlines) |
| State | **zustand** (replay clock, UI state); **@tanstack/react-query** (API data) |
| Charts | **Recharts** |
| Routing | react-router |
| Icons and fonts | `lucide-react`; `@fontsource/inter`, `@fontsource/jetbrains-mono` (bundled locally) |
| Offline | `npm run build` bundles everything. FastAPI serves `frontend/dist` at `/`. **No CDN or remote fonts.** Works with Wi-Fi off. |
| Honesty | **SIMULATED banner** whenever simulated data is shown. Every alert shows `origin` (asset / sensor). Every number comes from the API (or a mock with the identical contract). Missing data turns a feature off with a note and never crashes. |
| Modes | Every page renders in `full`, `meter_only` and `data_only`. |
| Footer | "SIMULATED data is labelled. 3D model: Showdoze (Sketchfab), CC-BY-NC 4.0." |

---

## 3. Repository layout

`frontend/` and `api/` sit at the **root of the team repo** (FINAL_PRD §12.1), next to `ingest/`, `twin/`, `analytics/` and so on.

```
frontend/
  public/models/transformer_parts.glb
  src/
    main.tsx  App.tsx  index.css (tokens + Tailwind)
    api/
      types.ts            all API types (§5), the single source of truth on the frontend
      client.ts           fetch wrappers; picks mock or real via VITE_USE_MOCK
      mock/               mock implementation of every endpoint (same types)
    state/
      replay.ts           zustand: datasetId, index, playing, speed, nTotal
      ui.ts               drawerOpen, xray, blueprint, openBoxes, dismissedAlertIds
    components/
      layout/   AppShell NavRail TopBar AlarmIndicator Drawer ReplayDock SimulatedBanner Footer
      twin/     TwinCanvas TransformerModel parts.ts Windings Core PartTooltip DetailBox
                BlueprintCallouts CameraRig FallbackModel
      health/   HealthRing SubScoreBars RulCard RiskBadge
      alerts/   AlertList AlertRow OriginBadge RecommendationCard
      charts/   MeasuredVsTwin LoadingChart PhaseCurrents MiniTrend
      ui/       GlassPanel StatusChip Badge EmptyState
    pages/      Overview LoadingTemps FailureModules Alerts Import DataHealth RealField SelfTest Reports About
    lib/        status.ts (bands, colours, severity → status), format.ts
api/
  main.py                FastAPI app, routes (§5), serves frontend/dist
  runs.py                load dataset → precompute snapshot timeline (cache)
  twin_view.py           builds Snapshot from AnalysisResult + row (ALERT_TO_PART, §6.2)
  mock.py                mock datasets/snapshots with the same shapes (used until team modules land)
```

**Run (dev):**
- `uvicorn api.main:app --reload --port 8000`
- `cd frontend && npm run dev` (Vite proxies `/api` to `:8000`)

**Run (demo):**
- `cd frontend && npm run build`
- `uvicorn api.main:app --port 8000`, then open `http://localhost:8000`

**Frontend only:** `VITE_USE_MOCK=true npm run dev` needs no Python at all.

---

## 4. Screen layout

```
┌──┬────────────────────────────────────────────────────────────────────────┐
│≡ │ [▲ ALARM: WARNING]  Transformer-1 · 1000 kVA   2026-04-21 14:15  FULL  │ Top bar 56px
│  ├────────────────────────────────────────────────────────────────────────┤
│◉ │ SIMULATED — Scenario S2: cooling degradation                           │ banner 28px
│  ├────────────────────────────────────────────────────────┬───────────────┤
│▤ │                                                        │ ‹  DRAWER     │
│  │   ┌glass box┐                                          │  360px        │
│⚠ │   │Radiators│────╮        3D TRANSFORMER               │  Health ring  │
│  │   └─────────┘     ●     (hover / click / X-ray /       │  Parts list   │
│⇪ │                         blueprint / reset view)        │  RUL · risk   │
│  │                                                        │  Alerts       │
│… ├────────────────────────────────────────────────────────┴───────────────┤
│  │ [S2 ▾] ▶  1 h/s ▾  ━━━━━━━━●━━━━━━━━━━━━━  day 21/30  [Jump to fault]  │ Replay dock 64px
│  │ SIMULATED data is labelled · 3D model: Showdoze (Sketchfab), CC-BY-NC  │ footer 24px
└──┴────────────────────────────────────────────────────────────────────────┘
 nav rail 56px (icons + tooltips)
```

- **Shared shell:** the top bar, banner, replay dock and footer appear on **every page**, and the replay clock is shared. On other pages, the drawer is replaced by that page's content.
- **Canvas sizing:** the canvas fills the remaining space, and the camera auto-fits the whole model (§6.4). When the drawer opens, the canvas shrinks rather than being covered.
- **Target screens:** 1366×768 and 1920×1080.

---

## 5. API contract

Mock and real implement exactly this; TypeScript types go in `src/api/types.ts`.

| Method and path | Returns |
|---|---|
| `GET /api/status` | `{ ok, backend: "mock" \| "real" }` |
| `GET /api/datasets` | `DatasetInfo[]` |
| `POST /api/datasets/{id}/load` | `RunInfo` (backend precomputes the snapshot timeline and caches it) |
| `GET /api/datasets/{id}/snapshot?i=` | `Snapshot` at replay index `i` |
| `GET /api/datasets/{id}/series?cols=a,b&from=&to=&step=` | `{ t: string[], cols: Record<string, (number\|null)[]> }` |
| `GET /api/datasets/{id}/alerts` | `Alert[]` (all, with `index` of first occurrence and `lead_time_h`) |
| `GET /api/datasets/{id}/events` | through-fault `Event[]` (DATA_INGESTION_SPEC §3.2) |
| `GET /api/datasets/{id}/data-health` | `health_report` (DATA_INGESTION_SPEC §3.3) |
| `POST /api/import/inspect` (multipart files) | `InspectResult`: proposed mapping with confidences, preview rows, units |
| `POST /api/import/load` `{ upload_id, mapping, save_as? }` | `DatasetInfo` |
| `GET /api/selftest` | self-test rows (reference, software, % diff, pass) |
| `GET /api/datasets/{id}/report.pdf` · `report.csv` | file download |

```ts
type Status = "green" | "yellow" | "red" | "grey";
type PartId = "windings" | "tank" | "radiators" | "conservator" | "bushings" | "core";

interface DatasetInfo { id: string; label: string; kind: "scenario" | "real" | "imported";
  simulated: boolean; n_steps: number; interval_min: number; start: string;
  fault_onset_index: number | null; }

interface RunInfo { id: string; n_steps: number; mode: "full" | "meter_only" | "data_only";
  capabilities: Record<string, boolean>; asset: Record<string, { value: string | number | null; tag: string }>;
  nameplate_estimated: boolean; }

interface Snapshot {
  index: number; n_steps: number; timestamp: string; simulated: boolean;
  mode: "full" | "meter_only" | "data_only"; source_label: string;
  alarm: Status;                                  // worst of parts (asset-origin) — §6.3
  health: { score: number; band: Status; capped: boolean;
            components: Record<string, number>; weights: Record<string, number> };
  rul: { years_low: number; years_high: number; risk: "low" | "medium" | "high" } | null;
  fidelity_rmse_C: number | null;
  parts: Record<PartId, {
    status: Status; available: boolean; estimated: boolean;
    readings: { label: string; value: number | null; unit: string; twin?: number | null }[];
    alert_ids: string[]; sensor_alert_ids: string[]; }>;
  active_alerts: Alert[];                         // active at this index
  history: Partial<Record<PartId, { t: string[]; measured: (number|null)[]; twin: (number|null)[] }>>; // last 48 h
}

interface Alert { id: string; index: number; timestamp: string; part: PartId | null;
  module: string; type: string; severity: "info" | "warning" | "critical";
  origin: "asset" | "sensor"; detector: "rule" | "residual" | "ml" | "physics";
  value: number | null; threshold: number | null; explanation: string;
  lead_time_h: number | null; simulated: boolean;
  recommendation: { action: string; test: string | null; urgency: string; rationale: string;
                    standard_ref: string | null } | null; }
```

**Replay:**
- The frontend owns the clock. Each tick (1 s) it moves `index` by the speed (1 / 4 / 16 / 96 steps, labelled "15 min/s · 1 h/s · 4 h/s · 1 day/s") and fetches that snapshot.
- react-query caches snapshots and prefetches the next few.
- Charts use `series` once per dataset and draw a marker at the current index.

---

## 6. 3D twin

### 6.1 Model
- `public/models/transformer_parts.glb`: about 4.6 MB, about 12k triangles, textured. "High voltage power transformer" by **Showdoze** (Sketchfab), **CC-BY-NC 4.0**.
- It has been split into **28 named meshes** by `tools/split_glb.py`. Previews: `docs/model_preview.png` and `docs/model_parts_preview.png`.
- Mesh name prefixes: `tank*` (tank + `tank_fitting_*`), `conservator`, `radiator*` (6 banks + `radiator_header_*` + `radiator_pipe_*`), `bushing*` (`bushing_hv_1..3`, `bushing_lv_1..3`, `bushing_base_1..6`).
- Base at y = 0, about 5.5 × 4.4 × 3 units, conservator at −x.
- **Built in code:** windings `winding_r/y/b` (copper coils by phase) and a laminated `core`, placed inside the tank bounds and visible in X-ray.
- **Fallback:** an `ErrorBoundary` + `Suspense` fallback builds a primitive transformer with the same part ids if the `.glb` fails.
- In the pitch: "representative 3D model". The data models the 1000 kVA distribution transformer.

### 6.2 Parts, readings and alert mapping

| Part | Meshes | Readings (canonical / twin columns) | Alert types placed here |
|---|---|---|---|
| `windings` | `winding_r/y/b` | `IR, IY, IB, I_mean, loading_pct, WTI_C`, `twin_hs_C`, `aging_rate` | overload, hot_spot, loading, unbalance, neutral, through_fault, insulation / ageing |
| `tank` | `tank*` | `OTI_C` vs `twin_oil_C`, `amb_C` | top_oil, OTI sensor faults (jump / stuck), model drift |
| `radiators` | `radiator*` | `residual_oil_C`, `fidelity_rmse_C`, `OTI_C`, `twin_oil_C` | residual_drift (cooling degradation) |
| `conservator` | `conservator` | `OLI_pct` (+ slope), `RH_pct`, breathing index | oil_leak, oil_theft, oil_level_low, moisture / breathing |
| `bushings` | `bushing*` | `VR, VY, VB`, voltage unbalance, `PF`, `freq_Hz` | voltage high / low, voltage_unbalance |
| `core` | `core` (X-ray only) | none | **Not monitored.** Always neutral grey. Tooltip: "Core: not monitored (no sensor)". |

- `api/twin_view.py` holds `ALERT_TO_PART`, keyed by `Alert.type` with a fallback on `Alert.module`. Unknown types go to the part owning the channel, else to "General". Nothing is dropped.
- The frontend only **places** alerts on parts. Detection and severity come from P3's analytics.

### 6.3 Status rules
- **Part status** = worst active **asset-origin** alert on it: critical → red, warning → yellow, otherwise green.
- **Sensor-origin alerts:** no red. They show a blue-grey **sensor badge** (ⓘ) with "Check the device, not the transformer".
- **Unavailable** (capability off) → grey, with "No data: … not in this dataset".
- **Meter-only mode:** tank and radiators show "Estimated". Radiators are grey because the residual is off.
- **Alarm** = worst part status. It is grey if the API is unreachable.
- **Health bands:** Green ≥ 80, Yellow 60–79, Red < 60. If `capped`, show "capped at 40 by critical alarm".
- **Anti-flicker:** colour upgrades show immediately. Downgrades show after 3 consecutive snapshots.
- **Never colour alone:** ✓ Normal · ▲ Warning · ✕ Critical · ? No data · ⓘ Sensor.

### 6.4 Scene and camera (R3F)
- **Canvas:** `<Canvas>` with a light background (`--canvas`), `<Environment preset>` built from local `RoomEnvironment` (no HDR download), one key light and a soft contact shadow.
- **Framing:** wrap the model in **drei `<Bounds fit clip observe margin={1.15}>`**. It fits the **whole** model on load and on every resize, so it is never cropped.
- **Reset view** button re-fits.
- **Controls:** `OrbitControls` with zoom limits, no pan, and the polar angle above the ground. Auto-rotate (about 1 rev/min) pauses on hover/drag and resumes after 10 s.
- **focusPart(id):** eases the camera (800 ms) to frame that part.
- **Materials:** cloned per part at load, so tinting one part never affects another.

### 6.5 Interaction
| Trigger | Result |
|---|---|
| Hover part | Whole part highlighted (drei `<Outlines>` or emissive lift) + glass tooltip: label · status · one key reading |
| Click part | Glass **DetailBox** (§6.6), attached with drei `<Html>` to the part's anchor point, with a leader line. It follows the model while rotating. |
| New alert id on a part | Box auto-opens + focusPart + **drawer auto-opens**. It does not reopen after the user closes it (dismissed ids in `ui.ts`). Max 2 boxes. |
| Windings alert | X-ray switches on automatically |
| Buttons (top-right of canvas) | X-ray · Blueprint · Reset view |
| `Esc` / ✕ / empty click | Close boxes |

### 6.6 Detail box (glass)
```
┌ ✕ Critical · Radiators ──────────────────── SIMULATED ┐
│ residual_drift · detector: residual · origin: asset   │
│ Since 2026-04-21 14:15 · lead time 9.5 h vs baseline  │
│ "Measured oil temp 6.2 °C above twin for 3 h"         │
│ Readings          measured   twin                     │
│  Top oil          78.4 °C    72.2 °C   (+6.2)         │
│  Fidelity RMSE    2.9 °C                              │
│ [mini chart: OTI vs twin_oil, last 48 h]              │
│ Recommended: Inspect radiators/cooling; check oil     │
│ level · Urgency 7 d · ref: IEC 60076-7                │
└───────────────────────────────────────────────────────┘
```
A healthy part shows its readings and "Operating normally". `GlassPanel` is used for the detail box, the tooltip and the drawer:

```css
.glass {
  background: rgba(255,255,255,.62);
  backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(255,255,255,.7); border-left: 4px solid var(--status-colour);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.8);
}
@supports not (backdrop-filter: blur(1px)) { .glass { background: rgba(255,255,255,.95); } }
```
- The status colour also appears as a faint top tint: 8 % fading to transparent over 40 px.
- The status chip and SIMULATED tag stay solid.
- Text stays `--text` at full strength. Raise opacity to 0.75 if contrast over the model drops below 4.5:1.
- With `prefers-reduced-transparency`, use the solid fallback.

### 6.7 Blueprint mode (P1 feature, first to cut)
While the Blueprint toggle is on, hovering a part:
1. Fades the rest of the model to about 10 %.
2. Draws the part as **blue edge lines** (drei `<Edges>`, `#1D4ED8`) over a faint grid on a `#EFF6FF` tint.
3. Shows **solid** (not glass) callouts:
   - part name and function (static text in `parts.ts`)
   - specs from `RunInfo.asset` **with their tags** ([Confirmed] / [Assumed] / [Calculated])
   - sensors watching it (from `capabilities`)
   - a live status chip

Callouts linger 300 ms after the pointer leaves. **No invented dimensions:** a missing spec shows "— (nameplate pending)". The corner label reads "Representative model · specs per asset.yaml". Click still opens the detail box.

| Part | Function | Specs shown |
|---|---|---|
| windings | Carry load current (R/Y/B); hot-spot drives insulation ageing | rating kVA, LV V, rated current, vector group, insulation |
| tank | Holds core, windings and insulating oil | cooling type |
| radiators | Dissipate oil heat to air (ONAN) | cooling type, rated top-oil rise |
| conservator | Oil expansion reservoir; breathes via silica-gel breather | breather type |
| bushings | Insulated HV/LV terminals | HV kV, LV V |
| core | Magnetic circuit (laminated steel) | no-load loss |

---

## 7. Drawer (right, 360 px, glass)

The drawer is closed by default. It **opens automatically when the alarm rises** to yellow/red, and the `‹` arrow toggles it. From top to bottom:

1. **Health ring:** animated score, band colour, "capped" note.
2. **Parts list:** status icon, label, one-line reason, sensor badge. Clicking a row runs focusPart and opens the box.
3. **Sub-score bars:** thermal, ageing, loading, electrical, integrity, fault stress, with weights. Unavailable sub-scores are greyed.
4. **RUL range** in years, plus risk badge and fidelity RMSE.
5. **Active alerts:** severity, type, origin badge, lead time. Clicking an alert focuses its part.

---

## 8. Other pages (FINAL_PRD §10)

| Page | Contents |
|---|---|
| Loading & Temps | Loading % (90/100 % lines), R/Y/B currents and voltages, **measured vs twin oil temp** + residual, hot-spot, ambient, fidelity RMSE with a "model drift" warning. A replay marker on every chart. |
| Failure Modules | Tabs: Overloading · Insulation · Short circuit · Oil leak/theft · Unbalance · Moisture ("experimental") · Through-fault log (cumulative I²t). "Needs X" when a capability is missing. |
| Alerts & Maintenance | Full alert table (time, module, type, severity, origin, detector, value vs threshold, lead time, SIMULATED). Recommendation table. Clicking a row jumps the replay to it. Lead-time summary vs baseline. |
| Import | File drop → mapping table (dropdown per column with confidence colour), preview, units, Save mapping, Load → dataset appears in the selector. |
| Data Health | Rows, span, interval, flag counts, conversions, derived channels, capability matrix (✓/✕), mode, nameplate source. |
| Real Field Data | Kaggle unit: fitted twin vs OTI, data-quality flags on the timeline, sensor-fault alerts. Banner: "different transformer, fitted twin". |
| Self-Test | CPRI Excel format table, pass ≤ 1 %, 50 A / 60 °C trips (bench only), status-to-master-number (Telegram + fallback). |
| Reports | Download PDF / CSV, lead-time table. |
| About | Twin definition (CIGRE), architecture diagram, assumptions register, citations, fidelity. |

---

## 9. Visual style (light mode only)

```
--bg #F4F6F9  --canvas #EEF1F5  --panel #FFFFFF  --border #E2E8F0
--text #0F172A  --muted #64748B  --accent #0284C7 (twin / predicted, dashed)
--ok #16A34A  --warn #CA8A04  --crit #DC2626  --stale #94A3B8  --sensor #475569
--simulated #B45309  --blueprint #1D4ED8  --blueprint-bg #EFF6FF
```

- **Colour use:** green, yellow and red are only for health state.
- **Charts:** white background, `--border` grid. Measured is solid `--text`, twin is dashed `--accent`, the residual is a filled area, and thresholds are dotted. No animation on replay ticks.
- **Fonts:** Inter for the UI, JetBrains Mono for numbers (`tabular-nums`).
- **Motion:** UI 200–300 ms, camera 800 ms, red pulse 1 Hz. Respect `prefers-reduced-motion` (no pulse, no auto-rotate).

---

## 10. Build order

1. **Scaffold:**
   - Vite React TS + Tailwind + fonts + tokens + router
   - AppShell: nav rail, top bar with alarm, drawer shell, replay dock, banner, footer
2. **Data layer:** `types.ts` + mock API (datasets N, S1–S5 with plausible data, zero alerts in N) + replay store + react-query
3. **3D:**
   - TwinCanvas, `useGLTF`, part grouping by prefix, Bounds framing, hover tooltip
   - X-ray + windings/core, reset view, fallback
4. **Status:** colours from the snapshot, alarm, sensor badge, grey/estimated, anti-flicker
5. **Detail box:** glass DetailBox + leader line + auto-open + drawer auto-open
6. **Drawer:** content (§7)
7. **Blueprint mode** (§6.7)
8. Loading & Temps + Alerts & Maintenance pages
9. **FastAPI layer:** `api/` mock first (same contract), then wire the team modules (`ingest.load`, `sim.generate`, `TwinEngine`, `StreamAnalyzer`) + serve `dist`
10. Import + Data Health (P1's `inspect` / `load`)
11. Failure Modules, Real Field Data, Self-Test, Reports, About
12. Offline build check (§11)

**Cut order:** Blueprint mode → Telegram → PDF (CSV/HTML fallback) → Real Field fitted twin → Self-Test polish.
**Never cut:** Overview with 3D, Import, Data Health, Alerts.
If 3D blocks progress for over 2 hours, use an SVG transformer diagram with the same part ids and statuses.

---

## 11. Done = all pass

- [ ] `npm run build` + `uvicorn api.main:app` works with Wi-Fi off; loads in < 3 s
- [ ] The whole transformer is visible at 1366×768 and 1920×1080 while rotating
- [ ] N: all green, zero alerts. S1–S5 each colour the expected part and auto-open the box and drawer
- [ ] Sensor-origin alerts show the sensor badge, not red
- [ ] Meter-only and data-only render without crashes, with "needs X" notes
- [ ] Glass boxes are readable over the model; the leader line stays attached while rotating
- [ ] SIMULATED banner on simulated data on every page; footer credit present
- [ ] Every number traces to the API / mock contract
