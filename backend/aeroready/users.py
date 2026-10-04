"""Simulated user accounts, generated alongside the fleet.

One commander for the whole fleet; per base one planner and N technicians
(N from scenario_config.json). Passwords are bcrypt hashes; the demo
passwords follow `<username><password_suffix>` and are listed in README only.
"""
from __future__ import annotations

import json

import bcrypt

from aeroready.config import DATA_DIR
from aeroready.fleet.generator import load_scenario_config
from aeroready.fleet.models import Fleet

USERS_PATH = DATA_DIR / "users.json"


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def generate_users(fleet: Fleet) -> list[dict]:
    cfg = load_scenario_config()["users"]
    suffix = cfg["password_suffix"]
    users = [{"username": "commander", "name": "Commander", "role": "commander", "base_id": None}]
    for b in fleet.bases:
        key = b.id.lower()
        users.append({"username": f"planner.{key}", "name": f"Planner {b.id}", "role": "planner", "base_id": b.id})
        for i in range(1, cfg["technicians_per_base"] + 1):
            users.append({"username": f"tech.{key}.{i}", "name": f"Technician {b.id}-{i}", "role": "technician", "base_id": b.id})
    for u in users:
        u["password_hash"] = _hash(u["username"] + suffix)
    return users


def save_users(users: list[dict]) -> None:
    USERS_PATH.write_text(json.dumps(users, indent=2), encoding="utf-8")


def load_users() -> list[dict]:
    return json.loads(USERS_PATH.read_text(encoding="utf-8"))


def verify(password: str, stored_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except ValueError:
        return False


def public(u: dict) -> dict:
    return {"username": u["username"], "name": u["name"], "role": u["role"], "base_id": u["base_id"]}


def by_role(role: str, base_id: str | None = None) -> list[dict]:
    return [public(u) for u in load_users() if u["role"] == role and (base_id is None or u["base_id"] == base_id)]
