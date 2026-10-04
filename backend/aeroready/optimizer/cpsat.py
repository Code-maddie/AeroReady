"""CP-SAT availability-first maintenance scheduler.

Time-indexed formulation: one boolean per (job, start day [, part source]).
Every rule the evaluator checks is mirrored here; after solving, the plan is
re-scored by the shared evaluator and the two availability totals must match.
"""
from __future__ import annotations

from dataclasses import dataclass

from ortools.sat.python import cp_model

from aeroready.config import SEED, SOLVER_TIME_LIMIT_S
from aeroready.optimizer.evaluate import Assignment, Plan
from aeroready.optimizer.problem import CANNIBALISE_EARLIEST, Problem


@dataclass(frozen=True)
class Weights:
    aircraft_day: int = 100      # objective unit: one mission-ready aircraft-day
    risk_engine_day: int = 10    # flying an engine past its P10 forecast
    deferral_day: int = 20       # using authorised deferral
    cannibalization: int = 40    # extra labour, paperwork, donor disturbance
    unplanned_failure: int = 400 # safety + repair spilling past the horizon
    surge_shortfall: int = 1000  # per aircraft below the surge target per day
    carryover: int = 1000        # inspection due in-horizon pushed past the horizon
    spillover_day: int = 100     # downtime of a started job that falls after the horizon


def solve(p: Problem, w: Weights = Weights(), hint: Plan | None = None,
          time_limit_s: float = SOLVER_TIME_LIMIT_S) -> tuple[Plan, dict]:
    H = p.H
    m = cp_model.CpModel()

    # ---- decision variables ------------------------------------------------
    # x[j][s] -> list of (var, donor or None)
    x: dict[str, dict[int, list[tuple[cp_model.IntVar, str | None]]]] = {}
    for j in p.jobs:
        x[j.id] = {}
        donors = p.donors.get(j.parts[0], []) if len(j.parts) == 1 else []
        for s in range(max(0, j.earliest), min(H - 1, j.latest) + 1):
            opts = [(m.NewBoolVar(f"x[{j.id},{s}]"), None)]
            if s >= CANNIBALISE_EARLIEST:
                opts += [(m.NewBoolVar(f"xc[{j.id},{s},{dn}]"), dn) for dn, _ in donors]
            x[j.id][s] = opts

    def all_vars(jid):
        return [v for opts in x[jid].values() for v, _ in opts]

    def started_by(jid, d):
        return sum(v for s, opts in x[jid].items() if s <= d for v, _ in opts)

    def active(j, d):
        return sum(v for s, opts in x[j.id].items() if d - j.duration < s <= d for v, _ in opts)

    jobs_by_ac = {a: [j for j in p.jobs if j.aircraft_id == a] for a in p.aircraft}
    fail_terms = []
    for j in p.jobs:
        m.AddAtMostOne(all_vars(j.id))
        if j.kind == "corrective":
            prev = p.job(j.pair_id)
            # Corrective work only exists if preventive work did not happen.
            m.Add(sum(all_vars(j.id)) + sum(all_vars(prev.id)) <= 1)
            fail_terms.append(1 - sum(all_vars(prev.id)))

    # ---- aircraft downtime -------------------------------------------------
    down = {}
    avail_terms = []
    for a in p.aircraft:
        for d in range(H):
            if d in p.fixed_down[a]:
                continue                               # down regardless; contributes 0
            v = m.NewBoolVar(f"down[{a},{d}]")
            down[a, d] = v
            avail_terms.append(1 - v)
            for j in jobs_by_ac[a]:
                act = active(j, d)
                if not isinstance(act, int):
                    m.Add(v >= act)
                if j.kind == "scheduled" and d >= j.hard_limit:
                    m.Add(v >= 1 - started_by(j.id, d))
                if j.kind == "corrective" and d >= j.failure_day:
                    prev = p.job(j.pair_id)
                    m.Add(v >= 1 - sum(all_vars(prev.id)) - started_by(j.id, d))
    available_per_day = [
        sum(1 - down[a, d] for a in p.aircraft if (a, d) in down) for d in range(H)]

    # ---- capacity: bays (one per aircraft in work) and technician hours ----
    for b in p.bays:
        acs = [a for a in p.aircraft if p.base_of[a] == b]
        for d in range(H):
            in_bay = []
            for a in acs:
                acts = [active(j, d) for j in jobs_by_ac[a]]
                acts = [e for e in acts if not isinstance(e, int)]
                if not acts:
                    continue
                ib = m.NewBoolVar(f"inbay[{a},{d}]")
                for e in acts:
                    m.Add(ib >= e)
                in_bay.append(ib)
            if in_bay:
                m.Add(sum(in_bay) <= p.bays[b][d])
            load = [j.hours * active(j, d) for j in p.jobs if j.base_id == b]
            load = [e for e in load if not isinstance(e, int)]
            if load:
                m.Add(sum(load) <= p.hours[b][d])

    # ---- parts: stock + inbound until the lead time, or a donor ------------
    for part, sup in p.supply.items():
        users = [j for j in p.jobs if part in j.parts]
        if not users:
            continue
        for d in range(min(H, sup.lead_time)):
            used = [v for j in users for s, opts in x[j.id].items() if s <= d
                    for v, dn in opts if dn is None]
            if used:
                m.Add(sum(used) <= sup.by_day(d))
        for donor, qty in p.donors.get(part, []):
            taken = [v for j in users for opts in x[j.id].values() for v, dn in opts if dn == donor]
            if taken:
                m.Add(sum(taken) <= qty)

    # ---- penalties ---------------------------------------------------------
    risk = []
    deferral = []
    for j in p.jobs:
        if j.kind == "preventive":
            for d in range(j.risk_start, min(j.failure_day, H)):
                risk.append(1 - started_by(j.id, d))
        if j.kind == "scheduled":
            for s, opts in x[j.id].items():
                if s > j.due:
                    deferral += [(min(s, j.hard_limit) - j.due) * v for v, _ in opts]
    # Work that falls due inside the horizon must not be pushed past it: the
    # baseline does it in-horizon, so skipping it would flatter the optimiser.
    carryover = [1 - sum(all_vars(j.id)) for j in p.jobs
                 if j.kind == "scheduled" and j.due < H and x[j.id]]
    # Downtime pushed past the horizon is still downtime: charge it like an
    # in-horizon aircraft-day so late starts are not a free win.
    spill = [(s + j.duration - H) * v for j in p.jobs for s, opts in x[j.id].items()
             if s + j.duration > H for v, _ in opts]
    cann = [v for j in p.jobs for opts in x[j.id].values() for v, dn in opts if dn is not None]

    shortfall = []
    if p.surge:
        for d in range(p.surge.start_day, min(H - 1, p.surge.end_day) + 1):
            sf = m.NewIntVar(0, len(p.aircraft), f"short[{d}]")
            m.Add(sf >= p.surge.min_available - available_per_day[d])
            shortfall.append(sf)

    m.Maximize(
        w.aircraft_day * sum(avail_terms)
        - w.risk_engine_day * sum(risk)
        - w.deferral_day * sum(deferral)
        - w.cannibalization * sum(cann)
        - w.unplanned_failure * sum(fail_terms)
        - w.surge_shortfall * sum(shortfall)
        - w.carryover * sum(carryover)
        - w.spillover_day * sum(spill))

    if hint:
        for j in p.jobs:
            s = hint.get(j.id, Assignment()).start
            for s2, opts in x[j.id].items():
                for v, dn in opts:
                    m.AddHint(v, int(s2 == s and dn is None))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    # A single worker is deterministic (parallel workers can return different
    # tie-breaking plans). The tighter LP relaxation proves optimality in <1 s.
    solver.parameters.num_workers = 1
    solver.parameters.linearization_level = 2
    solver.parameters.random_seed = SEED
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(f"CP-SAT failed: {solver.StatusName(status)}")

    plan: Plan = {}
    for j in p.jobs:
        plan[j.id] = Assignment()
        for s, opts in x[j.id].items():
            for v, dn in opts:
                if solver.Value(v):
                    plan[j.id] = Assignment(start=s, cannibalized_from=dn)
    stats = {
        "status": solver.StatusName(status),
        "objective": solver.ObjectiveValue(),
        "best_bound": solver.BestObjectiveBound(),
        "wall_time_s": round(solver.WallTime(), 2),
        "solver_aircraft_days": int(sum(solver.Value(t) for t in avail_terms)),
        "num_booleans": sum(len(o) for jx in x.values() for o in jx.values()),
    }
    return plan, stats
