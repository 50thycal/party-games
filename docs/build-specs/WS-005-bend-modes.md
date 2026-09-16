# WS-005 — Optional bend systems

Owner authorized building both experiments on 2026-09-16 after approving the
planning discussion. Significant existing WS-005 continuation. Build OS v0.12
checked against canonical; compatible.

## Goal and approved rules
Choose at game setup: Straight (default), Bend Tokens, or Delayed Construction.
The choice is immutable after start and recorded in saved games and reports.
- Tokens: three per company; one spent per bend; automatic extra purchase at $3M
  each on Confirm, only with available cash. Multiple bends may finish in one
  activated placement. Cancellation costs nothing; Undo restores purchases/tokens.
- Delayed: no tokens; each stop at a bend uses that line's one activated placement,
  not the entire company turn. Hire the line again later to continue remaining
  length. Each extra bend costs another activation. No unbuilt space reservation.
- Straight paths and each leg of a bent path obey the existing maximum 90-degree
  heading change, no overlap, no self-cross/rejoin, occupied-peg and contact rules.
  Total path length matches the recipe with the existing tolerance applied once.
- Bend/worksite markers are not scoring pegs: no neighborhood service, transfers,
  station access or endpoint/card credit. Part-built legs are real geometry and
  charge contacts when built, but give no network length until the segment ends.
- Crossings use actual legs, never the endpoint chord. Existing access remains
  once per line/opponent/station. Completion reward only on actual line completion.
- Nine rounds remain; blocked unfinished work follows existing unfinished penalties.

## Implementation and acceptance
Store completed incoming bends on the endpoint node and work-in-progress on the
line, keeping route nodes synonymous with scoring pegs. Shared physical-leg
helpers feed collision/contact/drawing; network edges use complete path lengths.
Reducer validates untrusted payloads and owns all effects. Setup exposed in local
hotseat and companion host/Lab. Board supports bend preview, cancellation, clear
costs, partial work and remaining length. Existing direct placement stays simple.
Bots/replays remain legal and mode-aware. Tests cover mode persistence/immutability,
geometry/angles, costs/Undo, delayed other-crew retention/round advance/blocking,
non-peg scoring, actual path intersections, reconnect, rendering and full games.
Build/lint/Subway suite plus independent review required. Browser limitation must
be disclosed if still unavailable.

## Non-goals
No economy/card retuning, unrestricted angles, new station pegs at bends, combined
modes, changes to round count or automatic merge. Rulebook remains draft.
