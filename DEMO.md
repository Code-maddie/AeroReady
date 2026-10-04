# AeroReady: 3-minute demo script

**Setup (before the judges arrive)**
1. `cd backend && .venv/Scripts/python -m uvicorn aeroready.api.main:app --port 8000`
2. Or simply run `.\start.ps1` from the project root, which builds the UI and serves everything at http://localhost:8000. Open it full-screen (≥ 1280 px wide).
3. Set the base selector to **All bases**. Optional: run `scripts/run_demo_check.py` once so the numbers below are fresh in your head.

All numbers below come from the deterministic default scenario (seed 26249).

---

### 0:00–0:35 · The question and the headline (landing page, then Readiness)
Start on the landing page (the Typhoon photo with the AeroReady wordmark). The asterisk is the footnote: fleet data is synthetic and engine data is NASA C-MAPSS. Click **Open fleet readiness**.
> "Commanders don't ask for a remaining-useful-life number. They ask *how many aircraft can I fly each day for the next month, and what do I change to fly more?* That's what AeroReady answers."

- Point at the headline: **+58 aircraft-days gained** over 30 days, with the same 24 aircraft, the same hangars and the same spares.
- The chart: grey dashed is **reactive maintenance as done today**; amber is **our optimised plan**. The reactive curve sags to 16 aircraft around Day 13 because six engines fail and the Southern base's two bays jam up. The optimised plan never drops below 20.
- Note honestly that on Day 0 we fly *fewer* aircraft (21 vs 23): we deliberately take A-05 and A-20 in early. From Day 9 onwards the optimised plan flies more aircraft than reactive every single day.
- Tiles: average 21.2 vs 19.2 aircraft per day, 3 critical aircraft, and 6 unplanned failures avoided.

### 0:35–1:20 · One recommendation, one cannibalisation (Plan page)
Click **Open the plan**.
- Read the top recommendation: *"Cannibalise HPC module from A-12 to restore A-20."*
  - A-20's engine is forecast to fail around **Day 5** (P10 3.6 d, P50 5.5 d).
  - The HPC module has **0 in stock and a 21-day lead time**.
  - A-12 is grounded all month for structural repair and holds a serviceable module. The plan takes it on Day 1 and raises a linked removal record.
- In the Gantt, find **A-20**: three blocks stacked on Days 2–4 (engine repair, phase inspection and landing-gear inspection) **bundled into one grounding**. Hover a block to show its window, parts and forecast failure day.
- Toggle **Reactive** at the top right. A-20 is now a long red hatched bar: failed on Day 5 and still waiting for the part at the end of the month. **A-20 alone: 27 vs 5 mission-ready days.**
- Toggle back to **Optimised**. The metric strip shows the summary: failures 6 → 0, engine risk-days 55 → 5.

### 1:20–1:50 · Why we trust the forecast (Aircraft page, A-20)
Click **A-20** (any tail link).
- RUL band chart: the P10–P90 band narrows as the engine approaches failure. It is trained on **NASA C-MAPSS**, and this engine *is* a real C-MAPSS test trajectory.
- **Truth (validation) tile:** the real remaining life was 11 cycles; we predicted 9. That is shown for validation only, and the planner never sees the truth.
- **Contributing sensors:** HPC outlet static pressure and bleed enthalpy pull the forecast down (tree-SHAP). Sensor trends sit next to it.
- One line on metrics: test RMSE 17.7 / 17.3 cycles on FD001 / FD003. Our intervals are a bit narrow, and we say so in the README.

### 1:50–2:25 · What-if 1: a spares delay (What-if page)
Click **What-if**, then the **Spares delay** quick scenario (main bearing supplier slips 10 days). Or open `/what-if?preset=spares`.
- The amber curve re-optimises and animates; the faint dotted line is the previous plan.
- Delta chip: **−7 aircraft-days**. The red **Consequence** callout explains it: *A-10-E1 can no longer be repaired before its forecast failure on Day 20, because the bearing now arrives Day 24.*
- Point out that the optimised plan is still +51 over reactive. The system tells you what a supplier delay costs, before it happens.

### 2:25–2:50 · What-if 2: surge
Click **Surge** (≥ 21 mission-ready aircraft, Days 10–16).
- The shaded band appears. **Reactive misses the target by 26 aircraft-days; the optimised plan meets it exactly (shortfall 0)** by shifting inspections out of the surge window. Total availability is unchanged at 635.
- If there's time, show **Bay closure** too: one Southern-base bay lost for a week costs reactive 5 aircraft-days and the optimised plan **zero**.

### 2:50–3:00 · Close (Spares page)
Click **Spares**: Day-0 orders (seal kits, bearing), the two cannibalisation actions, and supply strips per part.
> "Health data, technical records, spares and hangar capacity in one model, and an optimiser that turns them into more aircraft in the air. Everything here is synthetic except the C-MAPSS engine data; the next step is real HUMS and MIS feeds and validation with maintenance engineers."

---

**If something goes wrong**
- *Red "Backend offline" banner:* the API isn't running; start it (setup step 1) and click **Retry**.
- *Re-plan slow:* scenarios solve in about 0.3–1 s; the first request after start-up can take a few seconds.
