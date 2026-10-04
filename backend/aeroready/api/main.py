"""AeroReady API.

Run from backend/:  .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000
All routes live under /api. When frontend/dist exists the UI is served too.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from aeroready import datastore, scenarios, service
from aeroready.config import BACKEND_DIR, RUL_METRICS_PATH, RUL_PATH, RUL_TEST_PREDICTIONS_PATH
from aeroready.fleet.generator import load_scenario_config
from aeroready.optimizer.problem import Scenario
from aeroready.rul.cmapss import SENSOR_NAMES
from aeroready.rul.features import sensor_of


@asynccontextmanager
async def lifespan(_: FastAPI):
    service.plan_for()      # warm the baseline plan so the console loads instantly
    yield


app = FastAPI(title="AeroReady API", version="0.2.0", lifespan=lifespan,
              description="Availability-first predictive maintenance (SIH 26249). Simulated fleet scenario "
                          "on NASA C-MAPSS engine data.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ScenarioQ = Query(None, description="Saved scenario id; omit for the baseline scenario")
BaseQ = Query(None, description="Base id filter; omit for all bases")


def _plan(scenario: str | None) -> dict:
    try:
        return service.plan_for(scenario)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario '{scenario}'")


def _check_base(base: str | None) -> str | None:
    if base:
        fleet, _ = datastore.active_inputs()
        if base not in {b.id for b in fleet.bases}:
            raise HTTPException(404, f"Unknown base '{base}'")
    return base


def _validate_scenario(sc: Scenario) -> None:
    fleet, _ = datastore.active_inputs()
    parts = {p.id for p in fleet.parts}
    bases = {b.id for b in fleet.bases}
    tails = {a.id for a in fleet.aircraft}
    for d in sc.part_delays:
        if d.part_id not in parts:
            raise HTTPException(422, f"Unknown part '{d.part_id}'")
    for c in sc.bay_closures:
        if c.base_id not in bases:
            raise HTTPException(422, f"Unknown base '{c.base_id}'")
        if c.end_day < c.start_day:
            raise HTTPException(422, "Bay closure end day is before its start day")
    if sc.surge and sc.surge.end_day < sc.surge.start_day:
        raise HTTPException(422, "Surge end day is before its start day")
    for o in sc.sortie_rates:
        if (o.scope == "base" and o.id not in bases) or (o.scope == "aircraft" and o.id not in tails):
            raise HTTPException(422, f"Unknown {o.scope} '{o.id}'")


# ------------------------------------------------------------------ core --
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "data_version": datastore.data_version()}


@app.get("/api/meta")
def meta() -> dict:
    fleet, _ = datastore.active_inputs()
    return {
        "start_date": fleet.start_date, "horizon_days": fleet.horizon_days,
        "data_origin": "uploaded" if datastore.uploaded_sources() else "simulated",
        "uploaded_sources": datastore.uploaded_sources(),
        "bases": [{**b.model_dump(), **{k: v for k, v in ag.model_dump().items() if k != "base_id"}}
                  for b in fleet.bases for ag in fleet.agencies if ag.base_id == b.id],
        "parts": [p.model_dump() for p in fleet.parts],
        "aircraft": [{"id": a.id, "base_id": a.base_id, "sortie_rate": a.sortie_rate} for a in fleet.aircraft],
    }


@app.get("/api/summary")
def summary(scenario: Optional[str] = ScenarioQ, base: Optional[str] = BaseQ) -> dict:
    p = _plan(scenario)
    return {**service.summary(p, _check_base(base)), "scenario_id": p["scenario_id"], "scenario_name": p["scenario_name"]}


@app.get("/api/fleet")
def fleet(scenario: Optional[str] = ScenarioQ, base: Optional[str] = BaseQ) -> dict:
    p = _plan(scenario)
    return {"horizon_days": p["horizon_days"], "start_date": p["start_date"],
            "aircraft": service.fleet_rows(p, _check_base(base))}


@app.get("/api/aircraft/{tail}")
def aircraft(tail: str, scenario: Optional[str] = ScenarioQ) -> dict:
    try:
        return service.aircraft_detail(_plan(scenario), tail)
    except KeyError:
        raise HTTPException(404, f"Unknown aircraft '{tail}'")


@app.get("/api/plan")
def plan_get(scenario: Optional[str] = ScenarioQ) -> dict:
    return service.public(_plan(scenario))


@app.post("/api/plan")
def plan_post(sc: Scenario) -> dict:
    """Run an unsaved scenario."""
    _validate_scenario(sc)
    return service.public(service.plan_for(scenario=sc))


@app.post("/api/plan/rerun")
def plan_rerun(scenario: Optional[str] = ScenarioQ) -> dict:
    try:
        p = service.plan_for(scenario, force=True)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario '{scenario}'")
    return {"computed_at": p["computed_at"], "solver": p["optimized"]["solver"], "scenario_id": p["scenario_id"]}


@app.get("/api/recommendations")
def recommendations(scenario: Optional[str] = ScenarioQ, base: Optional[str] = BaseQ,
                    type: Optional[str] = Query(None)) -> dict:
    p = _plan(scenario)
    return {"recommendations": service.recommendations(p, _check_base(base), type)}


@app.get("/api/capacity")
def capacity(scenario: Optional[str] = ScenarioQ) -> dict:
    return service.capacity(_plan(scenario))


@app.get("/api/spares")
def spares(scenario: Optional[str] = ScenarioQ) -> dict:
    return service.spares(_plan(scenario))


# ------------------------------------------------------------- scenarios --
class SaveScenario(BaseModel):
    name: str
    scenario: Scenario


@app.get("/api/scenarios")
def scenarios_list() -> dict:
    return {"scenarios": scenarios.list_scenarios()}


@app.post("/api/scenarios", status_code=201)
def scenarios_save(body: SaveScenario) -> dict:
    _validate_scenario(body.scenario)
    try:
        return scenarios.save(body.name, body.scenario)
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.delete("/api/scenarios/{scenario_id}", status_code=204)
def scenarios_delete(scenario_id: str) -> None:
    try:
        scenarios.delete(scenario_id)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario '{scenario_id}'")


# ------------------------------------------------------------------ data --
@app.get("/api/data/sources")
def data_sources() -> dict:
    return {"sources": datastore.sources_info(),
            "data_origin": "uploaded" if datastore.uploaded_sources() else "simulated"}


@app.get("/api/data/assumptions")
def data_assumptions() -> dict:
    cfg = load_scenario_config()
    leads = [p["lead_time_days"] for p in cfg["parts"]]
    fleet_cfg = cfg["fleet"]
    rate_lo, rate_hi = fleet_cfg["sortie_rate_range_cycles_per_day"]
    statements = [
        f"Fleet of {fleet_cfg['aircraft_count']} aircraft across {len(cfg['bases'])} bases; "
        f"{len(fleet_cfg['single_engine_tails'])} single-engine, the rest twin-engine.",
        f"Planning horizon {cfg['horizon_days']} days at daily granularity, starting {cfg['start_date']}.",
        f"Sortie rate per aircraft drawn between {rate_lo} and {rate_hi} engine cycles per day (seed {cfg['seed']}).",
        fleet_cfg["cycle_to_day_rule"],
        f"Each engine follows one NASA C-MAPSS test trajectory from {', '.join(cfg['engines']['cmapss_datasets'])}.",
        f"{len(cfg['parts'])} part types with supplier lead times from {min(leads)} to {max(leads)} days.",
        "Hangar bays and technician hours per day by base: " + "; ".join(
            f"{a['base_id']} {a['bays']} bays, {a['tech_hours_per_day']} h" for a in cfg["agencies"]) + ".",
        f"Engine work: preventive {cfg['engine_task']['preventive_duration_days']} days, "
        f"unplanned failure repair {cfg['engine_task']['corrective_duration_days']} days.",
        cfg["failure_rule"], cfg["parts_rule"],
        f"{len(cfg['planted']['at_risk_engines'])} engines are deliberately chosen to degrade inside the horizon, "
        f"and {cfg['planted']['donor']['tail']} is grounded all horizon holding donor parts, so the planner has "
        "real trade-offs to resolve.",
    ]
    return {"statements": statements, "config": cfg, "config_file": "backend/aeroready/fleet/scenario_config.json"}


@app.get("/api/data/template/{source}")
def data_template(source: str) -> PlainTextResponse:
    if source not in datastore.SOURCES:
        raise HTTPException(404, f"Unknown source '{source}'")
    return PlainTextResponse(datastore.template_csv(source), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{source}.csv"'})


@app.post("/api/data/upload/{source}")
async def data_upload(source: str, request: Request, filename: str = Query("upload.csv")) -> dict:
    """Body: raw CSV text. Validated against the source schema; a rejected file changes nothing."""
    if source not in datastore.SOURCES:
        raise HTTPException(404, f"Unknown source '{source}'")
    raw = await request.body()
    if len(raw) > 2_000_000:
        raise HTTPException(413, "File is larger than 2 MB")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(422, "File is not UTF-8 text")
    rows, errors = datastore.validate(source, text)
    if errors:
        return {"ok": False, "errors": errors, "rows_read": len(rows)}
    datastore.store_upload(source, rows, filename)
    service.clear_cache()
    p = service.plan_for()
    return {"ok": True, "rows": len(rows), "computed_at": p["computed_at"], "solver": p["optimized"]["solver"]}


@app.post("/api/data/reset")
def data_reset() -> dict:
    datastore.reset()
    service.clear_cache()
    p = service.plan_for()
    return {"ok": True, "computed_at": p["computed_at"]}


# ----------------------------------------------------------------- model --
@app.get("/api/model/metrics")
def model_metrics() -> dict:
    if not RUL_METRICS_PATH.exists():
        raise HTTPException(404, "No saved training run. Run scripts/train_rul.py.")
    m = json.loads(RUL_METRICS_PATH.read_text())
    m.pop("feature_importance", None)
    return m


@app.get("/api/model/predictions")
def model_predictions() -> dict:
    if not RUL_TEST_PREDICTIONS_PATH.exists():
        raise HTTPException(404, "No saved test predictions. Run scripts/train_rul.py.")
    return {"datasets": json.loads(RUL_TEST_PREDICTIONS_PATH.read_text())}


@app.get("/api/model/importance")
def model_importance() -> dict:
    if not RUL_METRICS_PATH.exists():
        raise HTTPException(404, "No saved training run. Run scripts/train_rul.py.")
    feats = json.loads(RUL_METRICS_PATH.read_text()).get("feature_importance", [])
    by_sensor: dict[str, float] = {}
    for f in feats:
        s = sensor_of(f["feature"]) or "cycle"
        by_sensor[s] = by_sensor.get(s, 0.0) + f["gain_share"]
    sensors = [{"sensor": s, "name": SENSOR_NAMES.get(s, "Cycle count (engine age)"), "gain_share": round(v, 4)}
               for s, v in sorted(by_sensor.items(), key=lambda kv: -kv[1])]
    return {"features": feats, "sensors": sensors, "note": json.loads(RUL_PATH.read_text()).get("note")}


# ------------------------------------------------- built frontend (optional) --
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "Unknown API route")
        f = (FRONTEND_DIST / path).resolve()
        if path and f.is_file() and FRONTEND_DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")   # client-side routes
