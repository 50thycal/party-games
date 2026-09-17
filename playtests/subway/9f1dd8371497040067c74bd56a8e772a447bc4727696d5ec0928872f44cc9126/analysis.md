# Analysis

## Evidence and limitations

QNHT, 2026-09-17, state v25, bot policy v6, delayed construction. Two companies:
Company 1 human (32 recorded gameplay actions); Company 2 bot (30). This Markdown
is mixed human/bot evidence, archived as legacy/reference by the ingestion format.
It is not a full replay export; exact replay and rejected attempts are unavailable.

## Why construction ended

The session explicitly records ROUND_LIMIT. Accepted action 63 is Company 2's
round-nine BUILD, transitioning CONSTRUCTION to SCORING. Action 64 reveals results.
Both companies acted in round nine. The current reducer ends after the final
company's turn in round nine. This was not an all-lines-complete ending: Company 1
still had Purple at 5/6 segments and Green at 1/6 with an unfinished worksite.

## Score and cash

Bot won 12–3. Bot completed three four-segment lines: 4+4+4=12 VP. Human completed
Brown (+5), left Purple (-7) and Green (-6), but won Longest Network (+5) and
Largest Transfer Station (+6): 5-7-6+5+6=3. Neither company scored any private card.

Human: $40 - $24 contracts - $20 crews - $1 tolls + $2 received tolls + $3 completion
= $0. Bot: $40 - $16 contracts - $15 crews - $2 tolls + $1 received toll + $9 completion
= $17. No final debt penalties. Cash was not converted into VP automatically.

The human bought 17 total segments versus the bot's 12. Delayed bends add crew
activations without completing a segment, increasing this already larger workload.
The bot's cheaper, shorter portfolio secured completion VP; the human achieved
the public awards but unfinished penalties erased most gains. This one game does
not establish general balance or show that more rounds necessarily solve it.

## Parked experiment — not implemented

Owner proposed ending after the last player finishes their final line, then giving
remaining players in that round their turn. Clarify first-company versus last-company
trigger and a fallback for blocked lines before designing a variant. Preserve the
current nine-round/no-legal-construction rules in this UI PR.
