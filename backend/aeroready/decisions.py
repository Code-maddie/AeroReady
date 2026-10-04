"""Approve / reject decisions on optimiser recommendations.

A decision is an operational commitment, so it applies to every plan
(baseline and saved scenarios):

  approve  predictive / bundle / level / defer / cannibalize
           -> lock that job to that start day (and part source)
  approve  order        -> record the order as placed (the plan already assumes it)
  reject   predictive   -> no preventive work on that engine in the horizon
  reject   cannibalize  -> do not take the part from the donor for that job
  reject   bundle / level / defer -> not on that day; the optimiser picks another
  reject   order        -> no new orders of that part inside the horizon
"""
from __future__ import annotations

import hashlib
import json
import threading
from datetime import datetime, timezone

from aeroready.config import DATA_DIR

DECISIONS_PATH = DATA_DIR / "decisions.json"
_lock = threading.Lock()

EFFECTS = {
    ("approve", "order"): "Order recorded as placed. The plan already assumes it.",
    ("approve", "other"): "Locked into the plan at this day and part source.",
    ("reject", "predictive"): "No preventive work on this engine inside the horizon; the engine may fail on its forecast day.",
    ("reject", "cannibalize"): "The part will not be taken from the donor for this job.",
    ("reject", "order"): "No new orders of this part inside the horizon; only stock and inbound deliveries are used.",
    ("reject", "other"): "The job will not be done on this day; the optimiser picks another.",
}


def effect_text(action: str, rec_type: str) -> str:
    return EFFECTS.get((action, rec_type)) or EFFECTS[(action, "other")]


def _read() -> list[dict]:
    if not DECISIONS_PATH.exists():
        return []
    return json.loads(DECISIONS_PATH.read_text(encoding="utf-8"))


def _write(items: list[dict]) -> None:
    DECISIONS_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")


def list_decisions() -> list[dict]:
    return _read()


def version() -> str:
    return hashlib.sha1(json.dumps(_read(), sort_keys=True).encode()).hexdigest()[:12]


def key(rec_type: str, job_id: str, part_id: str | None = None) -> str:
    return f"{rec_type}|{part_id if rec_type == 'order' else job_id}"


def add(rec: dict, action: str, user: dict, note: str) -> dict:
    with _lock:
        items = [d for d in _read() if d["key"] != key(rec["type"], rec["job_id"], rec.get("part_id"))]
        d = {
            "id": hashlib.sha1(f"{rec['type']}{rec['job_id']}{datetime.now().isoformat()}".encode()).hexdigest()[:10],
            "key": key(rec["type"], rec["job_id"], rec.get("part_id")),
            "action": action, "type": rec["type"], "job_id": rec["job_id"], "aircraft_id": rec["aircraft_id"],
            "base_id": rec["base_id"], "title": rec["title"], "start": rec.get("start"), "donor": rec.get("donor"),
            "part_id": rec.get("part_id"), "effect": effect_text(action, rec["type"]), "note": note.strip(),
            "by": user["name"], "role": user["role"],
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        _write([*items, d])
        return d


def remove(decision_id: str) -> dict:
    with _lock:
        items = _read()
        hit = next((d for d in items if d["id"] == decision_id), None)
        if not hit:
            raise KeyError(decision_id)
        _write([d for d in items if d["id"] != decision_id])
        return hit


def constraints() -> dict:
    """Translate decisions into optimiser constraints."""
    out = {"locks": {}, "forbid_starts": set(), "forbid_jobs": set(), "forbid_donor_jobs": set(), "no_order_parts": set()}
    for d in _read():
        t, a = d["type"], d["action"]
        if a == "approve" and t != "order" and d["start"] is not None:
            out["locks"][d["job_id"]] = (d["start"], d["donor"], d["id"])
        elif a == "reject":
            if t == "predictive":
                out["forbid_jobs"].add(d["job_id"])
            elif t == "cannibalize":
                out["forbid_donor_jobs"].add(d["job_id"])
            elif t == "order" and d["part_id"]:
                out["no_order_parts"].add(d["part_id"])
            elif d["start"] is not None:
                out["forbid_starts"].add((d["job_id"], d["start"]))
    return out
