# Subway terminology and wording audit

Audited 2026-09-16 against merged rules v25 / PR #187. Wording corrections do
not approve balance or remove the rulebooks’ DRAFT — NEEDS OWNER REVIEW status.

## Shared vocabulary

| Term | Meaning / wording rule |
|---|---|
| Company / player | The company is controlled by a player; bots may control companies in tests. |
| Line | One colored line with one Line Contract. Use line rather than route. |
| Line Contract | Purchased color, recipe, price and completion score; distinct from Line Engineering cards. |
| Station | One placed peg. One station per hole. Use station rather than node. |
| Peg space | Distance unit, not a count of stations. Peg remains appropriate for physical instructions. |
| Transfer station | Local group of horizontally/vertically adjacent stations; use this rather than cluster. |
| Card transfer | For Station cards, only adjacency between different lines joins a qualifying group. Same-line adjacency does not bridge card groups. Ordinary transfer cards require your own lines; Opponent Contact permits opponents. |
| Largest Transfer Station | Public award includes same-line adjacency. An isolated station counts as size one for this award. Aggregate company stations across all tied-largest groups; preserve 6/3/2/0 awards. |
| Network | Your connected lines; opponents never bridge your network. |
| Longest Network | Longest continuous trail of completed segments, measured along actual paths, with no segment reused. |
| Segment / leg | One contract recipe entry between stations / one straight part of that segment. |
| Bend / worksite | Path vertex / unfinished tip; neither is a station or qualifying line end. |
| Round / turn / construction activation | Cycle of company turns / one company’s opportunity / one hired line’s action. Delayed construction may stop before completing a segment. |
| Line Ends Only | Starter station or final station of a completed line. A growing unfinished tip does not qualify. |
| Consecutive Stations | Successive stations on one line, joined by one segment. |
| One Transfer Station / Distinct Transfer Stations | One qualifying card group / separate qualifying groups counted once each. |
| Neighborhood | Served by a station inside its footprint, never by passing string. |
| Destination card | Connect listed neighborhoods in any order through your own network. |
| Engineering card | Seven Line, seven Station and seven Neighborhood cards. IDs, requirements and VP unchanged. |
| Transfer access | $1M once per line, opponent and qualifying local transfer station, including starter joins. |
| Line contact / crossing | New qualifying opposing contacts cost $1M separately from transfer access. |
| $M / VP | Millions of game dollars / victory points. |

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
change is made. The owner approved replacing node/cluster/route in current player copy with
station/transfer station/line, including card tags and public-award labels.

Retained intentionally: internal identifiers such as currentPeriod, stationIds
(neighborhood IDs), largestStation (legacy report key), retired schedule/card
compatibility code, historical decisions and playtest exports. They are not a
new player vocabulary or permission to use retired mechanics. The old ScheduleBoard
is not the active crew board. This audit does not claim to rename every source
identifier or rewrite historical evidence. Graphics text is a checklist, not final art.

## Acceptance / non-goals

Mode-aware crew text on active schedule/help/phone; distances distinguish peg
spaces from pieces; active round labels agree; current rules and reports describe
no stacking and station groups. Build, lint and Subway suite pass; independent
review required for the multi-surface wording update. No mechanics, state schema,
card balance, batch-simulation selector or historical-export changes.

Copy changes in rules-fingerprint inputs produce a new fingerprint. State schema
remains v25; historical exports and internal identifiers are preserved.
