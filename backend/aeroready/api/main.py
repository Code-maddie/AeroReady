"""AeroReady API. Every route declares the roles allowed to call it.

Run from backend/:  .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

from aeroready import auth, datastore, planning, scenarios, service, workflow
from aeroready.auth import ANY, COMMANDER, PLANNER, STAFF, TECHNICIAN, current_user
from aeroready.config import BACKEND_DIR, RUL_METRICS_PATH, RUL_PATH, RUL_TEST_PREDICTIONS_PATH
from aeroready.fleet.generator import load_scenario_config
from aeroready.optimizer.problem import Scenario
from aeroready.rul.cmapss import SENSOR_NAMES
from aeroready.rul.features import sensor_of
from aeroready.rul.model import QUANTILES
from aeroready.users import by_role


@asynccontextmanager
async def lifespan(_: FastAPI):
    service.plan_for()      # warm the optimiser proposal
    yield


app = FastAPI(title="AeroReady API", version="0.3.0", lifespan=lifespan,
              description="Fleet maintenance planning (SIH 26249). Simulated fleet scenario on NASA C-MAPSS engine data.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Comment(BaseModel):
    comment: str = ""


class Reason(BaseModel):
    reason: str = ""


# ------------------------------------------------------------------ helpers --
def _check_base(base: str | None) -> str | None:
    if base:
        fleet, _ = datastore.active_inputs()
        if base not in {b.id for b in fleet.bases}:
            raise HTTPException(404, f"Unknown base '{base}'")
    return base


def view(user: dict, which: str | None) -> dict:
    """The plan a view is built on: 'active', 'working', a plan id, or the role default.
    With no plan available, the current optimiser proposal is used and labelled as such."""
    if which and which not in ("active", "working"):
        return planning.result(planning.get(which))
    if which is None:
        which = "working" if user["role"] == "planner" else "active"
    p = planning.working() if which == "working" else planning.active()
    if p is None and which == "working":
        p = planning.active()
    if p is not None:
        return planning.result(p)
    res = service.plan_for()
    return {**res, "plan": None, "scenario_name": "Optimiser proposal (no approved plan)"}


def _validate_scenario(sc: Scenario) -> None:
    fleet, _ = datastore.active_inputs()
    parts, bases, tails = {p.id for p in fleet.parts}, {b.id for b in fleet.bases}, {a.id for a in fleet.aircraft}
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


# --------------------------------------------------------------------- auth --
class LoginBody(BaseModel):
    username: str
    password: str


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/auth/login")
def login(body: LoginBody) -> dict:
    token, user, exp = auth.login(body.username, body.password)
    return {"token": token, "user": user, "expires_at": exp}


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)) -> dict:
    return {"user": user}


@app.get("/api/meta")
def meta(user: dict = ANY) -> dict:
    fleet, _ = datastore.active_inputs()
    ops = load_scenario_config()["operations"]
    return {
        "start_date": fleet.start_date, "horizon_days": fleet.horizon_days,
        "data_origin": "uploaded" if datastore.uploaded_sources() else "simulated",
        "bases": [{**b.model_dump(), **{k: v for k, v in ag.model_dump().items() if k != "base_id"}}
                  for b in fleet.bases for ag in fleet.agencies if ag.base_id == b.id],
        "parts": [p.model_dump() for p in fleet.parts],
        "aircraft": [{"id": a.id, "base_id": a.base_id, "sortie_rate": a.sortie_rate} for a in fleet.aircraft
                     if user["role"] != "technician" or a.base_id == user["base_id"]],
        "defect_systems": ops["defect_systems"], "work_order_release_days": ops["work_order_release_days"],
    }


# -------------------------------------------------------------------- plans --
@app.get("/api/plans")
def plans_list(user: dict = STAFF) -> dict:
    items = sorted(planning.plans(), key=lambda p: -p["version"])
    out = []
    for p in items:
        res = planning.result(p)
        out.append({**planning.summary(p), "aircraft_days": res["optimized"]["aircraft_days"],
                    "reactive_aircraft_days": res["baseline"]["aircraft_days"]})
    a = planning.active()
    return {"plans": out, "active_id": a["id"] if a else None,
            "active_aircraft_days": planning.result(a)["optimized"]["aircraft_days"] if a else None}


@app.get("/api/plans/status")
def plans_status(user: dict = ANY) -> dict:
    a, w = planning.active(), planning.working()
    return {"active": planning.summary(a) if a else None, "working": planning.summary(w) if w else None,
            "label": planning.label(a), "working_label": planning.label(w) if w else None}


@app.post("/api/plans/working")
def plans_working(user: dict = PLANNER) -> dict:
    return planning.summary(planning.create_or_get_working(user))


@app.get("/api/plans/{plan_id}")
def plan_get(plan_id: str, user: dict = STAFF) -> dict:
    return service.public(planning.result(planning.get(plan_id)))


@app.post("/api/plans/{plan_id}/optimize")
def plan_optimize(plan_id: str, user: dict = PLANNER) -> dict:
    return planning.summary(planning.run_optimizer(planning.get(plan_id), user))


class Decide(BaseModel):
    key: str
    action: str
    reason: str = ""


@app.post("/api/plans/{plan_id}/recommendations/decide")
def plan_decide(plan_id: str, body: Decide, user: dict = PLANNER) -> dict:
    return planning.summary(planning.decide(planning.get(plan_id), body.key, body.action, body.reason, user))


class Keys(BaseModel):
    keys: list[str]


@app.post("/api/plans/{plan_id}/recommendations/accept")
def plan_bulk_accept(plan_id: str, body: Keys, user: dict = PLANNER) -> dict:
    done, skipped = [], []
    for k in body.keys:
        try:
            planning.decide(planning.get(plan_id), k, "accept", "", user)
            done.append(k)
        except HTTPException as e:
            skipped.append({"key": k, "reason": e.detail})
    return {"accepted": done, "skipped": skipped}


class Move(BaseModel):
    day: int
    comment: str = ""


@app.post("/api/plans/{plan_id}/tasks/{job_id}/check")
def task_check(plan_id: str, job_id: str, body: Move, user: dict = PLANNER) -> dict:
    violations, _ = planning.check_move(planning.get(plan_id), job_id, body.day)
    return {"ok": not violations, "violations": violations}


@app.post("/api/plans/{plan_id}/tasks/{job_id}/move")
def task_move(plan_id: str, job_id: str, body: Move, user: dict = PLANNER) -> dict:
    return planning.summary(planning.move(planning.get(plan_id), job_id, body.day, body.comment, user))


class Lock(BaseModel):
    locked: bool


@app.post("/api/plans/{plan_id}/tasks/{job_id}/lock")
def task_lock(plan_id: str, job_id: str, body: Lock, user: dict = PLANNER) -> dict:
    return planning.summary(planning.set_lock(planning.get(plan_id), job_id, body.locked, user))


@app.post("/api/plans/{plan_id}/tasks/{job_id}/remove")
def task_remove(plan_id: str, job_id: str, body: Reason, user: dict = PLANNER) -> dict:
    return planning.summary(planning.remove(planning.get(plan_id), job_id, body.reason, user))


@app.post("/api/plans/{plan_id}/submit")
def plan_submit(plan_id: str, body: Comment, user: dict = PLANNER) -> dict:
    return planning.summary(planning.submit(planning.get(plan_id), body.comment, user))


@app.post("/api/plans/{plan_id}/return")
def plan_return(plan_id: str, body: Comment, user: dict = COMMANDER) -> dict:
    return planning.summary(planning.return_plan(planning.get(plan_id), body.comment, user))


@app.post("/api/plans/{plan_id}/approve")
def plan_approve(plan_id: str, body: Comment, user: dict = COMMANDER) -> dict:
    plan, orders = planning.approve(planning.get(plan_id), body.comment, user)
    return {"plan": planning.summary(plan), "work_orders_released": len(orders)}


@app.get("/api/plans/{plan_id}/review")
def plan_review(plan_id: str, user: dict = STAFF) -> dict:
    plan = planning.get(plan_id)
    res = planning.result(plan)
    a = planning.active()
    ref = planning.result(a) if a and a["id"] != plan["id"] else None
    ref_series = ref["optimized"]["available_per_day"] if ref else res["baseline"]["available_per_day"]
    ref_days = ref["optimized"]["aircraft_days"] if ref else res["baseline"]["aircraft_days"]
    return {"plan": planning.summary(plan), **planning.changes(plan), "risks": planning.risks(res),
            "series": {"plan": res["optimized"]["available_per_day"], "reference": ref_series},
            "aircraft_days": {"plan": res["optimized"]["aircraft_days"], "reference": ref_days},
            "start_date": res["start_date"], "horizon_days": res["horizon_days"], "fleet_size": res["fleet_size"]}


# -------------------------------------------------------------- plan views --
PlanQ = Query(None, description="'active', 'working' or a plan id; default depends on role")
BaseQ = Query(None)


@app.get("/api/summary")
def summary(plan: Optional[str] = PlanQ, base: Optional[str] = BaseQ, user: dict = STAFF) -> dict:
    res = view(user, plan)
    return {**service.summary(res, _check_base(base)), "plan": res.get("plan"), "plan_label": res["scenario_name"]}


@app.get("/api/readiness/by-base")
def readiness_by_base(plan: Optional[str] = PlanQ, user: dict = STAFF) -> dict:
    res = view(user, plan)
    fleet, _ = datastore.active_inputs()
    usage = service.part_usage(res)
    jobs = {j["id"]: j for j in res["jobs"]}
    short_by_base: dict[str, set] = {}
    for part, u in usage.items():
        if u["shortfall"] > 0:
            for x in u["uses"]:
                if not x["donor"] and x["job_id"] in jobs:
                    short_by_base.setdefault(jobs[x["job_id"]]["base_id"], set()).add(part)
    rows = []
    for b in fleet.bases:
        s = service.summary(res, b.id)
        rows.append({"base_id": b.id, "base_name": b.name, "aircraft": s["fleet_size"],
                     "mission_ready_today": s["mission_ready_today"]["optimized"],
                     "avg_available": s["avg_available"]["optimized"], "avg_available_reactive": s["avg_available"]["reactive"],
                     "aircraft_at_risk": s["aircraft_at_risk"]["count"], "part_shortages": sorted(short_by_base.get(b.id, set()))})
    return {"rows": rows, "plan_label": res["scenario_name"], "horizon_days": res["horizon_days"]}


@app.get("/api/fleet")
def fleet_view(plan: Optional[str] = PlanQ, base: Optional[str] = BaseQ, user: dict = STAFF) -> dict:
    res = view(user, plan)
    return {"horizon_days": res["horizon_days"], "start_date": res["start_date"], "plan_label": res["scenario_name"],
            "aircraft": service.fleet_rows(res, _check_base(base))}


@app.get("/api/aircraft/{tail}")
def aircraft(tail: str, plan: Optional[str] = PlanQ, user: dict = STAFF) -> dict:
    try:
        return service.aircraft_detail(view(user, plan), tail)
    except KeyError:
        raise HTTPException(404, f"Unknown aircraft '{tail}'")


@app.get("/api/capacity")
def capacity(plan: Optional[str] = PlanQ, user: dict = STAFF) -> dict:
    return service.capacity(view(user, plan))


@app.get("/api/spares")
def spares(plan: Optional[str] = PlanQ, user: dict = STAFF) -> dict:
    return service.spares(view(user, plan))


@app.get("/api/reports/readiness")
def report(from_day: int = 0, to_day: Optional[int] = None, user: dict = COMMANDER) -> dict:
    res = view(user, "active")
    H = res["horizon_days"]
    to_day = H - 1 if to_day is None else min(H - 1, to_day)
    if from_day < 0 or from_day > to_day:
        raise HTTPException(422, "The start day must be on or before the end day")
    s = service.summary(res, None)
    a = planning.active()
    changes = []
    if a:
        changes = [c for c in planning.changes(a)["changes"]
                   if any(d is not None and from_day <= d <= to_day for d in (c["from_day"], c["to_day"]))]
    return {"plan_label": res["scenario_name"], "start_date": res["start_date"], "from_day": from_day, "to_day": to_day,
            "fleet_size": s["fleet_size"],
            "series": {"plan": s["series"]["optimized"][from_day:to_day + 1], "reactive": s["series"]["reactive"][from_day:to_day + 1]},
            "by_base": readiness_by_base("active", user)["rows"],
            "risks": [w for w in s["watchlist"] if w["p10_days"] <= to_day],
            "shortages": [p for p in service.spares(res)["inventory"] if p["shortfall"] > 0],
            "changes": changes}


# ---------------------------------------------------------------- scenarios --
class SaveScenario(BaseModel):
    name: str
    scenario: Scenario


@app.get("/api/plan")
def scenario_plan(scenario: Optional[str] = Query(None), user: dict = STAFF) -> dict:
    try:
        return service.public(service.plan_for(scenario))
    except KeyError:
        raise HTTPException(404, f"Unknown scenario '{scenario}'")


@app.post("/api/plan")
def scenario_run(sc: Scenario, user: dict = STAFF) -> dict:
    _validate_scenario(sc)
    return service.public(service.plan_for(scenario=sc))


@app.get("/api/scenarios")
def scenarios_list(user: dict = STAFF) -> dict:
    return {"scenarios": scenarios.list_scenarios()}


@app.post("/api/scenarios", status_code=201)
def scenarios_save(body: SaveScenario, user: dict = STAFF) -> dict:
    _validate_scenario(body.scenario)
    try:
        item = scenarios.save(body.name, body.scenario)
    except ValueError as e:
        raise HTTPException(409, str(e))
    workflow.audit(user, "Saved scenario", "scenario", item["id"], detail=item["name"])
    return item


@app.delete("/api/scenarios/{scenario_id}", status_code=204)
def scenarios_delete(scenario_id: str, user: dict = STAFF) -> None:
    try:
        scenarios.delete(scenario_id)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario '{scenario_id}'")
    workflow.audit(user, "Deleted scenario", "scenario", scenario_id)


# --------------------------------------------------------------- work orders --
@app.get("/api/work-orders")
def wo_list(status: Optional[str] = None, base: Optional[str] = None, user: dict = ANY) -> dict:
    items = workflow.work_orders()
    if user["role"] == "technician":
        items = [w for w in items if w["technician"] == user["username"]]
    if status:
        items = [w for w in items if w["status"] == status]
    if base:
        items = [w for w in items if w["base_id"] == base]
    return {"work_orders": sorted(items, key=lambda w: (w["planned_day"], w["id"]))}


@app.get("/api/work-orders/{wo_id}")
def wo_get(wo_id: str, user: dict = ANY) -> dict:
    w = workflow.get_wo(wo_id)
    if user["role"] == "technician" and w["technician"] != user["username"]:
        raise HTTPException(403, "This work order is assigned to another technician")
    return w


class Completion(BaseModel):
    actual_hours: float = Field(gt=0)
    parts_used: list[dict] = []
    findings: str = ""
    follow_up_defect: bool = False


@app.post("/api/work-orders/{wo_id}/start")
def wo_start(wo_id: str, user: dict = TECHNICIAN) -> dict:
    return workflow.transition(wo_id, "start", user)


@app.post("/api/work-orders/{wo_id}/pause")
def wo_pause(wo_id: str, user: dict = TECHNICIAN) -> dict:
    return workflow.transition(wo_id, "pause", user)


@app.post("/api/work-orders/{wo_id}/complete")
def wo_complete(wo_id: str, body: Completion, user: dict = TECHNICIAN) -> dict:
    return workflow.transition(wo_id, "complete", user, completion=body.model_dump())


@app.post("/api/work-orders/{wo_id}/cannot-complete")
def wo_cannot(wo_id: str, body: Reason, user: dict = TECHNICIAN) -> dict:
    return workflow.transition(wo_id, "cannot_complete", user, reason=body.reason)


class Reassign(BaseModel):
    technician: str


@app.post("/api/work-orders/{wo_id}/reassign")
def wo_reassign(wo_id: str, body: Reassign, user: dict = PLANNER) -> dict:
    return workflow.reassign(wo_id, body.technician, user)


@app.get("/api/technicians")
def technicians(base: Optional[str] = None, user: dict = STAFF) -> dict:
    return {"technicians": by_role("technician", base)}


# ------------------------------------------------------------------- defects --
class DefectBody(BaseModel):
    aircraft_id: str
    system: str
    description: str
    suspected_parts: list[str] = []
    serviceable: bool


@app.get("/api/defects")
def defects_list(status: Optional[str] = None, user: dict = ANY) -> dict:
    items = workflow.defects()
    if user["role"] == "technician":
        items = [d for d in items if d["base_id"] == user["base_id"]]
    if status:
        items = [d for d in items if d["status"] == status]
    return {"defects": list(reversed(items))}


@app.post("/api/defects", status_code=201)
def defects_report(body: DefectBody, user: dict = TECHNICIAN) -> dict:
    fleet, _ = datastore.active_inputs()
    return workflow.report_defect(body.model_dump(), user, fleet)


@app.post("/api/defects/{defect_id}/review")
def defects_review(defect_id: str, user: dict = PLANNER) -> dict:
    return workflow.review_defect(defect_id, user)


@app.post("/api/defects/{defect_id}/convert")
def defects_convert(defect_id: str, user: dict = PLANNER) -> dict:
    return workflow.convert_defect(defect_id, user)


@app.post("/api/defects/{defect_id}/close")
def defects_close(defect_id: str, body: Reason, user: dict = PLANNER) -> dict:
    return workflow.close_defect(defect_id, body.reason, user)


# ------------------------------------------------------- technician aircraft --
@app.get("/api/technician/aircraft/{tail}")
def tech_aircraft(tail: str, user: dict = TECHNICIAN) -> dict:
    fleet, rul = datastore.active_inputs()
    acs = fleet.aircraft_by_id()
    if tail not in acs:
        raise HTTPException(404, f"Unknown aircraft '{tail}'")
    if acs[tail].base_id != user["base_id"]:
        raise HTTPException(403, f"{tail} is not at base {user['base_id']}")
    res = view({"role": "commander"}, "active")
    row = next(r for r in service.fleet_rows(res, None) if r["id"] == tail)
    wos = [w for w in workflow.work_orders() if w["aircraft_id"] == tail]
    engines = []
    for e in rul["engines"]:
        if e["aircraft_id"] == tail:
            d = res["forecasts_days"].get(e["engine_id"]) or \
                {f"{k}_days": round(v / acs[tail].sortie_rate, 1) for k, v in e["rul_cycles"].items()}
            engines.append({"engine_id": e["engine_id"], **d})
    return {"aircraft": {"id": tail, "type": acs[tail].type, "base_id": acs[tail].base_id},
            "status": row["status"], "status_reason": row["status_reason"], "engines": engines,
            "open_work_orders": [w for w in wos if w["status"] in workflow.OPEN_WO],
            "completed_work": [w for w in wos if w["status"] == "Completed"][-10:],
            "open_defects": [d for d in workflow.defects() if d["aircraft_id"] == tail and d["status"] in workflow.OPEN_DEFECT],
            "horizon_days": res["horizon_days"]}


# ---------------------------------------------------- notifications, audit --
@app.get("/api/notifications")
def notifications(user: dict = ANY) -> dict:
    items = workflow.my_notifications(user)
    return {"notifications": items[:50], "unread": sum(1 for n in items if not n["read"])}


@app.post("/api/notifications/read-all")
def notifications_read_all(user: dict = ANY) -> dict:
    workflow.mark_read(user, None)
    return {"ok": True}


@app.post("/api/notifications/{note_id}/read")
def notifications_read(note_id: str, user: dict = ANY) -> dict:
    workflow.mark_read(user, note_id)
    return {"ok": True}


@app.get("/api/audit")
def audit(user_f: Optional[str] = Query(None, alias="user"), role: Optional[str] = None, object_type: Optional[str] = None,
          date_from: Optional[str] = Query(None, alias="from"), date_to: Optional[str] = Query(None, alias="to"),
          user: dict = STAFF) -> dict:
    return {"entries": workflow.audit_log(user_f, role, object_type, date_from, date_to)}


@app.get("/api/users")
def users_list(user: dict = STAFF) -> dict:
    return {"users": [u for r in auth.ROLES for u in by_role(r)]}


# --------------------------------------------------------------------- data --
@app.get("/api/data/sources")
def data_sources(user: dict = PLANNER) -> dict:
    return {"sources": datastore.sources_info(), "data_origin": "uploaded" if datastore.uploaded_sources() else "simulated"}


@app.get("/api/data/assumptions")
def data_assumptions(user: dict = PLANNER) -> dict:
    cfg = load_scenario_config()
    leads = [p["lead_time_days"] for p in cfg["parts"]]
    f = cfg["fleet"]
    lo, hi = f["sortie_rate_range_cycles_per_day"]
    statements = [
        f"Fleet of {f['aircraft_count']} aircraft across {len(cfg['bases'])} bases; {len(f['single_engine_tails'])} single-engine, the rest twin-engine.",
        f"Planning horizon {cfg['horizon_days']} days at daily granularity, starting {cfg['start_date']}.",
        f"Sortie rate per aircraft drawn between {lo} and {hi} engine cycles per day (seed {cfg['seed']}).",
        f["cycle_to_day_rule"],
        f"Each engine follows one NASA C-MAPSS test trajectory from {', '.join(cfg['engines']['cmapss_datasets'])}.",
        f"{len(cfg['parts'])} part types with supplier lead times from {min(leads)} to {max(leads)} days.",
        "Hangar bays and technician hours per day by base: " + "; ".join(f"{a['base_id']} {a['bays']} bays, {a['tech_hours_per_day']} h" for a in cfg["agencies"]) + ".",
        f"Engine work: preventive {cfg['engine_task']['preventive_duration_days']} days, unplanned failure repair {cfg['engine_task']['corrective_duration_days']} days.",
        cfg["failure_rule"], cfg["parts_rule"],
        f"Users: 1 commander; per base 1 planner and {cfg['users']['technicians_per_base']} technicians.",
        f"Work orders are released for planned tasks starting within {cfg['operations']['work_order_release_days']} days of plan approval.",
        f"{len(cfg['planted']['at_risk_engines'])} engines are chosen to degrade inside the horizon, and {cfg['planted']['donor']['tail']} is grounded all horizon holding donor parts.",
    ]
    cfg = {k: v for k, v in cfg.items() if k != "users"}
    return {"statements": statements, "config": cfg, "config_file": "backend/aeroready/fleet/scenario_config.json"}


@app.get("/api/data/template/{source}")
def data_template(source: str, user: dict = PLANNER) -> PlainTextResponse:
    if source not in datastore.SOURCES:
        raise HTTPException(404, f"Unknown source '{source}'")
    return PlainTextResponse(datastore.template_csv(source), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{source}.csv"'})


@app.post("/api/data/upload/{source}")
async def data_upload(source: str, request: Request, filename: str = Query("upload.csv"), user: dict = PLANNER) -> dict:
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
    workflow.audit(user, "Uploaded data", "data_source", source, detail=f"{filename}, {len(rows)} rows")
    return {"ok": True, "rows": len(rows)}


@app.post("/api/data/reset")
def data_reset(user: dict = PLANNER) -> dict:
    datastore.reset()
    service.clear_cache()
    workflow.audit(user, "Reset data to simulated scenario", "data_source", "all")
    return {"ok": True}


# -------------------------------------------------------------------- model --
@app.get("/api/model/metrics")
def model_metrics(user: dict = PLANNER) -> dict:
    if not RUL_METRICS_PATH.exists():
        raise HTTPException(404, "No saved training run. Run scripts/train_rul.py.")
    m = json.loads(RUL_METRICS_PATH.read_text())
    m.pop("feature_importance", None)
    m["quantiles"] = QUANTILES
    return m


@app.get("/api/model/predictions")
def model_predictions(user: dict = PLANNER) -> dict:
    if not RUL_TEST_PREDICTIONS_PATH.exists():
        raise HTTPException(404, "No saved test predictions. Run scripts/train_rul.py.")
    return {"datasets": json.loads(RUL_TEST_PREDICTIONS_PATH.read_text())}


@app.get("/api/model/importance")
def model_importance(user: dict = PLANNER) -> dict:
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
        return FileResponse(FRONTEND_DIST / "index.html")
