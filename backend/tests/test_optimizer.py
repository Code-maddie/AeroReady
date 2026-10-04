import pytest

from aeroready.optimizer.baseline import reactive_plan
from aeroready.optimizer.cpsat import solve
from aeroready.optimizer.evaluate import Assignment, evaluate
from aeroready.optimizer.plan import load_inputs, run_plan
from aeroready.optimizer.problem import (
    BayClosure, Job, PartDelay, PartSupply, Problem, Scenario, Surge, build_problem,
)


@pytest.fixture(scope="module")
def default_plan():
    return run_plan()


def _used_starts(result, part):
    jobs = {j["id"]: j for j in result["jobs"]}
    return sorted(s for jid, (s, donor) in result["optimized"]["starts"].items()
                  if s is not None and donor is None and part in jobs[jid]["parts"])


def test_optimized_beats_baseline_and_is_valid(default_plan):
    r = default_plan
    assert r["optimized"]["aircraft_days"] >= r["baseline"]["aircraft_days"]
    assert r["gain_aircraft_days"] > 0
    assert r["baseline"]["violations"] == [] and r["optimized"]["violations"] == []
    assert r["optimized"]["solver"]["solver_aircraft_days"] == r["optimized"]["aircraft_days"]
    assert r["optimized"]["solver"]["wall_time_s"] <= 10.5


def test_bay_and_technician_capacity_respected(default_plan):
    r = default_plan
    for plan in ("baseline", "optimized"):
        for base, use in r[plan]["bay_use"].items():
            assert all(u <= c for u, c in zip(use, r["capacity"]["bays"][base]))
        for base, use in r[plan]["hour_use"].items():
            assert all(u <= c for u, c in zip(use, r["capacity"]["tech_hours"][base]))


def test_parts_respected_and_cannibalisation_only_from_donor(default_plan):
    fleet, rul = load_inputs()
    p = build_problem(fleet, rul)
    for part, sup in p.supply.items():
        starts = _used_starts(default_plan, part)
        for d in range(min(p.H, sup.lead_time)):
            assert sum(1 for s in starts if s <= d) <= sup.by_day(d), (part, d)
    for c in default_plan["optimized"]["cannibalizations"]:
        assert c["donor"] == "A-12" and c["day"] >= 1
    # The zero-stock, 21-day HPC module can only reach A-20 early by cannibalisation.
    a20 = default_plan["optimized"]["starts"]["A-20-E1-PM"]
    assert a20[0] < 21 and a20[1] == "A-12"


def test_bay_closure_is_respected():
    r = run_plan(Scenario(bay_closures=[BayClosure(base_id="BS", start_day=0, end_day=29, bays_closed=1)]))
    assert all(c == 1 for c in r["capacity"]["bays"]["BS"])
    assert all(u <= 1 for u in r["optimized"]["bay_use"]["BS"])
    assert r["optimized"]["violations"] == [] and r["gain_aircraft_days"] >= 0


def test_part_delay_never_helps():
    base = run_plan()
    delayed = run_plan(Scenario(part_delays=[PartDelay(part_id="P04", days=10)]))
    assert delayed["optimized"]["aircraft_days"] <= base["optimized"]["aircraft_days"]
    assert delayed["optimized"]["violations"] == []


def test_surge_target_reduces_shortfall():
    r = run_plan(Scenario(surge=Surge(start_day=10, end_day=16, min_available=21)))
    assert r["optimized"]["surge_shortfall"] <= r["baseline"]["surge_shortfall"]
    assert r["optimized"]["surge_shortfall"] == 0


def test_deterministic():
    a, b = run_plan(), run_plan()
    assert a["optimized"]["starts"] == b["optimized"]["starts"]


def _toy(jobs, bays=1, hours=24, part_stock=5):
    H = 10
    return Problem(
        H=H, aircraft=["X", "Y"], base_of={"X": "B", "Y": "B"}, fixed_down={"X": set(), "Y": set()},
        bays={"B": [bays] * H}, hours={"B": [hours] * H}, jobs=jobs,
        supply={"P": PartSupply("P", "part", part_stock, [], 3)}, donors={}, surge=None,
        scenario=Scenario())


def test_overlapping_jobs_on_one_aircraft_count_down_once():
    # Due dates well inside the horizon so end-of-horizon effects do not interfere.
    a = Job("a", "X", "B", "scheduled", "insp A", 3, 4, [], 0, 9, due=5, hard_limit=5)
    b = Job("b", "X", "B", "scheduled", "insp B", 2, 4, [], 0, 9, due=5, hard_limit=5)
    p = _toy([a, b])
    ev = evaluate(p, {"a": Assignment(2), "b": Assignment(3)})
    assert ev["per_aircraft_available_days"]["X"] == 10 - 3     # days 2,3,4 only
    assert max(ev["bay_use"]["B"]) == 1                         # one bay, not two
    plan, _ = solve(p)
    assert evaluate(p, plan)["per_aircraft_available_days"]["X"] == 7


def test_single_bay_forces_sequencing_and_parts_gate_start():
    a = Job("a", "X", "B", "scheduled", "insp A", 2, 4, ["P"], 0, 9, due=6, hard_limit=6)
    b = Job("b", "Y", "B", "scheduled", "insp B", 2, 4, ["P"], 0, 9, due=6, hard_limit=6)
    p = _toy([a, b], bays=1, part_stock=0)        # no stock: nothing before lead time (day 3)
    plan, _ = solve(p)
    ev = evaluate(p, plan)
    assert ev["violations"] == []
    sa, sb = plan["a"].start, plan["b"].start
    assert sa >= 3 and sb >= 3 and abs(sa - sb) >= 2
    assert ev["aircraft_days"] >= evaluate(p, reactive_plan(p))["aircraft_days"]
