# WS-004 — Subway tabletop console and playtest clarity

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-08-29
**Updated:** 2026-08-30
**Build OS:** v0.5

## Goal

Make Subway play like a digital tabletop rather than a long form: keep the pegboard central, arrange
the public schedule and each player's cards around it, preserve private information in the normal
UI, make planning available throughout Construction, and narrate accepted actions and state changes
where players are already looking.

## Capture-Only Consolidation

Capture Only ran during the 2026-08-29 playtest and ended when the owner asked for a PR that Claude
could implement. No repository changes were made while capture was active.

### Observations

- The Route Planner disappears at Construction and its phantom route is lost.
- Construction placement requires tapping the same target a second time; choosing a different target
  works, but the interaction is not explicit enough and players reach for Undo before committing.
- Starter placement leaves every starter target green after selection, obscuring the yellow/step-2
  route preview.
- Players can start in the interior even though the intended physical game starts routes at the
  board edge.
- Period, turn, card-play, and placement changes are easy to miss because attention stays on the
  pegboard while status text lives elsewhere.
- Cards, schedule, company state, and action controls are stacked below the board, causing repeated
  page scrolling and making the digital game feel unlike the tabletop concept.
- The four requested card families contain 10 Engineering objectives, 6 Destinations, 3 Scheduling
  cards, and 3 Construction cards.

### Interpretations

- “Turn ends when the marker is placed” means Confirm consumes and resolves one scheduled or bonus
  action, then the reducer advances its queue normally. If Overtime or Surge legitimately created
  another action for the same company, that separate action still resolves under existing rules.
- “Private” means opponents do not see card faces or assignments in the supported multiplayer and
  hotseat UI. It is not server secrecy: the engine still sends the complete room state to every
  client under project invariant 11.
- A saved phantom plan should remain genuinely non-binding and private. Client-local storage is the
  correct boundary; putting it in shared game state would expose it and make it look authoritative.
- “At least 10 cards, or six different types” is an audit threshold, not approval of unreviewed card
  effects. Engineering and Destination meet the six-type threshold; Scheduling and Construction do
  not.

### Proposed Rules Not Yet Approved

- Add three new Scheduling card types and three new Construction card types from the candidate table
  in [the card audit](../subway-card-audit.md), bringing each family to six unique types.
- Decide whether those six types should appear once each or form a 10-card deck through duplicates.

These proposals are deliberately excluded from the implementation scope until the owner reviews the
audit table and approves specific effects and quantities.

### Approved Decisions

- Plan Mode remains available during Construction.
- A player can save private phantom routes and see them later while building.
- Placement becomes select/reposition/Confirm: tapping legal targets moves a provisional marker,
  shows the following legal endpoints, and never commits until the player presses Confirm.
- Confirming a starter or Construction marker resolves that action and advances the turn/queue.
- Starter pegs are legal only on the outer board border and remain illegal on stations.
- Starter selection must make the selected step and following step visually distinct; unselected
  starter targets may not cover the following preview.
- Important accepted actions and state transitions appear as short pegboard overlays and in a public
  event history, without leaking private card identities.
- The primary UI becomes a board-centred tabletop console with the schedule, public opponent state,
  private player mat, cards, controls, and supporting information arranged around the pegboard.
- The card audit and recommendations ship for owner review, while new card effects remain a follow-up.

## Approved Clarification — one continuous tabletop (2026-08-30)

The owner reviewed the merged v1 console and clarified the intent of this workstream. This is a
**clarification of the approved WS-004 goal, not a new gameplay proposal**: it changes presentation
only, and no rule, cost, phase, card effect, or reducer behaviour moves with it. It is distinct
from the still-unapproved card expansion under `Proposed Rules Not Yet Approved` below, which
remains excluded (OD-12).

### What was wrong

v1 read "board-centred tabletop console" as panels arranged around the pegboard in ordinary page
flow — mats, a Gantt panel, an event rail, phone bottom-sheet tabs — each with its own scrolling,
with only the pegboard itself pan/zoomable. That reads as more web UI around a webpage, not as a
game on a table.

### What is approved instead

The game is presented as **one continuous, zoomable virtual tabletop** resembling the physical game
viewed from directly above. One camera, one world, every component inside it as a physical-looking
piece.

- **OD-13 — Single coordinate space.** Schedule board, pegboard, cards, line-contract boards, and
  tokens all live in one pan-and-zoom world. Nothing game-related is a page section outside it.
- **OD-14 — Spatial order.** Opponent public edge → public construction schedule board → pegboard
  (centre, dominant, roughly its current size, never shrunk for panels) → the viewer's private
  tabletop. No nested scroll regions; the camera moves, the page does not.
- **OD-15 — Camera.** Pan the table, zoom to read a card, zoom out for the whole state, plus
  `Reset view` and focus controls for schedule, pegboard, hand, and line contracts. Polling never
  moves the camera, the focused card, a provisional placement, or a saved plan.
- **OD-16 — Cards as pieces.** Cards are zoomable and openable into a readable focused state with
  their legal action attached; unavailable cards stay inspectable with a reason; playing one moves
  it visibly between zones with a short animation; the live `COMPLETE` treatment stays.
- **OD-17 — Accessible interaction.** Keyboard and touch alternatives exist for everything.
  Drag-and-drop is never the only path.
- **OD-18 — Line-contract boards.** One printed board per owned line: name, permanent line colour,
  strongly visual ordered recipe (completed filled/crossed, next emphasized, future visible), built
  and remaining nodes, next length, status, and the Engineering/Destination cards assigned to it
  shown attached to that board. Line colours are never tied to player colours.
- **OD-19 — Privacy unchanged.** Opponent edge shows public information plus backs and counts only;
  the hotseat veil is preserved. This stays UI privacy under invariant 11, documented honestly and
  never described as server-side secrecy.
- **OD-20 — One interface.** The tabletop becomes the primary and only interface; the previous
  dashboard is removed, not left in place beside it.

Where a presentational requirement would conflict with a reducer rule, the reducer rule wins and the
conflict is surfaced rather than resolved in the view. One such conflict exists and is surfaced
here rather than changed: **committed Engineering objectives are company-wide in the reducer, not
per-line**, so they cannot be "attached to their assigned line" — only Destinations carry a line
assignment. They are presented on the company shelf with that stated on the board. Changing
objectives to per-line commitments would be a gameplay change and needs separate owner approval.

Spec: [Addendum A](../build-specs/WS-004-subway-tabletop-console.md#addendum-a--single-surface-tabletop-approved-clarification-2026-08-30).
Decision: `DEC-023`.

## Current Mental Model

```text
  one camera over one world (pan + zoom; screen keeps only status, camera
  controls, narration, and the Confirm/Cancel strip)

  +---------------------------------------------------------------+
  |  opponent public edge — cash, lines, card backs and counts     |
  |  PUBLIC CONSTRUCTION SCHEDULE BOARD — 16 periods, priority     |
  |                                                               |
  |  contract     [ METROPOLITAN PEGBOARD — centre, dominant ]     |
  |  office                                              logbook   |
  |                                                               |
  |  YOUR TABLETOP — company plaque · line-contract boards with    |
  |  their attached Destination cards · objectives shelf · hands   |
  +---------------------------------------------------------------+

Plan Mode: choose owned line -> draw/edit phantom route -> Save privately
Construction: choose target -> see NEXT options -> choose another or Confirm
Confirm -> reducer accepts placement -> action ends -> event overlay -> queue advances
Card: zoom or focus -> read -> play/commit/assign from the focused state -> it moves zones
```

## Assumptions

- Saved plans are per room, player, and owned line in browser storage. They survive refresh on that
  device but do not sync across devices.
- A saved plan that no longer matches the real line remains visible as stale/different until the
  owner edits or clears it; the game never silently treats it as legal or reserved.
- Event overlays are tiered so “every state change” does not become constant obstruction: phase and
  period changes receive prominent banners; accepted player actions receive shorter notices; routine
  polling and rejected actions receive none.
- Card faces are shown only on the owning player's mat. Opponents see public counts/backs and public
  played cards. Hotseat inserts a handoff veil before private cards change owners.
- The board retains its current rendered size at default zoom. Since 2026-08-30 it is positioned by
  the shared table camera rather than panning and zooming on its own, and the rest of the table is
  arranged around it in the same world.
- Camera position is a client-local view preference, like a scroll position: it is never sent to the
  room, and a poll never moves it.

## Non-Goals

- Server-side per-player state filtering, authentication, or protection against network/devtools
  inspection.
- Changing existing card effects, adding the proposed cards, or changing deck distributions before
  owner approval of the audit.
- Automating a saved phantom plan, reserving its holes, charging its tolls, or sharing it with the
  opponent.
- Removing post-confirmation one-placement Undo; the new Confirm flow only removes the need to Undo
  a provisional choice.
- Changing WS-003 geometry, toll, debt, Destination, Survey, recipe, or scoring rules.

## Build Card

# Build Card — Subway Tabletop Console

**Workstream:** WS-004
**Status:** Approved
**Date:** 2026-08-29
**Build Spec:** [WS-004 Build Spec](../build-specs/WS-004-subway-tabletop-console.md)
**Card Audit:** [Current inventory and recommendations](../subway-card-audit.md)

### Goal

Let players operate Subway from one board-centred tabletop surface, retain private plans and cards,
understand every important state change, and confirm placements deliberately.

### Current behavior

The pegboard, Gantt schedule, phase panels, card hands, and company state sit in a vertical page.
Plan Mode exists only during Engineering/Scheduling and disappears with its ghost route.
Construction commits by tapping the same peg twice. Starter targets visually cover the following
preview, starters may use interior holes, and accepted actions are summarized away from the board.

### New behavior

- The pegboard stays central at its current size.
- Desktop arranges the public schedule, opponent public mat, private player mat/cards, action strip,
  minimap, and event history around it. Mobile uses a fixed board/action area plus compact bottom
  sheets or tabs rather than one long scrolling page.
- Cards appear as organized card faces on the owner's mat and as backs/counts on the opponent's mat;
  tapping a card enlarges it without leaving the table.
- Plan Mode works in Engineering, Scheduling, Starter Placement, and Construction. Saved per-line
  phantom routes persist privately in that browser.
- Tapping a legal target selects or moves the provisional marker. A separate Confirm button commits
  it and consumes one action. The following legal targets remain visible throughout selection.
- Starter targets are border-only. After selecting one, selected/NOW and following/NEXT markers take
  rendering precedence over unused legal starter targets.
- Structured public events drive board overlays and a bounded history for phase, period, turn,
  placement, public card-play, route, schedule, and scoring changes.

### Important rules

- Preview, planner, and tabletop layout are UI aids; the reducer remains authoritative.
- Confirm sends only the selected target. It must revalidate against current room state and reject a
  stale choice without consuming the action.
- Confirm advances exactly one pending action. Extra actions from Overtime/Surge remain separate and
  may return control to the same company under the existing queue.
- Border starter means `x = 0`, `x = 26`, `y = 0`, or `y = 8` on the 27×9 board. Stations remain
  invalid starters.
- Saved plans never enter shared room state and never affect legality, payment, priority, or scoring.
- Public narration names public cards and actions only. Private drafts/commitments use generic copy.
- Private presentation remains UI-only under invariant 11 and must be disclosed honestly.
- New Scheduling/Construction card mechanics are not in this build.

### Recommended presentation model

- **Phase/period banner:** centred, translucent overlay, roughly 1.5–2 seconds; dismissible and
  compatible with reduced-motion preferences.
- **Action notice:** smaller overlay such as “Zoe placed Purple Express at 12,4” or “Calvin played
  Overtime”; avoid modal interruption.
- **Persistent event rail:** last 20 public events with newest first and a clear current-turn marker.
- **Tabletop mats:** own full card faces; opponent card backs/counts; line cards use their permanent
  route colour and code; public cash, schedule, and construction state remain visible.
- **Mobile:** sticky Confirm/Cancel action strip and tabs for `My Mat`, `Schedule`, and `Log`; board
  remains pan/zoomable above the sheet.

### Definition of done

- [ ] Construction Plan Mode can create, edit, save, reload, switch, and clear a private phantom
      route per owned line without dispatching game actions.
- [ ] Selecting another legal peg moves the provisional starter/build marker; Confirm alone commits,
      consumes one action, and preserves correct Overtime/Surge queue behavior.
- [ ] Starter pegs are reducer-enforced border-only and the starter NOW/NEXT preview remains legible
      even where target sets overlap.
- [ ] The board-centred desktop and mobile layouts expose the schedule, private player mat, public
      opponent state, cards, action controls, minimap, and event history without routine page hunting.
- [ ] Accepted public actions and state changes produce deduplicated, privacy-safe overlays/history;
      polling and rejected actions do not.
- [ ] Hotseat hides private mats behind a player-handoff veil.
- [ ] Existing Subway rules remain intact; state version, rules, project memory, focused tests,
      build, lint, desktop playtest, phone playtest, and hotseat playtest agree.
- [ ] The card audit is published and linked, with no unapproved card effects added to the game.

---

**After this change, the system should** feel like a complete tabletop laid around one central
pegboard: the active player can see their private hand and saved route plan, confirm a deliberate
move, and immediately understand what changed without scrolling away from the board.

## Implementation State

Merged. Implemented 2026-08-29 by Claude, delivered as PR
[#148](https://github.com/50thycal/party-games/pull/148) stacked onto Design Handoff PR
[#147](https://github.com/50thycal/party-games/pull/147)'s branch; the owner merged #148 into that
branch (`33202316234b60d016e0decd2b50e1eb0bbfc209`) and then #147 to `main`
(`ff4627dd1fdf959bb1eba5ac37fa099fb87796ab`) on 2026-08-29. The production Vercel deployment of
that head is READY. Shipped: board-centred tabletop console with opponent public mat, private
player mat, event rail, and minimap; saved Plan Mode through Construction in versioned client
storage with stale marking; select/reposition/Confirm placement; reducer-enforced border-only
starters with NOW/NEXT marker precedence; bounded privacy-safe public event stream with pegboard
narration (state version 8); phone bottom-sheet tabs with a height-filling board; hotseat handoff
veil. Card expansion stays excluded per OD-12. Validation before merge: focused reducer harness
(extended for WS-004), production build, lint, `git diff --check`, and a scripted Chromium playtest
covering desktop 1440×980, phone 390×844 touch, and hotseat veiling.

**v2 — single-surface tabletop (implemented 2026-08-30, in review).** The owner's approved
clarification above returned this workstream to `BUILDING`; the rebuild is delivered as PR
[#150](https://github.com/50thycal/party-games/pull/150) on
`claude/subway-tabletop-pr-147-1qcbqf` (head `941c68077b828e8860ea688b106c1ccc2df58fe6`), and the
phase is `REVIEW` again. Shipped: one camera over one world (`canvas.tsx`) holding the opposition's
public edge, the printed schedule board with its planning slip, the contract office, the pegboard at
its natural size (`board.tsx`, private pan/zoom and minimap removed), the site logbook, and the
viewer's own edge with line-contract boards, objectives shelf and hands (`table.tsx`); pan/pinch/
wheel/keyboard camera with `Reset view`, quick-focus per zone, HUD-band-aware framing, and a
drag-vs-tap rule that keeps a pan from ever confirming a peg; camera state client-local so polling
moves nothing; cards as pieces that open into a focused state carrying their legal action, with a
short flight when played and a reason when they cannot be; phone framing that opens the board at a
working zoom instead of an unreadable fit; the v1 dashboard layout removed rather than left beside
it. The reducer, state version 8, every rule, and the card-audit boundary (OD-12) are unchanged.
Validation before handoff: Subway rules harness, `tsc`, lint, production build, `git diff --check`,
and three scripted Chromium suites (tabletop 35 checks, phase walk 21 checks, extras 7 checks) on
freshly staged rooms at 1440×900, 390×844 and 844×390.

One approved requirement could not be met as written and was surfaced rather than resolved in the
view: committed Engineering objectives are company-wide in the reducer, so they cannot attach to a
line board (OD-18 / SA-17). They render on a company shelf that says so; making them per-line would
be a gameplay change awaiting owner approval.

## Review State

| PR | Verdict | Reviewed head | Finalization |
|---|---|---|---|
| [#148](https://github.com/50thycal/party-games/pull/148) (implementation, stacked into #147) | Merged by owner 2026-08-29 with no recorded verdict | — | — |
| [#147](https://github.com/50thycal/party-games/pull/147) | Merged to `main` by owner 2026-08-29 with no recorded verdict | — | Not pushed; superseded by this post-merge reconciliation |

Recorded rather than backfilled so `main` does not imply a review that did not happen: no
independent verdict was posted on either PR before the owner merged them (owner direction replaces
the merger under protocol rule 11; it does not replace the reviewer, so the gap is recorded here).

## Related Decisions

- `DEC-002` (views live on the client), `DEC-003` (polling), `DEC-006` (hotseat), `DEC-008`
  (Subway state versioning), `DEC-013` (redundant non-colour cues), and `DEC-015` (post-confirm Undo).
- `DEC-021` (board-centred console and narrated public state).
- `DEC-022` (saved plans are private client-local aids; placement uses explicit Confirm).

## Related PRs

- [#144](https://github.com/50thycal/party-games/pull/144) — merged WS-003 implementation this
  playtest evaluates.
- [#147](https://github.com/50thycal/party-games/pull/147) — WS-004 Design Handoff and
  implementation PR (merged to `main` 2026-08-29; carries the Implementation Handoff).
- [#148](https://github.com/50thycal/party-games/pull/148) — WS-004 implementation, stacked onto
  #147's head branch (merged into it 2026-08-29).
- [#149](https://github.com/50thycal/party-games/pull/149) — post-merge reconciliation of the v1
  record (merged 2026-08-29).
- [#150](https://github.com/50thycal/party-games/pull/150) — the approved single-surface
  clarification: Subway rebuilt as one continuous zoomable tabletop (open, in review).

## Next Step

Independent review of PR [#150](https://github.com/50thycal/party-games/pull/150) against Addendum A
(SA-1–SA-25) and its acceptance list, naming the full 40-character head it was reached against.
Owner decisions still open: whether the company-shelf treatment of Engineering objectives is
accepted or objectives should become per-line commitments (a gameplay change), and the card audit
(OD-12).

Still open from v1: owner playtest of the tabletop in production — desktop, phone, and hotseat, with
particular attention to saved plans surviving refresh, the Confirm flow under real two-device play,
and narration pacing. Separately, owner review of
[the card audit](../subway-card-audit.md): any Scheduling/Construction card expansion needs
explicit owner selections, economics, copy, availability, and tests under an amended Build Card or
a follow-up workstream (OD-12).
