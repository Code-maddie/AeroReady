"""Deterministic SYNTHETIC fleet generator.

Engines follow real NASA C-MAPSS test trajectories so sensor health is
realistic; everything else (tails, bases, inspections, spares, logs) is
synthetic. A handful of aircraft are scripted to plant the tensions the
optimizer is meant to resolve; the rest of the fleet is drawn from a seeded RNG.
"""
from __future__ import annotations

import numpy as np

from aeroready.config import HORIZON_DAYS, SEED, START_DATE
from aeroready.fleet.models import (
    AgencyCapacity, Aircraft, Arrival, Base, Engine, EngineTaskTemplate, Fleet,
    Grounding, MaintenanceLogEntry, MaintenanceTask, Part, SparesStock,
)
from aeroready.rul.cmapss import load_split, load_test_rul

TWIN = "TMR-2 twin-engine multirole"
SINGLE = "SLT-1 single-engine lead-in trainer"

BASES = [
    Base(id="BN", name="North Sector Air Base", region="North"),
    Base(id="BC", name="Central Sector Air Base", region="Central"),
    Base(id="BS", name="Southern Sector Air Base", region="South"),
]
AGENCIES = [
    AgencyCapacity(agency_id="SF-BN", base_id="BN", name="BN Servicing Flight", bays=4, tech_hours_per_day=64),
    AgencyCapacity(agency_id="SF-BC", base_id="BC", name="BC Servicing Flight", bays=3, tech_hours_per_day=48),
    # Tension: Southern base is the bay bottleneck (8 aircraft, 2 bays).
    AgencyCapacity(agency_id="SF-BS", base_id="BS", name="BS Servicing Flight", bays=2, tech_hours_per_day=32),
]

PARTS = [
    Part(id="P01", name="HPC module", category="engine", lead_time_days=21),
    Part(id="P02", name="Fuel nozzle kit", category="engine", lead_time_days=7),
    Part(id="P03", name="HPC seal kit", category="engine", lead_time_days=10),
    Part(id="P04", name="Main bearing assembly", category="engine", lead_time_days=14),
    Part(id="P05", name="Hydraulic pump", category="airframe", lead_time_days=6),
    Part(id="P06", name="Landing-gear actuator", category="airframe", lead_time_days=12),
    Part(id="P07", name="Brake unit", category="airframe", lead_time_days=4),
    Part(id="P08", name="Radar T/R module", category="avionics", lead_time_days=18),
    Part(id="P09", name="Inspection consumables kit", category="consumable", lead_time_days=3),
    Part(id="P10", name="Borescope consumables kit", category="consumable", lead_time_days=3),
    Part(id="P11", name="Hydraulic filter kit", category="consumable", lead_time_days=3),
]

STOCK = [
    # Tension: the HPC module has the longest lead time and none on the shelf.
    SparesStock(part_id="P01", on_hand=0),
    SparesStock(part_id="P02", on_hand=2, inbound=[Arrival(day=12, qty=2)]),
    SparesStock(part_id="P03", on_hand=1),
    SparesStock(part_id="P04", on_hand=0),
    SparesStock(part_id="P05", on_hand=2),
    SparesStock(part_id="P06", on_hand=1),
    SparesStock(part_id="P07", on_hand=3, inbound=[Arrival(day=5, qty=2)]),
    SparesStock(part_id="P08", on_hand=0, inbound=[Arrival(day=9, qty=1)]),
    SparesStock(part_id="P09", on_hand=8),
    SparesStock(part_id="P10", on_hand=4),
    SparesStock(part_id="P11", on_hand=5),
]

# name, duration_days, tech_hours_per_day, window_width, defer_max_days, parts
INSPECTIONS = {
    "PHASE": ("Phase inspection (150 FH)", 3, 12, 10, 3, ["P09"]),
    "LG": ("Landing-gear inspection", 2, 8, 10, 0, ["P07"]),
    "CAL": ("Calendar inspection (90-day)", 4, 16, 14, 5, ["P09"]),
    "AVX": ("Avionics functional check", 1, 6, 7, 0, []),
    "HYD": ("Hydraulic system servicing", 1, 8, 7, 2, ["P11"]),
}

ENGINE_TASK = EngineTaskTemplate(
    preventive_duration_days=3, preventive_tech_hours_per_day=12,
    corrective_duration_days=6, corrective_tech_hours_per_day=12,
)

SINGLE_ENGINE_TAILS = {"A-06", "A-07", "A-08", "A-14", "A-15", "A-16", "A-23", "A-24"}

# Engines scripted to degrade inside the horizon:
# tail -> (target true-RUL in days, sortie rate, part needed for engine work)
AT_RISK = {
    "A-20": (7, 1.6, "P01"),    # needs the zero-stock, 21-day-lead HPC module
    "A-05": (10, 1.5, "P03"),   # competes with A-18 for the single HPC seal kit
    "A-03": (12, 1.4, "P02"),
    "A-18": (15, 1.5, "P03"),
    "A-10": (19, 1.3, "P04"),   # bearing: 0 stock, 14-day lead -> must order on Day 0
    "A-14": (23, 1.2, "P02"),
    "A-23": (26, 1.2, "P02"),
}

# Scripted inspections: (tail, inspection code, due_day). Southern base cluster
# (days 11-15) over-subscribes its 2 bays if everything waits until hard-due.
PLANTED_INSPECTIONS = [
    ("A-20", "PHASE", 12),   # A-20 has two inspections whose windows overlap
    ("A-20", "LG", 13),      # -> can be bundled with its engine work
    ("A-17", "CAL", 13),
    ("A-18", "PHASE", 12),
    ("A-19", "LG", 13),
    ("A-21", "PHASE", 14),
    ("A-22", "AVX", 12),
    ("A-24", "CAL", 15),
]

DONOR_TAIL = "A-12"
# A deferred radar defect that needs the part the donor also holds.
RADAR_TASK = ("A-15", "Radar T/R module replacement (deferred defect)", 6, 0, 1, 10, ["P08"])


def _tail(i: int) -> str:
    return f"A-{i:02d}"


def _base_for(i: int) -> str:
    return "BN" if i <= 8 else ("BC" if i <= 16 else "BS")


def _candidate_units() -> list[tuple[str, int, int, int]]:
    """(dataset, unit, true_rul, cycles_observed) for every C-MAPSS test unit."""
    out = []
    for ds in ("FD001", "FD003"):
        test = load_split(ds, "test")
        lengths = test.groupby("unit")["cycle"].max()
        rul = load_test_rul(ds)
        for unit, n in lengths.items():
            out.append((ds, int(unit), int(rul[unit - 1]), int(n)))
    return out


def generate_fleet(seed: int = SEED) -> Fleet:
    rng = np.random.default_rng(seed)
    candidates = _candidate_units()
    used: set[tuple[str, int]] = set()

    def pick_unit(target_cycles: float | None) -> tuple[str, int, int, int]:
        if target_cycles is None:
            # Healthy engine: long remaining life, decent history.
            pool = [c for c in candidates if c[2] >= 100 and c[3] >= 60 and (c[0], c[1]) not in used]
            choice = pool[int(rng.integers(len(pool)))]
        else:
            # Degrading engine: long observed history so the forecast is credible.
            pool = [c for c in candidates if c[3] >= 120 and (c[0], c[1]) not in used]
            choice = min(pool, key=lambda c: (abs(c[2] - target_cycles), c[0], c[1]))
        used.add((choice[0], choice[1]))
        return choice

    aircraft: list[Aircraft] = []
    engines: list[Engine] = []
    for i in range(1, 25):
        tail = _tail(i)
        ac_type = SINGLE if tail in SINGLE_ENGINE_TAILS else TWIN
        n_eng = 1 if ac_type == SINGLE else 2
        risk = AT_RISK.get(tail)
        rate = risk[1] if risk else round(float(rng.uniform(1.0, 2.0)), 1)
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
                repair_part_id=risk[2] if at_risk else str(rng.choice(["P02", "P03", "P04"])),
            ))
        grounding = None
        if tail == DONOR_TAIL:
            grounding = Grounding(
                reason="AOG - awaiting depot structural repair (wing attach fitting crack)",
                since_day=-40, until_day=75, occupies_bay=False,
                donor_parts={"P01": 1, "P08": 1},
            )
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
    for i in range(1, 25):
        tail = _tail(i)
        if tail in planted_tails:
            continue
        for code in rng.choice(list(INSPECTIONS), size=int(rng.integers(1, 3)), replace=False):
            code = str(code)
            due = int(rng.integers(4, 45))
            if due - INSPECTIONS[code][3] < HORIZON_DAYS:    # window opens inside horizon
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
        data_notice="SYNTHETIC fleet data for demonstration. Engine sensor trajectories from NASA C-MAPSS.",
        seed=seed, start_date=START_DATE, horizon_days=HORIZON_DAYS,
        bases=BASES, agencies=AGENCIES, aircraft=aircraft, engines=engines,
        parts=PARTS, stock=STOCK, tasks=tasks, log=log, engine_task=ENGINE_TASK,
        planted_tensions=tensions,
    )
