"""Turn fleet + RUL forecasts + scenario into a flat planning problem.

Day semantics (horizon H, days 0..H-1):
  * A job started on day s is active (aircraft in a bay) on days s .. s+dur-1.
  * Scheduled inspection: may start from window_open; after due_day it is a
    deferral (penalised); if not started by due_day+defer_max (the hard limit)
    the aircraft is grounded from that day until the inspection starts.
  * Engine with forecast failure day F = floor(P50 days) < H: preventive work
    must start by F-1; otherwise the engine fails on day F, the aircraft is
    grounded from F and a longer corrective job is needed.
  * Flying an un-maintained engine on days in [floor(P10), F) accrues risk.
  * Parts: supply by day d = on hand + inbound arrived by d; from the lead
    time onward anything ordered on Day 0 has arrived (unlimited).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal, Optional

from pydantic import BaseModel, Field

from aeroready.config import HORIZON_DAYS
from aeroready.fleet.models import Fleet

UNLIMITED = 10**6
CANNIBALISE_EARLIEST = 1     # removal + transfer takes a day


# ---------------------------------------------------------------- scenario --
class PartDelay(BaseModel):
    part_id: str
    days: int = Field(ge=0, le=60)


class BayClosure(BaseModel):
    base_id: str
    start_day: int = Field(ge=0)
    end_day: int = Field(ge=0)       # inclusive
    bays_closed: int = Field(default=1, ge=1)


class Surge(BaseModel):
    start_day: int = Field(ge=0)
    end_day: int = Field(ge=0)       # inclusive
    min_available: int = Field(ge=0)


class SortieRate(BaseModel):
    """Set sorties (engine cycles) per day for one base or one aircraft."""
    scope: Literal["base", "aircraft"]
    id: str
    sorties_per_day: float = Field(gt=0, le=6)


class Scenario(BaseModel):
    part_delays: list[PartDelay] = []
    bay_closures: list[BayClosure] = []
    surge: Optional[Surge] = None
    sortie_rate_multiplier: float = Field(default=1.0, gt=0.2, le=3.0)
    sortie_rates: list[SortieRate] = []


# ---------------------------------------------------------------- problem --
@dataclass
class Job:
    id: str
    aircraft_id: str
    base_id: str
    kind: Literal["scheduled", "preventive", "corrective"]
    name: str
    duration: int
    hours: int
    parts: list[str]
    earliest: int                    # first allowed start day
    latest: int                      # last allowed start day inside the horizon
    due: Optional[int] = None        # scheduled: start after this = deferral
    hard_limit: Optional[int] = None # scheduled: latest start; not started -> grounded from this day
    engine_id: Optional[str] = None
    failure_day: Optional[int] = None  # preventive/corrective: forecast failure day (may be >= H)
    risk_start: Optional[int] = None   # preventive: floor(P10 days)
    pair_id: Optional[str] = None      # preventive <-> corrective
    defect_id: Optional[str] = None    # rectification task created from a reported defect


@dataclass
class PartSupply:
    part_id: str
    name: str
    on_hand: int
    inbound: list[tuple[int, int]]
    lead_time: int

    def by_day(self, d: int) -> int:
        if d >= self.lead_time:
            return UNLIMITED
        return self.on_hand + sum(q for day, q in self.inbound if day <= d)


@dataclass
class Problem:
    H: int
    aircraft: list[str]
    base_of: dict[str, str]
    fixed_down: dict[str, set[int]]
    bays: dict[str, list[int]]          # usable bays per base per day
    hours: dict[str, list[int]]
    jobs: list[Job]
    supply: dict[str, PartSupply]
    donors: dict[str, list[tuple[str, int]]]   # part -> [(donor aircraft, qty)]
    surge: Optional[Surge]
    scenario: Scenario
    forecasts: dict[str, dict] = field(default_factory=dict)   # engine -> rul days used
    fixed_labels: dict[str, str] = field(default_factory=dict)  # aircraft -> reason for fixed grounding

    def job(self, job_id: str) -> Job:
        return next(j for j in self.jobs if j.id == job_id)


def sortie_rate_for(ac_id: str, base_id: str, default: float, sc: Scenario) -> float:
    """Aircraft override beats base override beats the fleet-wide multiplier."""
    for scope, key in (("aircraft", ac_id), ("base", base_id)):
        hit = next((o for o in sc.sortie_rates if o.scope == scope and o.id == key), None)
        if hit:
            return hit.sorties_per_day
    return default * sc.sortie_rate_multiplier


def build_problem(fleet: Fleet, rul: dict, scenario: Scenario | None = None,
                  horizon: int = HORIZON_DAYS) -> Problem:
    sc = scenario or Scenario()
    H = horizon
    acs = fleet.aircraft_by_id()
    parts = fleet.part_by_id()
    engines = fleet.engine_by_id()
    tmpl = fleet.engine_task

    # Capacity per base per day, minus closures and bays held by fixed groundings.
    bays = {ag.base_id: [ag.bays] * H for ag in fleet.agencies}
    hours = {ag.base_id: [ag.tech_hours_per_day] * H for ag in fleet.agencies}
    for c in sc.bay_closures:
        for d in range(max(0, c.start_day), min(H - 1, c.end_day) + 1):
            bays[c.base_id][d] = max(0, bays[c.base_id][d] - c.bays_closed)

    fixed_down: dict[str, set[int]] = {a.id: set() for a in fleet.aircraft}
    donors: dict[str, list[tuple[str, int]]] = {}
    for a in fleet.aircraft:
        g = a.grounding
        if g is None:
            continue
        days = set(range(max(0, g.since_day), min(H, g.until_day)))
        fixed_down[a.id] = days
        if g.occupies_bay:
            for d in days:
                bays[a.base_id][d] = max(0, bays[a.base_id][d] - 1)
        # Only an aircraft grounded for the whole horizon is a safe donor.
        if g.since_day <= 0 and g.until_day >= H:
            for p, q in g.donor_parts.items():
                donors.setdefault(p, []).append((a.id, q))

    delay = {d.part_id: d.days for d in sc.part_delays}
    supply = {}
    for s in fleet.stock:
        extra = delay.get(s.part_id, 0)
        supply[s.part_id] = PartSupply(
            part_id=s.part_id, name=parts[s.part_id].name, on_hand=s.on_hand,
            inbound=[(a.day + extra, a.qty) for a in s.inbound],
            lead_time=parts[s.part_id].lead_time_days + extra)

    def grounded_all_horizon(ac_id: str) -> bool:
        return len(fixed_down[ac_id]) >= H

    jobs: list[Job] = []
    for t in fleet.tasks:
        if grounded_all_horizon(t.aircraft_id) or t.window_open >= H:
            continue
        jobs.append(Job(
            id=t.id, aircraft_id=t.aircraft_id, base_id=t.base_id, kind="scheduled",
            name=t.name, duration=t.duration_days, hours=t.tech_hours_per_day,
            parts=list(t.parts), earliest=t.window_open, latest=H - 1, due=t.due_day,
            hard_limit=t.due_day + t.defer_max_days))

    forecasts = {}
    for f in rul["engines"]:
        e = engines[f["engine_id"]]
        ac = acs[e.aircraft_id]
        if grounded_all_horizon(ac.id):
            continue
        rate = sortie_rate_for(ac.id, ac.base_id, ac.sortie_rate, sc)
        p10_d = f["rul_cycles"]["p10"] / rate
        p50_d = f["rul_cycles"]["p50"] / rate
        forecasts[e.id] = {"p10_days": round(p10_d, 1), "p50_days": round(p50_d, 1),
                           "p90_days": round(f["rul_cycles"]["p90"] / rate, 1)}
        risk_start = math.floor(p10_d)
        if risk_start >= H:
            continue                                     # healthy through the horizon
        F = math.floor(p50_d)
        pid = f"{e.id}-PM"
        jobs.append(Job(
            id=pid, aircraft_id=ac.id, base_id=ac.base_id, kind="preventive",
            name=f"Engine {e.position} predictive repair ({parts[e.repair_part_id].name})",
            duration=tmpl.preventive_duration_days, hours=tmpl.preventive_tech_hours_per_day,
            parts=[e.repair_part_id], earliest=0,
            latest=min(H - 1, max(F - 1, 0)), engine_id=e.id, failure_day=F,
            risk_start=risk_start, pair_id=f"{e.id}-CM" if F < H else None))
        if F < H:
            jobs.append(Job(
                id=f"{e.id}-CM", aircraft_id=ac.id, base_id=ac.base_id, kind="corrective",
                name=f"Engine {e.position} unplanned failure repair ({parts[e.repair_part_id].name})",
                duration=tmpl.corrective_duration_days, hours=tmpl.corrective_tech_hours_per_day,
                parts=[e.repair_part_id], earliest=F, latest=H - 1, engine_id=e.id,
                failure_day=F, pair_id=pid))

    return Problem(
        H=H, aircraft=[a.id for a in fleet.aircraft], base_of={a.id: a.base_id for a in fleet.aircraft},
        fixed_down=fixed_down, bays=bays, hours=hours, jobs=jobs, supply=supply, donors=donors,
        surge=sc.surge, scenario=sc, forecasts=forecasts)
