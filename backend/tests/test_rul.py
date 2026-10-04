import json

import numpy as np

from aeroready.config import RUL_PATH
from aeroready.rul.model import nasa_score


def test_nasa_score_penalises_late_more_than_early():
    true = np.array([50.0])
    assert nasa_score(np.array([60.0]), true) > nasa_score(np.array([40.0]), true) > 0
    assert nasa_score(true, true) == 0


def test_fleet_forecasts_are_ordered_and_explained():
    preds = json.loads(RUL_PATH.read_text())["engines"]
    assert len(preds) == 40
    for e in preds:
        c = e["rul_cycles"]
        assert 0 <= c["p10"] <= c["p50"] <= c["p90"] <= 125
        assert e["top_sensors"] and e["rul_days"]["p50"] == round(c["p50"] / e["sortie_rate"], 1)
