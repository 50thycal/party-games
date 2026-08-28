# WS-003 — Subway construction access and route lookahead

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-08-25
**Updated:** 2026-08-28
**Build OS:** v0.5

## Goal

Keep ordered-route construction playable and legible: show where the next two placements can go,
replace spatial lockouts with priced interaction, make Destinations reliably draftable, and retain
meaningful budget consequences without making Construction impossible.

## Context

The first WS-003 playtest established lookahead, company-wide Survey Pins, a visible Early
Mobilization waiver, paid shared pegs, and Construction-only debt. PR #143 then merged the approved
design artifacts without implementing the game behavior. A second playtest on the unchanged game
showed that the remaining spatial prohibitions still block too much play, Crossing Design is still
acting as a permit, the longest contracts overfill the board, and Destinations are too rare because
they appear only through the Procurement Engineering market.

This is a continuation of WS-003, not a new workstream. The approved card and issued spec below
replace their 2026-08-25 versions. Because the documentation-only PR is already merged, Build OS
requires a new draft continuation PR for implementation.

## Current Mental Model

```text
Engineering
three face-up Destinations -> alternate free picks -> exactly two per company
            -> assign each to an owned line (maximum two per line)
            -> commit three normal Engineering objectives
            -> buy/place 0–5 company-wide Survey Pins

Construction placement
legal current targets glow green
        |
select one (local preview; no action yet)
        v
selected target stays green + legal following endpoints glow yellow
        |
select green again
        v
server revalidates geometry + computes opposing contacts
        |
        +--> $1M to opponent per distinct opposing contact; debt allowed
        v
place node/string; one-placement Undo restores routes and both balances

Final score: ending debt = -2 VP per $1M below zero
```

## Decisions Made

- **Two-step lookahead is part of placement.** Green is the current legal target; selecting it shows
  the following legal targets in yellow, and selecting it again confirms. Starter selection previews
  the first recipe segment the same way.
- **Only core geometry remains restrictive.** Ordered segment lengths, the 90° turn cap, board
  bounds, exact station docks/capacity, and the ban on exact string-over-string overlap remain.
  Normal pegs may otherwise land on or beside existing pegs and strings; strings may cross routes or
  pass through existing normal pegs.
- **Opponent interaction is priced, not prohibited.** Each distinct contact with an opposing normal
  route costs $1M, paid atomically to its owner. Own-route contacts are free.
- **Crossing Design is an objective, never permission.** Crossing an opposing string is always
  legal if the core geometry passes and the player can accept its Construction cost. The card awards
  +2 VP once for making at least one proper opposing-string crossing.
- **Construction alone may create debt.** Ending cash below zero scores -2 VP per $1M. Earlier
  phases still reject unaffordable spending, and later payments received can reduce final debt.
- **Survey Pins are company-wide.** They remain paid, public Engineering placements, but any owned
  line can fulfil one.
- **Destinations get a dedicated Engineering draft.** Three are face-up; players alternate free
  picks, beginning with the odd-period-priority company, until each owns exactly two. Destinations
  remain separate from the three objective commitments and are assigned to owned lines, maximum two
  per line.
- **The three longest recipes are shortened.** Express becomes five segments, Crosstown six, and
  Long seven. Contract prices, VP, penalties, and ordered length identities otherwise remain.
- **Early Mobilization waives only the incremental mobilization surcharge.** A second-crew cost
  change remains payable and the UI itemizes the distinction.

## Open Decisions

None. The owner approved the amended Build Card rules on 2026-08-27.

## Assumptions

- A “distinct opposing contact” is one geometric event: a proper string crossing, an endpoint on
  the interior of an opposing string, or a normal opposing peg touched by the new segment or
  endpoint. Landing on an opposing peg is one contact and is not multiplied by its incident strings.
- Reusing the same opponent feature in later placements incurs a new toll each time. Multiple
  distinct contacts created by one placement are summed before confirmation and transferred in one
  reducer action.
- Exact collinear string overlap remains illegal because it has no unambiguous finite contact count.
- Station capacity and exact dock selection remain exclusive station rules. The permissive contact
  model applies to normal route geometry, not station docks or station centres.
- “Any line” for a Survey Pin means any line owned by its buyer, never an opponent's line.
- A proper crossing for Crossing Design excludes endpoint touches, shared nodes, and pass-through at
  an existing peg.
- Debt uses ending cash, not cumulative borrowing. Payments received during Construction can reduce
  or eliminate it.

## Non-Goals

- Repricing contracts, Survey Pins, mobilization, second crews, stations, tolls, or existing VP
  awards beyond the three approved recipe lengths and Crossing Design's permission removal.
- Borrowing during Procurement, Engineering, Scheduling, or starter placement.
- Sharing full station docks, allowing exact overlapping strings, or removing ordered recipes,
  board bounds, station capacity, or the 90° turn limit.
- Persistent route reservations, opponent approval for a toll, general loans/trading, or more than
  the existing one-placement Undo.
- Final balance certification for the $1M interaction toll or -2 VP debt rate.

## Build Card

# Build Card — Subway Open Routing, Destinations & Lookahead

**Workstream:** WS-003
**Status:** Approved
**Date:** 2026-08-27
**Build Spec:** [WS-003 Build Spec](../build-specs/WS-003-subway-construction-access.md)

### Goal

Let players plan two placements ahead and route through a crowded board by paying for opponent
infrastructure, while making Destinations a reliable Engineering choice.

### Current behavior

The merged game still shows only the immediate target, blocks pegs and strings for several spatial
reasons, requires Crossing Design as a permit, exposes Destinations only through occasional
Procurement draws, binds Survey Pins to a line, and prevents all negative cash.

### New behavior

Selecting a green target previews the following legal endpoints in yellow before confirmation,
including starter placement. Existing normal route geometry no longer blocks placement except for
exact overlapping strings and the core recipe/turn/bounds/station rules. Every distinct opposing
route contact costs $1M, own contacts are free, and Construction payments may create debt. Crossing
Design becomes a +2 VP objective. Engineering begins with an alternating Destination draft that
gives each company exactly two line-assigned cards. Survey Pins work for any owned line. Express,
Crosstown, and Long lose one final ordered segment each.

### Mental model / flow

```text
green target -> select -> yellow next-step preview -> confirm green target
                                               |
opponent contacts x $1M -> itemized confirmation + atomic transfer
                                               |
ending cash below $0 -> -2 VP per $1M debt
```

### Important rules

- Preview state is local and non-binding; the reducer validates the confirmed placement again.
- Ordered length, ≤90° turn, bounds, station docks/capacity, and no exact string overlap remain.
- Peg adjacency, occupied normal holes, peg-on-string, string-through-peg, self-crossing, and
  opposing crossing are not blockers.
- A placement charges $1M per distinct opposing contact and displays the total, recipient, and
  projected debt before confirmation. Own contacts cost $0.
- Crossing Design scores +2 VP for at least one proper opposing crossing and grants no permission.
- Destinations are drafted free in Engineering, do not count among the three normal commitments,
  and remain assigned to owned lines with a maximum of two per line.
- Survey Pins remain $1M, 0–5, public, stackable, non-reserving Engineering placements and score
  once when any owned line reaches their exact normal hole.
- Only Construction may take cash below zero; every earlier phase still requires available cash.
- Early Mobilization waives only the added mobilization surcharge, not second-crew changes.

### Decisions made

- **Contact pricing** -> $1M for every distinct opponent interaction; own interactions are free.
  Crowding becomes an economic choice instead of a hard lockout.
- **Destination availability** -> three face-up, alternate picks, exactly two each. This guarantees
  the mechanic appears every game without competing with the three objective commitments.
- **Contract trim** -> Express 6→5, Crosstown 7→6, Long 8→7. The three largest spatial footprints
  lose one segment while their existing ordered pattern and economics remain recognizable. It also
  moves the schedule: total construction demand falls from 36 placements to 33 against an unchanged
  2 × 16 = 32 base capacity, so the most balanced 3/3 split goes from 18/18 to 16/17. Forced
  shelving (`DEC-011`) becomes a one-placement squeeze on one company instead of a routine cost for
  both, and is not eliminated — 33 > 32 keeps a both-sides-fit split impossible.
- **Crossing card** -> objective only, +2 VP. Crossings are ordinary paid route interactions, not a
  capability hidden behind a draw.

### Non-goals

- Removing recipe order, turn limits, station capacity, bounds, or exact-overlap protection.
- Debt outside Construction; changing Destination/Survey scoring; rebalancing all contracts.
- Persistent two-move plans, route reservations, or more than the existing one-placement Undo.

### Definition of done

- [ ] Starter and construction placement clearly show a selected green target and its yellow legal
      continuations on desktop and phone, distinguished by more than colour, and a routine one-second
      poll does not cancel a selection in progress.
- [ ] Every normal-node/string interaction described above is legal, while core geometry and exact
      overlap stay enforced by the reducer and preview.
- [ ] Multi-contact tolls, projected debt, atomic transfers, final -2 VP/$1M scoring, later receipts,
      and Undo are correct and visible.
- [ ] Crossing Design is a +2 VP proper-crossing objective and never gates construction.
- [ ] Engineering gives each player exactly two alternating Destination picks from a three-card
      face-up row, then supports legal line assignment separately from three objective commitments.
- [ ] Survey Pins are company-wide and Early Mobilization's incremental waiver is itemized.
- [ ] Express has five segments, Crosstown six, and Long seven; schedules/actions/tests derive from
      the recipes and all six contracts remain buildable.
- [ ] Reducer tests, production build, lint, desktop playtest, phone playtest, rules, state version,
      and project memory agree.

---

**After this change, the system should** let players plan ahead and keep building through a crowded
network by paying for opponent infrastructure, while reliably drafting meaningful line-specific
Destinations.

## Implementation State

**Implemented on [#144](https://github.com/50thycal/party-games/pull/144).** OD-1 through OD-15 are
built. The framework gate was cleared by the Build OS v0.5 adoption in
[#145](https://github.com/50thycal/party-games/pull/145), which the owner authorised and which
merged on 2026-08-27. #144 merged to `main` on 2026-08-28 at
`9c3e851989a2c15c3784bc7ebf1e70e7ab55fdb3`.

What exists now:

- **Open routing.** Normal holes are shared, adjacency is unrestricted, pegs may sit on strings, and
  strings may pass through pegs and cross each other. The only surviving route prohibition is a
  string lying on top of another string. Bounds, ordered lengths, the 90° cap, and station
  docks/capacity are unchanged.
- **Priced contacts.** Every distinct contact with the opposing normal network costs $1M, paid to
  its owner in the same reducer action as the placement. Contacts are keyed by coordinate, so a peg
  is one charge however many strings meet there, and a peg always beats a crossing at its own
  coordinate. Own contacts are free.
- **Construction debt.** Only a contact toll may take a company below $0; ending there costs -2 VP
  per $1M, and receipts reduce it. Every earlier phase still refuses what it cannot afford.
- **Crossing Design** is an ordinary +2 VP objective for one proper crossing. It grants no
  permission and caps nothing.
- **Two-step placement.** The first tap selects and previews where the line could go next; the
  second confirms. Current-step markers carry a solid ring and a `1`, following-step markers a
  dashed ring and a `2`, so the two never depend on green versus yellow. A routine poll does not
  cancel a selection.
- **Destination draft.** Three face up, alternating free picks from the odd-period company, exactly
  two each, removed from the Procurement market. Both must be assigned before the plan locks.
- **Company-wide Survey Pins**, fulfilled by any line their buyer owns.
- **Recipes trimmed** to Express 5, Crosstown 6, Long 7.
- **Early Mobilization** waives only the mobilization increment and itemises it beside the crew cost
  it does not waive.
- `SUBWAY_STATE_VERSION` is 7; v6 rooms restart per `DEC-008`.

Validation: `./scripts/test-subway.sh`, `npm run build`, and `npm run lint` all pass.

## Review State

| PR | Verdict | Reviewed head | Finalization |
|---|---|---|---|
| [#143](https://github.com/50thycal/party-games/pull/143) | Not started | — | — |
| [#144](https://github.com/50thycal/party-games/pull/144) | Changes required (design package; corrected in `513aaf2`). **No verdict recorded against the implementation head** | `c833cab1bb94fc1e5f163ba2888ac4b58601d28f` | Not started at merge |
| [#145](https://github.com/50thycal/party-games/pull/145) | Approved — merged 2026-08-27 | — | Complete |

#143 was a documentation-only handoff merged before implementation and makes no independent-review
claim. The continuation PR is the review unit for the amended spec and eventual implementation.

**Recorded honestly:** #144 was merged by the owner on 2026-08-28 with no independent verdict against
its implementation head. The only verdict on that PR is the design-package one above, against
`c833cab`, which the implementation superseded. The implementing agent did not approve or merge it.
This is an owner decision, noted here so `main` does not imply a review that did not happen; per
`AGENTS.md` rule 11, owner direction replaces the merger, not the reviewer. A retrospective
independent review of the merged implementation remains available if the owner wants one, and would
be recorded as a new row rather than backfilled into this one. The merge also landed without the
documentation-only finalization commit rule 12 calls for; this workstream update is that
reconciliation, applied after the fact.

The design-package review of head `c833cab` returned **Changes required** with seven findings: a
`view()` secrecy mechanism that does not exist in this engine, two repository paths that do not
exist, preview invalidation incompatible with the one-second poll, colour as the only cue between
the two preview steps, the undisclosed scheduling effect of the recipe trim, the unstated survival
of the dead-end/skip path, and unstated per-placement tolling for Overtime and Surge. All seven are
corrected in the Build Spec and this card; the owner approved correcting them and then implementing
on this same PR. The contact-counting model and the DEC-018/019 supersession handling were approved
as written. The corrections landed, the framework gate cleared, and the implementation followed on
the same PR — so the review unit is now the implementation head, not `c833cab`.

## Related Decisions

- Existing: `DEC-008` (Subway state versioning), `DEC-013` (ordered route geometry and line
  identity), `DEC-015` (one-placement Undo).
- Current: `DEC-018` (priced open routing and Construction debt) and `DEC-019` (dedicated
  Destination draft with company-wide Surveys).

## Related PRs

- [#143](https://github.com/50thycal/party-games/pull/143) — merged documentation-only Design
  Handoff; no gameplay implementation.
- [#144](https://github.com/50thycal/party-games/pull/144) — draft continuation PR for the amended
  spec and eventual implementation.

## Next Step

The owner's balance playtest of the merged behaviour: the $1M contact toll, the -2 VP debt rate, the
trimmed recipes, and whether an open board with paid contacts plays better than blockers did. Two
gaps from the implementation PR are still open and belong to that pass or a follow-up: debt has never
been reached in a browser session, only in reducer tests, and hotseat mode was not exercised. An
independent review of the merged implementation was never performed and is optional now that the
change has landed — see `Review State`.
