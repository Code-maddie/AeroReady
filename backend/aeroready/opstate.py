"""Operational state: plans, work orders, defects, notifications, audit log.

Stored as JSON under data/state/. `apply_state` folds the live state into a
planning problem so every plan, view and scenario reflects work done and
defects raised.
"""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone
from typing import Callable

from aeroready.config import DATA_DIR
from aeroready.fleet.generator import load_scenario_config
from aeroready.optimizer.problem import Job, Problem

STATE_DIR = DATA_DIR / "state"
_lock = threading.RLock()
STORES = ("plans", "work_orders", "defects", "notifications", "audit", "ops")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _path(name: str):
    return STATE_DIR / f"{name}.json"


def read(name: str):
    p = _path(name)
    if not p.exists():
        return {"completed_jobs": [], "stock_used": {}} if name == "ops" else []
    return json.loads(p.read_text(encoding="utf-8"))


def write(name: str, data) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _path(name).with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(_path(name))


def update(name: str, fn: Callable):
    """Read-modify-write under the state lock; returns fn's result."""
    with _lock:
        data = read(name)
        out = fn(data)
        write(name, data)
        return out


def version() -> str:
    """Changes whenever operational state that affects planning changes."""
    h = hashlib.sha1()
    for name in ("defects", "ops"):
        p = _path(name)
        if p.exists():
            h.update(p.read_bytes())
    return h.hexdigest()[:12]


def next_id(items: list[dict], prefix: str) -> str:
    n = max([int(x["id"].split("-")[-1]) for x in items if x["id"].startswith(prefix)] + [0]) + 1
    return f"{prefix}{n:04d}"


# ------------------------------------------------------------- audit, notify --
def audit(user: dict, action: str, obj_type: str, obj_id: str, comment: str | None = None, detail: str | None = None) -> None:
    def add(items: list):
        items.append({"id": next_id(items, "A-"), "at": now(), "user": user["username"], "name": user["name"],
                      "role": user["role"], "action": action, "object_type": obj_type, "object_id": obj_id,
                      "comment": comment or None, "detail": detail})
    update("audit", add)


def notify(usernames: list[str], kind: str, text: str, link: str) -> None:
    def add(items: list):
        for u in sorted(set(usernames)):
            items.append({"id": next_id(items, "N-"), "at": now(), "user": u, "kind": kind,
                          "text": text, "link": link, "read": False})
    if usernames:
        update("notifications", add)


SYSTEM_USER = {"username": "system", "name": "System", "role": "system"}


# ---------------------------------------------------------- apply to problem --
def apply_state(p: Problem) -> Problem:
    """Fold completed work, parts drawn and defects into a planning problem."""
    ops = read("ops")
    done = set(ops.get("completed_jobs", []))
    if done:
        engines_done = {j.engine_id for j in p.jobs if j.id in done and j.kind == "preventive"}
        p.jobs = [j for j in p.jobs if j.id not in done and not (j.engine_id in engines_done and j.kind in ("preventive", "corrective"))]
        for e in engines_done:
            p.forecasts.pop(e, None)
    for part, used in ops.get("stock_used", {}).items():
        if part in p.supply:
            p.supply[part].on_hand = max(0, p.supply[part].on_hand - int(used))

    cfg = load_scenario_config()["operations"]["defect_task"]
    H = p.H
    for d in read("defects"):
        tail = d["aircraft_id"]
        if tail not in p.base_of or len(p.fixed_down.get(tail, ())) >= H:
            continue
        if d["status"] in ("Reported", "Under review") and not d["serviceable"]:
            p.fixed_down[tail] = set(range(H))
            p.fixed_labels[tail] = f"Grounded: defect {d['id']} ({d['system']}), awaiting planning"
        elif d["status"] == "Planned" and d["job_id"] not in done:
            limit = 0 if not d["serviceable"] else H - 1
            p.jobs.append(Job(
                id=d["job_id"], aircraft_id=tail, base_id=p.base_of[tail], kind="scheduled",
                name=f"Defect {d['id']} rectification: {d['system']}",
                duration=cfg["duration_days"], hours=cfg["tech_hours_per_day"],
                parts=[x for x in d.get("suspected_parts", []) if x in p.supply],
                earliest=0, latest=H - 1, due=limit, hard_limit=limit, defect_id=d["id"]))
    return p
