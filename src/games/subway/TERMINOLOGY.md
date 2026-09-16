# Subway terminology and wording audit

Audited 2026-09-16 against merged rules v25 / PR #187. Wording corrections do
not approve balance or remove the rulebooks’ DRAFT — NEEDS OWNER REVIEW status.

## Shared vocabulary

| Term | Meaning / wording rule |
|---|---|
| Company / player | The company is controlled by a player; bots may control companies in tests. |
| Line / route | One colored line with one Line Contract. Route is an accepted synonym, not a network. |
| Line Contract | The purchased color, recipe, price and completion score. Distinct from the Line category of Engineering cards. |
| Peg / node | One placed scoring piece. Node is an accepted synonym retained in card names such as Consecutive Nodes. One peg per hole. |
| Peg space | Unit of measured distance. Recipe numbers are distances, not peg counts. |
| Segment | One printed recipe entry between successive real pegs. It may contain multiple straight legs. |
| Leg | One straight part of a segment, between its start, a bend or its end. |
| Bend / worksite | A path vertex / unfinished construction tip. Neither is a scoring peg, station or qualifying endpoint. |
| Round | One cycle of company turns, up to nine. Use round in active UI; internal period fields are compatibility identifiers. |
| Turn | One company’s opportunity to hire crews and perform its activated construction. |
| Construction activation | One hired line’s action. Finishes a segment in straight/token mode; may stop at a bend in delayed mode. |
| Neighborhood | A named board footprint, served only by a real peg within it. Passing string does not serve it. |
| Transfer station / station cluster | Local horizontally/vertically adjacent pegs on different lines. Own-line transfers connect your network; opponents do not bridge it. |
| Largest Cluster | Separate public goal: adjacent occupied holes across all companies, including the same line. Aggregate company pegs across all tied-largest clusters; award 6/3/2/0. |
| Longest Network | Longest continuous trail of completed segments within your company network, measured along actual paths; no segment reused. An unfinished line may contribute completed segments. |
| Endpoint | For card rules: a starter or final peg of a completed line. An unfinished growing end or worksite does not qualify. |
| Destination card / mission | Connect the listed neighborhoods through your own network, in any order; no starter/final peg requirement. |
| Engineering card / goal | One of 21 cards: seven Line, seven Station, seven Neighborhood. Existing scope tags and VP remain unchanged. |
| Station access | $1M once per line, opponent and station, including starter joins. |
| Line contact / crossing | Every new qualifying opposing contact costs $1M, separately from station access. Own contacts are free. |
| $M / VP | Millions of game dollars / victory points. Extra bend tokens require available cash; crew and contact costs may create debt. |

## Audit coverage and findings

Reviewed active tabletop/crew/card/phone copy, setup and local help, tutorial,
mode descriptions, payment/status explanations, card requirements and scope tags,
quick start, full rulebook, rules reference, graphics checklist and AI report text.
Compared statements with reducer, path, network, transfer and cluster rules.

Corrected: unconditional one-segment-per-crew copy; phone instruction to always
place a peg; period/round wording in active turn labels; contract “build periods”
(which is incorrect in delayed mode); recipe distances labeled as pegs;
ambiguous “different company lines”; starter help omitting station fees; tutorial
and local-help omission of Largest Cluster; stale shared-hole/Survey Pin scoring
wording in rules/report; stale rules-reference state version. Shared crew text is
used by the schedule, local help and phone guidance to prevent these drifting.

Card titles, requirements, 21-card categories, scope tags, values, endpoint rules,
Destination ordering, payment amounts and draft labels were checked. No gameplay
change is needed for those. Peg/node and line/route aliases are explicitly defined
rather than treating every synonym as a different rule.

Retained intentionally: internal identifiers such as currentPeriod, stationIds
(neighborhood IDs), largestStation (legacy report key), retired schedule/card
compatibility code, historical decisions and playtest exports. They are not a
new player vocabulary or permission to use retired mechanics. The old ScheduleBoard
is not the active crew board. This audit does not claim to rename every source
identifier or rewrite historical evidence. Graphics text is a checklist, not final art.

## Acceptance / non-goals

Mode-aware crew text on active schedule/help/phone; distances distinguish peg
spaces from pieces; active round labels agree; current rules and reports describe
no stacking and real-peg clusters. Build, lint and Subway suite pass; independent
review required for the multi-surface wording update. No mechanics, state schema,
card balance, batch-simulation selector or historical-export changes.
