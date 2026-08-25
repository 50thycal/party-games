# WS-003 — Subway construction access and route lookahead

**Phase:** READY_TO_BUILD
**Status:** Blocked
**Created:** 2026-08-25
**Updated:** 2026-08-25
**Build OS:** v0.5

## Goal

Keep ordered-route construction playable and legible: show players where a placement can lead,
turn opposing pegs from hard blockers into priced shared infrastructure, and allow construction debt
without removing the consequences of poor budgeting.

## Context

The owner's first playtest after WS-002 found four connected problems. A legal target says nothing
about whether the following recipe segment will fit, especially while choosing a starter. Survey
Pins are unnecessarily bound to one line. The one-hole exclusion around opposing pegs can remove all
legal play. Finally, the game has no way to pay for access during Construction after capital is
committed in earlier phases.

The same playtest reported that Early Mobilization did not visibly waive its extra mobilization
cost. The reducer and existing rules test already implement the intended incremental waiver, so
WS-003 treats this as a reproduce-and-correct defect with explicit cost visibility, not as approval
to waive unrelated second-crew costs.

## Current Mental Model

```text
Before Construction                         During Construction
cash must stay >= $0                        ordinary placement: free
        |                                   opponent's normal peg: pay owner $1M
        v                                             |
schedule costs lock                                  +--> cash may fall below $0
        |                                             |
        v                                             v
starter target gives no lookahead            final debt = max(0, -cash)
                                                      |
                                                      v
                                             score -2 VP per $1M debt

Placement interaction
legal current targets glow green
        |
select one (local preview; no action yet)
        v
selected target stays green + its legal continuations glow yellow
        |
select the green target again
        v
server validates and places it; stale/illegal selections do nothing
```

## Decisions Made

- **Two-step lookahead is part of placement.** Green is the current legal target; selecting it shows
  the following legal targets in yellow, and selecting it again confirms. Starter selection previews
  the first recipe segment the same way.
- **Survey Pins are company-wide.** They are still purchased and publicly placed during Engineering,
  but any line owned by the pin's player can fulfil one.
- **Early Mobilization waives only the incremental mobilization surcharge.** A change in second-crew
  overlap remains payable and the UI must itemize the distinction.
- **Opposing pegs no longer project a one-hole exclusion.** Adjacent normal pegs are legal when all
  other geometry rules pass.
- **An opposing normal peg can be shared for $1M.** The payment goes immediately to its owner; starter
  pegs, station docks, and a player's own occupied pegs cannot be shared.
- **Construction alone may create debt.** Ending cash below zero scores -2 VP per $1M. Earlier phases
  still reject unaffordable spending, and later payments received can reduce the final debt.

## Open Decisions

None. The owner approved the consolidated Build Card rules on 2026-08-25.

## Assumptions

- "Any line" for a Survey Pin means any line owned by the player who bought the pin, never an
  opponent's line.
- A shared peg is one physical hole but remains a route node independently owned and scored by each
  line using it; paying does not transfer ownership or create a jointly owned route.
- Touching at a paid shared endpoint is not a Crossing Design crossing. Existing prohibitions on
  overlapping strings, passing through other occupied pegs, self-crossing, and station capacity stay.
- A debt penalty uses ending cash, not cumulative borrowing. Payments received during Construction
  can therefore reduce or eliminate it.
- The Build OS v0.5 adoption is being delivered in a separate session and must land before
  implementation begins on this PR.

## Non-Goals

- Repricing contracts, Survey Pins, mobilization, second crews, stations, or existing VP awards.
- Borrowing during Procurement, Engineering, Scheduling, or starter placement.
- Sharing station docks, sharing a starter, sharing between two lines owned by the same player, or
  buying/selling a route after it is built.
- Waiving second-crew costs with Early Mobilization.
- Replacing the local Route Planner, adding a persistent route reservation, or adding general undo.
- Final balance certification for the $1M access toll or -2 VP debt rate; both require playtesting.

## Build Card

# Build Card — Subway Construction Access & Route Lookahead

**Workstream:** WS-003
**Status:** Approved
**Date:** 2026-08-25
**Build Spec:** [WS-003 Build Spec](../build-specs/WS-003-subway-construction-access.md)

### Goal

Prevent ordered routes from becoming blind or impossible while preserving competitive obstruction
and meaningful budgeting.

### Current behavior

Players see only their immediate legal endpoint. Opposing pegs block their own holes and every
adjacent hole, Survey Pins work for one preselected line, and cash can never go below zero. Early
Mobilization's waiver is not clear enough to verify during play.

### New behavior

Selecting a green legal target previews the next legal endpoints in yellow before confirmation,
including while choosing a starter. Opposing pegs may sit adjacent and their exact normal peg may be
shared for a $1M payment. Construction payments may create debt, scored at -2 VP per $1M remaining.
Survey Pins can be fulfilled by any of their owner's lines, and scheduling itemizes the Early
Mobilization waiver.

### Mental model / flow

```text
green target -> select -> yellow next-step preview -> confirm green target
                                         |
opponent peg -> pay owner $1M ------------+
                                         |
ending cash below $0 -> -2 VP per $1M debt
```

### Important rules

- Preview selection is local and non-binding; the reducer validates the confirmed placement again.
- Paid sharing is limited to an opponent's normal construction peg. All recipe, turn, string,
  crossing, station, action, and undo rules still apply.
- Only Construction may take cash below zero; every earlier phase still requires available cash.
- Survey Pins remain paid, public, stackable, non-reserving Engineering placements and score once
  when any owned line reaches the exact hole.
- Early Mobilization waives only the added mobilization surcharge, not any second-crew change.

### Decisions made

- **Access toll** -> $1M paid immediately to the opposing peg owner. This keeps access meaningful
  without pricing it like a full contract.
- **Debt penalty** -> -2 VP per $1M of ending debt. Borrowing $3M costs roughly one completed medium
  line, so it is available but painful.
- **Lookahead interaction** -> select once to preview and again to confirm. This keeps each yellow
  continuation visibly tied to the green choice on both desktop and touch screens.
- **Survey scope** -> any line owned by the buyer can fulfil a pin. Pins reward network planning,
  not an early line assignment that can become irrelevant.

### Non-goals

- Debt or peg sharing outside Construction; shared stations/starters; general trading or loans.
- Rebalancing the rest of Subway or claiming the new toll and penalty are final values.
- Persistent two-move plans or more than the existing one-placement undo.

### Definition of done

- [ ] Starter and construction placement clearly show one selected green target and its yellow legal
      continuations on desktop and phone.
- [ ] Adjacent opposing pegs are legal, while using the exact opposing peg atomically transfers $1M.
- [ ] Construction debt, projected penalty, final -2 VP/$1M scoring, later receipts, and Undo are
      correct and visible.
- [ ] Any owned line can fulfil a Survey Pin, which still scores at most once.
- [ ] Early Mobilization's incremental waiver is proven in the charge and itemized separately from
      second-crew cost.
- [ ] Reducer tests, production build, lint, desktop playtest, phone playtest, rules, state version,
      and project memory all agree.

---

**After this change, the system should** let players see where a route can go next, buy access to an
opponent's peg when needed, and finish construction in debt while paying a serious scoring penalty.

## Implementation State

Approved Build Card and issued Build Spec are published for implementation on draft PR
[#143](https://github.com/50thycal/party-games/pull/143).
Implementation is blocked until Party Games' separately owned Build OS v0.5 adoption lands and this
branch is rebased onto it. Opening this Design Handoff PR does not start `BUILDING`.

## Review State

**Verdict:** Not started
**Reviewed head:** —
**Reviewed PR:** —
**Finalization:** —

Design handoff only; implementation review has not started.

## Related Decisions

- Existing: `DEC-008` (Subway state versioning), `DEC-013` (ordered route geometry and permanent line
  identity), `DEC-014` (paid Destination/Survey commitments), and `DEC-015` (one-placement undo).
- To be recorded by this implementation: company-wide Survey fulfilment, and paid shared nodes with
  construction-only debt.

## Related PRs

[#143](https://github.com/50thycal/party-games/pull/143) — draft Design Handoff PR; the single branch
and PR Claude continues after the framework dependency lands.

## Next Step

Merge the separate Build OS v0.5 adoption, rebase this PR, then Claude begins implementation on this
same branch and draft PR.
