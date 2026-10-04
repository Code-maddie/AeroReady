"""Evaluate any plan (baseline or optimised) under the same rules.

A plan maps job id -> Assignment. The evaluator derives aircraft downtime,
checks every capacity / parts / window rule, and produces the Gantt blocks.
Both strategies are scored here so the comparison is like-for-like.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from aeroready.optimizer.problem import CANNIBALISE_EARLIEST, Job, Problem


@dataclass
class Assignment:
    start: Optional[int] = None              # None = not started inside the horizon
    cannibalized_from: Optional[str] = None  # donor aircraft id


Plan = dict[str, Assignment]


def failed(job: Job, plan: Plan) -> bool:
    """For an engine whose forecast failure day is in-horizon: was preventive work skipped?"""
    prev_id = job.id if job.kind == "preventive" else job.pair_id
    return plan.get(prev_id, Assignment()).start is None


def evaluate(p: Problem, plan: Plan) -> dict:
    H = p.H
    down = {a: set(p.fixed_down[a]) for a in p.aircraft}
    in_work = {a: set() for a in p.aircraft}
    blocks: dict[str, list[dict]] = {a: [] for a in p.aircraft}
    violations: list[str] = []
    bay_use = {b: [0] * H for b in p.bays}
    hour_use = {b: [0] * H for b in p.hours}
    risk_days = defer_days = spill_days = 0
    failures, cannibalizations = [], []

    for a, days in p.fixed_down.items():
        if days:
            blocks[a].append({"kind": "aog", "start": min(days), "end": max(days),
                              "label": "AOG - fixed grounding", "job_id": None})

    for j in p.jobs:
        asg = plan.get(j.id, Assignment())
        s = asg.start
        is_failed = j.kind in ("preventive", "corrective") and j.failure_day < H and failed(j, plan)

        if j.kind == "corrective" and not is_failed:
            if s is not None:
                violations.append(f"{j.id}: corrective scheduled but engine did not fail")
            continue

        if s is not None:
            if not (j.earliest <= s <= j.latest):
                violations.append(f"{j.id}: start {s} outside [{j.earliest},{j.latest}]")
            if asg.cannibalized_from and s < CANNIBALISE_EARLIEST:
                violations.append(f"{j.id}: cannibalised part cannot arrive before day {CANNIBALISE_EARLIEST}")
            spill_days += max(0, s + j.duration - H)
            for d in range(s, min(H, s + j.duration)):
                down[j.aircraft_id].add(d)
                in_work[j.aircraft_id].add(d)
                hour_use[j.base_id][d] += j.hours
            blocks[j.aircraft_id].append({
                "kind": j.kind, "start": s, "end": min(H - 1, s + j.duration - 1),
                "label": j.name, "job_id": j.id, "cannibalized_from": asg.cannibalized_from,
                "extends_beyond_horizon": s + j.duration > H})
            if asg.cannibalized_from:
                part = j.parts[0]
                cannibalizations.append({"job_id": j.id, "aircraft_id": j.aircraft_id, "part_id": part,
                                         "part_name": p.supply[part].name, "donor": asg.cannibalized_from,
                                         "day": s})
                blocks[asg.cannibalized_from].append({
                    "kind": "cannibalization", "start": max(0, s - 1), "end": max(0, s - 1),
                    "label": f"Remove {p.supply[part].name} for {j.aircraft_id}", "job_id": j.id})

        # Downtime that is not hands-on work.
        if j.kind == "scheduled":
            if s is not None and s > j.due:
                defer_days += min(s, j.hard_limit) - j.due
            # hard_limit is the latest start day: if work has not started by
            # then, the aircraft may not fly from that day until it does.
            limit = j.hard_limit
            wait_end = (s - 1) if s is not None else H - 1
            if limit <= wait_end:
                for d in range(limit, wait_end + 1):
                    down[j.aircraft_id].add(d)
                blocks[j.aircraft_id].append({
                    "kind": "awaiting", "start": limit, "end": wait_end,
                    "label": f"Overdue - grounded awaiting {j.name}", "job_id": j.id})
        elif j.kind == "preventive":
            stop = s if s is not None else min(j.failure_day, H)
            risk_days += max(0, min(stop, j.failure_day, H) - j.risk_start)
        elif j.kind == "corrective":
            F = j.failure_day
            failures.append({"engine_id": j.engine_id, "aircraft_id": j.aircraft_id, "day": F,
                             "repair_start": s})
            wait_end = (s - 1) if s is not None else H - 1
            for d in range(F, wait_end + 1):
                down[j.aircraft_id].add(d)
            if F <= wait_end:
                blocks[j.aircraft_id].append({
                    "kind": "awaiting", "start": F, "end": wait_end,
                    "label": "Engine failure - grounded awaiting bay/parts", "job_id": j.id})

    # Bays: an aircraft in work occupies one bay however many jobs overlap.
    for a in p.aircraft:
        for d in in_work[a]:
            bay_use[p.base_of[a]][d] += 1
    for b in p.bays:
        for d in range(H):
            if bay_use[b][d] > p.bays[b][d]:
                violations.append(f"{b} day {d}: {bay_use[b][d]} aircraft in {p.bays[b][d]} bays")
            if hour_use[b][d] > p.hours[b][d]:
                violations.append(f"{b} day {d}: {hour_use[b][d]} tech-h > {p.hours[b][d]}")

    # Parts: stock-sourced consumption must stay within supply on every day.
    for part, sup in p.supply.items():
        starts = sorted(plan[j.id].start for j in p.jobs
                        if part in j.parts and j.id in plan and plan[j.id].start is not None
                        and not plan[j.id].cannibalized_from
                        and not (j.kind == "corrective" and not failed(j, plan)))
        for d in range(min(H, sup.lead_time)):
            used = sum(1 for s in starts if s <= d)
            if used > sup.by_day(d):
                violations.append(f"{part} day {d}: {used} used > {sup.by_day(d)} available")
                break
    donor_use: dict[tuple[str, str], int] = {}
    for c in cannibalizations:
        donor_use[(c["donor"], c["part_id"])] = donor_use.get((c["donor"], c["part_id"]), 0) + 1
    for (donor, part), n in donor_use.items():
        cap = dict(p.donors.get(part, [])).get(donor, 0)
        if n > cap:
            violations.append(f"donor {donor} gives {n} x {part} > {cap}")

    available = [sum(1 for a in p.aircraft if d not in down[a]) for d in range(H)]
    per_aircraft = {a: H - len(down[a]) for a in p.aircraft}
    shortfall = 0
    if p.surge:
        for d in range(p.surge.start_day, min(H - 1, p.surge.end_day) + 1):
            shortfall += max(0, p.surge.min_available - available[d])
    for a in blocks:
        blocks[a].sort(key=lambda b: (b["start"], b["kind"]))
    return {
        "aircraft_days": sum(available),
        "available_per_day": available,
        "per_aircraft_available_days": per_aircraft,
        "risk_engine_days": risk_days,
        "deferral_days": defer_days,
        "spillover_days": spill_days,
        "failures": failures,
        "cannibalizations": cannibalizations,
        "surge_shortfall": shortfall,
        "carried_over": [j.id for j in p.jobs if j.kind == "scheduled" and j.due < H
                         and plan.get(j.id, Assignment()).start is None],
        "violations": violations,
        "blocks": blocks,
        "bay_use": bay_use,
        "hour_use": hour_use,
    }
