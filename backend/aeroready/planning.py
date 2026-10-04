"""Versioned maintenance plans and the planner / commander workflow.

Plan status: Draft -> Submitted -> Approved | Returned. A Returned plan is
edited and resubmitted. Only one Approved plan is active; approving a new one
supersedes it. Recommendation status: Proposed -> Accepted | Modified | Rejected.

A plan stores its schedule (job -> start day, donor) plus the planner's edits:
locks (kept fixed when the optimiser re-runs), exclusions from rejected
recommendations and removed tasks. Every change is audited.
"""
from __future__ import annotations

import threading
from collections import OrderedDict

from fastapi import HTTPException

from aeroready import opstate, service
from aeroready.opstate import audit, notify, now, update
from aeroready.optimizer.cpsat import solve
from aeroready.optimizer.evaluate import Assignment, evaluate
from aeroready.optimizer.plan import compute_result, state_problem
from aeroready.optimizer.problem import Scenario
from aeroready.users import by_role

EDITABLE = ("Draft", "Returned")
WORKING = ("Draft", "Returned", "Submitted")
REJECT_EFFECT = {
    "predictive": "No preventive work on this engine inside the horizon; the engine may fail on its forecast day.",
    "cannibalize": "The part is not taken from the donor for this job.",
    "order": "No new orders of this part inside the horizon; only stock and inbound deliveries are used.",
}
_results: OrderedDict[tuple, dict] = OrderedDict()
_rlock = threading.Lock()


# ------------------------------------------------------------------ access --
def plans() -> list[dict]:
    return opstate.read("plans")


def get(plan_id: str) -> dict:
    p = next((x for x in plans() if x["id"] == plan_id), None)
    if not p:
        raise HTTPException(404, f"Unknown plan {plan_id}")
    return p


def active() -> dict | None:
    return next((x for x in plans() if x["status"] == "Approved" and x["active"]), None)


def working() -> dict | None:
    return next((x for x in plans() if x["status"] in WORKING), None)


def label(p: dict | None) -> str:
    if p is None:
        return "No approved plan"
    if p["status"] == "Approved":
        return f"Approved plan, v{p['version']}" + ("" if p["active"] else " (superseded)")
    return {"Draft": f"Draft v{p['version']}", "Submitted": f"Draft v{p['version']} under review",
            "Returned": f"Draft v{p['version']} returned"}[p["status"]]


def _save(plan: dict) -> dict:
    def put(items: list):
        for i, x in enumerate(items):
            if x["id"] == plan["id"]:
                items[i] = plan
                return
        items.append(plan)
    update("plans", put)
    return plan


def _check_editable(plan: dict) -> None:
    if plan["status"] not in EDITABLE:
        raise HTTPException(409, f"Plan v{plan['version']} is {plan['status'].lower()} and cannot be changed")


def _check_base(user: dict, base_id: str) -> None:
    if user["role"] == "planner" and user["base_id"] != base_id:
        raise HTTPException(403, f"Planner {user['base_id']} can only change tasks at base {user['base_id']}")


# -------------------------------------------------------------- optimising --
def constraints(plan: dict) -> dict:
    f = plan["forbids"]
    return {
        "locks": {j: (v[0], v[1], j) for j, v in plan["locks"].items()},
        "forbid_starts": {(j, d) for j, d in f["starts"]},
        "forbid_jobs": set(f["jobs"]) | set(plan["removed"]),
        "forbid_donor_jobs": set(f["donor_jobs"]),
        "no_order_parts": set(f["no_order"]),
    }


def _optimise(plan: dict) -> None:
    fleet, p = state_problem()
    opt, stats = solve(p, decisions=constraints(plan))
    plan["schedule"] = {j: [a.start, a.cannibalized_from] for j, a in opt.items()}
    plan["solver"] = {k: stats[k] for k in ("status", "wall_time_s", "objective", "locks_ignored")}
    plan["optimized_at"] = now()
    plan["revision"] = plan.get("revision", 0) + 1


def _assignments(plan: dict) -> dict[str, Assignment]:
    return {j: Assignment(start=v[0], cannibalized_from=v[1]) for j, v in plan["schedule"].items()}


def result(plan: dict) -> dict:
    """Score the plan's schedule against the reactive baseline (memoised)."""
    key = (plan["id"], plan.get("revision", 0), service.state_key())
    with _rlock:
        hit = _results.get(key)
    if hit is None:
        fleet, p = state_problem()
        hit = compute_result(fleet, p, _assignments(plan), dict(plan["solver"]), Scenario())
        hit["_key"] = key
        hit["_constraints"] = constraints(plan)
        with _rlock:
            _results[key] = hit
            while len(_results) > 16:
                _results.popitem(last=False)
    out = dict(hit)
    out["recommendations"] = _with_status(plan, hit["recommendations"])
    out["plan"] = summary(plan)
    out["scenario_id"], out["scenario_name"] = None, label(plan)
    out["data_origin"] = "uploaded" if service.datastore.uploaded_sources() else "simulated"
    out["uploaded_sources"] = service.datastore.uploaded_sources()
    return out


def summary(plan: dict) -> dict:
    """Plan metadata without the schedule."""
    return {k: v for k, v in plan.items() if k not in ("schedule",)} | {"label": label(plan)}


def rec_key(r: dict) -> str:
    return f"{r['type']}|{r['part_id'] if r['type'] == 'order' else r['job_id']}"


def _with_status(plan: dict, recs: list[dict]) -> list[dict]:
    st = plan["rec_status"]
    out = []
    seen = set()
    for r in recs:
        k = rec_key(r)
        seen.add(k)
        s = st.get(k)
        out.append({**r, "key": k, "status": s["status"] if s else "Proposed", "decision": s,
                    "effects": {"reject": REJECT_EFFECT.get(r["type"], "The job will not be done on this day; the optimiser picks another.")}})
    # Decided recommendations the current schedule no longer produces stay visible in the queue.
    for k, s in st.items():
        if k not in seen and s.get("snapshot"):
            out.append({**s["snapshot"], "key": k, "status": s["status"], "decision": s, "current": False,
                        "effects": {"reject": ""}})
    return out


# ---------------------------------------------------------------- lifecycle --
def create_or_get_working(user: dict) -> dict:
    w = working()
    if w:
        return w
    base = active()
    version = max([x["version"] for x in plans()] + [0]) + 1
    plan = {
        "id": f"PLAN-{version:04d}", "version": version, "status": "Draft", "active": False,
        "based_on": base["version"] if base else None, "created_by": user["name"], "created_at": now(),
        "submitted_by": None, "submitted_at": None, "decided_by": None, "decided_at": None, "superseded_by": None,
        "comments": [], "locks": {}, "removed": {}, "change_notes": {}, "rec_status": {},
        "forbids": {"starts": [], "jobs": [], "donor_jobs": [], "no_order": []},
        "schedule": {}, "solver": {}, "optimized_at": None, "revision": 0,
    }
    _optimise(plan)
    _save(plan)
    audit(user, "Created draft plan", "plan", plan["id"], detail=f"v{version}, based on " + (f"v{base['version']}" if base else "no approved plan"))
    return plan


def run_optimizer(plan: dict, user: dict) -> dict:
    _check_editable(plan)
    _optimise(plan)
    _save(plan)
    ignored = plan["solver"].get("locks_ignored") or []
    audit(user, "Ran optimizer", "plan", plan["id"],
          detail=f"{plan['solver']['status'].lower()}" + (f"; {len(ignored)} locks could not be kept" if ignored else ""))
    return plan


def _find_rec(plan: dict, key: str) -> dict:
    r = next((x for x in result(plan)["recommendations"] if x["key"] == key), None)
    if not r:
        raise HTTPException(404, "That recommendation is not in the current plan")
    return r


def decide(plan: dict, key: str, action: str, reason: str, user: dict) -> dict:
    _check_editable(plan)
    r = _find_rec(plan, key)
    _check_base(user, r["base_id"])
    if action not in ("accept", "reject"):
        raise HTTPException(422, "Action must be accept or reject")
    if action == "reject" and not reason.strip():
        raise HTTPException(422, "A reason is required to reject a recommendation")
    snapshot = {k: r[k] for k in ("id", "type", "aircraft_id", "base_id", "job_id", "day", "title", "reason",
                                  "aircraft_delta", "start", "donor", "part_id")}
    plan["rec_status"][key] = {"status": "Accepted" if action == "accept" else "Rejected", "reason": reason.strip() or None,
                               "by": user["name"], "at": now(), "snapshot": snapshot}
    if action == "accept":
        if r["type"] != "order" and r["start"] is not None:
            plan["locks"][r["job_id"]] = [r["start"], r["donor"]]
        plan["revision"] += 1
    else:
        f = plan["forbids"]
        if r["type"] == "predictive":
            f["jobs"].append(r["job_id"])
        elif r["type"] == "cannibalize":
            f["donor_jobs"].append(r["job_id"])
        elif r["type"] == "order":
            f["no_order"].append(r["part_id"])
        elif r["start"] is not None:
            f["starts"].append([r["job_id"], r["start"]])
        plan["locks"].pop(r["job_id"], None)
        _optimise(plan)
    _save(plan)
    audit(user, "Accepted recommendation" if action == "accept" else "Rejected recommendation", "recommendation",
          f"{plan['id']}/{key}", comment=reason or None, detail=r["title"])
    return plan


def _violations(p, schedule: dict) -> list[str]:
    return evaluate(p, {j.id: schedule.get(j.id, Assignment()) for j in p.jobs})["violations"]


def check_move(plan: dict, job_id: str, day: int | None) -> tuple[list[str], object]:
    """New constraint violations if `job_id` started on `day` (None = unscheduled)."""
    fleet, p = state_problem()
    job = next((j for j in p.jobs if j.id == job_id), None)
    if not job:
        raise HTTPException(404, f"Unknown task {job_id}")
    if day is not None and not (job.earliest <= day <= job.latest):
        return [f"{job.name} on {job.aircraft_id} must start between day {job.earliest} and day {job.latest}"], job
    cur = _assignments(plan)
    before = set(_violations(p, cur))
    donor = plan["schedule"].get(job_id, [None, None])[1]
    cand = dict(cur)
    cand[job_id] = Assignment(start=day, cannibalized_from=donor if day is not None else None)
    return [v for v in _violations(p, cand) if v not in before], job


def move(plan: dict, job_id: str, day: int, comment: str, user: dict) -> dict:
    _check_editable(plan)
    violations, job = check_move(plan, job_id, day)
    _check_base(user, job.base_id)
    if violations:
        raise HTTPException(409, {"message": "The move breaks plan constraints", "violations": violations})
    old = plan["schedule"].get(job_id, [None, None])[0]
    donor = plan["schedule"].get(job_id, [None, None])[1]
    plan["schedule"][job_id] = [day, donor]
    plan["locks"][job_id] = [day, donor]
    plan["removed"].pop(job_id, None)
    if comment.strip():
        plan["change_notes"][job_id] = comment.strip()
    for r in result(plan)["recommendations"]:
        if r["job_id"] == job_id and r["status"] in ("Proposed", "Accepted"):
            plan["rec_status"][r["key"]] = {"status": "Modified", "reason": comment.strip() or None, "by": user["name"], "at": now(),
                                            "snapshot": {k: r[k] for k in ("id", "type", "aircraft_id", "base_id", "job_id", "day", "title",
                                                                           "reason", "aircraft_delta", "start", "donor", "part_id")}}
    plan["revision"] += 1
    _save(plan)
    audit(user, "Moved task", "task", f"{plan['id']}/{job_id}", comment=comment or None,
          detail=f"{job.name} on {job.aircraft_id}: day {old if old is not None else 'unscheduled'} to day {day}")
    return plan


def set_lock(plan: dict, job_id: str, locked: bool, user: dict) -> dict:
    _check_editable(plan)
    fleet, p = state_problem()
    job = next((j for j in p.jobs if j.id == job_id), None)
    if not job:
        raise HTTPException(404, f"Unknown task {job_id}")
    _check_base(user, job.base_id)
    start, donor = plan["schedule"].get(job_id, [None, None])
    if locked:
        if start is None:
            raise HTTPException(409, "Only a scheduled task can be locked")
        plan["locks"][job_id] = [start, donor]
    else:
        plan["locks"].pop(job_id, None)
    plan["revision"] += 1
    _save(plan)
    audit(user, "Locked task" if locked else "Unlocked task", "task", f"{plan['id']}/{job_id}", detail=f"{job.name} on {job.aircraft_id}")
    return plan


def remove(plan: dict, job_id: str, reason: str, user: dict) -> dict:
    _check_editable(plan)
    if not reason.strip():
        raise HTTPException(422, "A reason is required to remove a task")
    fleet, p = state_problem()
    job = next((j for j in p.jobs if j.id == job_id), None)
    if not job:
        raise HTTPException(404, f"Unknown task {job_id}")
    _check_base(user, job.base_id)
    plan["removed"][job_id] = reason.strip()
    plan["locks"].pop(job_id, None)
    plan["schedule"][job_id] = [None, None]
    plan["revision"] += 1
    _save(plan)
    audit(user, "Removed task", "task", f"{plan['id']}/{job_id}", comment=reason, detail=f"{job.name} on {job.aircraft_id}")
    return plan


def place_earliest(plan: dict, job_id: str, user: dict) -> int | None:
    """Put a task on its earliest feasible day and lock it (used for defects)."""
    for d in range(0, 400):
        try:
            violations, job = check_move(plan, job_id, d)
        except HTTPException:
            return None
        if d > job.latest:
            return None
        if not violations:
            donor = None
            plan["schedule"][job_id] = [d, donor]
            plan["locks"][job_id] = [d, donor]
            plan["revision"] += 1
            _save(plan)
            audit(user, "Placed task", "task", f"{plan['id']}/{job_id}", detail=f"{job.name} on {job.aircraft_id}, earliest feasible day {d}")
            return d
    return None


def _comment(plan: dict, user: dict, kind: str, text: str) -> None:
    plan["comments"].append({"by": user["name"], "role": user["role"], "at": now(), "kind": kind, "text": text})


def submit(plan: dict, comment: str, user: dict) -> dict:
    _check_editable(plan)
    plan["status"] = "Submitted"
    plan["submitted_by"], plan["submitted_at"] = user["name"], now()
    if comment.strip():
        _comment(plan, user, "submit", comment.strip())
    _save(plan)
    audit(user, "Submitted plan for approval", "plan", plan["id"], comment=comment or None, detail=f"v{plan['version']}")
    notify([u["username"] for u in by_role("commander")], "plan_submitted",
           f"Plan v{plan['version']} submitted for approval by {user['name']}", f"/commander/approvals/{plan['id']}")
    return plan


def return_plan(plan: dict, comment: str, user: dict) -> dict:
    if plan["status"] != "Submitted":
        raise HTTPException(409, "Only a submitted plan can be returned")
    if not comment.strip():
        raise HTTPException(422, "A comment is required to return a plan")
    plan["status"] = "Returned"
    plan["decided_by"], plan["decided_at"] = user["name"], now()
    _comment(plan, user, "return", comment.strip())
    _save(plan)
    audit(user, "Returned plan to planner", "plan", plan["id"], comment=comment, detail=f"v{plan['version']}")
    notify([u["username"] for u in by_role("planner")], "plan_returned",
           f"Plan v{plan['version']} returned: {comment.strip()}", "/planner")
    return plan


def approve(plan: dict, comment: str, user: dict) -> tuple[dict, list[dict]]:
    from aeroready import workflow  # avoid import cycle
    if plan["status"] != "Submitted":
        raise HTTPException(409, "Only a submitted plan can be approved")
    old = active()
    if old:
        old["active"] = False
        old["superseded_by"] = plan["version"]
        _save(old)
    plan["status"], plan["active"] = "Approved", True
    plan["decided_by"], plan["decided_at"] = user["name"], now()
    if comment.strip():
        _comment(plan, user, "approve", comment.strip())
    _save(plan)
    audit(user, "Approved plan", "plan", plan["id"], comment=comment or None,
          detail=f"v{plan['version']}" + (f", supersedes v{old['version']}" if old else ""))
    notify([u["username"] for u in by_role("planner")], "plan_approved", f"Plan v{plan['version']} approved by {user['name']}", "/planner")
    orders = workflow.release_work_orders(plan, result(plan), user)
    return plan, orders


# ------------------------------------------------------------ review support --
def changes(plan: dict) -> dict:
    """Tasks added, moved and removed against the active approved plan (or the reactive baseline)."""
    res = result(plan)
    jobs = {j["id"]: j for j in res["jobs"]}
    base = active()
    if base and base["id"] != plan["id"]:
        ref = {j: v[0] for j, v in base["schedule"].items()}
        ref_label = f"Approved plan v{base['version']}"
    else:
        ref = {j: v[0] for j, v in res["baseline"]["starts"].items()}
        ref_label = "Reactive baseline (no approved plan)"
    rec_notes = {}
    for r in res["recommendations"]:
        if r["decision"] and r["decision"].get("reason"):
            rec_notes.setdefault(r["job_id"], []).append(f"{r['status']}: {r['decision']['reason']}")
    rows = []
    for jid, (start, donor) in plan["schedule"].items():
        if jid not in jobs:
            continue
        before = ref.get(jid)
        if before == start:
            continue
        kind = "added" if before is None else ("removed" if start is None else "moved")
        j = jobs[jid]
        notes = [n for n in [plan["change_notes"].get(jid), plan["removed"].get(jid)] if n] + rec_notes.get(jid, [])
        rows.append({"job_id": jid, "aircraft_id": j["aircraft_id"], "base_id": j["base_id"], "task": j["name"],
                     "change": kind, "from_day": before, "to_day": start, "comment": "; ".join(notes) or None,
                     "locked": jid in plan["locks"]})
    rows.sort(key=lambda r: (r["change"], r["aircraft_id"]))
    cann = res["optimized"]["cannibalizations"]
    deferrals = [r for r in res["recommendations"] if r["type"] == "defer" and r.get("current", True)]
    return {"reference": ref_label, "changes": rows, "cannibalizations": cann, "deferrals": deferrals}


def risks(res: dict) -> list[dict]:
    """Engine tasks scheduled after the P10 forecast, and engines left to fail."""
    out = []
    starts = res["optimized"]["starts"]
    for j in res["jobs"]:
        if j["kind"] != "preventive" or not j["engine_id"]:
            continue
        fc = res["forecasts_days"].get(j["engine_id"])
        if not fc:
            continue
        s = starts.get(j["id"], [None, None])[0]
        if s is not None and s > fc["p10_days"]:
            out.append({"aircraft_id": j["aircraft_id"], "engine_id": j["engine_id"], "task": j["name"], "start": s,
                        "p10_days": fc["p10_days"], "margin_days": round(s - fc["p10_days"], 1), "kind": "after_p10"})
    for f in res["optimized"]["unplanned_failures"]:
        fc = res["forecasts_days"].get(f["engine_id"], {})
        out.append({"aircraft_id": f["aircraft_id"], "engine_id": f["engine_id"], "task": "No preventive work; engine fails",
                    "start": f["day"], "p10_days": fc.get("p10_days"), "margin_days": None, "kind": "failure"})
    return out
