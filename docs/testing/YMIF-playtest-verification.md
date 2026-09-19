# YMIF combined-bundle verification — 2026-09-19

Scope: approved changes merged in PRs #194 and #195. Local baseline:
`2f9f545379d13ab0b440630e8166a84c3ffaef90` (main, rules v29).
Public browser target: https://party-games-flame.vercel.app/.
This is agent-controlled acceptance testing and automated simulation, **not a
four-human playtest or balance study**. The original YMIF human report remains in
`playtests/subway`; this document does not invent another human export.

## Live browser run

Completed room **WZQC**, four companies, delayed construction and exact length.
Company 1 was controlled interactively through drafting, all three starters,
card purchases, and the first delayed segment over two construction turns.
Companies 2–4 were lab bots. Company 1 was then switched to a bot through the
visible lab controls and the room completed all nine rounds and final scoring.

The shared board ran in a desktop browser viewport. A separate companion ran at
390 × 844 inside the application's viewport inspector: navigate its embedded
page through Leave room → Subway multiplayer → My testing phone → WZQC.
This used real room UI and server actions; no hidden state or injected actions.
844 × 390 also correctly requested portrait orientation.

Observed:

- Setup exposed delayed construction as the default, exact length as the default,
  and flexible length as the optional mode; the legacy straight option was hidden.
- Draft line cards showed summed length. Company 1's Green recipe 3,5,2,4,3,5
  displayed 22. Draft cards did not show an active first segment.
- Engineering face-up drafting worked on the phone and replenished the row.
  Random Engineering drafting worked from both tablet and phone. Tablet copy
  directed face-up choices to the phone.
- At phone portrait width, goal glyphs and Destination chips sat beside the route
  rows in the compact status panel. Held Engineering cards preceded the permanent
  face-up market and its “Draw more on your turn · $3M” band.
- The phone displayed the brief “Your turn” banner; it disappeared afterward.
  It contained no payment recap.
- Shared-board route progress showed only the active company's three routes in
  one horizontal strip, including starter stations. Award slivers appeared above
  their respective company panels and changed with the leaders/ties. A matching
  compact award icon appeared on Company 1's phone while it held a transfer award.
- Own GR/BR/PU station abbreviations were visibly larger and in their line colors;
  opponent labels retained their smaller size. Neighborhood size labels were readable.
  Engineering artwork showed black station outlines.
- Adjacent starter placement did not charge a station fee: Company 1 stayed at
  $16M. Subsequent actual line contact paid it $1M, bringing it to $17M.
- Phone face-up Engineering purchase charged $3M ($17M → $14M), added the selected
  card, and replenished the two-card row. Tablet random Destination purchase charged
  another $3M ($14M → $11M). Both one-extra-per-game limits then disabled purchases.
  The phone still displayed the Engineering market below its four held cards.
- Destination faces displayed “Complete to earn $2M” for pairs and “$3M” for triples,
  and the Destination draw area showed the price and existing purchase limit.
- A Green segment with printed length 3 stopped after a two-space first leg.
  Exactly one “Segment endpoint” badge appeared beside four yellow endpoint dots.
  Dismissing it removed only the badge. It remained absent after handoff, on the
  next activation, and with nine subsequent yellow lookahead dots visible.
- The next Green activation had one space remaining; “Stop at a bend” was disabled.
  Finishing the segment succeeded. A bend did not reset the segment's length budget.
- Tablet “Since your last turn” dialogs appeared and automatically cleared.
  The observed later dialogs had $0 net change. Positive payer subtotals and totals
  are verified in the automated projected-recap tests below; the initial live $1M
  receipt dialog was not captured before its timeout.
- The completed room showed final cash $−9M → −18 VP for Company 1, $16M → +3 VP
  for Company 2, $7M → +3 VP for Company 3, and $0M → 0 VP for Company 4.
  Final scores were −14, 34, 29, and 1. Phone General and shared-board results agreed.

No confirmed product defect was found in these flows. No gameplay/rule change
was needed. The PR strengthens regression coverage and records acceptance.

## Automated acceptance map

Run from repository root: `npm run build`, `npm run lint`, `./scripts/test-subway.sh`.
The suite compiles and executes the following existing and expanded checks:

| Approved behavior | Coverage |
|---|---|
| Line totals, draft highlighting, station counts/art, own labels, compact glyphs/award strips | `subway-gzzf-test.tsx`, `subway-engineering-art-test.tsx`, status tests; 21 diagrams and 105 card-state renders |
| Brief banner, polling/refresh deduplication, current-company route strip | `subway-status-ui-test.mjs`: timer expiry, repeated polls, turn change, remount/session persistence and actor switch |
| Exact/flexible lengths; bends share budget; one bend; delayed default | `subway-bends-test.ts`, guidance/render tests; complete token/delayed 2/3/4-player games and replays |
| Debt multiplier, positive thresholds, final ledger | `subway-multiplayer-test.ts`: boundaries and range −12…12, spectrum/ledger agreement, borrowing |
| Free multi-owner starter/station joins; independent string tolls and Undo | `subway-transfers-test.ts` and build-cost/reducer comparisons |
| Payment recap, payer names/totals, bank separation | Existing focused summary tests plus **72** public-tablet vs authoritative recaps over complete companion games, **43 with income** |
| Destination reward labels, pay-once and Undo | Card-render tests and actual completion/purchase/Undo reducer checks |
| One yellow badge, legal endpoint lookahead | Board render count, lookahead purity and reducer legality; live dismissal/handoff described above |
| Optional card price, hidden-deck availability, refill and per-player limits | Expanded companion regression: **all 9 companies across 2/3/4-player games buy both extras**, using actual post-draft balances; face-up and random phone/tablet paths; per-purchase deck counts, four/three held-card counts and both caps |
| Full-game integration | 36 complete 2/3/4-player simulations, companion complete games, lab simulations/replays and complete 2/3/4-player iPad API games |

The expanded tests retain stale-revision rejection, request idempotency, device
permissions, hidden-deck projection, destination privacy, handoffs and replay checks.
The last four-player buyer succeeds with three Engineering cards remaining in the
random pile plus two face-up cards, and 18 Destinations remaining.

## Limits and deferred decisions

Browser evidence is desktop/portrait-width rendering and pointer interaction,
not physical iPhone/iPad Safari or multitouch testing. Same-game browser reload
of the yellow badge was not separately exercised; handoff/remount was exercised.
The persistence code remains unchanged. Banner refresh persistence is automated.
Positive receipt attribution is an automated projection check, not a captured
positive-income browser dialog. Flexible-length legality and token bends are
covered by reducers/simulations rather than an additional live room.

No balance conclusion is drawn from bots. KC's strategy, lower-player extra lines,
the polished tutorial, and early third-line completion remain the previously
parked owner decisions. Purchase caps and deck sizes remain unchanged.
