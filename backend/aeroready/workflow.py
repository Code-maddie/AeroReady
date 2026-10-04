"""Work orders, defects, notifications and audit queries.

Work order: Released -> In progress -> Paused -> Completed | Cannot complete.
Defect:     Reported -> Under review -> Planned -> Closed.
"""
from __future__ import annotations

from fastapi import HTTPException

from aeroready import opstate, planning, service
from aeroready.fleet.generator import load_scenario_config
from aeroready.opstate import SYSTEM_USER, audit, next_id, notify, now, update
from aeroready.users import by_role

WO_TRANSITIONS = {
    "start": ({"Released", "Paused"}, "In progress"),
    "pause": ({"In progress"}, "Paused"),
    "complete": ({"In progress"}, "Completed"),
    "cannot_complete": ({"Released", "In progress", "Paused"}, "Cannot complete"),
}
OPEN_WO = {"Released", "In progress", "Paused"}
OPEN_DEFECT = {"Reported", "Under review", "Planned"}


def ops_config() -> dict:
    return load_scenario_config()["operations"]


def _staff(base_id: str) -> list[str]:
    return [u["username"] for u in by_role("planner", base_id)] + [u["username"] for u in by_role("commander")]


# --------------------------------------------------------------- work orders --
def work_orders() -> list[dict]:
    return opstate.read("work_orders")


def get_wo(wo_id: str) -> dict:
    w = next((x for x in work_orders() if x["id"] == wo_id), None)
    if not w:
        raise HTTPException(404, f"Unknown work order {wo_id}")
    return w


def _save_wo(wo: dict) -> None:
    def put(items):
        for i, x in enumerate(items):
            if x["id"] == wo["id"]:
                items[i] = wo
                return
        items.append(wo)
    update("work_orders", put)


def _default_reason(j: dict, start: int) -> str:
    if j.get("defect_id"):
        return f"Rectification of defect {j['defect_id']}"
    if j["kind"] == "preventive":
        return f"Predictive maintenance ahead of the forecast failure day {j['failure_day']}"
    if j["kind"] == "corrective":
        return f"Unplanned failure repair; engine forecast to fail day {j['failure_day']}"
    return f"Scheduled inspection, window day {j['earliest']} to day {j['due']}"


def release_work_orders(plan: dict, res: dict, user: dict) -> list[dict]:
    """Planned tasks starting inside the release window become work orders."""
    window = ops_config()["work_order_release_days"]
    existing = {w["job_id"] for w in work_orders() if w["status"] in OPEN_WO}
    done = set(opstate.read("ops").get("completed_jobs", []))
    jobs = {j["id"]: j for j in res["jobs"]}
    usage = service.part_usage(res)
    ready = {(u["job_id"], part): u for part, x in usage.items() for u in x["uses"]}
    names = {p: x["name"] for p, x in usage.items()}
    reasons: dict[str, list[str]] = {}
    for r in res["recommendations"]:
        if r.get("current", True):
            reasons.setdefault(r["job_id"], []).append(r["reason"])
    starts = res["optimized"]["starts"]
    # Bay number: order of aircraft in work at the base on each day.
    in_work: dict[tuple[str, int], list[str]] = {}
    for row in res["optimized"]["gantt"]:
        for b in row["blocks"]:
            if b["kind"] in ("scheduled", "preventive", "corrective", "defect"):
                for d in range(b["start"], b["end"] + 1):
                    lst = in_work.setdefault((row["base_id"], d), [])
                    if row["aircraft_id"] not in lst:
                        lst.append(row["aircraft_id"])
    load: dict[str, int] = {}
    for w in work_orders():
        if w["status"] in OPEN_WO:
            load[w["technician"]] = load.get(w["technician"], 0) + 1

    created = []
    for jid, (start, donor) in sorted(starts.items(), key=lambda kv: (kv[1][0] is None, kv[1][0] or 0, kv[0])):
        if start is None or start >= window or jid in existing or jid in done or jid not in jobs:
            continue
        j = jobs[jid]
        techs = [u["username"] for u in by_role("technician", j["base_id"])]
        if not techs:
            continue
        tech = min(techs, key=lambda t: (load.get(t, 0), t))
        load[tech] = load.get(tech, 0) + 1
        bays = sorted(in_work.get((j["base_id"], start), []))
        parts = []
        for part in j["parts"]:
            u = ready.get((jid, part))
            parts.append({"part_id": part, "name": names.get(part, part), "qty": 1,
                          "source": f"Cannibalised from {donor}" if donor else "Stores",
                          "available_day": u["part_ready_day"] if u else None})
        created.append({
            "id": "", "plan_version": plan["version"], "job_id": jid, "aircraft_id": j["aircraft_id"], "base_id": j["base_id"],
            "task": j["name"], "task_type": "defect" if j.get("defect_id") else j["kind"], "defect_id": j.get("defect_id"),
            "planned_day": start, "duration_days": j["duration"], "est_hours": j["duration"] * j["tech_hours_per_day"],
            "bay": bays.index(j["aircraft_id"]) + 1 if j["aircraft_id"] in bays else None,
            "parts": parts, "reason": " ".join(reasons.get(jid, [])) or _default_reason(j, start),
            "technician": tech, "status": "Released", "cannot_reason": None, "completion": None,
            "history": [{"status": "Released", "by": user["name"], "role": user["role"], "at": now(), "comment": f"Plan v{plan['version']} approved"}],
        })

    def add(items):
        for w in created:
            w["id"] = next_id(items, "WO-")
            items.append(w)
    update("work_orders", add)
    for w in created:
        audit(user, "Released work order", "work_order", w["id"], detail=f"{w['task']} on {w['aircraft_id']}, day {w['planned_day']}, to {w['technician']}")
        notify([w["technician"]], "work_order_assigned", f"Work order {w['id']} assigned: {w['task']} on {w['aircraft_id']}, day {w['planned_day']}",
               f"/technician/work-orders/{w['id']}")
    return created


def transition(wo_id: str, action: str, user: dict, *, reason: str = "", completion: dict | None = None) -> dict:
    wo = get_wo(wo_id)
    if user["role"] == "technician" and wo["technician"] != user["username"]:
        raise HTTPException(403, "This work order is assigned to another technician")
    allowed, target = WO_TRANSITIONS[action]
    if wo["status"] not in allowed:
        raise HTTPException(409, f"A work order that is {wo['status'].lower()} cannot be moved to {target.lower()}")
    if action == "cannot_complete" and not reason.strip():
        raise HTTPException(422, "A reason is required")
    if action == "complete":
        c = completion or {}
        if not c.get("actual_hours") or c["actual_hours"] <= 0:
            raise HTTPException(422, "Actual hours must be greater than zero")
        allowed_parts = {p["part_id"] for p in wo["parts"]}
        for pu in c.get("parts_used", []):
            if pu["part_id"] not in allowed_parts:
                raise HTTPException(422, f"Part {pu['part_id']} is not on this work order")
            if pu["qty"] < 0:
                raise HTTPException(422, "Part quantities cannot be negative")
        wo["completion"] = {"actual_hours": c["actual_hours"], "parts_used": [p for p in c.get("parts_used", []) if p["qty"] > 0],
                            "findings": (c.get("findings") or "").strip(), "follow_up_defect": bool(c.get("follow_up_defect")),
                            "completed_at": now()}

        def done(ops):
            ops.setdefault("completed_jobs", [])
            if wo["job_id"] not in ops["completed_jobs"]:
                ops["completed_jobs"].append(wo["job_id"])
            su = ops.setdefault("stock_used", {})
            for pu in wo["completion"]["parts_used"]:
                if not any(p["part_id"] == pu["part_id"] and p["source"].startswith("Cannibalised") for p in wo["parts"]):
                    su[pu["part_id"]] = su.get(pu["part_id"], 0) + pu["qty"]
        update("ops", done)
        if wo.get("defect_id"):
            _set_defect_status(wo["defect_id"], "Closed", user, f"Work order {wo['id']} completed")
    if action == "cannot_complete":
        wo["cannot_reason"] = reason.strip()
    wo["status"] = target
    wo["history"].append({"status": target, "by": user["name"], "role": user["role"], "at": now(), "comment": reason.strip() or None})
    _save_wo(wo)
    audit(user, f"Work order {target.lower()}", "work_order", wo["id"], comment=reason or None,
          detail=f"{wo['task']} on {wo['aircraft_id']}")
    if action == "cannot_complete":
        notify(_staff(wo["base_id"]), "work_order_blocked", f"Work order {wo['id']} cannot be completed: {reason.strip()}",
               "/planner/work-orders")
    return wo


def reassign(wo_id: str, technician: str, user: dict) -> dict:
    wo = get_wo(wo_id)
    if user["base_id"] != wo["base_id"]:
        raise HTTPException(403, f"Planner {user['base_id']} can only reassign work at base {user['base_id']}")
    if wo["status"] not in OPEN_WO:
        raise HTTPException(409, "Only open work orders can be reassigned")
    if technician not in [u["username"] for u in by_role("technician", wo["base_id"])]:
        raise HTTPException(422, f"{technician} is not a technician at base {wo['base_id']}")
    old = wo["technician"]
    wo["technician"] = technician
    wo["history"].append({"status": wo["status"], "by": user["name"], "role": user["role"], "at": now(), "comment": f"Reassigned from {old} to {technician}"})
    _save_wo(wo)
    audit(user, "Reassigned work order", "work_order", wo["id"], detail=f"{old} to {technician}")
    notify([technician], "work_order_assigned", f"Work order {wo['id']} assigned: {wo['task']} on {wo['aircraft_id']}",
           f"/technician/work-orders/{wo['id']}")
    return wo


# ------------------------------------------------------------------- defects --
def defects() -> list[dict]:
    return opstate.read("defects")


def get_defect(defect_id: str) -> dict:
    d = next((x for x in defects() if x["id"] == defect_id), None)
    if not d:
        raise HTTPException(404, f"Unknown defect {defect_id}")
    return d


def _save_defect(d: dict) -> None:
    def put(items):
        for i, x in enumerate(items):
            if x["id"] == d["id"]:
                items[i] = d
                return
        items.append(d)
    update("defects", put)


def _set_defect_status(defect_id: str, status: str, user: dict, comment: str | None) -> dict:
    d = get_defect(defect_id)
    d["status"] = status
    d["history"].append({"status": status, "by": user["name"], "role": user["role"], "at": now(), "comment": comment})
    _save_defect(d)
    audit(user, f"Defect {status.lower()}", "defect", d["id"], comment=comment, detail=f"{d['system']} on {d['aircraft_id']}")
    return d


def report_defect(body: dict, user: dict, fleet) -> dict:
    acs = fleet.aircraft_by_id()
    tail = body["aircraft_id"]
    if tail not in acs:
        raise HTTPException(422, f"Unknown aircraft {tail}")
    if acs[tail].base_id != user["base_id"]:
        raise HTTPException(403, f"{tail} is not at base {user['base_id']}")
    if body["system"] not in ops_config()["defect_systems"]:
        raise HTTPException(422, "Choose a system from the list")
    if not body["description"].strip():
        raise HTTPException(422, "A description is required")
    parts = {p.id for p in fleet.parts}
    bad = [p for p in body.get("suspected_parts", []) if p not in parts]
    if bad:
        raise HTTPException(422, f"Unknown part {', '.join(bad)}")
    d = {"id": "", "aircraft_id": tail, "base_id": acs[tail].base_id, "system": body["system"],
         "description": body["description"].strip(), "suspected_parts": body.get("suspected_parts", []),
         "serviceable": bool(body["serviceable"]), "reported_by": user["name"], "reported_by_username": user["username"],
         "reported_at": now(), "status": "Reported", "job_id": "", "closed_reason": None, "history": []}

    def add(items):
        d["id"] = next_id(items, "D-")
        d["job_id"] = f"{tail}-{d['id']}"
        d["history"].append({"status": "Reported", "by": user["name"], "role": user["role"], "at": now(),
                             "comment": None if d["serviceable"] else "Aircraft reported not serviceable"})
        items.append(d)
    update("defects", add)
    audit(user, "Reported defect", "defect", d["id"], detail=f"{d['system']} on {tail}; " + ("serviceable" if d["serviceable"] else "aircraft grounded"))
    notify(_staff(d["base_id"]), "defect_reported",
           f"Defect {d['id']} on {tail} ({d['system']})" + ("" if d["serviceable"] else ", aircraft grounded"), "/planner/defects")
    _replan_after_defect(d)
    return d


def _replan_after_defect(d: dict) -> None:
    """A new defect triggers a re-plan of the working draft (or a new draft)."""
    w = planning.working()
    if w and w["status"] == "Submitted":
        return
    plan = w or planning.create_or_get_working(SYSTEM_USER)
    if w:
        planning.run_optimizer(plan, SYSTEM_USER)


def review_defect(defect_id: str, user: dict) -> dict:
    d = get_defect(defect_id)
    _check_defect_base(d, user)
    if d["status"] != "Reported":
        raise HTTPException(409, "Only a reported defect can be put under review")
    return _set_defect_status(defect_id, "Under review", user, None)


def convert_defect(defect_id: str, user: dict) -> dict:
    d = get_defect(defect_id)
    _check_defect_base(d, user)
    if d["status"] not in ("Reported", "Under review"):
        raise HTTPException(409, f"A defect that is {d['status'].lower()} cannot be converted to a task")
    plan = planning.create_or_get_working(user)
    if plan["status"] not in planning.EDITABLE:
        raise HTTPException(409, "The working plan is awaiting approval; convert the defect after it is approved or returned")
    _set_defect_status(defect_id, "Planned", user, "Converted to a planned task")
    plan = planning.get(plan["id"])
    day = planning.place_earliest(plan, d["job_id"], user)
    return {"defect": get_defect(defect_id), "plan_id": plan["id"], "job_id": d["job_id"], "day": day}


def close_defect(defect_id: str, reason: str, user: dict) -> dict:
    d = get_defect(defect_id)
    _check_defect_base(d, user)
    if d["status"] == "Closed":
        raise HTTPException(409, "The defect is already closed")
    if not reason.strip():
        raise HTTPException(422, "A reason is required to close a defect")
    d = _set_defect_status(defect_id, "Closed", user, reason.strip())
    d["closed_reason"] = reason.strip()
    _save_defect(d)
    return d


def _check_defect_base(d: dict, user: dict) -> None:
    if user["role"] == "planner" and user["base_id"] != d["base_id"]:
        raise HTTPException(403, f"Planner {user['base_id']} can only act on defects at base {user['base_id']}")


# --------------------------------------------------------- notifications, audit --
def my_notifications(user: dict) -> list[dict]:
    return [n for n in reversed(opstate.read("notifications")) if n["user"] == user["username"]]


def mark_read(user: dict, note_id: str | None) -> None:
    def mark(items):
        for n in items:
            if n["user"] == user["username"] and (note_id is None or n["id"] == note_id):
                n["read"] = True
    update("notifications", mark)


def audit_log(user_f: str | None, role: str | None, obj_type: str | None, date_from: str | None, date_to: str | None) -> list[dict]:
    out = []
    for a in reversed(opstate.read("audit")):
        if user_f and a["user"] != user_f:
            continue
        if role and a["role"] != role:
            continue
        if obj_type and a["object_type"] != obj_type:
            continue
        if date_from and a["at"][:10] < date_from:
            continue
        if date_to and a["at"][:10] > date_to:
            continue
        out.append(a)
    return out
