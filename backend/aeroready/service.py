"""Plan caching and the derived views the console needs.

Every number the UI shows is computed here from the optimiser and evaluator
output; nothing is typed in.
"""
from __future__ import annotations

import threading
from collections import OrderedDict

from aeroready import datastore, opstate, scenarios
from aeroready.fleet.models import Fleet
from aeroready.optimizer.cpsat import solve
from aeroready.optimizer.evaluate import evaluate
from aeroready.optimizer.plan import run_plan, state_problem
from aeroready.optimizer.problem import UNLIMITED, Problem, Scenario

_cache: OrderedDict[tuple[str, str], dict] = OrderedDict()
_derived: dict[object, dict] = {}       # plan _key -> memoised derived views
_lock = threading.Lock()
CACHE_SIZE = 24
DOWN_KINDS = {"aog", "scheduled", "preventive", "corrective", "awaiting", "defect"}
WORK_KINDS = {"scheduled", "preventive", "corrective", "defect"}


def state_key() -> str:
    """Inputs that change every plan: uploaded data and operational state."""
    return datastore.data_version() + opstate.version()


# ------------------------------------------------------------------ plans --
def plan_for(scenario_id: str | None = None, scenario: Scenario | None = None, force: bool = False) -> dict:
    """What-if plans for saved or unsaved scenarios (no plan edits applied)."""
    if scenario is None:
        sid, name, sc = scenarios.get(scenario_id)
    else:
        sid, name, sc = None, "Unsaved scenario", scenario
    key = (state_key(), sc.model_dump_json())
    with _lock:
        hit = None if force else _cache.get(key)
        if hit:
            _cache.move_to_end(key)
    if hit is None:
        hit = run_plan(sc)
        hit["_key"] = key
        with _lock:
            _cache[key] = hit
            while len(_cache) > CACHE_SIZE:
                _cache.popitem(last=False)
    uploaded = datastore.uploaded_sources()
    return {**hit, "scenario_id": sid, "scenario_name": name,
            "data_origin": "uploaded" if uploaded else "simulated", "uploaded_sources": uploaded}


def public(plan: dict) -> dict:
    return {k: v for k, v in plan.items() if not k.startswith("_")}


def clear_cache() -> None:
    with _lock:
        _cache.clear()
        _derived.clear()


def _memo(plan: dict) -> dict:
    return _derived.setdefault(plan.get("_key", id(plan)), {})


def _inputs() -> tuple[Fleet, dict]:
    return datastore.active_inputs()


def _problem(plan: dict) -> tuple[Fleet, dict, Problem]:
    fleet, p = state_problem(Scenario.model_validate(plan["scenario"]))
    return fleet, {}, p


def _rows(plan: dict, side: str, base: str | None) -> list[dict]:
    return [r for r in plan[side]["gantt"] if not base or r["base_id"] == base]


def availability(rows: list[dict], H: int) -> list[int]:
    out = [0] * H
    for r in rows:
        down = {d for b in r["blocks"] if b["kind"] in DOWN_KINDS for d in range(b["start"], b["end"] + 1)}
        for d in range(H):
            if d not in down:
                out[d] += 1
    return out


def _aircraft_of(engine_id: str) -> str:
    return engine_id.rsplit("-E", 1)[0]


# ---------------------------------------------------------------- summary --
def summary(plan: dict, base: str | None) -> dict:
    H = plan["horizon_days"]
    ro, rb = _rows(plan, "optimized", base), _rows(plan, "baseline", base)
    ao, ab = availability(ro, H), availability(rb, H)
    tails = {r["aircraft_id"] for r in ro}
    watch = watchlist(plan, base)
    at_risk = sorted({w["aircraft_id"] for w in watch})
    surge = plan["scenario"]["surge"]
    surge_days = []
    if surge:
        for d in range(surge["start_day"], min(H - 1, surge["end_day"]) + 1):
            surge_days.append({"day": d, "target": surge["min_available"], "optimized": ao[d], "reactive": ab[d]})
    return {
        "horizon_days": H, "start_date": plan["start_date"], "base": base,
        "fleet_size": len(tails),
        "mission_ready_today": {"optimized": ao[0], "reactive": ab[0]},
        "avg_available": {"optimized": round(sum(ao) / H, 2), "reactive": round(sum(ab) / H, 2)},
        "aircraft_days": {"optimized": sum(ao), "reactive": sum(ab), "gain": sum(ao) - sum(ab)},
        "aircraft_at_risk": {"count": len(at_risk), "tails": at_risk},
        "unplanned_failures": {
            "optimized": sum(1 for f in plan["optimized"]["unplanned_failures"] if f["aircraft_id"] in tails),
            "reactive": sum(1 for f in plan["baseline"]["unplanned_failures"] if f["aircraft_id"] in tails)},
        "series": {"optimized": ao, "reactive": ab},
        "surge": surge, "surge_days": surge_days,
        "top_recommendations": recommendations(plan, base)[:5],
        "watchlist": watch,
        "solver": plan["optimized"]["solver"], "computed_at": plan["computed_at"],
    }


def watchlist(plan: dict, base: str | None) -> list[dict]:
    """Engines whose P10 forecast falls inside the horizon, sorted by P10."""
    H = plan["horizon_days"]
    base_of = {r["aircraft_id"]: r["base_id"] for r in plan["optimized"]["gantt"]}
    o_starts, b_starts = plan["optimized"]["starts"], plan["baseline"]["starts"]
    o_fail = {f["engine_id"]: f for f in plan["optimized"]["unplanned_failures"]}
    b_fail = {f["engine_id"]: f for f in plan["baseline"]["unplanned_failures"]}
    out = []
    for eid, f in plan["forecasts_days"].items():
        tail = _aircraft_of(eid)
        if f["p10_days"] >= H or (base and base_of.get(tail) != base):
            continue
        pm = o_starts.get(f"{eid}-PM", [None, None])[0]
        if eid in o_fail:
            plan_action = f"Fails Day {o_fail[eid]['day']}"
        elif pm is not None:
            plan_action = f"Engine work Day {pm}"
        else:
            plan_action = "No work in horizon"
        reactive = f"Fails Day {b_fail[eid]['day']}" if eid in b_fail else "No failure in horizon"
        out.append({"aircraft_id": tail, "engine_id": eid, "base_id": base_of.get(tail), **f,
                    "optimized_action": plan_action, "reactive_outcome": reactive})
    return sorted(out, key=lambda r: r["p10_days"])


def recommendations(plan: dict, base: str | None = None, kind: str | None = None) -> list[dict]:
    recs = [r for r in plan["recommendations"] if (not base or r["base_id"] == base) and (not kind or r["type"] == kind)]
    return sorted(recs, key=lambda r: -r["aircraft_delta"])


# ------------------------------------------------------------------ parts --
def _part_ready_days(p: Problem, part: str, starts: list[int]) -> list[int]:
    """Day each successive stores-sourced unit of `part` becomes available."""
    sup = p.supply[part]
    out = []
    for k in range(1, len(starts) + 1):
        d = 0
        while sup.by_day(d) < k and sup.by_day(d) != UNLIMITED:
            d += 1
        out.append(d)
    return out


def part_usage(plan: dict) -> dict:
    """Per part: optimised uses with source and part-ready day, shelf, shortfall."""
    if "part_usage" in _memo(plan):
        return _memo(plan)["part_usage"]
    fleet, _, p = _problem(plan)
    jobs = {j.id: j for j in p.jobs}
    out = {}
    for part, sup in p.supply.items():
        uses = []
        for jid, (start, donor) in plan["optimized"]["starts"].items():
            j = jobs.get(jid)
            if start is not None and j and part in j.parts:
                uses.append({"job_id": jid, "aircraft_id": j.aircraft_id, "kind": j.kind, "name": j.name,
                             "start": start, "need_from": j.earliest, "donor": donor})
        uses.sort(key=lambda u: (u["start"], u["job_id"]))
        stores = [u for u in uses if not u["donor"]]
        for u, ready in zip(stores, _part_ready_days(p, part, [u["start"] for u in stores])):
            u["part_ready_day"] = ready
        for u in uses:
            if u["donor"]:
                u["part_ready_day"] = 1
        shelf = sup.on_hand + sum(q for _, q in sup.inbound)
        out[part] = {"uses": uses, "shelf": shelf, "shortfall": max(0, len(stores) - shelf),
                     "on_hand": sup.on_hand, "inbound": sup.inbound, "lead_time": sup.lead_time, "name": sup.name}
    _memo(plan)["part_usage"] = out
    return out


def _cannibalisation_gain(plan: dict, c: dict) -> int:
    """Aircraft-days the plan loses if this one donor part were not available."""
    store = _memo(plan).setdefault("cann_gain", {})
    if c["job_id"] in store:
        return store[c["job_id"]]
    _, _, p = _problem(plan)
    p.donors = {part: [(d, q) for d, q in lst if not (part == c["part_id"] and d == c["donor"])]
                for part, lst in p.donors.items()}
    alt, _ = solve(p, decisions=plan.get("_constraints"))
    gain = plan["optimized"]["aircraft_days"] - evaluate(p, alt)["aircraft_days"]
    store[c["job_id"]] = gain
    return gain


def spares(plan: dict) -> dict:
    fleet, _, p = _problem(plan)
    usage = part_usage(plan)
    jobs = {j.id: j for j in p.jobs}
    rlog = plan["reactive_log"]
    H = plan["horizon_days"]
    orders = {o["part_id"]: o for o in plan["part_orders"]}
    parts = fleet.part_by_id()
    inventory, timeline = [], []
    for part, u in usage.items():
        inbound_qty = sum(q for _, q in u["inbound"])
        inventory.append({
            "part_id": part, "name": u["name"], "category": parts[part].category, "on_hand": u["on_hand"],
            "inbound_qty": inbound_qty, "inbound": [{"day": d, "qty": q} for d, q in u["inbound"]],
            "lead_time_days": u["lead_time"], "demand": len(u["uses"]),
            "demand_from_stores": sum(1 for x in u["uses"] if not x["donor"]),
            "demand_cannibalised": sum(1 for x in u["uses"] if x["donor"]),
            "shortfall": u["shortfall"], "day0_order": orders.get(part)})
        reactive_waits = []
        for jid, log in rlog.items():
            j = jobs.get(jid)
            if not j or part not in j.parts:
                continue
            ready = log["part_ready_day"]
            reactive_waits.append({
                "job_id": jid, "aircraft_id": j.aircraft_id, "kind": j.kind, "name": j.name,
                "request_day": log["request_day"], "part_ready_day": ready, "start": log["start"],
                "waiting_days": (log["start"] if log["start"] is not None else H) - log["request_day"],
                "part_wait_days": (ready if ready is not None else H) - log["request_day"]})
        waits = [w for w in reactive_waits if w["part_wait_days"] > 0]
        if u["shortfall"] > 0 or waits:
            timeline.append({
                "part_id": part, "name": u["name"], "shortfall": u["shortfall"],
                "optimized": [{**x, "part_wait_days": max(0, x["part_ready_day"] - x["need_from"])}
                              for x in u["uses"] if not x["donor"]],
                "reactive": sorted(waits, key=lambda w: w["request_day"])})
    grounding = {a.id: a.grounding for a in fleet.aircraft if a.grounding}
    cann = []
    for c in plan["optimized"]["cannibalizations"]:
        g = grounding.get(c["donor"])
        cann.append({**c, "removal_day": max(0, c["day"] - 1), "aircraft_days_gained": _cannibalisation_gain(plan, c),
                     "condition": (f"{c['donor']} is grounded for the whole horizon"
                                   + (f" ({g.reason})" if g else ""))})
    return {"inventory": inventory, "shortage_timeline": timeline, "cannibalizations": cann,
            "part_orders": plan["part_orders"], "horizon_days": H}


# --------------------------------------------------------------- capacity --
def capacity(plan: dict) -> dict:
    H = plan["horizon_days"]
    out = []
    for b, bays in plan["capacity"]["bays"].items():
        hours = plan["capacity"]["tech_hours"][b]
        out.append({"base_id": b, "days": [{
            "day": d, "bays": bays[d], "tech_hours": hours[d],
            "bays_used": {"optimized": plan["optimized"]["bay_use"][b][d], "reactive": plan["baseline"]["bay_use"][b][d]},
            "hours_used": {"optimized": plan["optimized"]["hour_use"][b][d], "reactive": plan["baseline"]["hour_use"][b][d]},
        } for d in range(H)]})
    return {"horizon_days": H, "bases": out}


# ------------------------------------------------------------------ fleet --
def _status(row: dict, worst_p10: float | None, H: int) -> tuple[str, str]:
    today = [b for b in row["blocks"] if b["kind"] != "cannibalization" and b["start"] <= 0 <= b["end"]]
    kinds = {b["kind"] for b in today}
    if kinds & {"aog", "awaiting", "corrective"}:
        b = next(b for b in today if b["kind"] in {"aog", "awaiting", "corrective"})
        return "grounded", b["label"]
    if kinds & {"scheduled", "preventive", "defect"}:
        b = next(b for b in today if b["kind"] in {"scheduled", "preventive", "defect"})
        return "scheduled", f"In maintenance today: {b['label']}"
    if worst_p10 is not None and worst_p10 < H:
        return "at_risk", f"Engine RUL P10 {worst_p10} days, inside the {H}-day horizon"
    return "ready", "Mission ready; no forecast risk inside the horizon"


def _engine_days(plan: dict, rul: dict, fleet: Fleet) -> dict[str, dict]:
    acs = fleet.aircraft_by_id()
    out = {}
    for e in rul["engines"]:
        f = plan["forecasts_days"].get(e["engine_id"])
        if f is None:   # grounded all horizon: not planned, report at the base sortie rate
            r = acs[e["aircraft_id"]].sortie_rate
            f = {f"{k}_days": round(v / r, 1) for k, v in e["rul_cycles"].items()}
        out[e["engine_id"]] = {"engine_id": e["engine_id"], **f, "forecast_source": e.get("forecast_source", "model")}
    return out


def fleet_rows(plan: dict, base: str | None) -> list[dict]:
    fleet, rul = _inputs()
    H = plan["horizon_days"]
    eng = _engine_days(plan, rul, fleet)
    usage = part_usage(plan)
    short_parts = {k for k, u in usage.items() if u["shortfall"] > 0}
    rows_b = {r["aircraft_id"]: r for r in plan["baseline"]["gantt"]}
    out = []
    for row in _rows(plan, "optimized", base):
        ac = next(a for a in fleet.aircraft if a.id == row["aircraft_id"])
        engines = [eng[e] for e in ac.engine_ids]
        worst = min(engines, key=lambda e: e["p10_days"])
        aog_all = ac.grounding is not None and ac.grounding.since_day <= 0 and ac.grounding.until_day >= H
        status, reason = _status(row, None if aog_all else worst["p10_days"], H)
        work = sorted([b for b in row["blocks"] if b["kind"] in WORK_KINDS], key=lambda b: b["start"])
        nxt = work[0] if work else None
        shortages = sorted({part for part, u in usage.items() if part in short_parts
                            for x in u["uses"] if x["aircraft_id"] == ac.id and not x["donor"]})
        out.append({
            "id": ac.id, "type": ac.type, "base_id": ac.base_id, "sortie_rate": ac.sortie_rate,
            "status": status, "status_reason": reason, "grounded_all_horizon": aog_all,
            "engines": engines, "worst_engine": worst,
            "next_task": None if not nxt else {"label": nxt["label"], "kind": nxt["kind"], "start": nxt["start"],
                                               "job_id": nxt["job_id"]},
            "days_to_next_task": nxt["start"] if nxt else None,
            "part_shortages": shortages,
            "available_days": {"optimized": row["available_days"], "reactive": rows_b[ac.id]["available_days"]},
        })
    return out


# --------------------------------------------------------------- aircraft --
def aircraft_detail(plan: dict, tail: str) -> dict:
    fleet, rul = _inputs()
    acs = fleet.aircraft_by_id()
    if tail not in acs:
        raise KeyError(tail)
    ac = acs[tail]
    row = next(r for r in fleet_rows(plan, None) if r["id"] == tail)
    eng_by_id = fleet.engine_by_id()
    fc = {e["engine_id"]: e for e in rul["engines"]}
    jobs = {j["id"]: j for j in plan["jobs"] if j["aircraft_id"] == tail}
    recs = [r for r in plan["recommendations"] if r["aircraft_id"] == tail]
    reason_by_job: dict[str, list[str]] = {}
    for r in recs:
        reason_by_job.setdefault(r["job_id"], []).append(r["reason"])
    o_starts, b_starts = plan["optimized"]["starts"], plan["baseline"]["starts"]
    o_fail = {f["engine_id"]: f for f in plan["optimized"]["unplanned_failures"]}
    b_fail = {f["engine_id"]: f for f in plan["baseline"]["unplanned_failures"]}

    def reactive_text(j: dict) -> str:
        if j["kind"] == "preventive":
            f = b_fail.get(j["engine_id"])
            if f:
                rs = f["repair_start"]
                return f"No preventive work; engine fails Day {f['day']}, repair " + \
                    (f"starts Day {rs}" if rs is not None else "does not start inside the horizon")
            return "No preventive work; no failure inside the horizon"
        s = b_starts.get(j["id"], [None])[0]
        return f"Starts Day {s}" if s is not None else "Not started inside the horizon"

    planned = []
    for jid, j in jobs.items():
        if j["kind"] == "corrective":
            continue
        s, donor = o_starts.get(jid, [None, None])
        if s is None and j["kind"] == "preventive" and j["engine_id"] not in o_fail:
            continue        # optional engine work the plan does not schedule
        default = {"scheduled": f"Inspection window Day {j['earliest']} to Day {j['due']}",
                   "preventive": "Engine work ahead of the forecast failure day"}.get(j["kind"], "")
        planned.append({
            "job_id": jid, "kind": j["kind"], "name": j["name"], "start": s, "duration": j["duration"],
            "parts": j["parts"], "part_source": (f"Cannibalised from {donor}" if donor else "Stores") if j["parts"] else None,
            "reason": " ".join(reason_by_job.get(jid, [])) or default, "reactive": reactive_text(j)})
    for eid, f in o_fail.items():
        if _aircraft_of(eid) == tail:
            planned.append({"job_id": f"{eid}-CM", "kind": "corrective", "name": jobs[f"{eid}-CM"]["name"],
                            "start": f["repair_start"], "duration": jobs[f"{eid}-CM"]["duration"],
                            "parts": jobs[f"{eid}-CM"]["parts"], "part_source": "Stores",
                            "reason": f"Engine fails Day {f['day']} in this plan as well", "reactive": ""})
    planned.sort(key=lambda x: (x["start"] is None, x["start"] or 0))

    usage = part_usage(plan)
    parts_needed = []
    for part, u in usage.items():
        for x in u["uses"]:
            if x["aircraft_id"] == tail:
                parts_needed.append({"part_id": part, "name": u["name"], "job_id": x["job_id"], "start": x["start"],
                                     "source": f"Cannibalised from {x['donor']}" if x["donor"] else "Stores",
                                     "available_day": x["part_ready_day"], "shortfall": u["shortfall"]})
    cann = [{**c, "role": "donor" if c["donor"] == tail else "receiver"}
            for c in plan["optimized"]["cannibalizations"] if tail in (c["donor"], c["aircraft_id"])]

    engines = []
    for eid in ac.engine_ids:
        e = eng_by_id[eid]
        engines.append({**e.model_dump(), **fc[eid], "plan_days": plan["forecasts_days"].get(eid)})
    rows = {s: next(r for r in plan[s]["gantt"] if r["aircraft_id"] == tail) for s in ("optimized", "baseline")}
    return {
        "aircraft": ac.model_dump(), "base": next(b.model_dump() for b in fleet.bases if b.id == ac.base_id),
        "status": row["status"], "status_reason": row["status_reason"], "next_task": row["next_task"],
        "available_days": row["available_days"], "engines": engines,
        "log": [x.model_dump() for x in fleet.log if x.aircraft_id == tail],
        "planned_work": planned, "parts": parts_needed, "cannibalizations": cann,
        "timeline": {"optimized": rows["optimized"], "baseline": rows["baseline"]},
        "recommendations": recs, "horizon_days": plan["horizon_days"], "start_date": plan["start_date"],
    }
