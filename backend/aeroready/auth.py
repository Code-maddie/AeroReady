"""JWT sign-in and role-based access. Every API route declares the roles it allows."""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request

from aeroready.config import DATA_DIR
from aeroready.fleet.generator import load_scenario_config
from aeroready.users import load_users, public, verify

SECRET_PATH = DATA_DIR / "secret.key"
ALGO = "HS256"
ROLES = ("commander", "planner", "technician")


def _secret() -> str:
    env = os.environ.get("AERO_SECRET")
    if env:
        return env
    if not SECRET_PATH.exists():
        SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
    return SECRET_PATH.read_text(encoding="utf-8").strip()


def session_hours() -> int:
    return load_scenario_config()["operations"]["session_hours"]


def login(username: str, password: str) -> tuple[str, dict, str]:
    u = next((x for x in load_users() if x["username"] == username.strip().lower()), None)
    if not u or not verify(password, u["password_hash"]):
        raise HTTPException(401, "Incorrect username or password")
    exp = datetime.now(timezone.utc) + timedelta(hours=session_hours())
    token = jwt.encode({"sub": u["username"], "role": u["role"], "exp": exp}, _secret(), algorithm=ALGO)
    return token, public(u), exp.isoformat(timespec="seconds")


def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in required")
    try:
        claims = jwt.decode(header[7:].strip(), _secret(), algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Session is not valid. Sign in again.")
    u = next((x for x in load_users() if x["username"] == claims.get("sub")), None)
    if not u:
        raise HTTPException(401, "Account no longer exists")
    return public(u)


def roles(*allowed: str):
    """Dependency: the signed-in user must hold one of `allowed` roles."""
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(403, f"Not available to the {user['role']} role")
        return user
    return dep


# Use as a parameter default: `user: dict = PLANNER`.
ANY = Depends(roles(*ROLES))
STAFF = Depends(roles("commander", "planner"))
PLANNER = Depends(roles("planner"))
COMMANDER = Depends(roles("commander"))
TECHNICIAN = Depends(roles("technician"))
