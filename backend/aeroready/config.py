"""Global paths and planning constants."""
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
CMAPSS_DIR = DATA_DIR / "cmapss"
MODEL_DIR = DATA_DIR / "models"
FLEET_PATH = DATA_DIR / "fleet.json"
RUL_PATH = DATA_DIR / "rul_predictions.json"
RUL_METRICS_PATH = DATA_DIR / "rul_metrics.json"

RUL_TEST_PREDICTIONS_PATH = DATA_DIR / "rul_test_predictions.json"
UPLOAD_DIR = DATA_DIR / "uploads"
SCENARIOS_PATH = DATA_DIR / "scenarios.json"
SCENARIO_CONFIG_PATH = BACKEND_DIR / "aeroready" / "fleet" / "scenario_config.json"

_scenario_cfg = json.loads(SCENARIO_CONFIG_PATH.read_text(encoding="utf-8"))
SEED = _scenario_cfg["seed"]                  # SIH problem number; used for determinism
HORIZON_DAYS = _scenario_cfg["horizon_days"]  # planning horizon, daily granularity
START_DATE = _scenario_cfg["start_date"]      # Day 0 of the plan
RUL_CAP_CYCLES = 125         # piecewise-linear RUL cap (standard for C-MAPSS)
SOLVER_TIME_LIMIT_S = 10.0
