# Build Spec — Subway Open Routing, Destinations & Lookahead

**Workstream:** WS-003
**Build Card:** [Approved card](../workstreams/WS-003-subway-construction-access.md#build-card)
**Build OS:** v0.5
**Issued:** 2026-08-27
**Supersedes:** the WS-003 spec issued 2026-08-25
**Implementation state:** Blocked pending Party Games' separately owned Build OS v0.5 adoption or
an owner-approved deferral

## 1. Objective

Implement the complete approved WS-003 behavior: two-placement lookahead; permissive normal-route
geometry with per-contact opponent tolls; Construction-only debt; company-wide Survey Pins; a
dedicated two-card-per-player Destination draft; objective-only Crossing Design; shorter Express,
Crosstown, and Long recipes; and a correct, visible Early Mobilization waiver.

PR #143 merged only the earlier design artifacts. No listed behavior is present on `main`, so the
implementation must treat this replacement spec as one coherent change rather than assuming the
first packet was built. Canonical Build OS is v0.5 while Party Games still declares v0.4; do not
begin implementation until the separate adoption lands or the owner records the framework deferral
required by v0.5 migration guidance.

## 2. Owner-approved behavior

> After this change, the system should let players plan ahead and keep building through a crowded
> network by paying for opponent infrastructure, while reliably drafting meaningful line-specific
> Destinations.

### Owner decisions

- **OD-1 — Lookahead.** All current legal starter/construction targets glow green. Selecting one is
  a local preview: that target stays green and its legal following targets glow yellow. Selecting
  the green target again confirms the current placement.
- **OD-2 — Starter planning.** Starter placement uses the same interaction and previews where the
  first ordered recipe segment can end.
- **OD-3 — Core geometry only.** Preserve ordered segment length, the maximum 90° turn, board
  bounds, exact station dock choice/capacity, and the ban on exact string-over-string overlap.
  Remove normal-hole exclusivity, opposing-node spacing, peg-on-string, string-through-peg,
  own-route crossing, and opponent-crossing prohibitions.
- **OD-4 — Normal route contacts.** A normal node may be placed on an existing normal peg or on the
  interior of an existing string. A new string may cross existing strings or pass through existing
  normal pegs. Adjacency is unrestricted. These permissions apply to the actor's and opponent's
  routes; station-specific rules remain.
- **OD-5 — Opponent toll.** During Construction, pay the opponent $1M for every distinct geometric
  contact the new node/string makes with the opponent's normal route. Own-route contacts cost $0.
- **OD-6 — Contact counting.** A proper string crossing, an endpoint on an opposing string interior,
  and an opposing normal peg touched by the segment or endpoint are contacts. Count each geometric
  event once; landing on an opposing peg is one contact, not one charge per incident string.
  Exact collinear string overlap remains illegal.
- **OD-7 — Toll confirmation.** Before the second confirmation, show contact count, total cost,
  recipient, cash after, and projected debt penalty. The reducer recomputes all of it and performs
  route placement plus the full transfer atomically.
- **OD-8 — Crossing Design.** Crossing Design is an ordinary +2 VP Engineering objective completed
  by at least one proper crossing of an opposing string. It never grants permission or limits the
  number of crossings. Endpoint touches, shared nodes, and pass-through at an existing peg are not
  proper crossings for this objective.
- **OD-9 — Construction debt.** Only Construction interaction payments may take cash below $0. At
  scoring, ending debt costs -2 VP per $1M. Later Construction receipts reduce ending debt.
- **OD-10 — Undo.** The existing one-placement Undo reverses the placed route geometry, all contacts,
  the complete multi-contact transfer, both balances, queue/phase effects, and derived status.
- **OD-11 — Survey Pins.** Pins cost $1M each, 0–5 per player, and are bought/placed publicly during
  Engineering. They are company-wide, non-reserving, and stackable. A pin scores +1 VP once when any
  line owned by its buyer places a normal node at its exact hole.
- **OD-12 — Destination draft.** Engineering starts with three face-up Destination cards. Players
  alternate free picks, starting with the odd-period-priority company, refilling to three while
  possible, until each has exactly two. Destinations are removed from the Procurement Engineering
  market.
- **OD-13 — Destination assignment.** Destinations do not count among the three committed normal
  Engineering objectives. Each is assigned during Engineering to an owned line, maximum two per
  line, and scores +3 VP if that line reaches the named station whether or not the line completes.
- **OD-14 — Recipe trim.** Express becomes `[5,4,5,4,5]`, Crosstown becomes `[4,3,4,3,4,3]`, and
  Long becomes `[4,5,4,4,5,4,4]`. Prices, completion VP, shelving penalties, and all other contract
  recipes remain unchanged.
- **OD-15 — Early Mobilization.** Waive only the increase in mobilization surcharge caused by moving
  the selected block one period earlier. Any second-crew cost change remains payable. Itemize base
  mobilization, waived incremental surcharge, crew cost, total, and cash after.

### Implementation discretion

Yours to decide: helper/type names; local preview representation; pure hypothetical-state versus
behavior-equivalent derivation for yellow endpoints; accessible rendering for shared nodes and
contacts; exact responsive layout; Destination deck shuffle/refill implementation; and
behavior-preserving refactors. The odd-period company starts the Destination draft to reuse an
existing deterministic priority rule rather than introduce another random decision.

### Stop / escalation conditions

Stop if implementation would require any of the following:

- changing the $1M/contact toll, -2 VP/$1M debt penalty, +2 Crossing award, +3 Destination award, or
  $1M/+1 Survey economics;
- reinstating a removed spatial prohibition, allowing exact collinear string overlap, weakening the
  90° cap/ordered lengths/bounds/station capacity, or treating a station dock as a normal shared peg;
- charging own-route contacts, charging the same geometric event more than once, or asking the
  opponent to approve access synchronously;
- making yellow previews reserving or authoritative, or allowing debt outside Construction tolls;
- putting Destinations back in the Procurement draw, counting them among the three normal objective
  commitments, or giving either player fewer/more than two;
- changing unrelated contract prices/VP/penalties, phases outside the specified Engineering
  substep, or general Undo scope;
- proceeding before Build OS v0.5 adoption or an owner-approved recorded deferral.

## 3. Repository context

- `src/games/subway/config.ts` owns Subway state, reducer, geometry, queue, markets, cards,
  contracts, scoring, view redaction, and rules text.
- `src/games/subway/SubwayGame.tsx` owns board interaction, local preview state, planning panels,
  schedule display, scoring display, and responsive behavior.
- `src/games/subway/config.rules.test.ts` plus `scripts/test-subway.sh` are the focused reducer/rules
  harness. There is no CI; repository instructions also require build, lint, and manual desktop and
  phone playtests.
- `SUBWAY_STATE_VERSION` is currently 6. The Destination phase/deck and Survey state changes require
  a bump so old rooms restart per DEC-008.
- Full room state reaches every client. Keep objective and Destination secrecy in `view()` as today;
  do not introduce a server-secrecy assumption.

## 4. Architecture constraints

- Reducer legality is authoritative. Green and yellow UI derivations must use the same pure rules or
  be proven equivalent; never enforce a rule only in React.
- Reducers remain pure and JSON-serialisable. Random Destination order comes from `ctx.random()`.
- Rejected actions return the original state and preserve the existing Undo record. Accepted
  non-placement actions expire Undo under DEC-015.
- One accepted construction placement is one atomic transition even when it creates several
  contacts, transfers several million, completes objectives, advances the queue, or ends the game.
- Derived action counts and schedule blocks come from recipe length; do not add parallel node-count
  constants when trimming recipes.

## 5. Implementation requirements

### 5.1 Placement lookahead

1. Derive every legal current target with full reducer geometry and phase/action eligibility.
2. First tap/click selects one current target without dispatching an action.
3. Keep that current target green and visually stronger than other green choices. Derive yellow
   targets by hypothetically accepting it, then applying the next ordered segment and turn rules.
4. Second tap/click on the selected green target dispatches the existing placement action.
5. Tapping another green target changes preview. Tapping background, changing active line/phase,
   receiving newer room state, or losing legality clears preview.
6. Yellow targets are informational and not clickable commitments. An empty yellow set is a valid
   warning, not a reason to hide the current legal green choice.
7. For a starter, the hypothetical current placement is the starter and yellow represents the
   first recipe segment. For a final segment, no yellow endpoints are expected.
8. Yellow derivation ignores whether the player could afford its future toll because Construction
   debt is allowed; it still applies all geometry.

### 5.2 Contact legality and counting

Replace the current collection of spatial early exits with one explicit model:

- Continue rejecting out-of-bounds targets, wrong recipe lengths, turns over 90°, invalid/full
  station docks, unavailable actions, completed/shelved lines, and exact collinear overlap of the
  new string with any existing route string.
- Do not reject a normal target because its coordinate is already a route node, is adjacent to a
  route node, lies on a route string, makes a proper crossing, or causes the new string to pass
  through normal nodes.
- Permit the same rules for routes owned by the actor, including another owned line or the same line.
- Enumerate opponent contacts deterministically. Deduplicate by geometric event, not merely by
  segment pair, so an endpoint on an opponent node does not also charge for every incident segment.
- A proper interior/interior string crossing is one contact. An endpoint lying strictly inside an
  opposing segment is one contact. Every distinct opposing normal peg lying on the new segment,
  including its endpoint, is one contact.
- If one coordinate qualifies as both a peg contact and one or more string contacts, the peg event
  wins at that coordinate. Proper crossings elsewhere still count.
- Existing geometry tolerance must be used consistently by legality, contact count, render, tests,
  objective completion, and Undo.

### 5.3 Toll, debt, and confirmation

- `cost = distinctOpponentContacts * $1M`; two-player Subway has one recipient.
- The first selection computes and displays contact count, total, recipient, acting cash after, and
  projected `max(0, -cashAfter) * 2` VP penalty.
- The reducer recomputes contacts from authoritative state on confirm. It ignores client-provided
  prices/counts and accepts negative cash only for this Construction payment path.
- Apply geometry, acting-company debit, opponent credit, queue advancement, objective status, and
  Undo snapshot in one accepted action.
- Final scoring subtracts 2 VP per $1M of ending negative cash. Preserve cash as the last existing
  tiebreak after the VP penalty.
- Show negative cash and projected/final debt penalty anywhere cash or scoring is summarized.

### 5.4 Crossing Design objective

- Change Crossing Design from permission-kind behavior to a normal committable objective worth +2.
- Complete it live for its owner after that player has at least one proper interior/interior crossing
  with an opposing segment.
- Remove permit checks, crossing consumption, and one-crossing caps from reducer and UI copy.
- Keep committed-card secrecy: owner sees live `COMPLETE`; opponent sees no hidden card detail before
  scoring.
- Unlimited paid crossings are legal without drawing or committing the card.

### 5.5 Destination draft and assignment

1. Remove Destination cards from the Procurement Engineering market/deck. That market contains only
   normal Engineering objectives.
2. On entering Engineering, create a shuffled Destination deck using reducer randomness and expose
   three face-up cards.
3. Add a `DESTINATION_DRAFT` substep before objective commitment/assignment and Survey purchase.
4. Odd-period-priority company picks first; alternate accepted picks. Refill the row to three while
   cards remain. A player who already has two is skipped automatically.
5. End the substep only when both players have exactly two. With six cards total, two remain unused;
   preserve them only if useful for state clarity, never expose them as choices.
6. Picks are free and cannot create Undo. Rejected stale/not-in-row/wrong-turn picks do not mutate.
7. In the planning substep, assign each owned Destination to one owned line. Maximum two per line.
   Lock requires all two assigned and exactly three normal Engineering objectives committed.
8. Destination assignments remain hidden from the opponent in `view()` until scoring. Owner sees
   line assignment and live achieved status throughout play.
9. Score +3 if the assigned line reaches the named station, complete or not. Undo must revert
   derived achievement naturally.

### 5.6 Survey Pins

- Preserve Engineering purchase (0–5 at $1M each), alternating public placement, stacking,
  non-reservation, and exact-hole +1 VP scoring.
- Remove line assignment from persisted pin/purchase state and plan UI.
- Any owned line's normal node fulfils the pin. Opponent lines and strings passing through do not.
- One pin scores once even if several owned lines occupy the coordinate; stacked pins score
  independently.

### 5.7 Contract recipes

Set exactly:

| Contract | Previous | New |
|---|---:|---:|
| Express | 6 segments | 5: `[5,4,5,4,5]` |
| Crosstown | 7 segments | 6: `[4,3,4,3,4,3]` |
| Long | 8 segments | 7: `[4,5,4,4,5,4,4]` |

Do not change Short, Branch, or Medium. Recompute all node/action/schedule display from recipe length.
Prove all six recipes and every permitted station-dock approach remain buildable on the board.

### 5.8 Early Mobilization

- Reproduce both a no-overlap and changed-second-crew-overlap move.
- Compute baseline schedule cost and edited cost as explicit mobilization and second-crew components.
- Waive only the positive mobilization delta created by the one-period-earlier move. Do not waive a
  pre-existing surcharge or any crew delta.
- Show: mobilization before/after, waived amount, second crew before/after, total due, and cash after.
- Add focused reducer tests so the display cannot mask incorrect charging.

### 5.9 Undo and state version

- Keep DEC-015's one-snapshot model and scope. A confirmed starter, Survey, or construction
  placement is undoable; preview selection and Destination picks/assignment are not newly undoable.
- A paid construction Undo restores all route/contact/cash/queue/phase/objective changes exactly.
- Bump state version and update initial/restart behavior for the Destination draft and company-wide
  Survey shape.

## 6. State transitions

```text
PROCUREMENT complete
  -> ENGINEERING / DESTINATION_DRAFT
       PICK_DESTINATION (alternating, free, exactly 2 each)
  -> ENGINEERING / PLAN
       commit exactly 3 objectives
       assign 2 Destinations to owned lines (max 2/line)
       buy 0–5 company-wide Survey Pins
  -> ENGINEERING / SURVEY (skip if both bought 0)
       PLACE_SURVEY_PIN (alternating)
  -> SCHEDULING
       submit, reveal, optionally play one Scheduling card, confirm and pay
  -> STARTERS
       select preview -> confirm PLACE_STARTER
  -> CONSTRUCTION
       select preview -> confirm BUILD_NODE
          validate core geometry
          enumerate opposing contacts
          transfer contacts × $1M (debt allowed)
          advance derived state
       UNDO_PLACEMENT -> restore full pre-placement snapshot
  -> SCORING
       subtract ending debt × 2 VP
```

The phase order remains Procurement → Engineering → Scheduling → Starters → Construction → Scoring;
only the new Engineering substep is inserted.

## 7. Interfaces and failure behavior

- Prefer existing action names when compatible. New Destination action/state types must be explicit
  and serialisable.
- `legalTargets` (or equivalent) must expose enough data for current target legality, following
  targets, contact count, toll, and projected debt without trusting the client on dispatch.
- Every rejected reducer action is a no-op: stale target, wrong draft turn, card absent from row,
  third Destination pick, invalid assignment, geometry failure, or exact overlap.
- If a preview becomes stale, clear it and show refreshed choices; do not dispatch a fallback target.
- A valid build can never fail only because cash is insufficient for its Construction contact toll.
- No new network/API/database interface is required.

## 8. Persistence, concurrency, and privacy

- Bump `SUBWAY_STATE_VERSION`; old rooms restart rather than migrate in place.
- Keep state bounded: six Destinations, at most ten Survey Pins, six finite recipes, one Undo snapshot.
- All randomness enters through reducer context. Replaying a committed room action remains
  deterministic under the engine's current state/version control.
- Optimistic room versioning serializes simultaneous picks/builds. The loser recomputes from the new
  state and receives a no-op for a stale action.
- `view()` hides opponents' Destination hands/assignments and normal committed objectives before
  scoring, while the public Destination row, draft turn, Surveys, routes, toll transfers reflected in
  cash, and debt are public.

## 9. Edge cases

- Current target is legal but has zero yellow continuations.
- Selected target becomes occupied/contact-rich before confirmation; reducer recomputes the new
  legal result and price rather than using preview data.
- One segment passes through two opponent pegs and crosses another opponent string: three contacts.
- Endpoint lands on an opponent peg incident to two strings: one contact at that coordinate.
- Endpoint lands inside an opponent string away from a peg: one contact.
- Proper crossing occurs exactly at an existing opponent peg: peg contact only; not Crossing Design.
- A segment crosses two own routes and one opponent route: only the opponent crossing costs $1M.
- A route loops back to an earlier own node while satisfying ordered length and ≤90° turn: legal.
- Exact reverse/collinear overlap of any existing string: illegal even when endpoints differ.
- A Destination row empties near the end; both players still end with exactly two and unused cards
  cannot be drafted.
- Both Destinations are assigned to one owned line: legal. A line may later be shelved and still
  score if it reached the station.
- Zero Survey purchases skips SURVEY; asymmetric counts automatically skip exhausted players.
- Undo after a multi-contact build reverts negative cash and opponent income even if it crossed a
  period/phase boundary.
- Early Mobilization changes both mobilization and crew overlap; only mobilization delta is waived.

## 10. Tests

### Reducer / geometry

- Current/next target parity tests for starter, middle, final, dead-end, station dock, and stale
  confirmation cases.
- Legal adjacency, same-coordinate normal node, node-on-string, string-through-node, own crossing,
  opponent crossing, and loopback cases.
- Rejections for wrong ordered length, >90° turn, out of bounds, invalid/full dock, and exact overlap.
- Contact-count table covering single/multiple crossings, pass-through pegs, endpoint-on-string,
  endpoint-on-peg with incident segments, own contacts, and mixed contacts.
- Atomic multi-contact transfer, construction debt, later receipts, scoring penalty, tie break, and
  exact Undo restoration.
- Crossing Design completes only on a proper opposing crossing and is never required for legality.

### Engineering

- Destination shuffle/three-card row, odd-priority first pick, alternation, refill, exactly two each,
  stale/wrong-turn rejection, and removal from Procurement market.
- Assignment ownership/max-two/lock requirements, hidden opponent view, live owner status, +3 scoring,
  and shelved-but-reached behavior.
- Survey company-wide fulfillment, opponent non-fulfillment, stack scoring, zero/asymmetric purchase,
  and Undo.

### Recipes / scheduling / costs

- Exact new recipes and derived actions/schedule blocks; all contracts and station docks buildable.
- Early Mobilization no-overlap, new-overlap, removed-overlap, and pre-existing-surcharge cases with
  itemized expected totals.

### Regression and validation

- Existing Procurement, objective commitment, scheduling priority, period advancement, line
  completion/shelving, scoring, and view-redaction tests remain green unless intentionally updated.
- Run `./scripts/test-subway.sh`, `npm run build`, and `npm run lint`.
- Manual desktop and phone-width playtest: complete a Destination draft, assign cards, buy/place a
  Survey, use starter/mid-route lookahead, make free own contacts, make a debt-causing multi-contact
  opponent build, Undo it, rebuild, use Crossing Design without a permit gate, and verify scoring.

## 11. Acceptance criteria

- [ ] Green/yellow two-placement preview works for starters and construction and matches reducer
      legality on desktop and phone.
- [ ] Normal pegs/strings may interact without spatial blockers except the documented core rules.
- [ ] Every distinct opponent contact costs exactly $1M; own contacts are free; preview, reducer,
      balances, debt, and Undo agree.
- [ ] Crossing Design is an optional +2 VP proper-crossing objective and never a permit.
- [ ] Only Construction contact tolls create debt; final debt scores -2 VP/$1M.
- [ ] Engineering drafts exactly two Destinations per player from a three-card row and removes them
      from Procurement; assignment/scoring/secrecy work separately from three objectives.
- [ ] Survey Pins are company-wide and preserve approved purchase/placement/scoring rules.
- [ ] Express/Crosstown/Long have 5/6/7 segments with exact approved arrays and derived scheduling.
- [ ] Early Mobilization waives and itemizes only the incremental mobilization surcharge.
- [ ] State version, rules copy, tests, project memory, build, lint, and manual playtests agree.

## 12. Non-goals

- General route planning beyond one following placement, route reservation, negotiation UI, or
  opponent consent.
- Debt interest, loans, borrowing outside Construction contacts, or final balance certification.
- Changing station rules, contract prices/VP, Destination/Survey awards, other objective awards, or
  every contract recipe.
- More than one-placement Undo or changing the engine's polling/persistence model.

## 13. Required documentation updates

The implementation PR must update these to the truth of the delivered code:

- `src/games/subway/config.ts` rules text and card/contract descriptions.
- `docs/PROJECT_MODEL.md` for Engineering substeps, permissive contact geometry, toll/debt flow,
  lookahead, and state version.
- `docs/DECISIONS.md` only if implementation requires another consequential decision; DEC-018 and
  DEC-019 already record the approved model and supersede DEC-017/016.
- This workstream and `docs/workstreams/ACTIVE.md` at implementation start, review, and merge
  finalization.
- PR body: complete Build OS v0.5 Implementation Handoff with actual validation, deviations,
  framework state, and reviewed-head gate.

## 14. Handoff requirements

- Continue on the new draft continuation PR (`CONTINUATION_PR`); do not reopen #143 or create a
  second implementation PR.
- First rebase after Party Games' Build OS v0.5 adoption lands, or stop for an owner-approved
  recorded deferral. Resolve protocol-document conflicts in favor of the adopted framework.
- When code work actually starts, checkpoint WS-003 from `READY_TO_BUILD/Blocked` to
  `BUILDING/Active`. Publishing this design handoff alone is not implementation.
- Bump Subway state version and update every derived rule/UI/test surface.
- Validate with the focused harness, build, lint, and desktop/phone scenario above.
- Independent review should focus on preview/reducer parity, geometric contact deduplication,
  atomic multi-contact transfers and Undo, Destination draft secrecy/turn order, state versioning,
  and cost/scoring correctness.
- Any departure from OD-1 through OD-15 is a Spec Deviation and stop condition, not implementation
  discretion.
- Do not self-approve or merge. Independent review must name the current full head SHA and the PR
  must use Build OS v0.5 merge finalization before owner merge.
