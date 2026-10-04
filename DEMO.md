# AeroReady: demo script

Start with `.\start.ps1` (or delete `backend/data/state/` first for a clean run). Accounts and passwords are in the
README. Each step names the account and page.

1. **planner.bn, /planner.** Select *Run optimizer*. Draft v1 appears with its availability chart against the reactive
   baseline and the Gantt for all 24 aircraft.
2. **planner.bn, /planner/recommendations.** Tick three BN recommendations and select *Accept selected*. Reject one
   with a reason; the optimiser re-solves without it.
3. **planner.bn, /planner.** Click a task, enter a day and select *Check constraints*. An infeasible day shows the
   specific violation; a feasible one can be moved with a comment. Select *Submit for approval*.
4. **commander, /commander.** The banner shows the draft awaiting approval. *Review plan* opens the changes, the
   cannibalisations, deferrals and engine risks accepted. Select *Return to planner* with a comment.
5. **planner.bn.** The bell shows the returned plan and the comment. Adjust the task and resubmit.
6. **commander.** *Approve plan*. Work orders for the next 7 days are released.
7. **tech.bn.1, /technician.** Open today's work order, *Start*, then *Mark complete* with hours and findings.
   Then *Report defect* on another aircraft and mark it not serviceable: the aircraft is grounded.
8. **planner.bn, /planner/defects.** *Mark under review*, then *Convert to planned task*: the workspace opens with the
   rectification on the earliest feasible day. *Run optimizer*, submit; the commander approves.
9. **commander, /commander and /commander/reports.** Readiness reflects the grounding and the rectification.
10. **/audit.** Every step above is listed with user, role, action, object, time and comment; *Export CSV*.
