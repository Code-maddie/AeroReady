"""Deterministic SYNTHETIC fleet generator.

Engines follow real NASA C-MAPSS test trajectories so sensor health is
realistic; everything else (tails, bases, inspections, spares, logs) is
synthetic. A handful of aircraft are scripted to plant the tensions the
optimizer is meant to resolve; the rest of the fleet is drawn from a seeded RNG.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from aeroready.fleet.models import (
    AgencyCapacity, Aircraft, Arrival, Base, Engine, EngineTaskTemplate, Fleet,
    Grounding, MaintenanceLogEntry, MaintenanceTask, Part, SparesStock,
)
from aeroready.rul.cmapss import load_split, load_test_rul

CONFIG_PATH = Path(__file__).with_name("scenario_config.json")


def load_scenario_config() -> dict:
    """Every assumption behind the simulated scenario lives in scenario_config.json."""
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


CFG = load_scenario_config()
TWIN = CFG["fleet"]["types"]["twin"]
SINGLE = CFG["fleet"]["types"]["single"]
BASES = [Base(**b) for b in CFG["bases"]]
AGENCIES = [AgencyCapacity(**a) for a in CFG["agencies"]]
PARTS = [Part(**p) for p in CFG["parts"]]
STOCK = [SparesStock(part_id=s["part_id"], on_hand=s["on_hand"], inbound=[Arrival(**a) for a in s["inbound"]])
         for s in CFG["stock"]]
# name, duration_days, tech_hours_per_day, window_width, defer_max_days, parts
INSPECTIONS = {k: (v["name"], v["duration_days"], v["tech_hours_per_day"], v["window_days"], v["defer_max_days"], v["parts"])
               for k, v in CFG["inspection_types"].items()}
ENGINE_TASK = EngineTaskTemplate(**CFG["engine_task"])
SINGLE_ENGINE_TAILS = set(CFG["fleet"]["single_engine_tails"])
# tail -> (target true-RUL in days, sortie rate, part needed for engine work)
AT_RISK = {e["tail"]: (e["target_true_rul_days"], e["sortie_rate"], e["repair_part"])
           for e in CFG["planted"]["at_risk_engines"]}
PLANTED_INSPECTIONS = [(i["tail"], i["type"], i["due_day"]) for i in CFG["planted"]["inspections"]]
DONOR = CFG["planted"]["donor"]
DONOR_TAIL = DONOR["tail"]
_dd = CFG["planted"]["deferred_defect"]
RADAR_TASK = (_dd["tail"], _dd["name"], _dd["due_day"], _dd["defer_max_days"], _dd["duration_days"],
              _dd["tech_hours_per_day"], _dd["parts"])
N_AIRCRAFT = CFG["fleet"]["aircraft_count"]


def _tail(i: int) -> str:
    return f"{CFG['fleet']['tail_prefix']}{i:02d}"


def _base_for(i: int) -> str:
    return next(b["base_id"] for b in CFG["fleet"]["base_assignment"] if b["first_tail"] <= i <= b["last_tail"])


def _candidate_units() -> list[tuple[str, int, int, int]]:
    """(dataset, unit, true_rul, cycles_observed) for every C-MAPSS test unit."""
    out = []
    for ds in CFG["engines"]["cmapss_datasets"]:
        test = load_split(ds, "test")
        lengths = test.groupby("unit")["cycle"].max()
        rul = load_test_rul(ds)
        for unit, n in lengths.items():
            out.append((ds, int(unit), int(rul[unit - 1]), int(n)))
    return out


def generate_fleet(seed: int | None = None) -> Fleet:
    seed = CFG["seed"] if seed is None else seed
    eng_cfg = CFG["engines"]
    rng = np.random.default_rng(seed)
    candidates = _candidate_units()
    used: set[tuple[str, int]] = set()

    def pick_unit(target_cycles: float | None) -> tuple[str, int, int, int]:
        if target_cycles is None:
            # Healthy engine: long remaining life, decent history.
            pool = [c for c in candidates if c[2] >= eng_cfg["healthy_min_true_rul_cycles"]
                    and c[3] >= eng_cfg["healthy_min_observed_cycles"] and (c[0], c[1]) not in used]
            choice = pool[int(rng.integers(len(pool)))]
        else:
            # Degrading engine: long observed history so the forecast is credible.
            pool = [c for c in candidates if c[3] >= eng_cfg["degrading_min_observed_cycles"] and (c[0], c[1]) not in used]
            choice = min(pool, key=lambda c: (abs(c[2] - target_cycles), c[0], c[1]))
        used.add((choice[0], choice[1]))
        return choice

    aircraft: list[Aircraft] = []
    engines: list[Engine] = []
    lo_rate, hi_rate = CFG["fleet"]["sortie_rate_range_cycles_per_day"]
    for i in range(1, N_AIRCRAFT + 1):
        tail = _tail(i)
        ac_type = SINGLE if tail in SINGLE_ENGINE_TAILS else TWIN
        n_eng = 1 if ac_type == SINGLE else 2
        risk = AT_RISK.get(tail)
        rate = risk[1] if risk else round(float(rng.uniform(lo_rate, hi_rate)), 1)
        eng_ids = []
        for pos in range(1, n_eng + 1):
            at_risk = risk is not None and pos == 1
            ds, unit, _true_rul, n_obs = pick_unit(risk[0] * rate if at_risk else None)
            eid = f"{tail}-E{pos}"
            eng_ids.append(eid)
            engines.append(Engine(
                id=eid, aircraft_id=tail, position=pos,
                serial=f"ESN-{int(rng.integers(10000, 99999))}",
                cmapss_dataset=ds, cmapss_unit=unit, cycles_observed=n_obs,
                repair_part_id=risk[2] if at_risk else str(rng.choice(eng_cfg["healthy_repair_parts"])),
            ))
        grounding = None
        if tail == DONOR_TAIL:
            grounding = Grounding(reason=DONOR["reason"], since_day=DONOR["since_day"],
                                  until_day=DONOR["until_day"], occupies_bay=DONOR["occupies_bay"],
                                  donor_parts=dict(DONOR["donor_parts"]))
        aircraft.append(Aircraft(id=tail, type=ac_type, base_id=_base_for(i),
                                 sortie_rate=rate, engine_ids=eng_ids, grounding=grounding))

    # ---- scheduled inspections -------------------------------------------
    tasks: list[MaintenanceTask] = []

    def add_inspection(tail: str, code: str, due: int) -> None:
        name, dur, hrs, width, defer, parts = INSPECTIONS[code]
        base = _base_for(int(tail[2:]))
        n = sum(1 for t in tasks if t.aircraft_id == tail) + 1
        tasks.append(MaintenanceTask(
            id=f"{tail}-T{n}", aircraft_id=tail, base_id=base, name=name,
            window_open=max(0, due - width), due_day=due, defer_max_days=defer,
            duration_days=dur, tech_hours_per_day=hrs, parts=list(parts),
        ))

    for tail, code, due in PLANTED_INSPECTIONS:
        add_inspection(tail, code, due)
    tail, name, due, defer, dur, hrs, parts = RADAR_TASK
    tasks.append(MaintenanceTask(
        id=f"{tail}-T1", aircraft_id=tail, base_id=_base_for(int(tail[2:])), name=name,
        window_open=0, due_day=due, defer_max_days=defer, duration_days=dur,
        tech_hours_per_day=hrs, parts=parts,
    ))

    planted_tails = {t for t, _, _ in PLANTED_INSPECTIONS} | {RADAR_TASK[0], DONOR_TAIL}
    ri = CFG["random_inspections"]
    for i in range(1, N_AIRCRAFT + 1):
        tail = _tail(i)
        if tail in planted_tails:
            continue
        n_insp = int(rng.integers(ri["per_aircraft_min"], ri["per_aircraft_max"] + 1))
        for code in rng.choice(list(INSPECTIONS), size=n_insp, replace=False):
            code = str(code)
            due = int(rng.integers(ri["due_day_min"], ri["due_day_max"] + 1))
            if due - INSPECTIONS[code][3] < CFG["horizon_days"]:    # window opens inside horizon
                add_inspection(tail, code, due)

    # ---- 60-day maintenance history ---------------------------------------
    log: list[MaintenanceLogEntry] = []
    snags = [
        ("snag", "Pilot report: intermittent UHF radio drop-out; connector reseated", 3),
        ("snag", "Hydraulic seep at nose-gear steering actuator; seal replaced", 6),
        ("snag", "Cockpit display flicker; MFD reseated, BIT pass", 2),
        ("snag", "Bird strike inspection, no damage found", 4),
        ("servicing", "Engine compressor wash (both engines)", 5),
        ("servicing", "Oxygen system replenished and leak-checked", 2),
        ("component_change", "Main wheel tyre changed (wear limit)", 3),
        ("component_change", "Brake unit replaced (wear pin at limit)", 6),
        ("inspection", "Weekly inspection completed, nil defects", 4),
        ("inspection", "Pre-phase borescope: nil findings", 5),
    ]
    eng_by_ac: dict[str, list[str]] = {}
    for e in engines:
        eng_by_ac.setdefault(e.aircraft_id, []).append(e.id)
    for ac in aircraft:
        days = sorted(rng.choice(np.arange(-60, 0), size=int(rng.integers(3, 7)), replace=False))
        for d in days:
            cat, desc, hrs = snags[int(rng.integers(len(snags)))]
            log.append(MaintenanceLogEntry(
                id=f"{ac.id}-L{len(log) + 1}", aircraft_id=ac.id, day=int(d),
                category=cat, description=desc, tech_hours=int(hrs)))
        if ac.id in AT_RISK:
            eid = eng_by_ac[ac.id][0]
            log.append(MaintenanceLogEntry(
                id=f"{ac.id}-L{len(log) + 1}", aircraft_id=ac.id, day=int(rng.integers(-20, -5)),
                category="engine", engine_id=eid, tech_hours=2,
                description=f"{eid} trend monitoring: rising HPC outlet temperature noted; no limit exceeded"))
        if ac.grounding:
            log.append(MaintenanceLogEntry(
                id=f"{ac.id}-L{len(log) + 1}", aircraft_id=ac.id, day=ac.grounding.since_day,
                category="inspection", tech_hours=14,
                description="Crack found at wing attach fitting during NDT; aircraft declared AOG, depot team requested"))
    log.sort(key=lambda e: (e.aircraft_id, e.day))

    tensions = [
        "P01 HPC module: 0 on hand, 21-day lead time; A-20 engine E1 forecast to fail around Day 7.",
        "A-12 is AOG for the whole horizon (structural repair) and holds a serviceable HPC module and radar T/R module.",
        "A-20 has a phase inspection and a landing-gear inspection with overlapping windows (bundling opportunity).",
        "Southern base (BS) has only 2 bays; six inspections fall hard-due on Days 12-15.",
        "A-05 and A-18 both need the single HPC seal kit on the shelf.",
        "A-10 bearing has 0 stock and a 14-day lead: ordering on failure is too late.",
        "A-15 radar defect is due Day 6 but the only inbound T/R module arrives Day 9.",
    ]
    return Fleet(
        data_notice="Simulated fleet scenario. Engine sensor trajectories from NASA C-MAPSS.",
        seed=seed, start_date=CFG["start_date"], horizon_days=CFG["horizon_days"],
        bases=BASES, agencies=AGENCIES, aircraft=aircraft, engines=engines,
        parts=PARTS, stock=STOCK, tasks=tasks, log=log, engine_task=ENGINE_TASK,
        planted_tensions=tensions,
    )
