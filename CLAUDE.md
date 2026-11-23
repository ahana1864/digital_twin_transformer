# Transformer Digital Twin: React Frontend (P4)

## What this is
React frontend for a digital twin of a 1000 kVA, 415 V distribution transformer
(PowerNext-AI 2026, CPRI x MIT Bengaluru, Track 02). The app opens on an interactive 3D
transformer; parts take green/yellow/red from analytics; glass detail boxes explain alerts.

## My role
Ahana = P4 frontend. I own the React app only. The FastAPI server (`server/`) and all Python
modules belong to the backend team (P1/P2/P3): do NOT edit them or work around a missing/wrong
endpoint in the frontend; list it as a request instead.

## Read first
- **`FRONTEND_HANDOFF.md`: THE spec. Follow it.** Backend's API, pages, modes, rules (§1–14)
  plus my 3D twin design (§15, and changes marked [P4]). If it disagrees with
  `docs/openapi.json`, openapi.json wins for API shapes.
- `FINAL_PRD.md`: source of truth for data meaning, alerts, health bands, scenarios, honesty.
- `DATA_INGESTION_SPEC.md`: canonical column names and the Import / Data Health content.
- `docs/model_parts_preview.png`: which mesh in the .glb is which part.
- `docs/reference/`: older designs (incl. UI_DESIGN_v3_react.md), ideas only, NOT requirements.

## Stack
Vite + React + TypeScript + Tailwind; openapi-typescript (types from docs/openapi.json);
TanStack Query; React Router; Plotly (react-plotly.js) preferred for charts;
three + @react-three/fiber + @react-three/drei for the 3D twin; IBM Plex fonts bundled locally.
Backend: `uvicorn server.main:app --port 8000` (team's), serves the built frontend in demo mode.

## Hard rules
- Fully offline: no CDN, no remote fonts or HDRs. Wi-Fi off must work.
- Light mode only (tokens in FRONTEND_HANDOFF §9). Green/yellow/red only for health state;
  chip words NORMAL / WATCH / CRITICAL. Measured = orange, twin = blue, everywhere.
- Phases are R / Y / B. Units always shown. 50 A / 60 °C only on the Self-Test page.
- Never compute engineering values in the frontend. Placing alerts on 3D parts is a
  presentation lookup only (FRONTEND_HANDOFF §15.3).
- Every number comes from the API (types generated into `src/api/schema.d.ts`, never edited).
  Nothing hard-coded for show. Missing data = feature off with a note, never a crash.
- SIMULATED banner/tags on simulated data. Alerts show origin (asset/sensor).
  Sensor-origin alerts never paint a part red.
- No invented specs or dimensions (blueprint mode shows tagged asset values only).
- Model credit in the footer: "3D model: Showdoze (Sketchfab), CC-BY-NC 4.0".

## Commands
- Backend (team): `uvicorn server.main:app --reload --port 8000` (docs at /docs)
- Frontend dev: `cd web && npm run dev` (Vite proxies /api → :8000). Mock mode
  (`VITE_USE_MOCK=true npm run dev`) allowed only until the real API is reachable, and must
  match the generated types.
- Demo: `cd web && npm run build`, FastAPI serves `web/dist`.

## Working style
One step of FRONTEND_HANDOFF §12 at a time; keep `npm run build` passing. After UI changes, take a screenshot and check it.
