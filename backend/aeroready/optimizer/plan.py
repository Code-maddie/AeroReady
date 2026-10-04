"""Build the state-aware planning problem, run baseline + CP-SAT, package results."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from aeroready.datastore import active_inputs
from aeroready.fleet.models import Fleet
from aeroready.opstate import apply_state
from aeroready.optimizer.baseline import reactive_plan
from aeroready.optimizer.cpsat import solve
from aeroready.optimizer.evaluate import Assignment, Plan, evaluate
from aeroready.optimizer.problem import Problem, Scenario, build_problem
from aeroready.optimizer.recommend import recommendations


def load_inputs() -> tuple[Fleet, dict]:
    """Active inputs: simulated scenario plus any uploaded sources."""
    return active_inputs()


def state_problem(scenario: Scenario | None = None) -> tuple[Fleet, Problem]:
    """Planning problem for a scenario with live operational state applied."""
    fleet, rul = load_inputs()
    return fleet, apply_state(build_problem(fleet, rul, scenario or Scenario()))


def _summary(p: Problem, plan: Plan, ev: dict) -> dict:
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


def compute_result(fleet: Fleet, p: Problem, opt: Plan, stats: dict, sc: Scenario) -> dict:
    """Score a schedule (optimiser output or an edited plan) against the reactive baseline."""
    t0 = time.perf_counter()
    opt = {j.id: opt.get(j.id, Assignment()) for j in p.jobs}
    reactive_log: dict = {}
    base = reactive_plan(p, reactive_log)
    eb = evaluate(p, base)
    eo = evaluate(p, opt)
    recs, orders = recommendations(p, base, opt, eb, eo)
    jobs = [{"id": j.id, "aircraft_id": j.aircraft_id, "base_id": j.base_id, "kind": j.kind,
             "name": j.name, "duration": j.duration, "tech_hours_per_day": j.hours, "parts": j.parts,
             "earliest": j.earliest, "latest": j.latest, "due": j.due, "hard_limit": j.hard_limit,
             "engine_id": j.engine_id, "failure_day": j.failure_day, "risk_start": j.risk_start,
             "defect_id": j.defect_id}
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
        "reactive_log": reactive_log,
        "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "elapsed_s": round(time.perf_counter() - t0, 2),
    }


def run_plan(scenario: Scenario | None = None, decisions: dict | None = None) -> dict:
    sc = scenario or Scenario()
    fleet, p = state_problem(sc)
    opt, stats = solve(p, decisions=decisions)
    res = compute_result(fleet, p, opt, stats, sc)
    if stats["solver_aircraft_days"] != res["optimized"]["aircraft_days"]:
        raise AssertionError(f"solver ({stats['solver_aircraft_days']}) and evaluator "
                             f"({res['optimized']['aircraft_days']}) disagree on aircraft-days")
    return res
