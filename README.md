# AeroReady: availability-first predictive maintenance

**Smart India Hackathon 2026 · Problem statement 26249 · Air Power – Predictive Maintenance & Fleet Availability**
(Ministry of Defence / Defence Services Staff College)

AeroReady predicts engine life, then schedules maintenance for the whole fleet within hangar, technician and
spares limits to keep the most aircraft mission-ready. It answers the commander's question:

> *How many aircraft can I put in the air each day for the next 30 days, and what should I change to raise that number?*

![Landing page](docs/screenshots/landing.png)

The visual design follows the team's reference images: a full-bleed photographic hero with a large wordmark, a floating pill navigation, two-tone headings and rounded charcoal cards. Photos by Samuel Arkwright and Mihai Neagu (Unsplash licence), stored locally in `frontend/public/img`.

## What is real and what is simulated

| | Source | Status |
|---|---|---|
| Engine sensor trajectories and true remaining life | NASA C-MAPSS turbofan degradation data (FD001, FD003) | **Real (public dataset)** |
| RUL forecasts, P10/P50/P90 | LightGBM quantile models trained and tested on C-MAPSS | **Computed** from the real data |
| Fleet composition, bases, sortie rates | Seeded scenario generator | **Simulated** |
| Scheduled inspections, deferred defects, maintenance log | Seeded scenario generator | **Simulated** |
| Spares stock, inbound deliveries, lead times | Seeded scenario generator | **Simulated** |
| Hangar bays and technician hours | Seeded scenario generator | **Simulated** |

Every assumption behind the simulated scenario is in one file,
[`backend/aeroready/fleet/scenario_config.json`](backend/aeroready/fleet/scenario_config.json). The generator reads it,
and the console's **Data sources** page displays it. The UI labels this data "Simulated fleet scenario". Any of the
four sources can be replaced with your own CSV on that page; the label then changes to "Uploaded data".

The UI shows no hardcoded figures. Every metric, chart point and table row comes from the API. Model metrics are read
from the saved evaluation of the training run (`backend/data/rul_metrics.json`, `rul_test_predictions.json`).

## Site map

```
/                      Landing page: problem, how it works, live availability chart, data and method
/app                   Redirects to /app/overview
/app/overview          Readiness overview: stat tiles, daily availability, top recommendations, risk watchlist
/app/fleet             Fleet grid or sortable table, filters, search, CSV export
/app/fleet/:tail       Aircraft detail: engine RUL and sensors, planned work vs reactive, history, parts
/app/plan              Gantt (optimised / reactive / compare), task side panel, recommendations, capacity heatmap
/app/scenarios         What-if builder, run vs baseline, save, compare up to three saved scenarios
/app/spares            Inventory, shortage timeline, cannibalisation actions with marginal gain
/app/data              Data sources, CSV templates and uploads with row/column validation, assumptions
/app/model             Test-set metrics, predicted vs actual, feature importance, method
```

The base filter and the active scenario are stored in the URL query string (`?base=BS&scenario=...`), so any view can be shared.

## Headline result (default scenario, deterministic)

| | Reactive baseline | Optimised plan |
|---|---:|---:|
| Mission-ready aircraft-days (30 days, 24 aircraft) | 577 | **635 (+58)** |
| Average aircraft available per day | 19.2 | **21.2** |
| Unplanned engine failures | 6 | **0** |
| Engine risk-days (flown past the P10 forecast) | 55 | **5** |
| Capacity or parts violations | 0 | 0 |

CP-SAT proves the plan optimal in about a second. The reactive baseline and the optimised plan are scored by the same
evaluator, with the same data, horizon and rules.

## How it works

```mermaid
flowchart LR
  subgraph Integrate
    CM[NASA C-MAPSS] --> RUL
    CFG[scenario_config.json] --> GEN[Scenario generator]
    UP[CSV uploads] --> DS
    GEN --> DS[Data store<br/>engine health · maintenance records<br/>spares · capacity]
  end
  RUL[LightGBM quantile RUL<br/>P10 / P50 / P90 + SHAP] --> DS
  DS --> PB[Planning problem]
  SC[Scenario overrides] --> PB
  PB --> BL[Reactive baseline]
  PB --> OPT[CP-SAT optimiser]
  BL --> EV[Shared evaluator]
  OPT --> EV
  EV --> SV[Service layer<br/>summary · fleet · spares · capacity]
  SV --> API[FastAPI /api]
  API --> UI[React console]
```

1. **Integrate data.** Four sources (engine health, maintenance records, spares, maintenance capacity) are loaded into one pydantic data model. Uploaded CSVs are validated against each source's schema, row by row, before anything changes.
2. **Predict component life.** LightGBM quantile models (alpha 0.1/0.5/0.9) on C-MAPSS FD001+FD003. Near-constant sensors are dropped; rolling mean/std features are used; RUL is capped at 125 cycles. Cycles convert to days through each aircraft's sortie rate.
3. **Optimise the fleet schedule.** A time-indexed CP-SAT model chooses start days for inspections and engine work within:
   - bays per base (overlapping jobs on one aircraft use one bay)
   - technician hours
   - parts: stock and inbound deliveries until the lead time, with cannibalisation from aircraft grounded all horizon
   - inspection windows with authorised deferral
   - forecast failures, which ground the aircraft and need a longer repair

   The objective is mission-ready aircraft-days, minus penalties for:
   - flying past P10
   - deferrals
   - cannibalisation
   - failures
   - surge shortfall
   - work pushed past the horizon
4. **Test scenarios.** Part delays, bay closures, surge targets and per-base or per-aircraft sortie rates re-run the whole pipeline. Saved scenarios are stored on the backend in `backend/data/scenarios.json`.

### Model metrics (official C-MAPSS test sets, last observed cycle per engine)

| Set | Engines | RMSE | MAE | NASA score | P10–P90 coverage (nominal 80%) | True RUL below P10 (nominal 10%) |
|---|---:|---:|---:|---:|---:|---:|
| FD001 | 100 | 17.73 | 12.80 | 596 | 77% | 16% |
| FD003 | 100 | 17.27 | 12.07 | 711 | 68% | 24% |

## API

All routes are under `/api`; interactive docs are at `/docs`.

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness and data version |
| `GET /meta` | Bases, parts, aircraft, data origin |
| `GET /summary?scenario=&base=` | Overview stats, availability series, top recommendations, risk watchlist |
| `GET /fleet?scenario=&base=` · `GET /aircraft/{tail}?scenario=` | Fleet status; aircraft detail |
| `GET /plan?scenario=` · `POST /plan` · `POST /plan/rerun?scenario=` | Saved or baseline plan; unsaved what-if; force a re-run |
| `GET /recommendations?scenario=&base=&type=` | Recommendations sorted by impact |
| `GET /capacity?scenario=` | Daily bay and technician-hour use per base |
| `GET /spares?scenario=` | Inventory, shortage timeline, cannibalisation with marginal gain |
| `GET/POST /scenarios` · `DELETE /scenarios/{id}` | Saved scenarios |
| `GET /data/sources` · `GET /data/assumptions` · `GET /data/template/{source}` · `POST /data/upload/{source}` · `POST /data/reset` | Data integration |
| `GET /model/metrics` · `GET /model/predictions` · `GET /model/importance` | Saved training evaluation |

The frontend reads the API base URL from `VITE_API_BASE` (default `/api`; see `frontend/.env.example`).

## How to run

Prerequisites: Python 3.11+ (tested on 3.12) and Node 20+ (tested on 22).

**One command (Windows):**
```powershell
.\start.ps1          # creates the venv and installs packages if needed, builds the UI, serves everything at http://localhost:8000
.\start.ps1 -Dev     # API on :8000 with reload + Vite dev server on :5173
```

**Manual:**
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000

cd frontend
npm install
npm run dev                                                 # http://localhost:5173, proxies /api to :8000
```

**Rebuild data and models (optional; the outputs are committed):**
```bash
cd backend
.venv/Scripts/python scripts/download_cmapss.py   # NASA C-MAPSS, about 12 MB
.venv/Scripts/python scripts/generate_fleet.py    # simulated fleet from scenario_config.json
.venv/Scripts/python scripts/train_rul.py         # trains, evaluates, saves metrics and test predictions
.venv/Scripts/python scripts/run_demo_check.py    # baseline vs optimised; asserts optimised >= baseline
.venv/Scripts/python -m pytest                    # 16 tests
```

> **Windows note:** with Smart App Control enabled, the newest pandas (3.x) and OR-Tools (9.15) wheels are blocked
> from loading their DLLs. `requirements.txt` pins versions that load.

## Screenshots

| Overview | Fleet |
|---|---|
| ![Overview](docs/screenshots/overview.png) | ![Fleet](docs/screenshots/fleet.png) |
| **Aircraft detail** | **Plan (compare mode with task panel)** |
| ![Aircraft](docs/screenshots/aircraft.png) | ![Plan](docs/screenshots/plan.png) |
| **Scenarios** | **Spares** |
| ![Scenarios](docs/screenshots/scenarios.png) | ![Spares](docs/screenshots/spares.png) |
| **Data sources** | **Model** |
| ![Data sources](docs/screenshots/data.png) | ![Model](docs/screenshots/model.png) |

## Limitations

- **Not validated on real IAF data.** The fleet is simulated. The size of the gain depends on the scenario's deliberate tensions (`planted` in the config); it shows the mechanism, not a forecast of real-world benefit.
- **C-MAPSS simulates a commercial turbofan**, not a military engine, and its trajectories contain no maintenance actions.
- **RUL intervals are too narrow.** P10–P90 coverage is 68–77% against a nominal 80%, and 16–24% of true RULs fall below P10. The planner treats P10 as a risk threshold, so this matters. Conformal calibration is the next step.
- **Deterministic failure model.** Engines are assumed to fail on the P50 day in both plans; the plan is not stress-tested against the forecast distribution.
- **Model misses carry through.** The planner uses the forecast, not the truth. The model is late on A-18-E1 and A-14-E1, and probably raises a false alarm on A-01-E2.
- **Simplified logistics.** Spares are fleet-pooled with same-day transfer, each engine has one repair part, and there is no transport or crew rostering.
- **Recommendation impact** is reported per aircraft (that tail's optimised minus reactive days), not as a marginal value per action. Cannibalisation actions on the Spares page do show a true marginal value (the plan is re-solved without that donor part).
- **Uploaded engine health** replaces forecast values only; the RUL history chart and sensor attributions still come from the trained model.

## Next steps

1. Integration with real systems: health and usage monitoring, maintenance information system, logistics ERP and agency rosters, through the same schemas the upload page validates.
2. Validation with maintenance engineers: review recommendations against inspection rules and deferral authority, and run the planner in shadow mode against actual schedules.
3. Calibrated intervals and robustness testing: conformal prediction, and Monte Carlo over the RUL quantiles with chance constraints on failure risk.
4. Security accreditation before any operational data is used: on-premises deployment, role-based access, audit trail.

## Repository layout

```
backend/
  aeroready/
    rul/            C-MAPSS loading, features, quantile training and evaluation, inference + SHAP
    fleet/          pydantic data model, scenario_config.json, generator, JSON store
    optimizer/      problem builder, CP-SAT model, reactive baseline, evaluator, recommendations
    datastore.py    four data sources, CSV templates, validation, uploads, reset
    scenarios.py    saved scenarios (data/scenarios.json)
    service.py      plan cache and derived views (summary, fleet, aircraft, spares, capacity)
    api/main.py     FastAPI routes; serves frontend/dist when built
  scripts/          download_cmapss · generate_fleet · train_rul · run_demo_check
  tests/            fleet, RUL, optimiser, API (uploads, scenarios, model endpoints)
frontend/           React + Vite + TypeScript + Tailwind + Recharts + TanStack Query + lucide-react
docs/screenshots/
DEMO.md             3-minute demo script
start.ps1           one-command launcher
```
