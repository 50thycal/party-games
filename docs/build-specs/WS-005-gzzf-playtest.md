# Build Card and Spec — GZZF playtest corrections

Workstream: WS-005 · Significant continuation · Build OS v0.12
Status: Approved by Calvin in this ChatGPT conversation on 2026-09-13.

## Goal
Bots budget construction against each line's deadline and scoring value, route
toward attainable objectives, and produce understandable human/bot reports.
Starter pegs occupy empty holes; segment chips show actual completed segments.

## Approved behavior
- Check each line's remaining actions against remaining rounds, including the
  current round. Compare completion VP swings, rewards, crews and final debt.
- Use own objectives and optimistic reach checks before choosing starters/builds;
  reward actual connected mission progress and preserve legal continuation.
- Report controller provenance (including mixed play), bot version/profile and
  objective failure/partial-tier explanations. Unknown provenance stays unknown.
- Every new starter rejects another built peg or survey pin, including the same
  company's peg. Ordinary construction transfers/contact remain legal.
- Red at 3/4 shows three checks and its final 3-peg chip next. One shared segment
  count drives fraction, recipe and bar.
- Keep all current money, crew, debt, toll and VP settings.

## Implementation and acceptance checks
Reducer enforces occupancy; legal targets inherit it. State v21 distinguishes
the changed rule from v20 replays/rooms. Policy v2 uses a bounded three-line
schedule search; future tolls and route obstruction remain unknown, so replan
each turn. Own-hand potential functions use current board components and an
optimistic reach bound; this is a heuristic, not proof of objective feasibility.
Controller history is projected only at results from the existing recording
sidecar. No credentials, random tapes or hidden pre-results hands are exposed.

Regression coverage: GZZF Purple deadline, completion versus cheaper crews,
cash pressure, 2–4 player legal simulation/replay, occupied starters across
owners and survey pins, valid adjacent starters, construction sharing retained,
3/4 and 4/4 recipe rendering, exact failed/partial destination/engineering
explanations, mixed control and unknown provenance. Required build, lint and
full Subway suite; browser desktop/phone gameplay where accessible.
Archive original GZZF bytes and distinguish owner observations from analysis.

## Non-goals and limits
No economy retuning, scoring changes, ordinary transfer ban or new missions.
No claim of human balance from bot simulations. No live deployment until the
repository's independent current-head review gate and owner merge are complete.
