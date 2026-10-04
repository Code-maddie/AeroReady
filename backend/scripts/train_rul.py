"""Train the RUL quantile models, report test metrics, and score the fleet."""
import json

import _path  # noqa: F401
from aeroready.config import RUL_PATH
from aeroready.rul.infer import predict_fleet
from aeroready.rul.model import train


def main() -> None:
    m = train()
    print("Sensors used:", ", ".join(m["sensors_used"]))
    print(f"RUL cap {m['rul_cap_cycles']} cycles; metrics on official C-MAPSS test sets (last cycle per engine):")
    print(f"  {'set':6s} {'n':>4s} {'RMSE':>6s} {'MAE':>6s} {'NASA':>8s} {'P10-P90 cov':>12s} {'width':>6s}")
    for ds, r in m["datasets"].items():
        print(f"  {ds:6s} {r['n_test_engines']:4d} {r['rmse_p50']:6.2f} {r['mae_p50']:6.2f} "
              f"{r['nasa_score_p50']:8.1f} {r['p10_p90_coverage']:12.3f} {r['mean_interval_width']:6.1f}")
    preds = predict_fleet()
    RUL_PATH.write_text(json.dumps(preds, indent=2))
    print(f"\nWrote {len(preds['engines'])} engine forecasts to {RUL_PATH}")
    print(f"  {'engine':8s} {'P10':>5s} {'P50':>5s} {'P90':>5s} cycles | {'P10':>5s} {'P50':>5s} {'P90':>5s} days "
          f"| true  | top sensors")
    for e in sorted(preds["engines"], key=lambda e: e["rul_cycles"]["p50"])[:12]:
        c, d = e["rul_cycles"], e["rul_days"]
        top = ", ".join(s["sensor"] for s in e["top_sensors"][:3])
        print(f"  {e['engine_id']:8s} {c['p10']:5.0f} {c['p50']:5.0f} {c['p90']:5.0f}        | "
              f"{d['p10']:5.1f} {d['p50']:5.1f} {d['p90']:5.1f}      | {e['true_rul_cycles']:4d}  | {top}")


if __name__ == "__main__":
    main()
