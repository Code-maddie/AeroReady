"""NASA C-MAPSS loading."""
from __future__ import annotations

import numpy as np
import pandas as pd

from aeroready.config import CMAPSS_DIR

OP_COLS = ["op1", "op2", "op3"]
SENSOR_COLS = [f"s{i}" for i in range(1, 22)]
COLUMNS = ["unit", "cycle", *OP_COLS, *SENSOR_COLS]

# Human-readable names (Saxena et al., 2008) for the explainability panel.
SENSOR_NAMES = {
    "s1": "Fan inlet temp (T2)",
    "s2": "LPC outlet temp (T24)",
    "s3": "HPC outlet temp (T30)",
    "s4": "LPT outlet temp (T50)",
    "s5": "Fan inlet pressure (P2)",
    "s6": "Bypass duct pressure (P15)",
    "s7": "HPC outlet pressure (P30)",
    "s8": "Physical fan speed (Nf)",
    "s9": "Physical core speed (Nc)",
    "s10": "Engine pressure ratio (EPR)",
    "s11": "HPC outlet static pressure (Ps30)",
    "s12": "Fuel flow / Ps30 (phi)",
    "s13": "Corrected fan speed (NRf)",
    "s14": "Corrected core speed (NRc)",
    "s15": "Bypass ratio (BPR)",
    "s16": "Burner fuel-air ratio (farB)",
    "s17": "Bleed enthalpy (htBleed)",
    "s18": "Demanded fan speed (Nf_dmd)",
    "s19": "Demanded corrected fan speed (PCNfR_dmd)",
    "s20": "HPT coolant bleed (W31)",
    "s21": "LPT coolant bleed (W32)",
}


def load_split(dataset: str, split: str) -> pd.DataFrame:
    """split is 'train' or 'test'."""
    path = CMAPSS_DIR / f"{split}_{dataset}.txt"
    df = pd.read_csv(path, sep=r"\s+", header=None, names=COLUMNS)
    df["unit"] = df["unit"].astype(int)
    df["cycle"] = df["cycle"].astype(int)
    return df


def load_test_rul(dataset: str) -> np.ndarray:
    """True RUL (cycles) at the last observed test cycle, indexed by unit-1."""
    return np.loadtxt(CMAPSS_DIR / f"RUL_{dataset}.txt").astype(int)
