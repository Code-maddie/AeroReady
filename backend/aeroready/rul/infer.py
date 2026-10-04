"""Score fleet engines: RUL quantiles, per-engine sensor contributions, trends."""
from __future__ import annotations

import numpy as np
import pandas as pd

from aeroready.config import RUL_CAP_CYCLES
from aeroready.fleet.store import load_fleet
from aeroready.rul.cmapss import SENSOR_NAMES, load_split, load_test_rul
from aeroready.rul.features import build_features, sensor_of
from aeroready.rul.model import load_boosters

HISTORY_CYCLES = 80   # how much of each trajectory to ship to the UI


def predict_fleet() -> dict:
    fleet = load_fleet()
    boosters, sensors, cols = load_boosters()
    acs = fleet.aircraft_by_id()

    feats_by_ds: dict[str, pd.DataFrame] = {}
    raw_by_ds: dict[str, pd.DataFrame] = {}
    truth = {}
    for ds in {e.cmapss_dataset for e in fleet.engines}:
        raw = load_split(ds, "test")
        raw_by_ds[ds] = raw.sort_values(["unit", "cycle"]).reset_index(drop=True)
        feats_by_ds[ds] = build_features(raw, sensors)
        truth[ds] = load_test_rul(ds)

    # Global importance (gain) for context in the UI.
    gain = boosters["p50"].feature_importance("gain")
    global_imp: dict[str, float] = {}
    for f, g in zip(cols, gain):
        s = sensor_of(f)
        if s:
            global_imp[s] = global_imp.get(s, 0.0) + float(g)
    tot = sum(global_imp.values()) or 1.0

    engines = []
    for e in fleet.engines:
        f = feats_by_ds[e.cmapss_dataset]
        uf = f[f["unit"] == e.cmapss_unit]
        X = uf[cols]
        q = np.sort(np.vstack([boosters[n].predict(X) for n in ("p10", "p50", "p90")]), axis=0)
        q = np.clip(q, 0, RUL_CAP_CYCLES)
        p10, p50, p90 = (float(v) for v in q[:, -1])

        # Local explanation: SHAP-style contributions of the P50 model at "now".
        contrib = boosters["p50"].predict(X.tail(1), pred_contrib=True)[0][:-1]
        by_sensor: dict[str, float] = {}
        for fcol, c in zip(cols, contrib):
            s = sensor_of(fcol)
            if s:
                by_sensor[s] = by_sensor.get(s, 0.0) + float(c)
        top = sorted(by_sensor.items(), key=lambda kv: kv[1])[:5]   # most RUL-reducing first

        raw = raw_by_ds[e.cmapss_dataset]
        ur = raw[raw["unit"] == e.cmapss_unit].tail(HISTORY_CYCLES)
        trend_sensors = [s for s, _ in top[:4]]
        rate = acs[e.aircraft_id].sortie_rate
        engines.append({
            "engine_id": e.id,
            "aircraft_id": e.aircraft_id,
            "cmapss": f"{e.cmapss_dataset} test unit {e.cmapss_unit}",
            "cycles_observed": e.cycles_observed,
            "sortie_rate": rate,
            "rul_cycles": {"p10": round(p10, 1), "p50": round(p50, 1), "p90": round(p90, 1)},
            "rul_days": {k: round(v / rate, 1) for k, v in (("p10", p10), ("p50", p50), ("p90", p90))},
            "true_rul_cycles": int(truth[e.cmapss_dataset][e.cmapss_unit - 1]),
            "top_sensors": [
                {"sensor": s, "name": SENSOR_NAMES[s], "contribution_cycles": round(c, 2),
                 "global_importance": round(global_imp.get(s, 0.0) / tot, 3)}
                for s, c in top
            ],
            "rul_history": {
                "cycle": uf["cycle"].tail(HISTORY_CYCLES).tolist(),
                "p10": np.round(q[0, -HISTORY_CYCLES:], 1).tolist(),
                "p50": np.round(q[1, -HISTORY_CYCLES:], 1).tolist(),
                "p90": np.round(q[2, -HISTORY_CYCLES:], 1).tolist(),
            },
            "sensor_trend": {
                "cycle": ur["cycle"].tolist(),
                **{s: ur[s].round(3).tolist() for s in trend_sensors},
            },
        })
    return {
        "note": "Forecasts from LightGBM quantile models trained on NASA C-MAPSS FD001+FD003. "
                "true_rul_cycles is C-MAPSS ground truth, used for validation display only; "
                "the planner uses the forecast.",
        "global_sensor_importance": {s: round(v / tot, 3) for s, v in
                                     sorted(global_imp.items(), key=lambda kv: -kv[1])},
        "engines": engines,
    }
