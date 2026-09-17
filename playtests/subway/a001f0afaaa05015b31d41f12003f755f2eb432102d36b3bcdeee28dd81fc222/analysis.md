# DGLE playtest review

## Evidence and validation

Human versus human, two companies, exported at state version 25 as legacy Markdown (no replay
tapes): reference-only, replay unavailable, not a calibration baseline. All 68 accepted actions
parse; consecutive before/after snapshots agree. 33 and 33 human gameplay actions, no bot
actions. Rejected attempts, screens and intentions cannot be verified from this file.

## Results and economy

Construction ended at round 9 (ROUND_LIMIT) after 61m32s. No funny business wins 31–28 with
2/3 lines complete against 3/3, on Destination VP (11 vs 7), Longest network (5) and Largest
Transfer Station (6).

| Metric | No funny business | Uh uh uh uh ahhh |
| --- | ---: | ---: |
| Route purchase spend | $24M | $21M |
| Crew spend | $22M | $25M |
| Tolls paid / received | $8M / $8M | $8M / $8M |
| Completion income | $6M | $9M |
| Final cash | $0M | $3M |
| Completed routes | 2/3 | 3/3 |

Cash reconciles: 40-24-22-8+8+6=0 and 40-21-25-8+8+9=3.

## Debt

Every debt episode, from the action log:

| Round | Company | Cash before | Action | Low | Resolution |
| ---: | --- | ---: | --- | ---: | --- |
| 4 | Uh uh uh uh ahhh | $4M | 3 crews ($6M) | −$2M | Completed Short and Tram the same turn, +$6M, ended at $3M |
| 5 | No funny business | $2M | 2 crews ($3M) + $1M toll | −$2M | Completed River the same turn, +$3M, ended at $1M |
| 7–9 | No funny business | $0M | 1 crew per round | −$3M | Completed Orbital on the last build, +$3M, ended at exactly $0M |

The debt penalty (4 VP per $1M) is assessed on ending cash only, so debt bridged inside a turn
by completion cash was free. Debt was also the only late-game liquidity: both companies were
under $5M from round 3; No funny business could afford one crew per round from round 6 and
left Green Line at 4/6 (−6 VP). Without any debt it could not have hired at all in rounds 7–9.

## Rule changes taken to the next playtest (DEC-056)

Crews are paid from cash on hand; only contact tolls can create debt (`crewDebtAllowed`
keeps the previous rule one flag away). Connecting a held Destination pays $2M (pair) or $3M
(triple) once. In this game that would have added $3M and $6M respectively, roughly the
borrowing that occurred, without the same-turn bridge.
