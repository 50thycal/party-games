# Build Spec — Subway Tabletop Console

**Workstream:** WS-004
**Build Card:** [Approved card](../workstreams/WS-004-subway-tabletop-console.md#build-card)
**Build OS:** v0.5
**Issued:** 2026-08-29
**Card Audit:** [Current inventory and recommendations](../subway-card-audit.md)

## 1. Objective

Reshape Subway's interaction layer into a board-centred digital tabletop. Keep Plan Mode and saved
phantom lines available through Construction; replace second-tap commitment with an explicit Confirm
flow; restrict starter pegs to the board border; fix starter NOW/NEXT marker precedence; narrate
accepted public actions and transitions on the pegboard; and organize public schedule/opponent state
and private cards/player state around the board on desktop, phone, and hotseat.

The card inventory is audited in this PR, but no new card effects are approved for implementation.

## 2. Owner-approved behavior

> After this change, the system should feel like the actual tabletop version: the pegboard stays in
> the middle, players can see their own organized cards and saved route plan, and important actions
> appear over the board without requiring them to scroll around for game state.

### Owner decisions

- **OD-1 — Construction planning.** Plan Mode remains available during Construction.
- **OD-2 — Saved phantom routes.** Players can save a phantom route for an owned line and continue
  seeing/editing that plan while the real route is built.
- **OD-3 — Provisional placement.** Tapping a legal starter or Construction target selects it.
  Tapping another legal target moves the provisional marker. Neither action consumes the turn.
- **OD-4 — Explicit confirmation.** A visible Confirm button is the only way to commit the selected
  starter/build target. Confirmation resolves one action and advances the reducer queue normally.
- **OD-5 — Following preview.** The legal next-segment endpoints remain visible from the provisional
  target before confirmation.
- **OD-6 — Starter border.** Every starter peg must occupy a non-station hole on the outer border;
  interior holes are reducer-illegal.
- **OD-7 — Starter visibility.** Selecting a starter must not leave green legal-target rendering on
  top of the following-step markers. NOW and NEXT remain distinguishable by colour, ring pattern,
  and label.
- **OD-8 — Board narration.** New phases/periods and important accepted player actions appear as
  brief overlays on the pegboard. Public history remains available after an overlay disappears.
- **OD-9 — Tabletop organization.** The pegboard remains the central, current-size surface. Schedule,
  cards, company/line state, action controls, and supporting information are arranged around it to
  resemble the physical tabletop and minimize page hunting.
- **OD-10 — Private/public presentation.** The acting player sees their cards face up and organized.
  Opponents see only public information plus card backs/counts until reveal. Hotseat protects each
  private mat during player handoff.
- **OD-11 — Card audit.** Audit Engineering, Destination, Scheduling, and Construction cards in a
  reviewable table; identify categories below 10 cards/six unique types and propose additions.
- **OD-12 — Card expansion gate.** Recommendations are for owner review only. Do not add or rebalance
  card mechanics in this implementation without a later explicit approval.

### Implementation discretion

Claude may choose component boundaries, CSS grid/bottom-sheet implementation, animation library or
CSS transitions, local-storage hooks, event helper names, minimap rendering technique, card zoom
presentation, exact durations within the limits below, and behavior-preserving refactors. Prefer
repo-native React/CSS/SVG and existing card artwork over a new UI dependency.

### Stop / escalation conditions

Stop if implementation would require:

- adding any card from the audit recommendations or changing an existing card effect;
- putting phantom routes in shared room state, making them authoritative, or exposing them on an
  opponent's supported UI;
- server-side secrecy/authentication work, or claiming UI concealment is secure state redaction;
- changing WS-003 route geometry, contact tolls, debt, recipes, objectives, or scoring;
- deleting one-placement Undo, changing extra-action semantics, or making a provisional tap consume
  an action;
- shrinking the pegboard materially on desktop to make the surrounding dashboard fit;
- narrating private card names, Destination assignments, or committed objectives to the opponent.

## 3. Repository context

- `src/games/subway/GameView.tsx` owns the board, local preview, planner, current vertical layout,
  cards/panels, and responsive interaction.
- `src/games/subway/config.ts` owns reducer legality, phase/period/queue changes, state messages,
  card actions, public game state, and `SUBWAY_STATE_VERSION`.
- `src/games/subway/CardArt.tsx` renders Engineering and Destination faces. Existing generic cards
  in `GameView.tsx` may be refactored into reusable face/back components.
- `scripts/subway-rules-test.ts` is the focused reducer harness.
- `src/app/rooms/[roomCode]/page.tsx` polls the room about once per second and controls hotseat's
  active player. Touch it only if the handoff veil cannot be correctly contained in the game view.
- The entire room payload reaches every client. Private presentation is a React convention, never a
  security claim (`AGENTS.md`, `PROJECT_MODEL.md` invariant 11).
- Current Subway state version is 7. Persisted public events change its shape and require version 8.

## 4. Architecture constraints

- Reducer legality remains authoritative. Border starters and confirmed placements are enforced in
  `config.ts`; the UI never creates a new rule by filtering alone.
- Reducers remain pure, serialisable, deterministic, and use `ctx.now()` for event timestamps if a
  timestamp is stored.
- Routine polling must not reset selected targets, saved plans, card zoom, active tabletop tab, board
  pan/zoom, or already-seen event state when the relevant authoritative data is unchanged.
- Shared state may contain public events only. Never persist a private card name/assignment in event
  text or payload.
- Local saved plans are namespaced by room code, player id, Subway state version, and line contract
  identity. They are validated defensively when read and fail closed to an empty plan.
- Maintain DEC-013's redundant cues: permanent line colour plus code/dash; NOW/NEXT colour plus
  number/ring pattern; card state by label/icon as well as colour.
- Maintain DEC-015's post-confirm full-state Undo snapshot. Provisional interaction has its own
  Cancel/selection changes and does not create Undo.

## 5. Implementation requirements

### 5.1 Tabletop information architecture

Create a cohesive tabletop composition rather than a reordered stack of the same panels.

#### Desktop / wide layout

- Keep the Metropolitan Pegboard as the dominant central surface at its current aspect ratio and
  effective size.
- Provide an opponent public mat above or beside the board: company identity, public cash/debt,
  owned Line Contracts and progress, scheduled work when public, played/revealed cards, and backs or
  counts for hidden hands.
- Provide the player's private mat below or beside the board: owned Line Contracts, all card-family
  hands as actual face-up cards, Destination assignments/status, committed Engineering live status,
  cash/debt, Surveys, and phase-valid actions.
- Place the Gantt programme in a persistent public dashboard rail once it exists. Preserve private
  scheduling before simultaneous reveal exactly as today.
- Add a public event rail and a compact board minimap/viewport indicator. Either may collapse, but
  neither should require leaving the game surface.
- Keep the active-line banner and placement cost/Confirm controls attached to the board.

#### Phone / narrow layout

- Keep the board pan/zoomable and as tall as practical above a sticky action strip.
- Replace the long panel stack with a compact bottom sheet or tabs: `My Mat`, `Schedule`, `Log`.
- Show the current action, selected line, selected hole, cost, Cancel, and Confirm without opening a
  sheet.
- Cards remain tappable for a full readable face and dismiss back to the same board viewport.
- No horizontal page overflow. Board panning must not accidentally move the page or confirm a peg.

#### Card presentation

- Render each owned card as a recognizable face grouped under Engineering, Destination, Scheduling,
  and Construction. Use existing art where available and a consistent face template elsewhere.
- Use card backs/counts for opponents before public play/reveal. Never render private names,
  assignments, or objective completion for the opponent.
- Played public cards move to a public played/discard area or are otherwise clearly identified.
- A card zoom/detail view must show exact rule text and current `COMPLETE`/assigned/played state.

### 5.2 Saved Plan Mode

- Offer an explicit `Plan` mode control whenever the player owns at least one line during
  Engineering, Scheduling, Starter Placement, and Construction, including while waiting for the
  opponent.
- During the player's live placement action, entering Plan Mode pauses provisional placement UI; it
  does not dispatch, skip, or surrender the action. Leaving Plan Mode restores the current legal
  placement choices.
- Store one saved phantom route per owned line in browser local storage. Recommended key:
  `subway-plan-v8:<roomCode>:<playerId>:<contractId>`.
- Save is explicit. Provide `Save plan`, `Edit`, and `Clear` controls plus a saved indicator.
- A new plan begins from the line's real endpoint if it has one, otherwise from a legal border
  starter. Each phantom segment uses `legalTargets`/`validateNode` on a cloned state and current
  route, so its shape is informative but still non-binding.
- Draw saved plans with the line's permanent colour/code/dash plus a translucent/dashed phantom
  treatment. Only the owning player's UI draws them.
- As real nodes are confirmed, visually reconcile matching leading phantom nodes with the real
  route. If reality diverges or a later phantom segment becomes illegal, mark the remaining plan
  `STALE` and let the player edit from the real endpoint; never silently alter it into a different
  route.
- Plans survive refresh on the same browser. Missing/corrupt/old-version data is ignored safely.
- Hotseat loads only the active player's plan after the handoff veil.

### 5.3 Provisional placement and Confirm

- Replace “tap the same target again to commit” with explicit selection state.
- First legal tap selects a provisional target. Any later legal tap replaces it, including a
  different station dock. No Undo is involved.
- Selected target renders as solid `1 / NOW`; following targets render as dashed `2 / NEXT`.
- Show exact target/dock, active line, next required segment, opponent contacts, toll, cash after,
  projected debt penalty, `Cancel`, and `Confirm placement` in a sticky board action strip.
- Confirm dispatches `PLACE_STARTER` or `BUILD` with only the current target. The reducer revalidates
  it against current state. A rejection leaves the player in place mode, refreshes legal targets,
  clears or updates stale selection, and does not consume the action.
- On acceptance, clear provisional state, append the public event, and let the reducer's existing
  queue/phase progression decide whose action comes next.
- One confirmed placement consumes one pending action. If Overtime/Surge left another pending action,
  the same player may receive another action normally; this is not one confirmation committing two.
- Preserve post-confirm Undo exactly as today. Undo generates its own public event and restores the
  prior route/queue/balances under DEC-015.

### 5.4 Border-only starter and marker precedence

- In starter validation, require `x === 0 || x === columns - 1 || y === 0 || y === rows - 1`.
- Preserve bounds, normal-hole, and no-station starter rules. A station on the border would remain
  illegal unless the owner later changes that rule.
- `legalTargets(..., starter=true)` returns only legal border holes; tests must establish all four
  edges and reject representative interior holes.
- Once a starter is selected, render in this precedence order:
  1. dim or suppress unselected current legal starter targets;
  2. render following `2 / NEXT` markers;
  3. render the selected `1 / NOW` marker on top.
- If a coordinate belongs to both an unselected starter-target set and following-target set, NEXT
  wins visually. Target state must also be discernible without green/yellow.

### 5.5 Public event model and pegboard narration

Add a bounded, structured public event stream to `SubwayState`, for example:

```ts
type SubwayEvent = {
  seq: number;
  kind: "PHASE" | "PERIOD" | "TURN" | "PLACEMENT" | "CARD" | "PLAN" | "ROUTE" | "UNDO" | "SCORE";
  actorId?: string;
  text: string;
  createdAt: number;
  emphasis: "banner" | "notice";
};
```

- Keep a monotonic `nextEventSeq` and a bounded public history of the latest 20 events.
- Append events only for accepted reducer changes. Rejected actions and poll responses append none.
- Required prominent banners: game/phase start, Engineering substep transition where meaningful,
  schedule reveal, starter completion/Construction start, each new Construction period, scoring,
  results.
- Required action notices: public Destination pick without card identity, plan lock, Survey
  placement, schedule submission/confirmation, public Scheduling/Construction card play, starter,
  build with line and coordinate/station, toll transfer, line completion, skip, Undo, and scoring
  advance. Combine simultaneous facts into one readable notice rather than stacking several.
- Turn-only changes may use a compact notice/current-turn marker. Do not throw a large overlay after
  every queue pop.
- Never put a private Engineering card, unplayed hand card, Destination identity/assignment, private
  schedule before reveal, saved phantom route, or private completion state in a public event.
- The client tracks last-seen event sequence per room/player. Polling the same event never replays it.
  On initial load, show current state without replaying the full backlog.
- Queue unseen notices in order. Banner target duration: 1.5–2.5 seconds; action notice: 0.8–1.8
  seconds. Allow tap/click dismissal and honor `prefers-reduced-motion`.
- Use an `aria-live` region and retain the bounded event rail so information is not animation-only.
- Existing `message` may remain for compatibility or derive from the latest event, but it must not
  become a competing source of narration truth.

### 5.6 Private/public and hotseat behavior

- Multiplayer viewer sees their own private mat only. Opponent cards show backs/counts until played
  or revealed by current rules.
- Private Destination and Engineering status stays off public overlays, event history, opponent mat,
  and accessible labels.
- This is UI concealment only. Update rules/project memory to state that the complete room payload is
  still inspectable and fairness does not depend on server withholding.
- In hotseat, when control is about to move to another player, cover the private mat and saved plan
  with a handoff veil: `Pass to Zoe` → explicit `I am Zoe` confirmation → reveal Zoe's mat.
- The public board, last public event, and public schedule may remain visible behind or above the
  veil, but no outgoing/incoming private card face may flash during transition.

### 5.7 Card audit boundary

- Publish [the audit](../subway-card-audit.md) and link it from WS-004 and the PR body.
- Do not change `ENGINEERING_CARDS`, `DESTINATION_CARDS`, `SCHEDULING_CARDS`,
  `CONSTRUCTION_CARDS`, `MARKET_DECKS`, starting hands, card art, reducer card effects, or scoring
  except for purely presentational refactors needed to lay out the existing cards.
- The audit records 10 Engineering, 6 Destination, 3 Scheduling, and 3 Construction types.
- Any later card expansion requires explicit owner selections, economics, copy, availability, tests,
  and either an amended approved Build Card or a follow-up workstream.

## 6. State transitions

```text
Plan Mode (client only)
  choose line -> sketch with reducer geometry -> Save local -> show phantom
  no dispatch / no room mutation / no reservation

Live placement
  tap legal target -> provisional NOW + derive NEXT
  tap another       -> move NOW + recompute NEXT/cost
  Cancel            -> clear provisional state
  Confirm           -> dispatch authoritative action
       rejected     -> no action consumed; refresh selection
       accepted     -> placement + event + existing queue advance + Undo window

Accepted game action
  reducer mutates game state -> append one privacy-safe public event
  client poll sees unseen seq -> board overlay -> event rail retains record
```

## 7. Persistence and migration

- Bump `SUBWAY_STATE_VERSION` from 7 to 8 for the structured event fields.
- Old rooms restart under DEC-008; no in-place game-state migration.
- Saved plans use versioned browser keys and are not part of room persistence. A v7 plan key is never
  loaded into v8 behavior.
- Limit public events to 20 and avoid storing duplicate display strings or unbounded logs.
- Existing `partyShellPlayer` and hotseat active-player storage remain unchanged unless the handoff
  veil requires an additional small, namespaced client key.

## 8. Failure and concurrency behavior

- Corrupt saved-plan JSON, unknown contract, non-owned line, or malformed nodes: ignore and offer a
  fresh plan; do not crash the board.
- Selected target becomes illegal or changes toll before Confirm: show refreshed authoritative
  selection/cost and require a new confirmation; never commit a fallback coordinate.
- Concurrent opponent action arrives through polling while planning: preserve the saved plan but mark
  affected segments stale; do not erase it.
- Polling receives the same event history: no duplicate overlay.
- More events arrive than can be animated: preserve order but coalesce compatible turn/period notices
  and never block game input behind a long animation queue.
- Event history has no unseen event on reload: render current phase/period/turn from state rather than
  inventing an event.
- Local storage unavailable/quota rejected: planning still works for the session and Save reports
  that persistence is unavailable.

## 9. Tests

### Reducer

- Border starter legality on all four edges, four corners, representative interior holes, bounds,
  and station exclusion.
- Confirmed starter/build still consumes exactly one action and advances queue/period/phase exactly as
  before; Overtime and Surge extra actions remain independent.
- Stale/illegal confirmed target is a no-op and preserves the actor's action.
- Public events append only on accepted actions, increment sequence, cap at 20, and use correct
  banner/notice classes.
- Event privacy table proves no hidden card identity, assignment, private plan, or unrevealed schedule
  enters public payload text.
- Undo restores pre-placement gameplay state and produces the intended post-undo public event without
  leaking the reverted snapshot.
- State version 8/restart behavior.
- Existing WS-003 geometry, toll, debt, Destination, Survey, schedule, skip, and scoring tests remain
  green.

### UI / component

- Target A → target B changes provisional placement without dispatch; Confirm dispatches B once;
  Cancel dispatches nothing.
- Starter selection shows selected NOW and following NEXT above/different from remaining border
  targets, including an overlapping target coordinate.
- Routine one-second polls preserve provisional selection, saved plan, open card detail, current tab,
  and board viewport when relevant state is unchanged.
- Planner is available in Construction and waiting states; save/reload/edit/clear works per line and
  per player; stale plans are marked; opponent/hotseat-other player never renders them.
- Event overlays deduplicate, queue, dismiss, honor reduced motion, and update `aria-live`.
- Own cards render face-up and organized; opponent cards render backs/counts; played public cards
  render publicly; private labels do not enter opponent DOM/accessibility tree.
- Hotseat veil prevents private information flashing during player switch.

### Manual validation

- Desktop two-player at 1440×980: play from Engineering through at least three Construction periods
  without routine page scrolling; save plans for two lines; reposition and Confirm starters/builds;
  play public cards; inspect schedule and log.
- Phone two-player at 390×844 touch: same core flow with board pan/zoom, sticky Confirm/Cancel, card
  zoom, bottom-sheet tabs, minimap, no horizontal overflow, and no accidental commit while panning.
- Hotseat: switch players repeatedly across private drafting, Engineering commitment, Scheduling,
  and Construction; verify veil and private mats/plans.
- Starter preview specifically reproduces the reported all-green failure and proves NEXT remains
  visible after selection.
- Run `./scripts/test-subway.sh`, `npm run build`, and `npm run lint`.

## 10. Acceptance criteria

- [ ] Board-centred desktop and mobile tabletop layouts expose necessary public/private state without
      the current long-scroll workflow.
- [ ] Plan Mode works through Construction and saves private per-line phantom routes locally.
- [ ] Provisional placement can move freely; explicit Confirm alone commits and consumes one action.
- [ ] Starter placement is border-only in the reducer and NOW/NEXT markers never collapse into an
      all-green field.
- [ ] Structured, bounded, privacy-safe public events drive deduplicated board overlays and history.
- [ ] Own cards are face-up/organized, opponents' hidden cards are backs/counts, and hotseat uses a
      handoff veil.
- [ ] Existing card mechanics are unchanged and the card audit is available for separate owner review.
- [ ] State version, rules, project memory, tests, build, lint, and desktop/phone/hotseat evidence agree.

## 11. Required documentation updates

The implementation PR must update:

- `src/games/subway/RULES.md` for border starters, explicit Confirm, planner scope/persistence,
  narration, and private/public presentation disclosure.
- `docs/PROJECT_MODEL.md` for the tabletop view, client-local plan storage, event stream, state version,
  and privacy boundary.
- `docs/DECISIONS.md` only if implementation requires a new consequential choice beyond DEC-021/022.
- WS-004 and `docs/workstreams/ACTIVE.md` at implementation start, independent review, and merge
  finalization.
- PR body with actual validation, deviations, current full head, and Build OS v0.5 review gate.

## 12. Handoff requirements

- Continue on draft Design Handoff PR [#147](https://github.com/50thycal/party-games/pull/147); do
  not create a second implementation PR.
- On code start, change WS-004 from `READY_TO_BUILD / Active` to `BUILDING / Active`.
- Keep the card recommendations documentation-only until owner approval.
- Recommended review focus: reducer versus UI Confirm parity, action-queue semantics, event privacy
  and deduplication, local plan isolation, starter marker layering, hotseat concealment, and responsive
  tabletop usability.
- Do not self-approve or merge. Independent review must name the current full 40-character head SHA.
- Finish with the Build OS v0.5 documentation-only merge-finalization commit.

---

# Addendum A — Single-surface tabletop (approved clarification, 2026-08-30)

**Status:** Approved clarification of the existing WS-004 intent — not a new gameplay proposal.
**Decision record:** [DEC-023](../DECISIONS.md#dec-023--subway-renders-as-one-continuous-zoomable-tabletop-not-a-page-of-panels-around-a-board)
**Applies to:** §5.1 (information architecture) and the presentation half of §5.6. Sections 5.2–5.5,
§6, §7, §8 and the reducer contract are unchanged.

The v1 implementation read the §5.1 layout as panels arranged around the board in page flow. The
owner reviewed the merged result and clarified the intent: one continuous, zoomable virtual tabletop
that resembles the physical game viewed from directly above. This addendum supersedes §5.1 and the
mobile/desktop layout bullets of the Build Card; every rule, cost, phase, and privacy requirement
elsewhere in this spec still stands.

## A.1 One coordinate space

- **SA-1.** All game components live inside a single pan-and-zoom world: schedule board, pegboard,
  cards, line-contract boards, tokens, and player zones. Nothing that belongs to the game is laid
  out as a sibling page section outside that world.
- **SA-2.** Spatial order top → bottom is: opponent public edge, public construction schedule board,
  metropolitan pegboard, the viewer's private tabletop (contract boards, committed cards, hands,
  budget, pin supply). Left/right space carries the contract office and the site logbook.
- **SA-3.** The pegboard stays dominant and keeps roughly its current rendered size at default zoom.
  It is never reduced to make room for surrounding furniture.
- **SA-4.** No nested scroll regions inside the tabletop. The page itself does not scroll during
  play; the camera moves instead.
- **SA-5.** Screen level holds only: status, camera controls, narration overlay, the Confirm/Cancel
  action strip, and the hotseat veil. Everything else is world content.
- **SA-6.** Exactly one interface ships. The previous dashboard layout is removed, not kept beside
  the tabletop.

## A.2 Camera

- **SA-7.** Pan by dragging any empty table surface; zoom by wheel, pinch, or the zoom controls.
- **SA-8.** `Reset view` returns to the default framing. `Focus` controls exist for schedule,
  pegboard, hand/cards, and line contracts, on both desktop and phone.
- **SA-9.** Camera state is client-local. A poll, a room refetch, or an opponent's action never
  changes zoom, pan, focused card, provisional placement, or a saved plan. The camera may only move
  on explicit player input or on a phase/step transition (an intentional, announced re-framing).
- **SA-10.** Board hit-testing derives from the shared camera transform; a drag is never a tap, so
  panning can neither select nor confirm a peg.

## A.3 Cards as physical pieces

- **SA-11.** Cards are readable by zooming in, and are also openable into a focused state that
  presents the full face plus its current status.
- **SA-12.** Any legal action for a card is available from its focused state (play, commit, assign,
  draft, target selection). Unavailable cards remain inspectable and state the reason.
- **SA-13.** Playing or committing a card gets a short physical movement — a card visibly leaves its
  zone and lands in the zone it belongs to afterwards. Motion respects `prefers-reduced-motion`.
- **SA-14.** Selection plus an explicit action is the interaction contract. Keyboard and touch paths
  must exist for every action; drag-and-drop is never the only way to do anything.
- **SA-15.** The live `COMPLETE` treatment on satisfied objectives and Destinations is preserved.

## A.4 Line-contract boards

- **SA-16.** Each owned line gets its own printed board carrying: line name, permanent line colour,
  the ordered recipe as a strongly visual sequence (e.g. `5 — 3 — 4 — 4`) with completed segments
  filled or crossed, the next segment emphasized, and future segments visible; nodes built and
  remaining; next segment length; scheduled periods or shelved/complete status.
- **SA-17.** Engineering and Destination cards assigned to a line are displayed attached to that
  line's board, not pooled in one undifferentiated row. Cards that are company-wide rather than
  per-line (committed Engineering objectives, under the current reducer) sit on the company's own
  shelf and say so; this is a reducer fact, not a presentation choice, and is not changed here.
- **SA-18.** Line colours stay independent of player/company colours.
- **SA-19.** Destination rules are unchanged: Destinations do not count toward the three committed
  objectives, and at most two may be assigned to one line.

## A.5 Privacy and hotseat (presentation only)

- **SA-20.** The opponent's edge shows public information plus card backs and counts. No opposing
  card face, private assignment, or private status is rendered in this client's DOM or accessibility
  tree.
- **SA-21.** The hotseat handoff veil is preserved and covers the private edge of the table before
  the incoming player confirms.
- **SA-22.** This is UI privacy, not server-side secrecy: the whole room payload still reaches every
  client under invariant 11. Documentation must keep saying so plainly.

## A.6 Mobile

- **SA-23.** The phone gets the same tabletop and the same camera, framed differently at rest — not
  a separate stacked layout.
- **SA-24.** Quick-focus controls for schedule, pegboard, hand, and lines are reachable one-handed;
  Confirm/Cancel may stay in a stable screen-level strip.
- **SA-25.** Long vertical page scrolling is not an acceptable substitute for camera movement.
  Safe-area insets and browser gestures are respected; the page itself never scrolls sideways.

## A.7 Acceptance additions

In addition to §10, the change is acceptable only when, on a laptop width and on a phone in both
portrait and landscape:

- [ ] The whole game reads as one table; every component is inside the camera's world.
- [ ] Pan, zoom, `Reset view`, and every focus control work, by pointer, touch, and keyboard.
- [ ] Every card category can be found, read, and — where legal — played from the table.
- [ ] Engineering and Destination assignments are visibly attached to the right line board.
- [ ] Multiple lines at different progress are legible side by side.
- [ ] A provisional placement can be made, repositioned, and confirmed while zoomed.
- [ ] Saved phantom plans still render and reconcile.
- [ ] Narration and history stay privacy-safe.
- [ ] The hotseat handoff still conceals the private edge.
- [ ] A poll arriving while zoomed into a card, and while a provisional placement is live, changes
      neither the camera nor the selection.
- [ ] Subway rules harness, lint, typecheck, and production build pass.
