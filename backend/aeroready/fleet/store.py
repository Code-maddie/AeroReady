"""Load/save the fleet JSON."""
from __future__ import annotations

from pathlib import Path

from aeroready.config import FLEET_PATH
from aeroready.fleet.models import Fleet


def save_fleet(fleet: Fleet, path: Path = FLEET_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(fleet.model_dump_json(indent=2), encoding="utf-8")


def load_fleet(path: Path = FLEET_PATH) -> Fleet:
    return Fleet.model_validate_json(path.read_text(encoding="utf-8"))
