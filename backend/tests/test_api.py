import pytest
from fastapi.testclient import TestClient

from aeroready import datastore, opstate, planning, scenarios, service
from aeroready.api.main import app

PW = "-26249"


def login(c, user):
    r = c.post("/api/auth/login", json={"username": user, "password": user + PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture()
def c(tmp_path, monkeypatch):
    monkeypatch.setattr(opstate, "STATE_DIR", tmp_path / "state")
    monkeypatch.setattr(datastore, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(scenarios, "SCENARIOS_PATH", tmp_path / "scenarios.json")
    service.clear_cache()
    planning._results.clear()
    with TestClient(app) as client:
        yield client
    service.clear_cache()
    planning._results.clear()


def test_login_and_role_checks(c):
    assert c.post("/api/auth/login", json={"username": "commander", "password": "nope"}).json()["detail"] == "Incorrect username or password"
    assert c.get("/api/fleet").status_code == 401
    tech = login(c, "tech.bs.1")
    assert c.get("/api/fleet", headers=tech).status_code == 403
    assert c.post("/api/plans/working", headers=tech).status_code == 403
    cmd = login(c, "commander")
    assert c.post("/api/plans/working", headers=cmd).status_code == 403
    assert c.get("/api/summary", headers=cmd).status_code == 200
    assert c.get("/api/model/metrics", headers=cmd).status_code == 403
    me = c.get("/api/auth/me", headers=login(c, "planner.bs")).json()["user"]
    assert me == {"username": "planner.bs", "name": "Planner BS", "role": "planner", "base_id": "BS"}


def test_full_workflow(c):
    pl, cmd, tech = login(c, "planner.bs"), login(c, "commander"), login(c, "tech.bs.1")

    # Planner: draft from the optimizer
    draft = c.post("/api/plans/working", headers=pl).json()
    pid = draft["id"]
    assert draft["status"] == "Draft" and draft["version"] == 1
    plan = c.get(f"/api/plans/{pid}", headers=pl).json()
    bs = [r for r in plan["recommendations"] if r["base_id"] == "BS" and r["status"] == "Proposed"]
    assert len(bs) >= 3

    # Planner BN cannot decide on a BS recommendation
    assert c.post(f"/api/plans/{pid}/recommendations/decide", headers=login(c, "planner.bn"),
                  json={"key": bs[0]["key"], "action": "accept"}).status_code == 403
    # Accept some, reject one with reason (reason required)
    acc = c.post(f"/api/plans/{pid}/recommendations/accept", headers=pl, json={"keys": [bs[0]["key"], bs[1]["key"]]}).json()
    assert len(acc["accepted"]) == 2
    rej_key = next(r["key"] for r in bs[2:] if r["type"] != "order")
    assert c.post(f"/api/plans/{pid}/recommendations/decide", headers=pl, json={"key": rej_key, "action": "reject"}).status_code == 422
    assert c.post(f"/api/plans/{pid}/recommendations/decide", headers=pl,
                  json={"key": rej_key, "action": "reject", "reason": "Bay crew on leave"}).status_code == 200

    # Move one task: an infeasible day gives specific violations; a feasible day succeeds
    plan = c.get(f"/api/plans/{pid}", headers=pl).json()
    job = next(j for j in plan["jobs"] if j["base_id"] == "BS" and j["kind"] == "scheduled"
               and plan["optimized"]["starts"][j["id"]][0] is not None and j["id"] not in plan["plan"]["locks"])
    cur = plan["optimized"]["starts"][job["id"]][0]
    checks = {d: c.post(f"/api/plans/{pid}/tasks/{job['id']}/check", headers=pl, json={"day": d}).json()
              for d in range(job["earliest"], min(job["latest"], plan["horizon_days"] - 1) + 1) if d != cur}
    bad = [v for v in checks.values() if not v["ok"]]
    good = [d for d, v in checks.items() if v["ok"]]
    assert good, "no feasible alternative day"
    if bad:
        assert any(s.startswith("Base ") or s.startswith("Part ") or "must start" in s for s in bad[0]["violations"])
    r = c.post(f"/api/plans/{pid}/tasks/{job['id']}/move", headers=pl, json={"day": good[0], "comment": "Align with crew roster"})
    assert r.status_code == 200 and r.json()["locks"][job["id"]][0] == good[0]

    # Submit, commander returns with comment, planner fixes and resubmits
    assert c.post(f"/api/plans/{pid}/submit", headers=pl, json={"comment": ""}).json()["status"] == "Submitted"
    assert c.post(f"/api/plans/{pid}/move", headers=pl).status_code in (404, 405)
    assert c.post(f"/api/plans/{pid}/return", headers=cmd, json={"comment": ""}).status_code == 422
    assert c.post(f"/api/plans/{pid}/return", headers=cmd, json={"comment": "Explain the deferral at BS"}).json()["status"] == "Returned"
    assert any(n["kind"] == "plan_returned" for n in c.get("/api/notifications", headers=pl).json()["notifications"])
    assert c.post(f"/api/plans/{pid}/tasks/{job['id']}/lock", headers=pl, json={"locked": True}).status_code == 200
    assert c.post(f"/api/plans/{pid}/submit", headers=pl, json={"comment": "Deferral explained"}).json()["status"] == "Submitted"
    review = c.get(f"/api/plans/{pid}/review", headers=cmd).json()
    assert review["changes"] and len(review["series"]["plan"]) == review["horizon_days"]

    # Commander approves; work orders released for the next 7 days
    ap = c.post(f"/api/plans/{pid}/approve", headers=cmd, json={"comment": ""}).json()
    assert ap["plan"]["status"] == "Approved" and ap["plan"]["active"] and ap["work_orders_released"] > 0
    assert c.get("/api/plans/status", headers=tech).json()["label"] == "Approved plan, v1"

    # Technician: completes one work order, reports a defect grounding an aircraft
    wos = c.get("/api/work-orders", headers=tech).json()["work_orders"]
    assert wos and all(w["technician"] == "tech.bs.1" for w in wos)
    w = wos[0]
    assert c.post(f"/api/work-orders/{w['id']}/complete", headers=tech, json={"actual_hours": 5}).status_code == 409
    assert c.post(f"/api/work-orders/{w['id']}/start", headers=tech).json()["status"] == "In progress"
    done = c.post(f"/api/work-orders/{w['id']}/complete", headers=tech,
                  json={"actual_hours": w["est_hours"], "parts_used": [{"part_id": p["part_id"], "qty": 1} for p in w["parts"]],
                        "findings": "No further findings"}).json()
    assert done["status"] == "Completed" and len(done["history"]) == 3

    before = c.get("/api/summary", headers=cmd).json()["aircraft_days"]["optimized"]
    tail = next(a["id"] for a in c.get("/api/meta", headers=tech).json()["aircraft"] if a["id"] != "A-12")
    d = c.post("/api/defects", headers=tech, json={"aircraft_id": tail, "system": "Hydraulics",
                                                   "description": "Leak at main gear actuator", "serviceable": False}).json()
    assert d["status"] == "Reported"
    after = c.get("/api/summary", headers=cmd).json()["aircraft_days"]["optimized"]
    assert after < before                       # readiness reflects the grounding
    assert any(n["kind"] == "defect_reported" for n in c.get("/api/notifications", headers=pl).json()["notifications"])

    # Planner converts the defect to a task and re-runs the optimizer
    conv = c.post(f"/api/defects/{d['id']}/convert", headers=pl).json()
    assert conv["defect"]["status"] == "Planned" and conv["day"] is not None
    new = conv["plan_id"]
    assert c.get(f"/api/plans/{new}", headers=pl).json()["plan"]["version"] == 2
    assert c.post(f"/api/plans/{new}/optimize", headers=pl).status_code == 200

    # Audit log has every step
    actions = {a["action"] for a in c.get("/api/audit", headers=cmd).json()["entries"]}
    for x in ["Created draft plan", "Accepted recommendation", "Rejected recommendation", "Moved task", "Submitted plan for approval",
              "Returned plan to planner", "Approved plan", "Released work order", "Work order in progress", "Work order completed",
              "Reported defect", "Defect planned", "Ran optimizer"]:
        assert x in actions, x


def test_data_scenarios_model(c):
    pl = login(c, "planner.bn")
    assert c.get("/api/model/metrics", headers=pl).json()["datasets"]["FD001"]["rmse_p50"] > 0
    tmpl = c.get("/api/data/template/capacity", headers=pl).text
    bad = c.post("/api/data/upload/capacity?filename=x.csv", headers=pl, content="base_id,agency_name,bays,tech_hours_per_day\nBN,X,-1,64\n").json()
    assert not bad["ok"] and bad["errors"][0]["column"] == "bays"
    assert c.post("/api/data/upload/capacity?filename=c.csv", headers=pl, content=tmpl).json()["ok"]
    assert c.post("/api/data/reset", headers=pl).json()["ok"]
    cmd = login(c, "commander")
    s = c.post("/api/scenarios", headers=cmd, json={"name": "Bearing slip", "scenario": {"part_delays": [{"part_id": "P04", "days": 10}]}})
    assert s.status_code == 201
    assert c.get(f"/api/plan?scenario={s.json()['id']}", headers=cmd).json()["scenario_name"] == "Bearing slip"
