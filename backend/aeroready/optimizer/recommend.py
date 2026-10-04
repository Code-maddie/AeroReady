"""Explain the optimised plan as human-readable actions, versus the reactive plan.

Impact is reported per aircraft (optimised minus reactive mission-ready days
for that tail), which is exactly what the evaluator measured; we do not invent
per-action attributions.
"""
from __future__ import annotations

from aeroready.optimizer.evaluate import Assignment, Plan
from aeroready.optimizer.problem import Job, Problem


def _overlaps(a: Job, sa: int, b: Job, sb: int) -> bool:
    return sa < sb + b.duration and sb < sa + a.duration


def _day(d: int | None, H: int) -> str:
    return "beyond the horizon" if d is None else f"Day {d}"


def recommendations(p: Problem, base: Plan, opt: Plan, eb: dict, eo: dict) -> tuple[list[dict], list[dict]]:
    H = p.H
    recs: list[dict] = []
    delta = {a: eo["per_aircraft_available_days"][a] - eb["per_aircraft_available_days"][a]
             for a in p.aircraft}
    started = {j.id: opt[j.id].start for j in p.jobs if opt.get(j.id, Assignment()).start is not None}

    def bundled_with(j: Job) -> list[Job]:
        s = started.get(j.id)
        return [k for k in p.jobs if k.aircraft_id == j.aircraft_id and k.id != j.id
                and k.id in started and _overlaps(j, s, k, started[k.id])]

    def add(kind: str, j: Job, title: str, reason: str, day: int | None) -> None:
        recs.append({"id": f"R{len(recs) + 1}", "type": kind, "aircraft_id": j.aircraft_id,
                     "base_id": j.base_id, "job_id": j.id, "day": day, "title": title,
                     "reason": reason, "aircraft_delta": delta[j.aircraft_id]})

    for j in p.jobs:
        s = opt.get(j.id, Assignment()).start
        bs = base.get(j.id, Assignment()).start
        if s is None:
            continue
        mates = bundled_with(j)
        mate_txt = ", ".join(k.name.split(" (")[0].lower() for k in mates)
        fc = p.forecasts.get(j.engine_id or "", {})

        if j.kind == "preventive":
            if j.failure_day < H:
                corr = p.job(j.pair_id)
                cbs = base.get(corr.id, Assignment()).start
                back = None if cbs is None else cbs + corr.duration
                ret = ("is still down at the end of the horizon" if back is None or back >= H
                       else f"is back only on Day {back}")
                reason = (f"Forecast RUL P10 {fc['p10_days']} d, P50 {fc['p50_days']} d. "
                          f"Reactive plan flies {j.engine_id} to failure on Day {j.failure_day}; the aircraft {ret}.")
                if mates:
                    reason += f" Done together with {mate_txt} while the aircraft is already in the bay."
                add("predictive", j, f"Pull forward {j.engine_id} engine repair to Day {s}", reason, s)
            else:
                reason = (f"P10 forecast {fc['p10_days']} d falls inside the horizon (P50 {fc['p50_days']} d). ")
                reason += (f"Aircraft is already down for {mate_txt}, so the extra grounding is small and "
                           f"risk-days drop to zero." if mates else
                           "Removes flying in the engine's risk zone.")
                add("predictive", j, f"Fit {j.engine_id} engine repair into Day {s} downtime", reason, s)

        elif j.kind == "scheduled":
            if mates and (bs is None or s < bs):
                add("bundle", j, f"Pull forward {j.aircraft_id} {j.name.lower()} from {_day(bs, H)} to Day {s}",
                    f"Aircraft already down for {mate_txt}; avoids a second grounding.", s)
            elif bs is not None and s < bs:
                why = (f"the reactive plan waits for a bay until Day {bs} (due Day {j.due})"
                       if bs > j.due else f"frees a {j.base_id} bay before the due-date peak")
                add("level", j, f"Pull forward {j.aircraft_id} {j.name.lower()} from Day {bs} to Day {s}",
                    f"Window opens Day {j.earliest}; {why}.", s)
            if j.due < s <= j.hard_limit:
                add("defer", j, f"Defer {j.aircraft_id} {j.name.lower()} to Day {s}",
                    f"Within authorised deferral (due Day {j.due}, limit Day {j.hard_limit}); "
                    f"keeps {j.base_id} bays free for higher-value work.", s)
            elif s > j.hard_limit:
                add("defer", j, f"Ground {j.aircraft_id} from Day {j.hard_limit}; induct Day {s}",
                    f"Latest start is Day {j.hard_limit}; the aircraft stays on the ground and waits "
                    f"{s - j.hard_limit} day(s) for a {j.base_id} bay held by higher-value work.", s)

        donor = opt[j.id].cannibalized_from
        if donor:
            part = j.parts[0]
            sup = p.supply[part]
            avail_from = next((d for d in range(H) if sup.by_day(d) > 0), sup.lead_time)
            add("cannibalize", j, f"Cannibalise {sup.name} from {donor} to restore {j.aircraft_id}",
                f"{donor} is AOG all horizon. Stock is 0 and the earliest supply is Day {avail_from} "
                f"(lead time {sup.lead_time} d); the donor part lets work start Day {s}. "
                f"Linked removal record raised on {donor} for Day {max(0, s - 1)}.", s)

    # Day-0 orders implied by the plan.
    orders = []
    for part, sup in p.supply.items():
        uses = sorted(started[j.id] for j in p.jobs if part in j.parts and j.id in started
                      and not opt[j.id].cannibalized_from)
        shelf = sup.on_hand + sum(q for _, q in sup.inbound)
        if len(uses) > shelf:
            orders.append({"part_id": part, "part_name": sup.name, "qty": len(uses) - shelf,
                           "order_day": 0, "arrives_day": sup.lead_time,
                           "needed_from_day": uses[shelf]})
            for j in p.jobs:
                if part in j.parts and j.kind == "preventive" and j.id in started and \
                        not opt[j.id].cannibalized_from and started[j.id] >= sup.lead_time:
                    add("order", j, f"Order {sup.name} on Day 0 for {j.aircraft_id}",
                        f"0 spare after current demand; {sup.lead_time}-day lead time means a Day-0 order "
                        f"arrives Day {sup.lead_time}, before the forecast failure on Day {j.failure_day}. "
                        f"Ordering on failure (reactive) would land Day {j.failure_day + sup.lead_time}.",
                        0)

    order_rank = {"cannibalize": 0, "predictive": 1, "order": 2, "bundle": 3, "level": 4, "defer": 5}
    recs.sort(key=lambda r: (-r["aircraft_delta"], order_rank[r["type"]], r["day"] or 0))
    for i, r in enumerate(recs, 1):
        r["id"] = f"R{i}"
    return recs, orders
