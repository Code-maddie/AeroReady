"""Active input data: the simulated scenario plus any user uploads.

Four sources mirror the fragmented systems in the problem statement:
engine health (HUMS / prognostics output), maintenance records (scheduled
work from technical records), spares inventory, and maintenance capacity.
An upload replaces one source; everything downstream is recomputed.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from aeroready.config import FLEET_PATH, RUL_PATH, UPLOAD_DIR
from aeroready.fleet.models import (
    AgencyCapacity, Arrival, Fleet, MaintenanceTask, Part, SparesStock,
)
from aeroready.fleet.store import load_fleet

MAX_ERRORS = 200


def _int(lo: int | None = None, hi: int | None = None) -> Callable[[str], int]:
    def conv(v: str) -> int:
        x = int(v)
        if lo is not None and x < lo:
            raise ValueError(f"must be >= {lo}")
        if hi is not None and x > hi:
            raise ValueError(f"must be <= {hi}")
        return x
    return conv


def _float(lo: float, hi: float) -> Callable[[str], float]:
    def conv(v: str) -> float:
        x = float(v)
        if not lo <= x <= hi:
            raise ValueError(f"must be between {lo} and {hi}")
        return x
    return conv


def _text(v: str) -> str:
    if not v.strip():
        raise ValueError("must not be empty")
    return v.strip()


def _optional(conv: Callable[[str], Any]) -> Callable[[str], Any]:
    return lambda v: None if v.strip() == "" else conv(v)


def _choice(options: list[str]) -> Callable[[str], str]:
    def conv(v: str) -> str:
        if v.strip() not in options:
            raise ValueError(f"must be one of {', '.join(options)}")
        return v.strip()
    return conv


# column name, converter, description
SOURCES: dict[str, dict] = {
    "engine_health": {
        "title": "Engine health",
        "system": "Health and usage monitoring / prognostics output",
        "columns": [
            ("engine_id", _text, "Engine identifier, must match an engine in the fleet (e.g. A-20-E1)"),
            ("rul_p10_cycles", _float(0, 1000), "Remaining useful life, 10th percentile, in engine cycles"),
            ("rul_p50_cycles", _float(0, 1000), "Remaining useful life, median, in engine cycles"),
            ("rul_p90_cycles", _float(0, 1000), "Remaining useful life, 90th percentile, in engine cycles"),
        ],
    },
    "maintenance_records": {
        "title": "Maintenance records",
        "system": "Technical records: scheduled inspections and deferred defects",
        "columns": [
            ("task_id", _text, "Unique task identifier"),
            ("aircraft_id", _text, "Tail number, must match an aircraft in the fleet"),
            ("name", _text, "Task description"),
            ("window_open", _int(0, 365), "Earliest permitted start, days from plan start"),
            ("due_day", _int(0, 365), "Latest start without deferral, days from plan start"),
            ("defer_max_days", _int(0, 60), "Authorised deferral beyond the due day, in days"),
            ("duration_days", _int(1, 60), "Days the aircraft is in the bay"),
            ("tech_hours_per_day", _int(1, 200), "Technician hours needed per day"),
            ("part_id", _optional(_text), "Part consumed at start (blank if none)"),
        ],
    },
    "spares": {
        "title": "Spares inventory",
        "system": "Logistics / stores system",
        "columns": [
            ("part_id", _text, "Unique part identifier"),
            ("name", _text, "Part name"),
            ("category", _choice(["engine", "airframe", "avionics", "consumable"]), "Part category"),
            ("lead_time_days", _int(0, 365), "Days from order to arrival"),
            ("on_hand", _int(0, 10000), "Serviceable units in stores now"),
            ("inbound_day", _optional(_int(0, 365)), "Arrival day of an inbound delivery (blank if none)"),
            ("inbound_qty", _optional(_int(1, 10000)), "Quantity of that delivery (blank if none)"),
        ],
    },
    "capacity": {
        "title": "Maintenance capacity",
        "system": "Maintenance agency rosters and hangar allocation",
        "columns": [
            ("base_id", _text, "Base identifier, must match a fleet base"),
            ("agency_name", _text, "Maintenance agency"),
            ("bays", _int(0, 50), "Hangar bays available per day"),
            ("tech_hours_per_day", _int(0, 5000), "Technician hours available per day"),
        ],
    },
}


def _upload_path(source: str) -> Path:
    return UPLOAD_DIR / f"{source}.json"


def _load_upload(source: str) -> dict | None:
    p = _upload_path(source)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def data_version() -> str:
    """Changes whenever an upload is added, replaced or reset."""
    h = hashlib.sha1()
    for s in SOURCES:
        p = _upload_path(s)
        if p.exists():
            st = p.stat()
            h.update(f"{s}:{st.st_mtime_ns}:{st.st_size}".encode())
    return h.hexdigest()[:12]


def uploaded_sources() -> list[str]:
    return [s for s in SOURCES if _upload_path(s).exists()]


# ------------------------------------------------------------- applying --
def _apply(source: str, rows: list[dict], fleet: Fleet, rul: dict) -> None:
    acs = fleet.aircraft_by_id()
    if source == "engine_health":
        by_id = {r["engine_id"]: r for r in rows}
        for e in rul["engines"]:
            r = by_id.get(e["engine_id"])
            if not r:
                continue
            rate = acs[e["aircraft_id"]].sortie_rate
            e["rul_cycles"] = {"p10": r["rul_p10_cycles"], "p50": r["rul_p50_cycles"], "p90": r["rul_p90_cycles"]}
            e["rul_days"] = {k: round(v / rate, 1) for k, v in e["rul_cycles"].items()}
            e["forecast_source"] = "uploaded"
    elif source == "maintenance_records":
        fleet.tasks = [MaintenanceTask(
            id=r["task_id"], aircraft_id=r["aircraft_id"], base_id=acs[r["aircraft_id"]].base_id, name=r["name"],
            window_open=r["window_open"], due_day=r["due_day"], defer_max_days=r["defer_max_days"],
            duration_days=r["duration_days"], tech_hours_per_day=r["tech_hours_per_day"],
            parts=[r["part_id"]] if r["part_id"] else []) for r in rows]
    elif source == "spares":
        fleet.parts = [Part(id=r["part_id"], name=r["name"], category=r["category"],
                            lead_time_days=r["lead_time_days"]) for r in rows]
        fleet.stock = [SparesStock(part_id=r["part_id"], on_hand=r["on_hand"],
                                   inbound=[Arrival(day=r["inbound_day"], qty=r["inbound_qty"])]
                                   if r["inbound_day"] is not None else []) for r in rows]
    elif source == "capacity":
        old = fleet.agency_by_base()
        fleet.agencies = [AgencyCapacity(
            agency_id=old[r["base_id"]].agency_id if r["base_id"] in old else f"SF-{r['base_id']}",
            base_id=r["base_id"], name=r["agency_name"], bays=r["bays"],
            tech_hours_per_day=r["tech_hours_per_day"]) for r in rows]


def base_inputs() -> tuple[Fleet, dict]:
    return load_fleet(FLEET_PATH), json.loads(RUL_PATH.read_text(encoding="utf-8"))


def active_inputs() -> tuple[Fleet, dict]:
    fleet, rul = base_inputs()
    for e in rul["engines"]:
        e.setdefault("forecast_source", "model")
    # Spares first: maintenance records are validated against the active part list.
    for source in ("spares", "capacity", "maintenance_records", "engine_health"):
        up = _load_upload(source)
        if up:
            _apply(source, up["rows"], fleet, rul)
    return fleet, rul


# ------------------------------------------------------------ templates --
def current_rows(source: str) -> list[dict]:
    fleet, rul = active_inputs()
    if source == "engine_health":
        return [{"engine_id": e["engine_id"], "rul_p10_cycles": e["rul_cycles"]["p10"],
                 "rul_p50_cycles": e["rul_cycles"]["p50"], "rul_p90_cycles": e["rul_cycles"]["p90"]}
                for e in rul["engines"]]
    if source == "maintenance_records":
        return [{"task_id": t.id, "aircraft_id": t.aircraft_id, "name": t.name, "window_open": t.window_open,
                 "due_day": t.due_day, "defer_max_days": t.defer_max_days, "duration_days": t.duration_days,
                 "tech_hours_per_day": t.tech_hours_per_day, "part_id": t.parts[0] if t.parts else ""}
                for t in fleet.tasks]
    if source == "spares":
        parts = fleet.part_by_id()
        out = []
        for s in fleet.stock:
            p = parts[s.part_id]
            inb = s.inbound[0] if s.inbound else None
            out.append({"part_id": p.id, "name": p.name, "category": p.category, "lead_time_days": p.lead_time_days,
                        "on_hand": s.on_hand, "inbound_day": inb.day if inb else "",
                        "inbound_qty": inb.qty if inb else ""})
        return out
    if source == "capacity":
        return [{"base_id": a.base_id, "agency_name": a.name, "bays": a.bays,
                 "tech_hours_per_day": a.tech_hours_per_day} for a in fleet.agencies]
    raise KeyError(source)


def template_csv(source: str) -> str:
    cols = [c[0] for c in SOURCES[source]["columns"]]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for r in current_rows(source):
        w.writerow(r)
    return buf.getvalue()


# ----------------------------------------------------------- validation --
def validate(source: str, text: str) -> tuple[list[dict], list[dict]]:
    """Returns (rows, errors). Errors: {row, column, message}; row 1 = first data row."""
    spec = SOURCES[source]["columns"]
    errors: list[dict] = []
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    header = [h.strip() for h in (reader.fieldnames or [])]
    expected = [c[0] for c in spec]
    missing = [c for c in expected if c not in header]
    extra = [c for c in header if c not in expected]
    for c in missing:
        errors.append({"row": 0, "column": c, "message": "required column is missing from the header"})
    for c in extra:
        errors.append({"row": 0, "column": c, "message": "unknown column"})
    if missing:
        return [], errors

    rows: list[dict] = []
    for i, raw in enumerate(reader, start=1):
        row: dict = {}
        for name, conv, _ in spec:
            v = (raw.get(name) or "")
            try:
                row[name] = conv(v)
            except (ValueError, TypeError) as exc:
                msg = str(exc) if str(exc).startswith("must") else f"invalid value '{v}'"
                errors.append({"row": i, "column": name, "message": msg})
        rows.append(row)
        if len(errors) >= MAX_ERRORS:
            break
    if not rows and not errors:
        errors.append({"row": 0, "column": "", "message": "file has a header but no data rows"})
    if errors:
        return rows, errors[:MAX_ERRORS]
    errors += _cross_checks(source, rows)
    return rows, errors[:MAX_ERRORS]


def _dupes(rows: list[dict], key: str) -> list[dict]:
    seen, out = set(), []
    for i, r in enumerate(rows, start=1):
        if r[key] in seen:
            out.append({"row": i, "column": key, "message": f"duplicate value '{r[key]}'"})
        seen.add(r[key])
    return out


def _cross_checks(source: str, rows: list[dict]) -> list[dict]:
    fleet, rul = active_inputs()
    acs = fleet.aircraft_by_id()
    parts = {p.id for p in fleet.parts}
    errs: list[dict] = []
    if source == "engine_health":
        engines = {e["engine_id"] for e in rul["engines"]}
        errs += _dupes(rows, "engine_id")
        for i, r in enumerate(rows, start=1):
            if r["engine_id"] not in engines:
                errs.append({"row": i, "column": "engine_id", "message": f"unknown engine '{r['engine_id']}'"})
            if not r["rul_p10_cycles"] <= r["rul_p50_cycles"] <= r["rul_p90_cycles"]:
                errs.append({"row": i, "column": "rul_p50_cycles", "message": "requires P10 <= P50 <= P90"})
    elif source == "maintenance_records":
        errs += _dupes(rows, "task_id")
        for i, r in enumerate(rows, start=1):
            if r["aircraft_id"] not in acs:
                errs.append({"row": i, "column": "aircraft_id", "message": f"unknown aircraft '{r['aircraft_id']}'"})
            if r["window_open"] > r["due_day"]:
                errs.append({"row": i, "column": "window_open", "message": "must be on or before due_day"})
            if r["part_id"] and r["part_id"] not in parts:
                errs.append({"row": i, "column": "part_id", "message": f"unknown part '{r['part_id']}'"})
    elif source == "spares":
        errs += _dupes(rows, "part_id")
        new_parts = {r["part_id"] for r in rows}
        for i, r in enumerate(rows, start=1):
            if (r["inbound_day"] is None) != (r["inbound_qty"] is None):
                errs.append({"row": i, "column": "inbound_qty", "message": "inbound_day and inbound_qty go together"})
        needed = {e.repair_part_id for e in fleet.engines} | {p for t in fleet.tasks for p in t.parts}
        for p in sorted(needed - new_parts):
            errs.append({"row": 0, "column": "part_id",
                         "message": f"part '{p}' is used by engines or scheduled tasks but missing from the file"})
    elif source == "capacity":
        errs += _dupes(rows, "base_id")
        bases = {b.id for b in fleet.bases}
        for i, r in enumerate(rows, start=1):
            if r["base_id"] not in bases:
                errs.append({"row": i, "column": "base_id", "message": f"unknown base '{r['base_id']}'"})
        for b in sorted(bases - {r["base_id"] for r in rows}):
            errs.append({"row": 0, "column": "base_id", "message": f"base '{b}' is missing from the file"})
    return errs


def store_upload(source: str, rows: list[dict], filename: str) -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    _upload_path(source).write_text(json.dumps({
        "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "filename": filename, "rows": rows}), encoding="utf-8")


def reset() -> None:
    for s in SOURCES:
        _upload_path(s).unlink(missing_ok=True)


def _mtime(p: Path) -> str:
    return datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")


def sources_info() -> list[dict]:
    out = []
    for key, spec in SOURCES.items():
        up = _load_upload(key)
        if up:
            origin, updated, rows = "User upload", up["uploaded_at"], len(up["rows"])
            detail = f"Uploaded file: {up['filename']}"
        else:
            rows = len(current_rows(key))
            if key == "engine_health":
                origin = "NASA C-MAPSS + trained RUL model"
                updated = _mtime(RUL_PATH)
                detail = "Forecasts from LightGBM quantile models run on C-MAPSS test trajectories"
            else:
                origin = "Simulated fleet scenario"
                updated = _mtime(FLEET_PATH)
                detail = "Seeded scenario generator (see assumptions)"
        out.append({
            "id": key, "title": spec["title"], "system": spec["system"], "origin": origin, "detail": detail,
            "rows": rows, "last_updated": updated, "uploaded": bool(up),
            "schema": [{"name": n, "description": d} for n, _, d in spec["columns"]],
        })
    return out
