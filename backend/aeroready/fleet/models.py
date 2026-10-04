"""Common data model: health, technical records, spares and agency capacity.

Everything the planner needs is expressed in these pydantic models. Days are
integers relative to the plan start (Day 0); negative days are history.
All generated content is SYNTHETIC except the engine sensor trajectories,
which come from NASA C-MAPSS.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Base(BaseModel):
    id: str
    name: str
    region: str


class AgencyCapacity(BaseModel):
    """A maintenance agency (servicing flight) and what it can absorb per day."""
    agency_id: str
    base_id: str
    name: str
    bays: int = Field(ge=0)
    tech_hours_per_day: int = Field(ge=0)


class Part(BaseModel):
    id: str
    name: str
    category: Literal["engine", "airframe", "avionics", "consumable"]
    lead_time_days: int = Field(ge=0, description="Days from order to arrival")


class Arrival(BaseModel):
    day: int
    qty: int


class SparesStock(BaseModel):
    """Fleet-pooled stock for one part (central stores, ~same-day transfer)."""
    part_id: str
    on_hand: int
    inbound: list[Arrival] = []


class Grounding(BaseModel):
    """Pre-existing downtime that the planner cannot change."""
    reason: str
    since_day: int
    until_day: int                      # exclusive; may extend past the horizon
    occupies_bay: bool = False
    donor_parts: dict[str, int] = {}    # serviceable parts that could be cannibalised


class Engine(BaseModel):
    id: str
    aircraft_id: str
    position: int
    serial: str
    cmapss_dataset: Literal["FD001", "FD003"]
    cmapss_unit: int                    # test-set unit whose trajectory this engine follows
    cycles_observed: int                # cycles of sensor history available
    repair_part_id: str                 # part consumed by preventive/corrective engine work


class Aircraft(BaseModel):
    id: str                             # tail number
    type: str
    base_id: str
    sortie_rate: float                  # engine cycles flown per day
    engine_ids: list[str]
    grounding: Optional[Grounding] = None


class MaintenanceTask(BaseModel):
    """A scheduled (calendar/hours-based) inspection with a due window."""
    id: str
    aircraft_id: str
    base_id: str
    kind: Literal["scheduled"] = "scheduled"
    name: str
    window_open: int                    # earliest permitted start day
    due_day: int                        # latest start without a deferral
    defer_max_days: int = 0             # authorised deferral beyond due (with penalty)
    duration_days: int
    tech_hours_per_day: int
    parts: list[str] = []


class MaintenanceLogEntry(BaseModel):
    id: str
    aircraft_id: str
    day: int                            # negative = days before Day 0
    category: Literal["inspection", "snag", "component_change", "engine", "servicing"]
    description: str
    tech_hours: int
    engine_id: Optional[str] = None


class EngineTaskTemplate(BaseModel):
    """How engine work is modelled once a RUL forecast exists."""
    preventive_duration_days: int
    preventive_tech_hours_per_day: int
    corrective_duration_days: int       # unplanned failure: troubleshooting + collateral checks
    corrective_tech_hours_per_day: int


class Fleet(BaseModel):
    synthetic: bool = True
    data_notice: str
    seed: int
    start_date: str
    horizon_days: int
    bases: list[Base]
    agencies: list[AgencyCapacity]
    aircraft: list[Aircraft]
    engines: list[Engine]
    parts: list[Part]
    stock: list[SparesStock]
    tasks: list[MaintenanceTask]
    log: list[MaintenanceLogEntry]
    engine_task: EngineTaskTemplate
    planted_tensions: list[str]         # documented so the demo story is auditable

    # ---- convenience lookups -------------------------------------------------
    def aircraft_by_id(self) -> dict[str, Aircraft]:
        return {a.id: a for a in self.aircraft}

    def engine_by_id(self) -> dict[str, Engine]:
        return {e.id: e for e in self.engines}

    def part_by_id(self) -> dict[str, Part]:
        return {p.id: p for p in self.parts}

    def agency_by_base(self) -> dict[str, AgencyCapacity]:
        return {a.base_id: a for a in self.agencies}
