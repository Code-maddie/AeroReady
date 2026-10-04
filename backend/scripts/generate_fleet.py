"""Generate the deterministic SYNTHETIC fleet -> backend/data/fleet.json."""
from collections import Counter

import _path  # noqa: F401
from aeroready.config import FLEET_PATH, HORIZON_DAYS
from aeroready.fleet.generator import generate_fleet
from aeroready.fleet.store import save_fleet
from aeroready.rul.cmapss import load_test_rul


def main() -> None:
    fleet = generate_fleet()
    save_fleet(fleet)
    print(f"[SYNTHETIC] wrote {FLEET_PATH}")
    print(f"  aircraft={len(fleet.aircraft)} engines={len(fleet.engines)} parts={len(fleet.parts)} "
          f"tasks={len(fleet.tasks)} log_entries={len(fleet.log)}")
    for ag in fleet.agencies:
        n = sum(1 for a in fleet.aircraft if a.base_id == ag.base_id)
        print(f"  {ag.base_id}: {n} aircraft, {ag.bays} bays, {ag.tech_hours_per_day} tech-h/day")
    print("  aircraft types:", dict(Counter(a.type for a in fleet.aircraft)))

    truth = {ds: load_test_rul(ds) for ds in ("FD001", "FD003")}
    acs = fleet.aircraft_by_id()
    print("\n  Engines with true C-MAPSS RUL inside the horizon (ground truth, not the forecast):")
    for e in fleet.engines:
        r = int(truth[e.cmapss_dataset][e.cmapss_unit - 1])
        days = r / acs[e.aircraft_id].sortie_rate
        if days < HORIZON_DAYS + 10:
            print(f"    {e.id:8s} {e.cmapss_dataset}#{e.cmapss_unit:<3d} obs={e.cycles_observed:3d}cy "
                  f"trueRUL={r:3d}cy ~{days:5.1f}d  part={e.repair_part_id}")

    in_h = [t for t in fleet.tasks if t.window_open < HORIZON_DAYS]
    print(f"\n  Scheduled inspections with window opening in horizon: {len(in_h)}")
    for t in sorted(fleet.tasks, key=lambda t: (t.base_id, t.due_day)):
        print(f"    {t.base_id} {t.id:8s} {t.name:48s} window [{t.window_open:2d},{t.due_day:2d}] "
              f"+defer {t.defer_max_days} dur {t.duration_days}d {t.tech_hours_per_day}h/d parts {t.parts}")
    print("\n  Planted tensions:")
    for s in fleet.planted_tensions:
        print("   -", s)


if __name__ == "__main__":
    main()
