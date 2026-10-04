"""AeroReady API.

Run from backend/:  .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000
"""
from __future__ import annotations

import json
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from aeroready.config import BACKEND_DIR, RUL_METRICS_PATH
from aeroready.optimizer.plan import load_inputs, run_plan
from aeroready.optimizer.problem import Scenario

_cache: OrderedDict[str, dict] = OrderedDict()
_lock = threading.Lock()
CACHE_SIZE = 16


def get_plan(sc: Scenario | None = None) -> dict:
    sc = sc or Scenario()
    key = sc.model_dump_json()
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    result = run_plan(sc)
    with _lock:
        _cache[key] = result
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return result


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_plan()          # warm the default plan so the dashboard loads instantly
    yield


app = FastAPI(title="AeroReady API", version="0.1.0", lifespan=lifespan,
              description="Availability-first predictive maintenance (SIH 26249). SYNTHETIC fleet data.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# --------------------------------------------------------------- helpers --
def _forecasts_by_engine() -> dict[str, dict]:
    _, rul = load_inputs()
    return {e["engine_id"]: e for e in rul["engines"]}


def _aircraft_status(ac, plan: dict, fc: dict[str, dict]) -> tuple[str, str]:
    """green / amber / red from grounding, RUL forecast and the optimised plan."""
    if ac.grounding and ac.grounding.since_day <= 0 < ac.grounding.until_day:
        return "red", ac.grounding.reason
    days = [plan["forecasts_days"].get(e) for e in ac.engine_ids]
    days = [d for d in days if d]
    worst = min(days, key=lambda d: d["p10_days"]) if days else None
    if worst and worst["p10_days"] <= 7:
        return "red", f"Engine RUL P10 {worst['p10_days']} d"
    if worst and worst["p10_days"] < plan["horizon_days"]:
        return "amber", f"Engine RUL P10 {worst['p10_days']} d (inside 30-day horizon)"
    soon = [j for j in plan["jobs"] if j["aircraft_id"] == ac.id and j["kind"] == "scheduled"
            and j["due"] is not None and j["due"] <= 7]
    if soon:
        return "amber", f"{soon[0]['name']} due Day {soon[0]['due']}"
    return "green", "Serviceable; no forecast risk in horizon"


def _next_task(ac_id: str, plan: dict) -> dict | None:
    row = next(r for r in plan["optimized"]["gantt"] if r["aircraft_id"] == ac_id)
    work = [b for b in row["blocks"] if b["kind"] in ("scheduled", "preventive", "corrective")]
    return min(work, key=lambda b: b["start"]) if work else None


# ---------------------------------------------------------------- routes --
@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/meta")
def meta() -> dict:
    fleet, _ = load_inputs()
    metrics = json.loads(RUL_METRICS_PATH.read_text()) if RUL_METRICS_PATH.exists() else None
    return {
        "synthetic": fleet.synthetic, "data_notice": fleet.data_notice,
        "start_date": fleet.start_date, "horizon_days": fleet.horizon_days,
        "bases": [{**b.model_dump(), **{k: v for k, v in ag.model_dump().items() if k != "base_id"}}
                  for b in fleet.bases for ag in fleet.agencies if ag.base_id == b.id],
        "parts": [p.model_dump() for p in fleet.parts],
        "planted_tensions": fleet.planted_tensions,
        "rul_metrics": metrics,
    }


@app.get("/api/fleet")
def fleet_view() -> dict:
    fleet, _ = load_inputs()
    plan = get_plan()
    fc = _forecasts_by_engine()
    out = []
    for ac in fleet.aircraft:
        status, reason = _aircraft_status(ac, plan, fc)
        engines = []
        for eid in ac.engine_ids:
            d = plan["forecasts_days"].get(eid) or {
                k: round(v / ac.sortie_rate, 1) for k, v in
                (("p10_days", fc[eid]["rul_cycles"]["p10"]), ("p50_days", fc[eid]["rul_cycles"]["p50"]),
                 ("p90_days", fc[eid]["rul_cycles"]["p90"]))}
            engines.append({"engine_id": eid, **d})
        worst = min(engines, key=lambda e: e["p50_days"])
        row_b = next(r for r in plan["baseline"]["gantt"] if r["aircraft_id"] == ac.id)
        row_o = next(r for r in plan["optimized"]["gantt"] if r["aircraft_id"] == ac.id)
        out.append({
            "id": ac.id, "type": ac.type, "base_id": ac.base_id, "sortie_rate": ac.sortie_rate,
            "status": status, "status_reason": reason, "engines": engines, "worst_engine": worst,
            "next_task": _next_task(ac.id, plan),
            "available_today": not any(b["start"] <= 0 <= b["end"] for b in row_o["blocks"]
                                       if b["kind"] != "cannibalization"),
            "available_days": {"baseline": row_b["available_days"], "optimized": row_o["available_days"]},
        })
    return {"synthetic": True, "aircraft": out}


@app.get("/api/aircraft/{ac_id}")
def aircraft_detail(ac_id: str) -> dict:
    fleet, _ = load_inputs()
    acs = fleet.aircraft_by_id()
    if ac_id not in acs:
        raise HTTPException(404, f"Unknown aircraft {ac_id}")
    ac = acs[ac_id]
    plan = get_plan()
    fc = _forecasts_by_engine()
    status, reason = _aircraft_status(ac, plan, fc)
    engines = []
    for eid in ac.engine_ids:
        e = fleet.engine_by_id()[eid]
        engines.append({**e.model_dump(), **fc[eid], "plan_days": plan["forecasts_days"].get(eid)})
    return {
        "synthetic": True,
        "aircraft": ac.model_dump(),
        "base": next(b.model_dump() for b in fleet.bases if b.id == ac.base_id),
        "status": status, "status_reason": reason,
        "engines": engines,
        "log": [x.model_dump() for x in fleet.log if x.aircraft_id == ac_id],
        "tasks": [j for j in plan["jobs"] if j["aircraft_id"] == ac_id],
        "timeline": {
            "baseline": next(r for r in plan["baseline"]["gantt"] if r["aircraft_id"] == ac_id),
            "optimized": next(r for r in plan["optimized"]["gantt"] if r["aircraft_id"] == ac_id),
        },
        "recommendations": [r for r in plan["recommendations"] if r["aircraft_id"] == ac_id],
    }


@app.get("/api/plan")
def plan_default() -> dict:
    return get_plan()


@app.post("/api/plan")
def plan_scenario(scenario: Scenario) -> dict:
    fleet, _ = load_inputs()
    parts = fleet.part_by_id()
    bases = {b.id for b in fleet.bases}
    for d in scenario.part_delays:
        if d.part_id not in parts:
            raise HTTPException(422, f"Unknown part {d.part_id}")
    for c in scenario.bay_closures:
        if c.base_id not in bases:
            raise HTTPException(422, f"Unknown base {c.base_id}")
        if c.end_day < c.start_day:
            raise HTTPException(422, "Bay closure end_day is before start_day")
    if scenario.surge and scenario.surge.end_day < scenario.surge.start_day:
        raise HTTPException(422, "Surge end_day is before start_day")
    return get_plan(scenario)


@app.get("/api/spares")
def spares() -> dict:
    fleet, _ = load_inputs()
    plan = get_plan()
    jobs = {j["id"]: j for j in plan["jobs"]}
    parts = fleet.part_by_id()
    out = []
    for s in fleet.stock:
        part = parts[s.part_id]
        demand = {}
        for name in ("baseline", "optimized"):
            uses = []
            for jid, (start, donor) in plan[name]["starts"].items():
                if start is not None and s.part_id in jobs[jid]["parts"]:
                    uses.append({"job_id": jid, "aircraft_id": jobs[jid]["aircraft_id"], "day": start,
                                 "kind": jobs[jid]["kind"], "source": "cannibalised" if donor else "stores"})
            demand[name] = sorted(uses, key=lambda u: u["day"])
        shelf = s.on_hand + sum(a.qty for a in s.inbound)
        from_stores = [u for u in demand["optimized"] if u["source"] == "stores"]
        order = next((o for o in plan["part_orders"] if o["part_id"] == s.part_id), None)
        out.append({
            **part.model_dump(), "on_hand": s.on_hand,
            "inbound": [a.model_dump() for a in s.inbound],
            "demand": demand,
            "shortage_qty": max(0, len(from_stores) - shelf),
            "day0_order": order,
            "status": "short" if order else ("low" if shelf - len(from_stores) <= 0 and from_stores else "ok"),
        })
    return {"synthetic": True, "parts": out,
            "cannibalizations": plan["optimized"]["cannibalizations"],
            "part_orders": plan["part_orders"]}


# ------------------------------------------------- built frontend (optional) --
# After `npm run build`, the whole prototype is served from this one process.
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
