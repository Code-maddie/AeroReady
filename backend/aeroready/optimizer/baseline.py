"""Reactive baseline: how maintenance runs today.

* Scheduled inspections are inducted when they fall due (no pulling forward,
  no deliberate bundling); the aircraft keeps flying until its hard limit.
* Engines are flown until they fail (the same forecast failure day the
  optimiser plans against); then a corrective repair is queued.
* Bays and technicians go first-come-first-served among jobs that are ready.
* Parts: scheduled work was ordered on Day 0; parts for unplanned failures are
  only ordered when the failure happens. No cannibalisation.
"""
from __future__ import annotations

from aeroready.optimizer.evaluate import Assignment, Plan
from aeroready.optimizer.problem import Job, Problem


def reactive_plan(p: Problem) -> Plan:
    H = p.H
    plan: Plan = {j.id: Assignment() for j in p.jobs}
    bay_use = {b: [0] * H for b in p.bays}
    hour_use = {b: [0] * H for b in p.hours}
    busy = {a: [False] * H for a in p.aircraft}

    pool_used = {k: 0 for k in p.supply}          # units taken from on-hand + inbound
    requests: list[tuple[int, Job, int]] = []     # (request day, job, own order arrival)
    for j in p.jobs:
        if j.kind == "scheduled" and j.due < H:
            day = max(j.due, j.earliest)
            requests.append((day, j, p.supply[j.parts[0]].lead_time if j.parts else 0))
        elif j.kind == "corrective":
            arrival = j.failure_day + (p.supply[j.parts[0]].lead_time if j.parts else 0)
            requests.append((j.failure_day, j, arrival))
    requests.sort(key=lambda r: (r[0], r[1].id))

    queue: list[tuple[int, Job, int]] = []
    for d in range(H):
        queue += [r for r in requests if r[0] == d]
        started = []
        for req in queue:
            _, j, own_arrival = req
            if busy[j.aircraft_id][d]:
                continue
            use_pool = False
            if j.parts:
                part = j.parts[0]
                sup = p.supply[part]
                pool_now = sup.on_hand + sum(q for day, q in sup.inbound if day <= d) - pool_used[part]
                if pool_now > 0:
                    use_pool = True
                elif d < own_arrival:
                    continue
            days = range(d, min(H, d + j.duration))
            if any(bay_use[j.base_id][x] + 1 > p.bays[j.base_id][x] or
                   hour_use[j.base_id][x] + j.hours > p.hours[j.base_id][x] for x in days):
                continue
            for x in days:
                bay_use[j.base_id][x] += 1
                hour_use[j.base_id][x] += j.hours
                busy[j.aircraft_id][x] = True
            if use_pool:
                pool_used[j.parts[0]] += 1
            plan[j.id] = Assignment(start=d)
            started.append(req)
        queue = [r for r in queue if r not in started]
    return plan
