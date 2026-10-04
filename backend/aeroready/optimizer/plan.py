"""Run reactive baseline + CP-SAT for a scenario and package the result."""
from __future__ import annotations

import json
import time
from functools import lru_cache

from aeroready.config import RUL_PATH
from aeroready.fleet.models import Fleet
from aeroready.fleet.store import load_fleet
from aeroready.optimizer.baseline import reactive_plan
from aeroready.optimizer.cpsat import solve
from aeroready.optimizer.evaluate import evaluate
from aeroready.optimizer.problem import Problem, Scenario, build_problem
from aeroready.optimizer.recommend import recommendations


@lru_cache(maxsize=1)
def load_inputs() -> tuple[Fleet, dict]:
    return load_fleet(), json.loads(RUL_PATH.read_text())


def _summary(p: Problem, plan, ev: dict) -> dict:
    gantt = [{"aircraft_id": a, "base_id": p.base_of[a], "blocks": ev["blocks"][a],
              "available_days": ev["per_aircraft_available_days"][a]} for a in p.aircraft]
    starts = {j: (asg.start, asg.cannibalized_from) for j, asg in plan.items()}
    return {
        "aircraft_days": ev["aircraft_days"],
        "available_per_day": ev["available_per_day"],
        "avg_available": round(ev["aircraft_days"] / p.H, 1),
        "unplanned_failures": ev["failures"],
        "risk_engine_days": ev["risk_engine_days"],
        "deferral_days": ev["deferral_days"],
        "spillover_days": ev["spillover_days"],
        "cannibalizations": ev["cannibalizations"],
        "carried_over": ev["carried_over"],
        "surge_shortfall": ev["surge_shortfall"],
        "violations": ev["violations"],
        "gantt": gantt,
        "starts": starts,
        "bay_use": ev["bay_use"],
        "hour_use": ev["hour_use"],
    }


def run_plan(scenario: Scenario | None = None) -> dict:
    fleet, rul = load_inputs()
    sc = scenario or Scenario()
    p = build_problem(fleet, rul, sc)
    t0 = time.perf_counter()
    base = reactive_plan(p)
    eb = evaluate(p, base)
    opt, stats = solve(p)
    eo = evaluate(p, opt)
    if stats["solver_aircraft_days"] != eo["aircraft_days"]:
        raise AssertionError(f"solver ({stats['solver_aircraft_days']}) and evaluator "
                             f"({eo['aircraft_days']}) disagree on aircraft-days")
    recs, orders = recommendations(p, base, opt, eb, eo)
    jobs = [{"id": j.id, "aircraft_id": j.aircraft_id, "base_id": j.base_id, "kind": j.kind,
             "name": j.name, "duration": j.duration, "tech_hours_per_day": j.hours, "parts": j.parts,
             "earliest": j.earliest, "latest": j.latest, "due": j.due, "hard_limit": j.hard_limit,
             "engine_id": j.engine_id, "failure_day": j.failure_day, "risk_start": j.risk_start}
            for j in p.jobs]
    return {
        "synthetic": True,
        "start_date": fleet.start_date,
        "horizon_days": p.H,
        "scenario": sc.model_dump(),
        "fleet_size": len(p.aircraft),
        "max_aircraft_days": sum(p.H - len(p.fixed_down[a]) for a in p.aircraft),
        "baseline": _summary(p, base, eb),
        "optimized": {**_summary(p, opt, eo), "solver": stats},
        "gain_aircraft_days": eo["aircraft_days"] - eb["aircraft_days"],
        "recommendations": recs,
        "part_orders": orders,
        "capacity": {"bays": p.bays, "tech_hours": p.hours},
        "jobs": jobs,
        "forecasts_days": p.forecasts,
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }
