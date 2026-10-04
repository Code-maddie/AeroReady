"""Saved what-if scenarios, stored as JSON on the backend."""
from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone

from aeroready.config import SCENARIOS_PATH
from aeroready.optimizer.problem import Scenario

BASELINE_ID = "baseline"
BASELINE_NAME = "Baseline scenario"
_lock = threading.Lock()


def _read() -> list[dict]:
    if not SCENARIOS_PATH.exists():
        return []
    return json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))


def _write(items: list[dict]) -> None:
    SCENARIOS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCENARIOS_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")


def list_scenarios() -> list[dict]:
    base = {"id": BASELINE_ID, "name": BASELINE_NAME, "created_at": None, "scenario": Scenario().model_dump()}
    return [base, *_read()]


def get(scenario_id: str | None) -> tuple[str, str, Scenario]:
    """(id, name, scenario). Unknown ids raise KeyError."""
    if not scenario_id or scenario_id == BASELINE_ID:
        return BASELINE_ID, BASELINE_NAME, Scenario()
    for s in _read():
        if s["id"] == scenario_id:
            return s["id"], s["name"], Scenario.model_validate(s["scenario"])
    raise KeyError(scenario_id)


def save(name: str, scenario: Scenario) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Scenario name must not be empty")
    with _lock:
        items = _read()
        if any(s["name"].lower() == name.lower() for s in items) or name.lower() == BASELINE_NAME.lower():
            raise ValueError(f"A scenario named '{name}' already exists")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "scenario"
        sid, n = slug, 2
        while any(s["id"] == sid for s in items) or sid == BASELINE_ID:
            sid, n = f"{slug}-{n}", n + 1
        item = {"id": sid, "name": name, "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "scenario": scenario.model_dump()}
        _write([*items, item])
        return item


def delete(scenario_id: str) -> None:
    with _lock:
        items = _read()
        if not any(s["id"] == scenario_id for s in items):
            raise KeyError(scenario_id)
        _write([s for s in items if s["id"] != scenario_id])
