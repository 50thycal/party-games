# PRWK analysis

Source: owner-pasted state-v20 report, 66 accepted actions, two companies. Transcribed
from chat with normalized formatting. This is a legacy reference, not a verified
replay or an all-human calibration game: build hash, RNG tape, initial state and
human/bot controller provenance were not supplied. No rejected attempts are known.

## Economy reconciliation

| Company | Starting | Routes | Crews | Survey | Paid toll | Completion income | Received toll | Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Company 1 | 40 | -29 | -15 | 0 | 0 | +3 | +1 | 0 |
| Company 2 | 40 | -17 | -17 | -1 | -1 | +9 | 0 | 13 |

All amounts are millions. No budget arithmetic discrepancy found. Company 1 spent
$12M more on procurement, built 12 of 18 required segments and completed one line.
Company 2 built all 13 required segments and earned three completion bonuses.
Company 1's temporary -$1M balance in round 6 was resolved by its completion bonus.

The expensive portfolio has structural cash pressure: 18 builds in nine rounds
cost at least $27M in crews (nine two-crew rounds at $3M; using three crews costs
more for the same total). Even if all lines completed, 40 - 29 - 27 + 9 = -$7M
before net tolls and optional surveys. The actual +$1M received toll would reduce
that hypothetical debt to $6M. This is a lower bound, not proof that the same paths
could be completed using that schedule. Company 2's 13 builds need at least $17M
(four two-crew rounds and five one-crew rounds), exactly its observed spending.

This supports reviewing route prices, required builds and crew costs together,
not assuming a universal starting-cash increase is justified. Current rules intend
budget pressure. No economy/rule change is authorized or implemented here.

## Scoring and timing

Both companies scored zero from all six Engineering cards combined. Company 1's
incomplete lines cost 14 VP (-8 Teal, -6 White). Teal was one segment short; finishing
it changes its route score from -8 to +7, a 15 VP swing before other effects.
Company 1 still earned 11 Destination VP versus Company 2's 4. Route scoring was
therefore the largest source of the 20 VP final gap.

Construction ended 28m20.319s after START_GAME. The 31→32 action interval alone is
10m59.510s; no inference about active thinking time or a software hang is warranted.

## Follow-up interpretation

Retain this as one observed portfolio case for future balance comparison. Obtain
the downloadable replay JSON for exact replay and controller provenance if available.
Do not infer bot personality, actual human count, unavailable actions or calibration
success from this report. Duplicate card text and the three interaction/export
requests are addressed separately in the same WS-005 continuation.
