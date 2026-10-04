"""Global paths and planning constants."""
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
CMAPSS_DIR = DATA_DIR / "cmapss"
MODEL_DIR = DATA_DIR / "models"
FLEET_PATH = DATA_DIR / "fleet.json"
RUL_PATH = DATA_DIR / "rul_predictions.json"
RUL_METRICS_PATH = DATA_DIR / "rul_metrics.json"

SEED = 26249                 # SIH problem number; used everywhere for determinism
HORIZON_DAYS = 30            # planning horizon, daily granularity
START_DATE = "2026-10-05"    # Day 0 of the plan
RUL_CAP_CYCLES = 125         # piecewise-linear RUL cap (standard for C-MAPSS)
SOLVER_TIME_LIMIT_S = 10.0
