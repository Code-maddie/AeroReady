from aeroready.fleet.generator import generate_fleet


def test_fleet_is_deterministic_and_consistent():
    a, b = generate_fleet(), generate_fleet()
    assert a.model_dump() == b.model_dump()
    assert a.synthetic and "SYNTHETIC" in a.data_notice
    assert len(a.aircraft) == 24 and {x.base_id for x in a.aircraft} == {"BN", "BC", "BS"}
    engines = a.engine_by_id()
    for ac in a.aircraft:
        assert 1 <= len(ac.engine_ids) <= 2
        assert all(engines[e].aircraft_id == ac.id for e in ac.engine_ids)
    assert len({(e.cmapss_dataset, e.cmapss_unit) for e in a.engines}) == len(a.engines)
    parts = a.part_by_id()
    assert 8 <= len(parts) <= 12 and all(3 <= p.lead_time_days <= 21 for p in parts.values())
    for t in a.tasks:
        assert t.window_open <= t.due_day and all(p in parts for p in t.parts)
        codes = [x.name for x in a.tasks if x.aircraft_id == t.aircraft_id]
        assert len(codes) == len(set(codes))
    assert all(2 <= ag.bays <= 4 for ag in a.agencies)
    assert all(-60 <= e.day < 0 for e in a.log)
