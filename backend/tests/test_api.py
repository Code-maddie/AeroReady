from fastapi.testclient import TestClient

from aeroready.api.main import app


def test_endpoints():
    with TestClient(app) as c:
        assert c.get("/api/health").json() == {"ok": True}
        meta = c.get("/api/meta").json()
        assert meta["synthetic"] and meta["rul_metrics"]["datasets"]["FD001"]["rmse_p50"] > 0

        fleet = c.get("/api/fleet").json()["aircraft"]
        assert len(fleet) == 24
        by_id = {a["id"]: a for a in fleet}
        assert by_id["A-12"]["status"] == "red" and not by_id["A-12"]["available_today"]
        assert by_id["A-20"]["status"] == "red"

        det = c.get("/api/aircraft/A-20").json()
        assert det["engines"][0]["rul_history"]["p50"] and det["recommendations"]
        assert c.get("/api/aircraft/NOPE").status_code == 404

        plan = c.get("/api/plan").json()
        assert plan["gain_aircraft_days"] > 0 and len(plan["optimized"]["available_per_day"]) == 30

        what_if = c.post("/api/plan", json={"part_delays": [{"part_id": "P04", "days": 10}],
                                            "surge": {"start_day": 10, "end_day": 16, "min_available": 21}})
        assert what_if.status_code == 200 and what_if.json()["scenario"]["part_delays"][0]["days"] == 10
        assert c.post("/api/plan", json={"part_delays": [{"part_id": "X", "days": 1}]}).status_code == 422

        sp = c.get("/api/spares").json()
        assert {p["id"] for p in sp["parts"]} >= {"P01", "P04"} and sp["cannibalizations"]
