"""Print reactive vs optimised availability and check the demo story holds."""
import _path  # noqa: F401
from aeroready.optimizer.plan import run_plan
from aeroready.optimizer.problem import PartDelay, Scenario, Surge


def show(title: str, r: dict) -> None:
    b, o = r["baseline"], r["optimized"]
    print(f"\n=== {title} ===  (solver {o['solver']['status']} in {o['solver']['wall_time_s']} s, "
          f"run {r['elapsed_s']} s)")
    print(f"  max possible aircraft-days (excl. AOG): {r['max_aircraft_days']}")
    print(f"  {'':12s} {'acft-days':>9s} {'avg/day':>7s} {'failures':>8s} {'risk-days':>9s} "
          f"{'defer':>5s} {'spill':>5s} {'cannib.':>7s} {'surge short':>11s} {'violations':>10s}")
    for name, s in (("reactive", b), ("optimised", o)):
        print(f"  {name:12s} {s['aircraft_days']:9d} {s['avg_available']:7.1f} {len(s['unplanned_failures']):8d} "
              f"{s['risk_engine_days']:9d} {s['deferral_days']:5d} {s['spillover_days']:5d} {len(s['cannibalizations']):7d} "
              f"{s['surge_shortfall']:11d} {len(s['violations']):10d}")
    print(f"  GAIN: {r['gain_aircraft_days']:+d} aircraft-days")
    print("  reactive /day :", " ".join(f"{v:2d}" for v in b["available_per_day"]))
    print("  optimised/day :", " ".join(f"{v:2d}" for v in o["available_per_day"]))
    assert not b["violations"] and not o["violations"], (b["violations"], o["violations"])
    assert r["gain_aircraft_days"] >= 0, "optimised plan is worse than reactive"


def main() -> None:
    r = run_plan()
    show("Default scenario", r)
    print("\n  Recommendations:")
    for rec in r["recommendations"]:
        print(f"   {rec['id']:>3s} [{rec['type']:11s}] {rec['title']}  ({rec['aircraft_id']}: "
              f"{rec['aircraft_delta']:+d} acft-days)\n         {rec['reason']}")
    print("\n  Day-0 part orders:", r["part_orders"])

    show("What-if: HPC seal kit (P03) supplier delay +10 d",
         run_plan(Scenario(part_delays=[PartDelay(part_id="P03", days=10)])))
    show("What-if: surge, >= 21 aircraft available Days 10-16",
         run_plan(Scenario(surge=Surge(start_day=10, end_day=16, min_available=21))))
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
