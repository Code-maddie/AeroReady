# AeroReady: 3-minute demo script

**Setup:** run `.\start.ps1` from the project root and open http://localhost:8000 full-screen (1280 px or wider).
Figures below are from the deterministic default scenario; the screen always shows the live values.

---

### 0:00–0:30 · The question (landing page)
> "Commanders don't ask for a remaining-life number. They ask how many aircraft they can fly each day this month, and what to change to fly more."

- Read the headline. Point at the live chart on the right: grey dashed is reactive maintenance, amber is the optimised plan, and the figure above it is the aircraft-days difference.
- Scroll once through **The problem** (it cites SIH problem statement 26249) and **How it works** (four steps).
- Click **Open console**.

### 0:30–1:00 · Overview (/app/overview)
- Tiles: mission-ready today, 30-day average (optimised vs reactive), aircraft-days gained, aircraft at risk.
- Hover the chart around Day 13 to show the reactive dip and the per-day difference.
- Note that Day 0 is lower in the optimised plan, because aircraft are taken in early. That investment pays back for the rest of the month.
- Risk watchlist: engines whose P10 falls inside the horizon, and what each plan does about them.

### 1:00–1:40 · Plan (/app/plan)
- Switch the Gantt to **Compare**. A-20 shows engine work bundled with two inspections on Days 2–4 in the optimised row; in the reactive row it fails on Day 5 and waits for a part.
- Click A-20's predictive block. The side panel shows the part source: cannibalised from A-12, which is grounded all horizon. Stock is zero and the lead time is 21 days.
- Scroll to the **capacity heatmap**. The Southern base bays are the bottleneck.
- Filter recommendations to **Cannibalise**.

### 1:40–2:00 · Why trust the forecast (/app/fleet/A-20)
- RUL band from the NASA C-MAPSS trajectory; true RUL shown for validation only. Contributing sensors (SHAP) and sensor trends.
- Planned work table: what the optimised plan does and what the reactive baseline would have done.

### 2:00–2:35 · What-if (/app/scenarios)
- **Delay a part:** P04 main bearing, 10 days. Select **Run scenario**.
- Read the result: aircraft-days change against the baseline scenario, one unplanned failure, and the recommendations that were added, removed or moved. The A-10 engine repair can no longer happen in time.
- Save it as "Bearing slip". It appears in the top-bar scenario switcher.
- Add a **Surge requirement** (for example at least 21 aircraft, Days 10 to 16) and run again. The Surge tile says whether the target is met and on which days it is not.

### 2:35–3:00 · Spares and data (/app/spares, /app/data)
- Spares: the shortage timeline shows A-20 waiting in the reactive baseline, and the cannibalisation table shows the aircraft-days each action gains.
- Data sources: four integrated sources, which data is real (C-MAPSS) and which is simulated, CSV templates and uploads, and the assumptions list read from the generator's config file.
> "Health data, records, spares and hangar capacity in one model, and an optimiser that turns them into more aircraft available. Next: real system integration and validation with maintenance engineers."

---

**If something goes wrong**
- *"Cannot reach the AeroReady service":* the backend is not running; run `.\start.ps1` again, then select **Retry**.
- *An upload was rejected:* the table lists each row and column at fault; nothing was changed. **Reset to simulated scenario** restores the default data.
