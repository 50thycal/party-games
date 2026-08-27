# Build Spec — Subway Construction Access & Route Lookahead

**Workstream:** WS-003  
**Build Card:** [Approved card](../workstreams/WS-003-subway-construction-access.md#build-card)  
**Build OS:** v0.5  
**Issued:** 2026-08-25  
**Implementation state:** Blocked pending the separately owned Party Games Build OS v0.5 adoption

## 1. Objective

Implement the approved WS-003 follow-up so ordered routes provide two-placement lookahead, Survey
Pins can be fulfilled by any owned line, opposing pegs stop creating broad exclusion zones and may
be shared for payment, construction can run into explicitly penalised debt, and Early Mobilization's
incremental waiver is correct and visible. This spec was issued after checking canonical Build OS
v0.5; Party Games still declares v0.4, so implementation must not begin until the separate adoption
lands and this Design Handoff PR is rebased onto it.

## 2. Owner-approved behavior

> After this change, the system should let players see where a route can go next, buy access to an
> opponent's peg when needed, and finish construction in debt while paying a serious scoring
> penalty.

### Owner decisions

- **OD-1.** All current legal starter/construction targets glow green. Selecting one is a local,
  non-binding preview that shows that candidate's legal following targets in yellow; selecting the
  green candidate again confirms the current placement.
- **OD-2.** Starter placement uses the same interaction: select a green starter hole, see in yellow
  where the recipe's first segment could end, then select the starter again to confirm.
- **OD-3.** Survey Pins are bought and placed during Engineering exactly as today, but are not
  assigned to a line. A pin scores +1 VP once when any line owned by its buyer places a normal node
  on its exact hole.
- **OD-4.** Remove the rule requiring one empty hole beside opposing normal pegs. Adjacency alone is
  legal.
- **OD-5.** During Construction, a player may use an opponent's existing normal route peg as their
  own line's next node by immediately paying that opponent $1M.
- **OD-6.** Paid sharing does not apply to starter placement, station docks, or a hole already used
  by another line owned by the acting player.
- **OD-7.** Only a payment made during Construction may take a company's cash below $0. Procurement,
  Engineering, Scheduling, and starter placement continue to reject unaffordable spending.
- **OD-8.** At scoring, ending cash below $0 scores -2 VP per $1M of debt. Money received later in
  Construction reduces the ending debt and therefore the penalty.
- **OD-9.** Early Mobilization waives only the increase in mobilization surcharge caused by moving
  its selected block one period earlier. Any second-crew cost change remains payable, and the UI
  itemizes the waiver so the player can verify the charge.
- **OD-10.** The existing one-placement Undo reverses a paid shared-node placement completely,
  including both companies' cash balances.

### Implementation discretion

Yours to decide: internal helper/type names, how local preview state is represented, whether second
step targets are derived through a cloned hypothetical state or a behavior-equivalent pure helper,
how shared pegs combine line/company patterns accessibly, the exact compact layout of toll/debt and
waiver disclosures, and behavior-preserving refactors. Do not change the owner-visible rules above.

### Stop / escalation conditions

Stop and raise the conflict if implementation would require any of the following:

- charging a toll other than $1M, penalising debt at another rate, or imposing a debt floor/cap;
- allowing shared starters, station docks, or same-company route nodes;
- making yellow previews persistent, reserving, or authoritative;
- weakening a spatial invariant other than opposing-node adjacency and the explicit paid exception
  for an opposing node;
- waiving second-crew cost through Early Mobilization;
- changing Subway phases, contract recipes, action counts, other prices/VP, or general undo scope;
- proceeding before Party Games adopts Build OS v0.5 on `main` or explicitly records a framework
  deferral approved by the owner.

## 3. Repository context

- Subway's pure state, reducer, geometry, construction queue, scoring, and card economics live in
  `src/games/subway/config.ts`. Rules must remain authoritative there.
- `src/games/subway/GameView.tsx` renders the pegboard, legal targets, Scheduling totals, Engineering
  survey controls, scoring, and the existing client-local Route Planner. WS-003's two-step preview is
  also client-local until confirmation.
- `scripts/subway-rules-test.ts` drives the reducer directly and is the required automated behavior
  harness. Existing coverage already proves one Early Mobilization tier-boundary waiver.
- `src/games/subway/RULES.md` is the player/rules reference and currently documents line-assigned
  Surveys, opposing-node spacing, exclusive normal pegs, and non-negative scheduling.
- `SUBWAY_STATE_VERSION` is 6. WS-003 changes persisted Survey Pin shape and must bump it.
- The room engine polls shared state and applies reducer actions through optimistic locking. A
  concurrent confirmed placement is re-run against current state, so previews can become stale and
  must never be trusted by the reducer.

## 4. Architecture constraints

- Keep the game plugin boundary intact; no engine, API, database, registry, or polling changes.
- Reducer state remains pure and JSON-serialisable. All payments and placements are one accepted
  reducer transition so optimistic retry cannot expose a half-payment.
- The reducer revalidates all confirmed placements. UI highlighting is guidance, never enforcement.
- Preserve ordered recipes, ±0.5 length tolerance, the 90° turn cap, exact station slots, station
  capacity, one connection per line per station, string overlap/pass-through rules, self-crossing,
  Crossing Design, queue/action timing, and one-placement Undo except where explicitly changed.
- Preserve the existing view-only secrecy model. Preview state is genuinely local and is never
  dispatched or persisted.
- Desktop and phone interaction must not rely on hover. Color cannot be the only distinction among
  current targets, selected targets, following targets, paid targets, lines, and ownership.
- Do not edit Party Games' Build OS adoption surfaces in this PR unless resolving a rebase conflict
  after the separately owned adoption lands.

## 5. Implementation requirements

### Placement lookahead

- **R-1 (OD-1).** When the acting player has a starter or construction placement, render every target
  currently accepted by the authoritative rules as a green current target. Exact station docks are
  distinct targets even when they share station coordinates.
- **R-2 (OD-1).** The first activation of a green target selects it locally and dispatches no game
  action. Mark it as the selected current target using shape/pattern or label as well as green.
- **R-3 (OD-1).** For construction, derive yellow following targets as if the selected green target
  had been legally appended to the active line. Apply the next ordered recipe length, turn cap,
  effective station-slot geometry, occupancy/sharing, string, crossing-permit, and completion rules.
- **R-4 (OD-2).** For starter placement, derive yellow targets as if the selected green normal hole
  were the line's starter and the next placement were the first recipe segment. A starter with no
  legal yellow continuation remains confirmable, but the empty preview must be explicit rather than
  silently implying a continuation exists.
- **R-5 (OD-1, OD-2).** Activating the selected green target a second time dispatches the existing
  appropriate placement intent. Activating a different green target moves the local selection and
  recomputes yellow targets instead of placing either target.
- **R-6.** Yellow targets are informational only: they cannot be activated to skip the green step,
  consume no action, reserve nothing, and are recalculated only for the currently selected green
  candidate.
- **R-7.** Clear local selection when the active player, line, action, period, phase, recipe step, or
  authoritative target set changes. If a confirmation races with another action, the reducer's
  current validation wins and no payment/placement occurs on rejection.
- **R-8.** A green or yellow target that is an opponent's shareable peg carries a non-color-only
  `$1M` access indicator. Before confirming a selected paid green target, show recipient, projected
  cash, and projected debt penalty if the game ended at that balance.
- **R-9.** Retain precise pan/zoom/tap behavior on the pegboard. A gesture must not select or confirm
  a target, and a single accidental tap cannot place because confirmation requires the second
  activation.

### Survey Pins

- **R-10 (OD-3).** Remove line assignment from Survey placement state, action requirements, UI, and
  rules. A persisted pin identifies its buyer and normal-hole coordinate only.
- **R-11 (OD-3).** Engineering still purchases 0–5 pins at $1M each during plan lock, then publicly
  places them in the existing alternating SURVEY substep. Purchase affordability, turn order,
  stacking between opponents, no personal duplicate, non-reservation, no stations, and Survey Undo
  remain unchanged.
- **R-12 (OD-3).** A pin is fulfilled if at least one route owned by its buyer contains a normal node
  at the pin coordinate. An opponent route never fulfils it; a station node at the same board
  coordinate does not substitute for the normal hole.
- **R-13 (OD-3).** Each pin scores at most +1 VP even if multiple owned routes could satisfy it. Live
  status and Results no longer name an assigned line and revert automatically if the fulfilling
  placement is undone.
- **R-14.** Render Survey ownership by company identity rather than line identity, retaining an
  accessible label/pattern so stacked opposing pins remain distinguishable.

### Spatial access and paid shared nodes

- **R-15 (OD-4).** Delete the Chebyshev/one-empty-hole exclusion projected by opposing normal route
  nodes. A placement one hole away is not rejected for adjacency.
- **R-16.** Removing adjacency does not remove occupation. An unshared normal hole remains exclusive,
  stations retain exact docks/capacity, and strings still cannot pass through occupied holes.
- **R-17 (OD-5, OD-6).** During a normal `BUILD`, an exact coordinate occupied by one opponent normal
  route node is a candidate paid shared node. It is legal only if every other rule for the acting
  line and proposed segment passes.
- **R-18 (OD-6).** Reject paid sharing during starter placement, at any station coordinate/dock, at a
  node belonging to another line owned by the acting player, or where the acting line already used
  that station/hole as prohibited by existing rules.
- **R-19 (OD-5).** On accepted shared placement, append the coordinate to the acting line as its own
  normal route node, subtract $1M from the actor, and add $1M to the owner of the existing node in the
  same reducer result. The physical hole is shared; line ownership, completion, objectives, Surveys,
  and scoring remain independent.
- **R-20.** Sharing an endpoint is not a Crossing Design crossing and does not consume the permit.
  A new segment may leave that shared endpoint normally, but may not overlap an opponent string,
  travel through another occupied peg, or violate other crossing/self-crossing rules.
- **R-21.** `legalTargets`, no-legal-move detection, target pruning, construction-card legality, local
  Route Planner legality, immediate green targets, and yellow lookahead all agree on the paid-sharing
  exception and the removed adjacency rule.
- **R-22.** A rejected or stale shared-node confirmation changes neither route nor either balance.
  Optimistic retry re-resolves the node owner and legality from current state.
- **R-23.** Render a shared physical peg so both participating lines and both companies remain
  identifiable without relying on color alone; do not render two misleading offset holes.

### Construction debt and scoring

- **R-24 (OD-7).** An accepted $1M shared-node payment may make the actor's `money` negative. No
  lower bound or borrowing cap applies during Construction.
- **R-25 (OD-7).** Do not relax any affordability check in Procurement, Engineering, Scheduling, or
  starter placement. A company entering Construction at $0 may borrow only by making an accepted
  in-scope Construction payment.
- **R-26 (OD-8).** Debt is derived from ending cash: `debt = max(0, -money)`. At scoring, add a clear
  score-breakdown item worth `-2 * debt` VP. No penalty applies at $0 or above.
- **R-27 (OD-8).** Money received from an opponent is ordinary cash and immediately reduces a
  negative balance. The final penalty uses the resulting ending balance, not cumulative borrowed
  dollars or the lowest balance reached.
- **R-28.** Display negative cash consistently anywhere a player can see their company balance. During
  Construction, show the current projected debt penalty beside a negative balance; Results show both
  ending debt and its VP deduction.
- **R-29.** Existing tie breaks remain score, major connections, then remaining money. The debt VP
  deduction is applied before that comparison; negative remaining money remains a valid final
  tiebreak value.

### Early Mobilization visibility and correctness

- **R-30 (OD-9).** Preserve the rule `waiver = max(0, mobilization(newStart) -
  mobilization(oldStart))` when Early Mobilization moves one legal block one period earlier.
- **R-31 (OD-9).** The selected line's charged mobilization after Early Mobilization equals its
  pre-card mobilization charge. A move inside the same tier creates a $0 waiver.
- **R-32 (OD-9).** Recompute second-crew overlaps after the move and charge any resulting change.
  Early Mobilization never waives crew cost.
- **R-33.** In Scheduling resolution, itemize base/current mobilization, Early Mobilization waiver,
  final mobilization, second crew, schedule total, and cash after. The confirmation amount and actual
  deduction must use those same derived values.
- **R-34.** After the card is accepted, give immediate player-facing confirmation naming the moved
  line and waiver amount. If total cost changed solely because of second-crew overlap, make that
  distinction visible.
- **R-35.** Reproduce the owner's reported failure if possible. If the existing reducer is already
  correct for that scenario, record that honestly in the Implementation Handoff and treat the fix as
  cost transparency plus expanded regression coverage; do not invent a code defect.

### Undo and persisted state

- **R-36 (OD-10).** The current one-placement snapshot Undo for a shared build restores the exact
  pre-placement route, both balances, queue/turn/period/phase, objective/Survey status, and crossing
  count. It retains the existing actor/expiry/no-op behavior.
- **R-37.** Bump `SUBWAY_STATE_VERSION` because Survey Pin persisted shape changes. Older rooms follow
  the existing restart path rather than being read as line-agnostic pins.

## 6. State transitions

```text
Local placement UI
unselected --activate green--> previewing candidate
previewing --activate another green--> previewing new candidate
previewing --activate selected green--> dispatch confirmation
previewing --authoritative context changes--> unselected

Accepted paid BUILD (server reducer)
validate route + shared-node exception
        |
        +--invalid/stale--> return original state; no payment
        |
        +--valid--> append node + actor cash -= 1 + owner cash += 1
                         |
                         +--> normal queue/period/phase advancement
                         +--> snapshot Undo remains available per existing rule

Scoring
ending money >= 0 --> no debt item
ending money < 0  --> debt item = money * 2 VP (a negative number)
```

The game phase order does not change. `ENGINEERING/PLAN -> ENGINEERING/SURVEY` remains the only Survey
placement window; overdraft is possible only inside an accepted `CONSTRUCTION/BUILD` payment.

## 7. Interfaces

- Keep the existing game-action endpoint and action names.
- `PLACE_SURVEY` no longer requires or persists `lineIndex`; its meaningful payload is the acting
  player plus `x`,`y` normal-hole coordinate.
- `BUILD` does not need a user-supplied owner, price, or payment flag. The reducer derives whether the
  exact coordinate is an opposing normal node and applies the fixed $1M rule, preventing a client
  from choosing the recipient or price.
- Starter/build first activation is local view state. Only confirmation dispatches the existing
  reducer action.
- Any internal legal-target representation may add derived metadata such as exact dock, paid owner,
  or toll for rendering, but persisted state remains authoritative.

## 8. Persistence changes

- Change Survey Pin persisted data from `{playerId, lineIndex, x, y}` to `{playerId, x, y}`.
- No separate debt field is required or preferred; debt and penalty derive from `money`.
- No payment ledger is required. The authoritative balances and existing pre-placement Undo snapshot
  are sufficient for current rules.
- Shared ownership is represented by the same coordinate appearing in two independently owned route
  arrays. Do not collapse the routes into a jointly owned node entity.
- Bump the Subway state version per R-37.

## 9. Migration requirements

No in-place migration. Rooms with the previous Subway version display the existing restart path.
Do not guess a line-agnostic meaning for old line-assigned Survey Pins.

## 10. Failure behavior

- A stale preview confirmed after another accepted action is rejected by current reducer validation
  and changes no state. The next poll clears/recomputes the preview.
- A shared-node action is atomic: route plus both balances all change, or none do.
- If a selected starter has no yellow continuation, display `No legal first segment from this peg`;
  confirmation remains allowed because deliberate risky starters were not prohibited by the owner.
- A card move that creates an unaffordable schedule after legitimate crew recomputation remains
  rejected under existing rules; no Scheduling debt is allowed.
- Rendering failures must not weaken reducer enforcement. The user may lose preview guidance but
  cannot place an illegal node or avoid payment.

## 11. Concurrency / idempotency

- Preserve the existing CAS retry model. On retry, re-run shared-node detection, recipient lookup,
  route legality, payment, and balance mutation from the newly read state.
- Do not trust local preview metadata in the dispatched payload.
- A rejected/no-op confirmation returns the original state, preserving an existing Undo window.
- Duplicate network delivery follows current platform behavior; do not add a room-level idempotency
  system in this game change. The current turn/action queue should make a repeated BUILD invalid after
  the first accepted placement; add a reducer regression for the paid case.

## 12. Observability

No new production telemetry system. Player-facing state and the PR's manual playtest evidence are
proportional for this prototype. The UI must expose enough information to diagnose a playtest:
selected line/recipe step, green candidate, yellow continuation count, paid recipient/toll, current
cash/debt penalty, and Scheduling waiver/crew breakdown.

## 13. Backwards compatibility

- Existing rooms restart through `DEC-008`/the Subway version guard.
- No engine or client API compatibility change beyond the versioned Subway payload.
- Existing saved Route Planner sketches are client-local and may be cleared if their legality model
  changes; they are not authoritative data.
- All unrelated games and room modes remain unchanged.

## 14. Security / privacy constraints

No new sensitive information or authority surface. The reducer derives recipient and amount; clients
cannot direct arbitrary transfers. Preview state stays local. Existing shared-state/view-concealment
limitations remain unchanged.

## 15. Edge cases

| Case | Required behavior |
|---|---|
| Green candidate has zero yellow continuations | Shows an explicit dead-end preview; may still be confirmed |
| Green candidate would complete the line | No yellow continuations; show `Line completes here` |
| Yellow continuation is an exact station dock | Each legal dock is individually highlighted |
| Green/Yellow target is an opposing normal peg | Mark `$1M`; only a confirmed green target pays |
| Opposing peg is adjacent but not the selected coordinate | No spacing rejection and no payment |
| Starter selected on an occupied opposing peg | Rejected; paid sharing is Construction-only |
| Target is a station coordinate with an opposing dock occupant | Existing exact dock/capacity rules; no paid sharing |
| Target is occupied by another owned line | Rejected; no same-company sharing |
| Shared endpoint would cause string overlap | Rejected despite the shareable node |
| Shared endpoint merely touches opposing strings at that endpoint | Legal without Crossing Design if every other rule passes |
| Actor has $0 and confirms a paid peg | Actor becomes -$1M; owner gains $1M; projected penalty is -2 VP |
| Actor already has negative cash | May pay again during Construction; debt/penalty increase |
| Debtor later receives a $1M toll | Cash rises by $1M and projected/final penalty decreases by 2 VP |
| Undo paid placement immediately | Route and both balances restore exactly |
| Opponent acts before Undo | Existing Undo expires; the transfer and node remain |
| Duplicate paid BUILD delivery | Exactly one accepted route/payment under current queue state |
| One owned line reaches company Survey | Pin becomes fulfilled once |
| Two owned lines share/reach same Survey coordinate | Pin still scores only +1 VP |
| Only opponent reaches Survey | Pin remains unfulfilled |
| Fulfilling Survey build is undone | Pin returns to unfulfilled |
| Early move crosses a mobilization tier only | Mobilization component unchanged after waiver |
| Early move stays inside a tier | $0 waiver; mobilization component unchanged |
| Early move also creates crew overlap | Mobilization increment waived; crew increment remains in total |
| Final cash is $0 | No debt penalty |
| Final cash is -$3M | Score item is -6 VP; money remains -$3M for final tiebreak |
| Phone pan begins on a glowing target | Gesture neither selects nor confirms |

## 16. Tests

Extend reducer-level coverage to prove:

- opposing adjacency at every neighboring offset is legal when other geometry passes;
- exact opposing normal-node sharing succeeds, transfers $1M, appends an independently owned node,
  and does not consume Crossing Design merely for the shared endpoint;
- starter, station, same-company, overlap, pass-through, recipe, turn, and self-crossing cases remain
  rejected as applicable;
- `legalTargets`, `hasLegalMove`, target pruning, construction cards, and Route Planner legality see
  the same shareable targets;
- payments from positive, zero, and already-negative balances; reciprocal later receipts; no debt
  in earlier phases; scoring at $0/-$1M/-$3M; negative-money tiebreak behavior;
- paid-placement Undo, phase/period-advancing Undo, expiry, invalid/no-op persistence, and duplicate
  delivery;
- Survey purchase/placement without line assignment, any-owned-line fulfilment, opponent failure,
  score-once, Undo reversion, stacking, and affordability limits;
- Early Mobilization at every tier boundary, inside each tier, with and without changed crew overlap,
  confirmation deduction, and unaffordable rejection;
- persisted-state version/restart behavior.

UI/manual validation must cover:

- desktop and phone selection/confirmation for starters, normal holes, paid shared pegs, and exact
  station docks;
- yellow continuation accuracy for a straight route, 90° turn, dead end, line completion, paid
  follow-up, and station follow-up;
- pan/zoom gesture safety and stale-preview clearing after a poll changes legal state;
- Survey purchase/placement without a line selector and live fulfilment by two different owned lines;
- a paid placement from $0, Undo, another paid placement left in debt, later toll receipt, and Results
  showing the correct penalty;
- Early Mobilization with a tier change plus a separate crew-overlap change, with the displayed
  breakdown matching the cash deducted.

Tests must assert behavior rather than helper calls or component structure.

## 17. Acceptance criteria

- [ ] **AC-1.** Every actual starter/build target is green; selecting one shows only that candidate's
      legal next endpoints in yellow, and selecting it again confirms.
- [ ] **AC-2.** Starter lookahead applies the first recipe segment, construction lookahead applies the
      next segment, and both use exact reducer-equivalent geometry including docks and paid nodes.
- [ ] **AC-3.** Preview is local/non-reserving, gestures do not trigger it, stale selections clear,
      and the reducer revalidates confirmation.
- [ ] **AC-4.** Survey Pins have no line assignment and score once when any owned line reaches them.
- [ ] **AC-5.** Opposing normal pegs no longer exclude adjacent holes.
- [ ] **AC-6.** An exact opposing normal peg can be used during Construction for an atomic $1M
      transfer, while starter/station/same-company sharing stays prohibited.
- [ ] **AC-7.** Paid shared endpoints do not consume Crossing Design, but all other spatial and route
      rules remain enforced.
- [ ] **AC-8.** Only Construction payments can create debt; ending debt scores -2 VP per $1M and later
      receipts reduce the penalty.
- [ ] **AC-9.** Paid-placement Undo restores route, payment, queue, phase, period, and derived statuses.
- [ ] **AC-10.** Early Mobilization's incremental mobilization waiver affects the actual confirmation
      charge and is visibly separated from second-crew cost.
- [ ] **AC-11.** Shared pegs, paid targets, negative cash, debt penalty, Surveys, and lookahead remain
      understandable without color alone on desktop and phone.
- [ ] **AC-12.** `SUBWAY_STATE_VERSION` is bumped and stale rooms use the restart path.
- [ ] **AC-13.** `./scripts/test-subway.sh`, `npm run build`, and `npm run lint` pass.
- [ ] **AC-14.** Full desktop and phone playtests cover the scenario in §16 with no console error or
      horizontal overflow.
- [ ] **AC-15.** Rules, project memory, decisions, WS-003, ACTIVE, and the PR Implementation Handoff
      describe the behavior actually built.
- [ ] **AC-16.** Party Games' Build OS v0.5 adoption is present on the branch before implementation is
      marked `BUILDING` or the PR is marked ready for review.

## 18. Non-goals

- Rebalancing contracts, recipes, card VP, station VP/capacity, Survey price/VP, mobilization tiers,
  second-crew cost, starting money, procurement, or schedule length.
- Borrowing outside Construction, interest, repayment actions, credit limits, bankruptcy, loans, or
  voluntary cash transfers.
- Sharing starters, stations, same-company nodes, strings, whole routes, or ownership.
- Persistent/reserving lookahead, automatic route choice, a third preview step, or changes to the
  private Route Planner's purpose.
- A general action ledger or broader Undo.
- Engine/API/database changes, true server-side secrecy, WebSockets, or idempotency infrastructure.
- Final balance certification. The $1M access toll and -2 VP debt rate require owner playtesting.
- Performing the separately owned Build OS v0.5 project adoption in this gameplay PR.

## 19. Required documentation updates

- [ ] `src/games/subway/RULES.md` — document two-step preview, company-wide Surveys, removed adjacency,
      paid normal-node sharing, construction-only debt/penalty, Early Mobilization itemization, and
      unchanged spatial boundaries.
- [ ] `docs/PROJECT_MODEL.md` — after implementation, update the Subway workflow/rules-harness scope,
      persisted version, and important financial/spatial invariants; do not describe unmerged design
      as current behavior.
- [ ] `docs/DECISIONS.md` — supersede only DEC-014's pin-to-line binding with company-wide Survey
      fulfilment and append the consequential paid-shared-node/construction-debt decision. Preserve
      the rest of DEC-014 and all historical rationale.
- [ ] `docs/workstreams/WS-003-subway-construction-access.md` — checkpoint implementation start, PR
      readiness, review findings/verdict, and merge finalization with v0.5 per-PR review fields.
- [ ] `docs/workstreams/ACTIVE.md` — keep WS-003 synchronized; move WS-002 to completed when the
      separately owned framework/closeout work establishes the truthful checkpoint.
- [ ] PR body — replace the design-stage handoff with the complete v0.5 Implementation Handoff,
      including actual validation, exhaustive deviations, framework state, and reviewed-head gate.

## 20. Handoff requirements

- Continue on this Design Handoff branch and draft PR; do not open a second implementation PR.
- First rebase after the separate Party Games Build OS v0.5 adoption lands. Resolve protocol/document
  conflicts in favor of the merged adoption and record the real framework state.
- When implementation actually starts, change WS-003 from `READY_TO_BUILD/Blocked` to
  `BUILDING/Active`; opening this PR alone is not implementation.
- Bump Subway's state version for the Survey shape change.
- Run `./scripts/test-subway.sh`, `npm run build`, and `npm run lint`; then perform the desktop/phone
  manual scenario in §16.
- Recommended independent review focus: reducer/UI legality parity for second-step previews, atomic
  shared-node transfers under retry/Undo, spatial invariants at shared endpoints, debt scoring and
  tie breaks, Survey shape/versioning, and mobilization-versus-crew cost display.
- Any owner-visible behavior that departs from OD-1 through OD-10 is a Spec Deviation and a stop
  condition, not implementation discretion.
- Do not self-approve or merge. Once ready, independent review must name the current full head SHA;
  follow Build OS v0.5 merge finalization before owner merge.
