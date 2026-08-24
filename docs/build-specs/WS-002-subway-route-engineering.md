# Build Spec — Subway Route Engineering & Playtest UX

**Workstream:** WS-002 · **Build Card:** [`docs/workstreams/WS-002-subway-route-engineering.md`](../workstreams/WS-002-subway-route-engineering.md#build-card) · **Written under Build OS v0.4**

Canonical Build OS `VERSION.md` was checked on 2026-08-23 and remains v0.4, matching Party Games' adopted version.

---

## The three-way split

### Owner decisions — may not be silently changed

- **OD-1.** Default construction priority alternates by calendar period. A randomly chosen company has odd-period priority and the opponent has even-period priority. Priority Permit may override one contested period under its existing play rules.
- **OD-2.** Every Line Contract has a permanent, globally distinct line color. Company colors continue to identify ownership and priority, but do not color the routes themselves.
- **OD-3.** Each contract has the exact ordered segment recipe in §2. Players construct those lengths in order and may not reorder them.
- **OD-4.** Segment length is physical Euclidean peg spacing. A candidate satisfies a required integer length when its effective physical distance is within ±0.5 peg spaces of that value. Station-slot offsets participate in this geometry.
- **OD-5.** A new segment may change heading by at most 90°, inclusive. This applies at normal nodes and station slots.
- **OD-6.** Players select the exact open station slot they occupy. The selected slot is both the rendered endpoint and the endpoint used for distance/angle geometry.
- **OD-7.** A private, non-binding ghost Route Planner is available during Engineering and Scheduling. It previews an entire ordered recipe but does not reserve holes or publish the plan to shared room state.
- **OD-8.** During Construction, the active line, its color, current endpoint, next required segment length, progress through the recipe, and legal targets must be immediately obvious.
- **OD-9.** A player's own committed Engineering cards show live `COMPLETE` status as soon as their conditions are met. They remain hidden from the opponent until scoring.
- **OD-10.** Remove Long Segment and replace it with **Network Link**, worth +3 VP: complete one line that connects two different stations.
- **OD-11.** Destination cards are drawn from the face-up Engineering market but are separate from the exactly three normal Engineering commitments. Each Destination is assigned to one owned line; one line may carry at most two Destination cards; each fulfilled Destination scores +3 VP.
- **OD-12.** A Destination is fulfilled when its assigned line connects the named station, even if that line is incomplete at the end. Destination commitments remain hidden from the opponent until scoring and show live private completion to their owner.
- **OD-13.** During Engineering, each player may buy 0–5 Survey Pins for $1M each. Each pin is assigned to an owned line and scores +1 VP if that exact line later places a node on the pin's normal hole.
- **OD-14.** Survey Pins are public, non-reserving, and may not be placed on station slots. Different players may place pins on the same normal hole; one player may not place multiple personal pins on one hole. Survey placement alternates, beginning with the odd-period priority company.
- **OD-15.** Only the latest physical starter, Survey Pin, or construction placement may be undone. Undo is available only to the actor and expires after any later accepted state-changing game action. Purchases, commitments, card plays, schedule edits/locks, skips, and scoring may not be undone.
- **OD-16.** The feature is one cohesive Subway workstream and preserves the existing Procurement, Scheduling, Construction-card, shelving, scoring, board-layout, and two-player rules except where an owner decision above explicitly changes them.

### Implementation discretion — yours to decide

Choose internal types, helper names, reducer action names, state layout, component boundaries, palette values, accessible secondary encodings, ghost-planner interaction details, undo inverse/snapshot representation, test organization, and behavior-preserving refactors within Subway. Use existing dependencies unless a new one is genuinely necessary. Keep all owner-visible behavior above fixed.

The exact UI styling is yours to decide, but color must not be the only cue, the planner must work at desktop and phone widths, and the actual reducer—not the UI—must enforce every shared gameplay rule.

### Stop / escalation conditions

Stop the affected thread and raise the conflict instead of improvising if:

- Any OD cannot be implemented as written.
- The ±0.5 physical-length rule makes an approved recipe impossible on the existing board/station geometry.
- Exact slot geometry cannot be reconciled with the existing spatial invariants without changing station locations or capacities.
- Undo cannot restore the exact pre-placement game state without broadening into a general history system or creating unbounded room-state growth.
- Destination/Survey state would require engine-level secrecy or changes outside the Subway plugin.
- A change to Procurement prices, mobilization, crew cost, contract scoring, station values, board layout, or player count appears necessary.
- Existing behavior outside this Build Card must change, an invariant in `PROJECT_MODEL.md` would break, or a destructive/irreversible migration is unexpectedly required.

Otherwise use technical judgment and document it in the PR handoff.

---

## 1. Objective

Implement WS-002 as one Subway feature package: ordered physical line geometry, distinct contract identities, alternating priority, explicit station docks, private route preview, clearer active work, separate line-bound Destinations, paid public Survey Pins, live objective status, and narrowly scoped physical-placement undo. This spec covers the complete approved Build Card and is intended to be implemented on the draft WS-002 PR branch.

## 2. Owner-approved behavior

> After this change, the system should let players design recognizable subway routes before construction and then clearly execute those routes under meaningful geometric, financial, destination, and timing constraints.

### Contract recipes

| Contract | Required ordered segment lengths | Construction actions |
|---|---|---:|
| Short | 3, 4, 3, 4 | 4 |
| Branch | 5, 5, 3, 4, 4 | 5 |
| Medium | 3, 4, 3, 4, 3, 4 | 6 |
| Express | 5, 4, 5, 4, 5, 4 | 6 |
| Crosstown | 4, 3, 4, 3, 4, 3, 4 | 7 |
| Long | 4, 5, 4, 4, 5, 4, 4, 5 | 8 |

The starter node remains free. Recipe length therefore remains equal to the current build-period count, preserving the 16-period schedule model.

### Engineering flow

Each player still commits exactly three non-Destination Engineering cards. Separately, the player may assign any held Destination cards to owned lines, with no more than two assigned to one line. Unassigned Destination cards remain unused and score nothing. The player also purchases 0–5 Survey Pins at $1M each. Once both players lock this Engineering plan, purchased pins are placed publicly in alternating order. Scheduling begins after all purchased pins are placed.

### Physical route rules

The next placed endpoint must satisfy the next recipe length within ±0.5 peg spaces, must not turn more than 90° from the prior segment, and must satisfy every retained spatial rule. A selected station slot uses its physical dock position for both rendering and geometry. A line is complete only after all recipe segments exist.

## 3. Repository context

- `src/games/subway/config.ts` is the authoritative state, content, validation, scoring, and reducer surface. It currently derives completion from contract `nodes`, assigns a single `priorityPlayerId`, automatically assigns station slots in arrival order, and evaluates Engineering objectives through `objectiveMet`.
- `src/games/subway/GameView.tsx` renders the board, Gantt schedule, cards, private company state, station slots, and placement targets. It already holds client-local board zoom/pan and selected-line state, which are relevant patterns for a local-only ghost planner.
- `src/games/subway/RULES.md` is the player/developer rules reference and must describe built behavior, not intended behavior.
- `scripts/subway-rules-test.ts` drives the reducer directly and is the only automated behavior harness. Extend it substantially rather than replacing it with implementation-coupled tests.
- The server action pipeline applies Subway actions under optimistic-locking retries. Reducers are pure, JSON-serialisable, and may be re-run.
- Read `AGENTS.md`, `docs/PROJECT_MODEL.md` invariants 1–4 and 11, and `DEC-008`, `DEC-010`, `DEC-011`, `DEC-012` before implementation.

## 4. Architecture constraints

- Rules remain inside the Subway reducer/validation layer. The UI may preview or explain, but cannot be the only enforcement.
- Do not modify the engine, API routes, polling model, database schema, room shell, registries, or another game.
- Subway state remains JSON-serialisable. No `Map`, `Set`, class, function, or cyclic/full-history structure in persisted state.
- Use `ctx.random()` for the odd-priority assignment. Never use `Math.random()` in the reducer.
- Illegal actions return the prior state unchanged and do not throw.
- Route Planner state is client-local and is never part of the room payload. It is genuinely private within the current client, unlike committed cards that are only view-hidden.
- Retain the current social-play secrecy limitation for Engineering and Destination assignments; do not build per-player API filtering in this workstream.
- Preserve the 27 × 9 board, station coordinates/capacities, six contracts, forced 3/3 ownership, 16 periods, current money/economy, and one free starter for each scheduled line.
- Bump `SUBWAY_STATE_VERSION`; stale v5 rooms must offer restart per `DEC-008`, not be migrated or interpreted as the new shape.

## 5. Implementation requirements

- **R-1 (OD-3).** Each contract exposes its approved ordered recipe as authoritative data. Completion, remaining actions, schedule-block length, UI progress, and tests derive from that recipe so parallel `nodes`/recipe values cannot drift.
- **R-2 (OD-4, OD-6).** Define one effective physical position for every normal node and station slot. Use that same position for route rendering, segment distance, angle changes, crossing/point-on-segment checks where applicable, and ghost preview.
- **R-3 (OD-4).** A segment of required length `L` is legal only when `abs(effectiveDistance - L) <= 0.5`. Boundary values are legal. Use the same helper in authoritative placement validation and the preview/legal-target UI.
- **R-4 (OD-5).** Starting with the second built segment, reject a candidate whose heading change exceeds 90°. Exactly 90° is legal. Station slots receive the same treatment.
- **R-5 (OD-3–OD-6).** `validateNode`, `hasLegalMove`, buildable-line pruning, starter/build actions, Overtime, Surge Crew, skipping, completion, and scoring remain internally consistent under recipes, turn limits, and exact station slots.
- **R-6 (OD-6).** Building into a station requires an explicit open slot identifier. Reject missing, out-of-range, already-filled, or otherwise illegal slot choices. A stale client losing a slot race must not be silently moved to another slot.
- **R-7 (OD-2).** Give all six contracts distinct permanent colors. Use the line color for route string/pegs, its docked station slot, Gantt block, contract identity, Survey Pin, active-line indicator, and route preview. Retain company ownership via labels, badges/borders, legend, and priority indicators. Do not rely on color alone.
- **R-8 (OD-1).** Assign the odd-period priority company randomly at game start. `periodPriorityId` returns the odd company on odd periods and the opponent on even periods unless a period override exists. Procurement first refusal remains its existing independent alternation.
- **R-9 (OD-1, OD-14).** The odd-priority company takes the first starter placement and first Survey placement; retained alternating/fewer-placed logic must terminate correctly when counts differ. Display base/override priority for every period on the schedule.
- **R-10 (OD-7).** Add a private Route Planner during Engineering and Scheduling. A player selects an owned line, chooses a hypothetical legal normal starter, and builds/edits/clears a ghost route through the entire ordered recipe. Each step shows only targets that satisfy static board bounds, station-slot geometry, recipe length, ≤90° turns, and the ghost route's own spatial legality.
- **R-11 (OD-7).** The planner never dispatches a game action, reserves a hole, spends money, or promises future legality against opponent construction. It resets safely on reload and clearly labels the route as a non-binding preview.
- **R-12 (OD-8).** During actual starter/construction placement, show a prominent active-line treatment including line name/color, built/total progress, the full recipe with completed/current/future steps, the next required length, and the current endpoint. Highlight the same line consistently on the board and private company panel.
- **R-13 (OD-8).** Only reducer-legal candidate normal holes and open station slots glow/click as valid. When no target exists, explain that the scheduled action may be skipped; do not deadlock the period.
- **R-14 (OD-9).** For the owning player, evaluate committed Engineering cards against current state throughout play and render a clear `COMPLETE` state as soon as met. Do not expose card identity or completion to the opponent before scoring. Derived status must revert if an eligible placement is undone.
- **R-15 (OD-10).** Delete Long Segment from card content, market, starting hand references, diagrams, scoring, rules, and tests. Add Network Link with +3 VP and the exact requirement: one completed line contains connections to at least two distinct stations.
- **R-16 (OD-11).** Add one Destination card for each existing station to the face-up Engineering market. Drafting a Destination puts it in a separate Destination hand/state while drafting a normal card retains existing behavior.
- **R-17 (OD-11, OD-12).** Engineering lock accepts exactly three distinct held normal Engineering cards plus zero or more held Destination assignments. Each assignment names a current owned line. Reject more than two Destinations on a line, assignment of a card not held, assignment to a missing line, or assigning duplicate copies of the same station to the same line. Unassigned Destination cards remain non-scoring hand cards.
- **R-18 (OD-12).** A committed Destination scores +3 when its assigned line contains the named station, whether or not the line completes. Show live private completion; reveal assignments and outcome at scoring. A shelved line can score only if it actually received a connection before becoming incomplete; in normal flow a never-built shelved line cannot.
- **R-19 (OD-13).** Engineering plan lock includes a Survey quantity from 0 through 5. Reject quantities outside the range or whose `$1M × quantity` cost exceeds current money. Deduct the cost once when that player's plan locks; duplicate/invalid submissions may not double-charge. Purchase cannot be undone.
- **R-20 (OD-13, OD-14).** After both Engineering plans lock, place every purchased Survey Pin before Scheduling. Each placement names one owned line and one normal board hole. Pins never occupy/reserve a hole and never participate in peg spacing, crossing, or station capacity.
- **R-21 (OD-14).** Reject a player's second personal pin on the same coordinate and any station coordinate. Permit an opposing pin on the same coordinate. If one player has placed all purchased pins, the other places its remainder without deadlock.
- **R-22 (OD-13).** Score each pin +1 only when the assigned line has a node at its exact coordinate. A node from another owned line does not fulfill it. Keep pins visible and distinguish pending from fulfilled without obscuring real pegs/strings.
- **R-23 (OD-15).** Add one authoritative undo action. It is legal only for the actor of the current last undoable physical placement and only while no later accepted state-changing action has occurred. Invalid or repeated undo is a no-op.
- **R-24 (OD-15).** Undo of a Survey Pin returns that purchased pin to the actor's unplaced count and restores the correct Survey placement turn/substep. Undo of a starter or construction node restores the exact prior phase, period, queues, pending actions, line route, crossing usage, completion status, messages, and other side effects of that placement.
- **R-25 (OD-15).** Undo remains available when the placement itself advanced a phase—for example final Survey → Scheduling, final starter → Construction, or final build → Scoring—until another accepted action occurs. Scoring reveal or any other later accepted action expires it.
- **R-26 (OD-15).** Every accepted state-changing Subway action other than the undo itself clears any older undo opportunity before applying. Rejected/no-op actions and room polling do not clear it. Client-only selection/preview edits are not game actions.
- **R-27 (OD-16).** Retain existing procurement termination, Discount Yard, 3/3 cap, scheduling costs, shelving, construction cards, skipped-action loss, crossing permit, station/company scoring, tiebreakers, and endgame behavior except where this spec explicitly changes geometry/card scoring.
- **R-28.** Update status copy, card art/diagrams, legends, help text, mobile layout, and results breakdown so the new concepts can be understood without reading `RULES.md`.
- **R-29.** Bump Subway's state version and preserve the stale-room restart behavior.

## 6. State transitions

| From | To | Trigger | Guard | Side effects |
|---|---|---|---|---|
| SETUP | PROCUREMENT | Start game | Host/current existing guard | Shuffle contracts; randomly assign odd priority; initialize new state |
| PROCUREMENT | ENGINEERING / PLAN | Final contract owned | Existing termination rules | Normal and Destination hands are ready; no schedule yet |
| ENGINEERING / PLAN | ENGINEERING / PLAN | One player locks plan | Exactly 3 valid normal cards; valid Destination assignments; affordable 0–5 pin purchase | Remove/commit selected cards, store Destination assignments, deduct pin cost once, mark player locked |
| ENGINEERING / PLAN | ENGINEERING / SURVEY | Second player locks valid plan | Both locked | Set first Survey placer to odd-priority company; skip players with zero pins |
| ENGINEERING / SURVEY | ENGINEERING / SURVEY | Place Survey Pin | Correct actor; purchased pin remains; valid line/normal hole; no own pin there | Append public assigned pin; advance alternating turn |
| ENGINEERING / SURVEY | SCHEDULING / PLANNING | Last purchased pin placed | Both players placed purchased counts | Auto-schedule existing blocks and open private schedule planning |
| SCHEDULING / RESOLUTION | STARTER_PLACEMENT | Both schedules confirmed | Existing affordability/validity guards | Deduct existing schedule cost; odd-priority company starts starter placement |
| STARTER_PLACEMENT | CONSTRUCTION | Final scheduled-line starter placed | Existing starter legality plus new identity UI | Begin first scheduled construction period |
| CONSTRUCTION | CONSTRUCTION / SCORING | Build or skip | Existing turn/action guard plus geometry | Advance queue/period/phase as today; build creates undo opportunity |
| Any post-placement state | Restored prior state | Undo last placement | Same actor, token current, no accepted later action | Exact pre-placement gameplay state restored; undo opportunity consumed |
| SCORING | RESULTS | Host reveals scoring | Existing host guard | Score contracts, stations, Engineering, Destinations, surveys, tiebreakers |

Illegal transitions return the prior state unchanged. UI should explain common local invalidity before dispatch and surface a refreshed state after a race, but server-side reducer behavior remains authoritative.

## 7. Interfaces

### Reducer intents

Exact action names/payload structure are implementation discretion, but the public Subway intent surface must support:

- Locking an Engineering plan containing exactly three normal card IDs, Destination-card-to-line assignments, and Survey quantity.
- Placing a purchased Survey Pin with line index/reference and normal-hole coordinate.
- Placing a starter/build node with exact station slot when the target is a station.
- Undoing the latest eligible physical placement.

Payloads are untrusted. Validate player ownership, card possession, current phase/substep, numeric bounds, coordinates, slot openness, turn, line existence, and affordability in the reducer.

### UI contract

- Normal and Destination cards are visually distinct even though they share the face-up Engineering market.
- The owner sees committed normal and Destination cards with live status; the opponent sees neither before scoring.
- Survey quantity/cost/cash-after is shown before plan lock.
- Route Planner, active-line recipe, board highlights, exact station slots, priority row, and undo affordance work with mouse and touch.
- Actual target highlights come from the same authoritative rule helpers or behaviorally identical shared calculations; do not create a second divergent geometry rule in the view.

## 8. Persistence changes

Persist only shared authoritative game state. Expected conceptual additions include:

- Odd-priority company identity (replacing the single all-period default meaning).
- Ordered recipes and fixed colors as contract configuration, not copied per line unless necessary.
- Exact station slot on route nodes (already present but now player-selected and authoritative for geometry).
- Separate Destination hand/commitments with card ID, station ID, assigned line, and derived or stored completion as appropriate.
- Engineering substep/lock details, purchased/placed Survey counts, and public assigned Survey Pins.
- Bounded last-undoable placement information sufficient to restore one placement exactly.

Do not persist ghost planner routes. Do not persist unbounded action history. Keep completion statuses derived where practical so undo and scoring cannot drift.

## 9. Migration requirements

No in-place migration. Increment `SUBWAY_STATE_VERSION`. Any room with the prior version follows the existing restart prompt from `DEC-008`. New games initialize the complete new shape. Tests must prove stale state is not treated as current.

## 10. Failure behavior

| Failure | Retryable | User sees | State left |
|---|---|---|---|
| Required segment has no legal endpoint | Player may skip existing action | Clear “no legal endpoint” guidance | Construction turn remains until build/skip |
| Candidate wrong length or >90° | Yes, choose another target | Target does not glow; explicit reason if tapped/stale | Unchanged |
| Station slot filled by opponent race | Yes, choose another open target | Refresh/slot no longer available | Winner's action persists; loser unchanged |
| Invalid Destination assignment | Yes before lock | Specific assignment/cap error | Unchanged and not locked |
| Survey purchase unaffordable/out of range | Yes before lock | Cost/available-cash error | Unchanged and not charged |
| Invalid Survey hole/line/turn | Yes | Specific reason | Unchanged |
| Undo expired/wrong actor/replayed | No for that placement | Undo hidden or “no longer available” | Unchanged |
| Ghost route later becomes blocked | Yes, replan during allowed phase or adapt in Construction | Planner labelled non-binding | Shared state unaffected |
| Old Subway state after deploy | Start a new game | Existing stale-room restart prompt | Old blob not interpreted/mutated as new |

## 11. Concurrency / idempotency

- Preserve the engine's optimistic-locking CAS behavior. Reducer actions may be re-run from fresh state.
- Random odd-priority assignment occurs through `ctx.random()` in the existing start transition.
- Exact station-slot races, Survey placement turns, Engineering locks, purchases, and undo guards are revalidated against fresh state on every reducer execution.
- A player plan lock is one-time. A repeated valid-looking lock after the player is already locked is a no-op and cannot charge twice.
- Undo is one-shot. Replaying it after success is a no-op.
- The project has no general idempotency keys; do not expand this workstream into an engine delivery rewrite. Ensure the new guards are at least as safe as existing Subway actions.

## 12. Observability

No new external telemetry system is required. Maintain clear state messages for plan lock, Survey purchase/placement, exact station docking, invalid geometry, line completion, Destination/Survey completion where appropriate, undo success/expiry, and period priority. The PR handoff must report playtest observations and any rule that was difficult to explain from the UI.

## 13. Backwards compatibility

- Existing v5 Subway rooms are intentionally incompatible and restart via version guard.
- Other games, room creation/joining, hotseat/multiplayer shell behavior, Turso schema, and API payload wrapper remain compatible.
- Existing Subway procurement/scheduling action semantics remain compatible where their owner-visible behavior is not changed.
- No feature flag is required; state versioning is the rollout boundary.

## 14. Security / privacy constraints

- The owner and opponent must not see one another's committed Engineering or Destination identities/statuses in the rendered UI before scoring.
- The repository's known limitation remains: whole room state is returned to every client. Document this; do not claim true server secrecy.
- Ghost Route Planner data must remain local and absent from dispatched payloads and persisted state.
- Survey Pins, their assigned line/color, and fulfillment are public by design.
- Do not log card identities or planner content to external services. No new external dependency is needed.

## 15. Edge cases

| Case | Expected behavior |
|---|---|
| Distance exactly `L - 0.5` or `L + 0.5` | Legal if all other rules pass |
| Turn exactly 90° | Legal |
| Turn just over 90° | Rejected |
| First segment | Recipe length enforced; no turn rule yet |
| Candidate station with one open slot | Only that exact slot is legal; no auto-assignment |
| Two clients choose same final station slot | First committed action wins; retrying loser is rejected/no-op |
| Route enters and later leaves a station | Angles use the selected physical slot consistently |
| Recipe exhausted | Line is complete; no further build/Surge/Overtime action on it |
| Scheduled action after line already completed early | Existing pruning removes it; no phantom action |
| No legal target under recipe/turn/spatial rules | Existing skip path remains available and action is lost |
| Ghost route self-crosses or revisits illegal geometry | Preview rejects that step |
| Ghost route uses opponent Survey Pin hole | Allowed; pins do not reserve |
| Player buys zero Survey Pins | Locks normally; placement phase skips that player or both and reaches Scheduling |
| Players buy unequal Survey counts | Alternate while both have pins, then remaining player finishes without deadlock |
| Both players survey same hole | Allowed and rendered legibly |
| Same player surveys same hole twice | Rejected |
| Survey assigned line later shelved | Pin remains public, costs money, scores 0 unless that line somehow actually connected before end |
| Different owned line builds through a pin | Pin remains unfulfilled |
| Assigned line builds through pin, then build is undone | Fulfillment reverts |
| Destination card unassigned | Remains in hand and scores 0 |
| Third Destination assigned to one line | Plan lock rejected |
| Duplicate same-station Destinations assigned to same line | Rejected; may be assigned to different lines if otherwise valid |
| Destination line reaches target but is incomplete | Destination scores +3 |
| Target station fills before assigned line reaches it | Card remains unfulfilled |
| Network Link connects same station twice | Does not count; two distinct station IDs required |
| Network Link line connects two stations but remains incomplete | Does not count; line must be complete |
| Undo immediately after normal build | Restores route and exact turn/queue state |
| Undo after build auto-advances period | Restores prior period and actor turn |
| Undo final build after auto-transition to SCORING | Allowed until host scoring action or another accepted action |
| Undo final starter after transition to CONSTRUCTION | Allowed until another accepted action |
| Undo final Survey after transition to SCHEDULING | Allowed until another accepted action |
| Opponent acts before undo | Undo expires and is rejected |
| Invalid/no-op opponent action occurs | Does not expire undo because no accepted state change occurred |
| Undo request delivered twice | First restores, second no-op |
| Phone pinch/pan while targets glow | Gesture does not accidentally place a peg; tap still selects precise hole/slot |
| Color-vision deficiency | Line name/order/labels or patterns preserve identity without color alone |

## 16. Tests

Extend reducer-level behavior coverage to prove:

- Both possible odd-priority assignments, odd/even periods, no-conflict periods, and Priority Permit overrides.
- All six recipes, each step in order, ±0.5 boundaries, wrong lengths, exact 90°, >90°, station-slot geometry, and completion/action counts.
- Every retained spatial invariant under effective slot positions: occupation, spacing, strings, self-crossing, opponent crossing permission, capacity, and one connection per line per station.
- Exact-slot selection and slot-race rejection; no automatic fallback slot.
- Network Link success/failure: completed vs incomplete, one station vs two distinct stations.
- Normal Engineering and Destination market drafting/hand separation, exactly-three normal commitments, destination assignment cap/possession/duplicates, live/scoring completion.
- Survey purchase boundaries 0/5/6, affordability, one-time charge, placement order with 0/equal/unequal counts, stacking rules, line assignment, fulfillment, and scoring.
- Undo for Survey, starter, normal build, build that crosses, line-completing build, period-advancing build, phase-advancing final placement, expiry on later accepted action, persistence after no-op, wrong actor, and duplicate undo.
- `hasLegalMove`, action pruning, Overtime, Surge Crew, skip, shelving, and scoring with constrained recipes.
- State-version stale-room behavior or the closest existing unit seam, without bypassing `DEC-008`.

UI/manual validation must cover:

- Private ghost planning of each recipe, editing/clearing, explicit non-binding messaging, no shared-state publication.
- Desktop and phone active-line clarity, recipe progress, exact station-slot taps, pan/zoom gesture safety, destination/survey cards, live completion, priority row, and undo affordance.
- A full two-player/hotseat game from Procurement through Results using at least one Destination, one fulfilled and one blocked Survey Pin, one exact station-slot race, one Priority override, and one undo.

Tests must assert behavior, not helper calls or component implementation.

## 17. Acceptance criteria

- [ ] **AC-1.** All six approved recipes are authoritative and displayed in order.
- [ ] **AC-2.** Actual placement rejects wrong lengths and >90° turns in the reducer, including station-slot endpoints.
- [ ] **AC-3.** Exact station slots are individually selectable, individually validated, and never auto-substituted.
- [ ] **AC-4.** The local Route Planner can preview/edit/clear a complete recipe during Engineering and Scheduling without dispatching or persisting it.
- [ ] **AC-5.** Construction clearly identifies the active line, next length, endpoint, progress, and legal targets on desktop and phone.
- [ ] **AC-6.** Every contract uses a unique accessible line identity across board, schedule, cards, stations, surveys, and legend while company ownership remains clear.
- [ ] **AC-7.** Base priority alternates odd/even from a randomized starting company and Priority Permit still overrides its chosen contested period.
- [ ] **AC-8.** Players still commit exactly three normal Engineering cards; live private completion appears without leaking to the opponent UI.
- [ ] **AC-9.** Long Segment is absent and Network Link correctly scores +3 only for a completed line connecting two distinct stations.
- [ ] **AC-10.** Destination cards share the Engineering market, remain separate from the three-card limit, enforce two per line, show private status, reveal at scoring, and score +3 on the assigned line's target connection.
- [ ] **AC-11.** Survey purchases enforce $1M each and 0–5 maximum, deduct once, place in correct order, remain public/non-reserving, and score +1 only for the assigned line.
- [ ] **AC-12.** Limited undo restores the exact pre-placement state for Survey, starter, and construction placements and expires after any later accepted state change.
- [ ] **AC-13.** No other Subway economy, phase, spatial, card, shelving, or scoring behavior changes without a disclosed spec deviation.
- [ ] **AC-14.** `SUBWAY_STATE_VERSION` is bumped and stale rooms follow the restart path.
- [ ] **AC-15.** `./scripts/test-subway.sh`, `npm run build`, and `npm run lint` pass.
- [ ] **AC-16.** Manual desktop and phone playtests complete the scenario in §16 with no console error or horizontal overflow.
- [ ] **AC-17.** `RULES.md`, `PROJECT_MODEL.md`, `DECISIONS.md`, WS-002, ACTIVE, and the PR handoff match the behavior actually built.

## 18. Non-goals

- More than two players, a bot, new maps/stations, Company Cards, or multiple project cycles.
- Engine/API/database changes, true server-side secrecy, WebSockets, or an idempotency-system rewrite.
- Changing contract prices/VP/penalties, station values/capacities/locations, starting money/hands beyond replacing Long Segment, mobilization, crew pricing, timeline length, procurement, or the forced 3/3 split.
- Reserving board holes with surveys.
- Persisting ghost routes or adding general action history/multi-level undo.
- Final balance claims. The recipes, +3 Destinations, and $1M/+1 surveys require a follow-up owner playtest.
- Closing or resolving WS-001's retrospective open decisions.

## 19. Required documentation updates

- [ ] `src/games/subway/RULES.md` — replace freeform geometry/card text; document recipes, distance tolerance, 90° cap, exact slots, odd/even priority, Destinations, Survey purchase/placement/scoring, live status, and undo.
- [ ] `docs/PROJECT_MODEL.md` — update Subway phase/substep flow and the Subway rules-harness description if its scope materially changes; preserve the documented engine boundaries and secrecy limitation.
- [ ] `docs/DECISIONS.md` — append consequential accepted entries for (a) ordered contract geometry/distinct line identity and (b) separate paid Destination/Survey planning commitments, if implementation confirms those durable boundaries. Do not rewrite existing accepted entries.
- [ ] `docs/workstreams/WS-002-subway-route-engineering.md` — at implementation start/PR readiness/review, update phase, Updated, Implementation State, Review State, Related Decisions/PRs, and Next Step to what is true.
- [ ] `docs/workstreams/ACTIVE.md` — keep WS-002's row synchronized with its phase/status/next step/PR.
- [ ] PR body — replace the design-stage draft body with the complete Implementation Handoff required by `framework/CLAUDE_HANDOFF.md`; every section present, explicit `None` where empty, spec deviations exhaustive.

## 20. Handoff requirements

- Continue on the existing WS-002 branch/draft PR rather than opening a second implementation PR.
- Run the Build OS v0.4 compatibility check before significant implementation; record the real result in the PR's `Framework:` field.
- Treat every OD/R/AC as reviewable. Any deviation, including a “better” geometry/card behavior, must be listed under Spec Deviations and escalated when owner-facing.
- Validation is mandatory: `./scripts/test-subway.sh`, `npm run build`, `npm run lint`, full desktop playtest, and phone-width playtest.
- The PR's Recommended Review Focus must specifically name geometry consistency, exact slot races, Engineering substeps, Survey/Destination scoring, and undo restoration/expiry.
- Do not merge. Mark the PR ready only after implementation and validation; independent Design Room review comes next.
