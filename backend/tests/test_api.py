import pytest
from fastapi.testclient import TestClient

from aeroready import datastore, scenarios, service
from aeroready.api.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Uploads and saved scenarios go to a temp dir so tests never touch real data.
    monkeypatch.setattr(datastore, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(scenarios, "SCENARIOS_PATH", tmp_path / "scenarios.json")
    service.clear_cache()
    with TestClient(app) as c:
        yield c
    service.clear_cache()


def test_core_views(client):
    assert client.get("/api/health").json()["ok"]
    s = client.get("/api/summary").json()
    assert s["aircraft_days"]["gain"] == s["aircraft_days"]["optimized"] - s["aircraft_days"]["reactive"] > 0
    assert len(s["series"]["optimized"]) == s["horizon_days"] and len(s["top_recommendations"]) <= 5
    assert s["aircraft_at_risk"]["count"] == len(s["aircraft_at_risk"]["tails"]) > 0
    sb = client.get("/api/summary?base=BS").json()
    assert sb["fleet_size"] < s["fleet_size"]
    assert client.get("/api/summary?base=XX").status_code == 404

    fleet = {a["id"]: a for a in client.get("/api/fleet").json()["aircraft"]}
    assert fleet["A-12"]["status"] == "grounded" and fleet["A-12"]["grounded_all_horizon"]
    assert {a["status"] for a in fleet.values()} <= {"ready", "scheduled", "at_risk", "grounded"}

    det = client.get("/api/aircraft/A-20").json()
    assert det["planned_work"] and det["engines"][0]["rul_history"]["p50"]
    assert any(c["role"] == "receiver" for c in det["cannibalizations"])
    assert client.get("/api/aircraft/NOPE").status_code == 404

    cap = client.get("/api/capacity").json()
    for b in cap["bases"]:
        assert all(d["bays_used"]["optimized"] <= d["bays"] for d in b["days"])

    sp = client.get("/api/spares").json()
    assert sp["cannibalizations"] and all("aircraft_days_gained" in c for c in sp["cannibalizations"])
    assert any(t["part_id"] == "P01" for t in sp["shortage_timeline"])

    assert client.get("/api/recommendations?type=cannibalize").json()["recommendations"]


def test_model_endpoints(client):
    m = client.get("/api/model/metrics").json()
    assert m["datasets"]["FD001"]["rmse_p50"] > 0 and m["trained_at"]
    pr = client.get("/api/model/predictions").json()["datasets"]
    assert len(pr["FD001"]) == m["datasets"]["FD001"]["n_test_engines"]
    imp = client.get("/api/model/importance").json()
    assert abs(sum(s["gain_share"] for s in imp["sensors"]) - 1) < 0.01


def test_scenarios_roundtrip(client):
    body = {"name": "Bearing slip", "scenario": {"part_delays": [{"part_id": "P04", "days": 10}]}}
    saved = client.post("/api/scenarios", json=body).json()
    assert client.post("/api/scenarios", json=body).status_code == 409
    ids = [s["id"] for s in client.get("/api/scenarios").json()["scenarios"]]
    assert ids[0] == "baseline" and saved["id"] in ids
    plan = client.get(f"/api/plan?scenario={saved['id']}").json()
    assert plan["scenario_name"] == "Bearing slip"
    assert plan["optimized"]["aircraft_days"] <= client.get("/api/plan").json()["optimized"]["aircraft_days"]
    assert client.delete(f"/api/scenarios/{saved['id']}").status_code == 204
    assert client.get(f"/api/plan?scenario={saved['id']}").status_code == 404
    bad = {"name": "x", "scenario": {"sortie_rates": [{"scope": "base", "id": "ZZ", "sorties_per_day": 1}]}}
    assert client.post("/api/scenarios", json=bad).status_code == 422


def test_upload_validation_and_reset(client):
    tmpl = client.get("/api/data/template/capacity").text
    assert tmpl.startswith("base_id,agency_name,bays,tech_hours_per_day")
    bad = "base_id,agency_name,bays,tech_hours_per_day\nBN,X,-1,64\nQQ,Y,2,abc\n"
    r = client.post("/api/data/upload/capacity?filename=bad.csv", content=bad).json()
    assert not r["ok"]
    cols = {(e["row"], e["column"]) for e in r["errors"]}
    assert (1, "bays") in cols and (2, "tech_hours_per_day") in cols
    assert client.get("/api/meta").json()["data_origin"] == "simulated"

    good = tmpl.replace("BS,BS Servicing Flight,2,", "BS,BS Servicing Flight,3,")
    r = client.post("/api/data/upload/capacity?filename=cap.csv", content=good).json()
    assert r["ok"], r
    assert client.get("/api/meta").json()["data_origin"] == "uploaded"
    src = {s["id"]: s for s in client.get("/api/data/sources").json()["sources"]}
    assert src["capacity"]["origin"] == "User upload"
    assert client.get("/api/capacity").json()["bases"][2]["days"][0]["bays"] == 3

    assert client.post("/api/data/reset").json()["ok"]
    assert client.get("/api/meta").json()["data_origin"] == "simulated"
    a = client.get("/api/data/assumptions").json()
    assert a["statements"] and a["config"]["seed"]
