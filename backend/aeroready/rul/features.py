"""Feature engineering for C-MAPSS RUL regression."""
from __future__ import annotations

import pandas as pd

from aeroready.config import RUL_CAP_CYCLES
from aeroready.rul.cmapss import SENSOR_COLS

WINDOW = 10


def informative_sensors(train: pd.DataFrame, tol: float = 1e-4) -> list[str]:
    """Drop sensors that are (near) constant across the training data."""
    std = train[SENSOR_COLS].std()
    return [s for s in SENSOR_COLS if std[s] > tol * max(1.0, abs(train[s].mean()))]


def build_features(df: pd.DataFrame, sensors: list[str]) -> pd.DataFrame:
    """Raw value + rolling mean/std per sensor, computed within each unit."""
    df = df.sort_values(["unit", "cycle"]).reset_index(drop=True)
    g = df.groupby("unit")
    out = {"unit": df["unit"], "cycle": df["cycle"]}
    for s in sensors:
        out[s] = df[s]
        out[f"{s}_mean{WINDOW}"] = g[s].transform(lambda x: x.rolling(WINDOW, min_periods=1).mean())
        out[f"{s}_std{WINDOW}"] = g[s].transform(lambda x: x.rolling(WINDOW, min_periods=2).std()).fillna(0.0)
    return pd.DataFrame(out)


def feature_columns(sensors: list[str]) -> list[str]:
    cols = ["cycle"]
    for s in sensors:
        cols += [s, f"{s}_mean{WINDOW}", f"{s}_std{WINDOW}"]
    return cols


def sensor_of(feature: str) -> str | None:
    """Map a feature column back to its sensor id (None for 'cycle')."""
    return None if feature == "cycle" else feature.split("_")[0]


def add_train_target(df: pd.DataFrame) -> pd.Series:
    """Piecewise-linear RUL: remaining cycles to failure, capped."""
    last = df.groupby("unit")["cycle"].transform("max")
    return (last - df["cycle"]).clip(upper=RUL_CAP_CYCLES)
