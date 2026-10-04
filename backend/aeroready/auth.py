"""Sign-in with roles. Demo accounts live in data/users.json (PBKDF2 hashes).

Roles:
  commander   view everything; approve or reject recommendations
  planner     everything a commander can do, plus re-plan, scenarios and data uploads
  technician  view only
Tokens are HMAC-signed (no server-side session store) and expire after TOKEN_HOURS.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Depends, HTTPException, Request

from aeroready.config import DATA_DIR

USERS_PATH = DATA_DIR / "users.json"
SECRET_PATH = DATA_DIR / "secret.key"
TOKEN_HOURS = 12
PBKDF2_ROUNDS = 120_000

PERMISSIONS = {
    "decide": {"commander", "planner"},          # approve / reject recommendations
    "plan": {"planner"},                         # re-plan, run and save scenarios
    "data": {"planner"},                         # upload and reset data sources
}


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS).hex()
    return f"{salt}${digest}"


def _verify(password: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


def _secret() -> bytes:
    env = os.environ.get("AERO_SECRET")
    if env:
        return env.encode()
    if not SECRET_PATH.exists():
        SECRET_PATH.write_text(secrets.token_hex(32), encoding="utf-8")
    return SECRET_PATH.read_text(encoding="utf-8").strip().encode()


def _users() -> dict[str, dict]:
    return {u["username"]: u for u in json.loads(USERS_PATH.read_text(encoding="utf-8"))}


def public_user(u: dict) -> dict:
    return {"username": u["username"], "name": u["name"], "role": u["role"],
            "permissions": sorted(p for p, roles in PERMISSIONS.items() if u["role"] in roles)}


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue_token(username: str) -> str:
    body = _b64(json.dumps({"u": username, "exp": int(time.time()) + TOKEN_HOURS * 3600}).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def login(username: str, password: str) -> tuple[str, dict]:
    u = _users().get(username.strip().lower())
    if not u or not _verify(password, u["password_hash"]):
        raise HTTPException(401, "Wrong username or password")
    return issue_token(u["username"]), public_user(u)


def _user_from_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
        good = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            raise ValueError
        data = json.loads(_unb64(body))
    except Exception:
        raise HTTPException(401, "Session is not valid. Sign in again.")
    if data["exp"] < time.time():
        raise HTTPException(401, "Session expired. Sign in again.")
    u = _users().get(data["u"])
    if not u:
        raise HTTPException(401, "Account no longer exists")
    return public_user(u)


def current_user(request: Request) -> dict:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to use the console")
    return _user_from_token(header[7:].strip())


def require(permission: str):
    """Dependency: the signed-in user must hold `permission`."""
    def dep(user: dict = Depends(current_user)) -> dict:
        if permission not in user["permissions"]:
            roles = " or ".join(sorted(PERMISSIONS[permission]))
            raise HTTPException(403, f"Your role ({user['role']}) cannot do this. Needs {roles}.")
        return user
    return dep
