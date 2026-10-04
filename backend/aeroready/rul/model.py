"""LightGBM quantile regression for RUL (P10 / P50 / P90)."""
from __future__ import annotations

import json

import lightgbm as lgb
import numpy as np
import pandas as pd

from aeroready.config import MODEL_DIR, RUL_CAP_CYCLES, RUL_METRICS_PATH, SEED
from aeroready.rul.cmapss import load_split, load_test_rul
from aeroready.rul.features import (
    add_train_target, build_features, feature_columns, informative_sensors,
)

DATASETS = ("FD001", "FD003")
QUANTILES = {"p10": 0.1, "p50": 0.5, "p90": 0.9}
PARAMS = dict(
    learning_rate=0.03, num_leaves=31, min_data_in_leaf=80, feature_fraction=0.8,
    bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, seed=SEED, deterministic=True,
    force_row_wise=True, num_threads=4, verbose=-1,
    # With a capped target the 0.9-quantile init equals the cap, every residual
    # has the same sign and the P90 model never splits. Start from 0 instead.
    boost_from_average=False,
)
NUM_ROUNDS = 900


def nasa_score(pred: np.ndarray, true: np.ndarray) -> float:
    """PHM08 asymmetric score: late predictions are penalised harder."""
    d = pred - true
    return float(np.sum(np.where(d < 0, np.exp(-d / 13.0) - 1, np.exp(d / 10.0) - 1)))


def _load_train() -> pd.DataFrame:
    frames = []
    for i, ds in enumerate(DATASETS):
        df = load_split(ds, "train")
        df["unit"] = df["unit"] + 1000 * i      # keep units unique across datasets
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def train() -> dict:
    raw = _load_train()
    sensors = informative_sensors(raw)
    feats = build_features(raw, sensors)
    y = add_train_target(raw.sort_values(["unit", "cycle"]).reset_index(drop=True))
    cols = feature_columns(sensors)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    boosters = {}
    for name, alpha in QUANTILES.items():
        ds = lgb.Dataset(feats[cols], label=y, free_raw_data=False)
        b = lgb.train({**PARAMS, "objective": "quantile", "alpha": alpha}, ds, num_boost_round=NUM_ROUNDS)
        b.save_model(str(MODEL_DIR / f"rul_{name}.txt"))
        boosters[name] = b
    (MODEL_DIR / "rul_meta.json").write_text(json.dumps({"sensors": sensors, "features": cols}, indent=2))

    metrics = {"datasets": {}, "sensors_used": sensors, "rul_cap_cycles": RUL_CAP_CYCLES,
               "num_rounds": NUM_ROUNDS}
    for ds in DATASETS:
        test = load_split(ds, "test")
        tf = build_features(test, sensors)
        last = tf.groupby("unit").tail(1)
        true = load_test_rul(ds)[last["unit"].values - 1].astype(float)
        preds = {n: b.predict(last[cols]) for n, b in boosters.items()}
        p = np.sort(np.vstack([preds["p10"], preds["p50"], preds["p90"]]), axis=0)
        true_capped = np.minimum(true, RUL_CAP_CYCLES)
        metrics["datasets"][ds] = {
            "n_test_engines": int(len(true)),
            "rmse_p50": round(float(np.sqrt(np.mean((p[1] - true_capped) ** 2))), 2),
            "mae_p50": round(float(np.mean(np.abs(p[1] - true_capped))), 2),
            "nasa_score_p50": round(nasa_score(p[1], true_capped), 1),
            "p10_p90_coverage": round(float(np.mean((true_capped >= p[0]) & (true_capped <= p[2]))), 3),
            "mean_interval_width": round(float(np.mean(p[2] - p[0])), 1),
            "frac_true_below_p10": round(float(np.mean(true_capped < p[0])), 3),
        }
    RUL_METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    return metrics


def load_boosters() -> tuple[dict[str, lgb.Booster], list[str], list[str]]:
    meta = json.loads((MODEL_DIR / "rul_meta.json").read_text())
    boosters = {n: lgb.Booster(model_file=str(MODEL_DIR / f"rul_{n}.txt")) for n in QUANTILES}
    return boosters, meta["sensors"], meta["features"]
