# WS-001 — Subway v0.3 gameplay redesign

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-08-23 *(retrofitted; the work itself ran 2026-08-19 → 2026-08-22)*
**Updated:** 2026-08-23

> **This workstream is a retrofit, and the first test of the Build OS workstream layer in this
> repository.** Subway v0.3 was designed and built before Party Games adopted Build OS, and its
> implementation is already merged. Nothing below should be read as a record of a Design Room
> session that happened — no Build Card was written, no Build Spec was issued, and no
> independent review has taken place. Everything here is reconstructed from the repository:
> PR [#137](https://github.com/50thycal/party-games/pull/137) and
> [#139](https://github.com/50thycal/party-games/pull/139), the merged code,
> `src/games/subway/RULES.md`, and `DEC-008`, `DEC-010`, `DEC-011`. Where the reasoning behind
> something is not recoverable from those sources, it is marked unknown rather than invented.

## Goal

Turn Subway from a per-period commit/reveal prototype into a game whose whole schedule is
decided up front: a single pass in which Procurement settles who owns what, Scheduling settles
when every block runs and what it costs, and Construction merely executes the locked plan.

## Context

Subway v0.2 asked both companies to secretly commit "which line am I building?" every period,
for ten periods. The v0.3 work (PR #137) replaced that loop wholesale, rebuilt Procurement
around one-at-a-time contract offers with alternating first refusal and a Discount Yard, and
introduced a Gantt-style Scheduling phase with mobilization and paid second-crew capacity.
PR #139 then applied three owner-requested corrections after play-testing.

The workstream exists now, after the fact, because v0.3 shipped with product rulings the
implementer made where the owner's brief was silent, and with open balance questions the PR
raised and nobody has answered. Those need a home that is not a merged PR description.

**Provenance limit:** the original owner-facing v0.3 brief — the one PR #137 refers to as
"the brief", including its fourteen procurement cases and fifteen scheduling cases — is **not
in this repository**. It exists only outside GitHub. Its requirements are known here only as
PR #137 restated them, which is exactly the failure mode Build OS adoption is meant to end.

## Current Mental Model

The system as merged. `src/games/subway/RULES.md` is the detailed rules text; this is the
shape.

```text
SETUP ─► PROCUREMENT ─► ENGINEERING ─► SCHEDULING ─► STARTER_PLACEMENT ─► CONSTRUCTION ─► SCORING ─► RESULTS
                                        │                                     │
                        PLANNING → RESOLUTION                     16 periods, executes the locked plan
                        (private → submit → reveal                 no commitment, no reveal, no re-planning
                         → 1 card → confirm & lock)

PROCUREMENT      6 contracts, revealed one at a time, first refusal alternating per contract.
                 Buy at list, or pass and draft a face-up card (free). Double pass → Discount
                 Yard at −$2M, floor $3M. All six sell. Cap 3 per company (DEC-010) → the split
                 is forced 3/3 every game.

SCHEDULING       Each owned contract becomes one contiguous block, length = nodes − 1, inside a
                 16-period horizon. One base crew: own blocks may not overlap for free; extra
                 concurrency costs $2M per period per extra block. Mobilization is charged on a
                 block's start period (1–3 $3M, 4–6 $2M, 7–9 $1M, 10+ free). A contract may be
                 shelved — left off the schedule entirely — and takes its incomplete penalty.

CONSTRUCTION     Each scheduled block grants its line one action in each period it occupies.
                 Priority orders shared periods. A skipped action is lost, never carried.

Money            $34M start; $50M of contracts. Only contracts, mobilization, and crew cost
                 money. The binding constraint is usually the calendar, not cash: three
                 contracts frequently total more than 16 build periods.
Board            27 × 9 corridor; spatial rules (spacing, stations, strings, crossing) unchanged
                 from v0.2.
State            SUBWAY_STATE_VERSION = 5; a stale room offers a restart (DEC-008).
```

## Decisions Made

Owner-level, and recorded:

- **Contracts capped at three per company**, knowingly forcing a 3/3 split — owner decision
  after play-testing. See `DEC-010`, including the future move if the forced split proves dull.
- **A shelved contract gets no starter peg** — a peg for a line that will never be built is a
  free blocker, because pegs project the spacing exclusion. See `DEC-011`.
- **Long Segment requires 5 pegs, not 3** — on a 27-wide corridor a 3-peg reach happens by
  accident (PR #139, owner-requested).
- **The v0.3 loop itself** — single pass, first-refusal procurement, Gantt scheduling — came
  from the owner's v0.3 brief. Its rationale is not recorded in this repository beyond PR #137's
  restatement of it.

Implementation-level, made by the implementer and disclosed in PR #137:

- **Distressed sale and floor deadlock.** A forced owner that cannot afford the price pays what
  it holds; a yard contract declined by both at the floor is assigned to the legal buyer with
  the most money. Both exist purely to guarantee the phase terminates.
- **`decisionsUsed` is tracked and displayed but never blocks.** See D2 — this one has a
  product-visible edge and is not purely mechanical.

## Open Decisions

**Rulings needing owner ratification.** Each was made by the implementer where the brief was
silent or ambiguous, and each changes what a player experiences. None has been owner-approved.
They are listed here rather than written into `DECISIONS.md`, because an unratified decision is
an open question, not a rationale.

- **D1. Shelving.** A company may leave a contract off the schedule entirely and eat its
  incomplete penalty (−4 to −8 VP). Introduced because a company forced above the horizon would
  otherwise have *no* legal schedule and Scheduling would deadlock. **This is product behavior,
  not a termination detail**: it turns "which contracts can I finish?" into a live strategic
  choice, and it interacts with the second-crew price (D6). *Options:* keep as is · keep but
  make shelving cost something beyond the penalty · remove and prevent over-commitment during
  Procurement instead. *Recommendation:* keep for now — with the cap at three, over-commitment
  is rarer than it was at four, but the escape valve still prevents a hard deadlock.
- **D2. "Five procurement decisions" is descriptive, not a gate.** The brief specified five
  decisions per company; the implementation tracks and displays `decisionsUsed` but never blocks
  on it, because Discount Yard cleanup can need more and gating could strand a contract unowned.
  **This is a departure from a stated brief requirement.** *Options:* accept descriptive ·
  restore the gate and change yard cleanup so it cannot exceed the budget · drop the counter
  from the UI entirely. *Recommendation:* accept descriptive, and consider dropping the display
  — a counter that never binds invites players to think it does.
- **D3. Distressed sale / floor deadlock.** Termination mechanics (above). Product-visible only
  in a corner case, but the corner is reachable: it decides who ends up owning a contract nobody
  wants and at what price. *Recommendation:* ratify as implementation discretion; no ADR.
- **D4. Surge Crew targets any other incomplete line of yours**, not only one scheduled in that
  period — otherwise the card is dead whenever a single block is running. This changes the
  card's power against the schedule players just paid to lock. *Options:* keep · restrict to
  scheduled lines and accept dead draws · restrict and compensate elsewhere.

**Balance questions raised by PR #137 and not answered.** These are playtest hypotheses, not
decisions:

- **D5.** Mobilization makes late starts free, but a large portfolio *must* start early to fit
  16 periods — so the surcharge may be an unavoidable tax rather than a choice.
- **D6.** Second crew ($2M/period) versus incomplete penalties (−4 to −8) decides whether
  compressing or shelving is correct. Watch which one play-testers pick.
- **D7.** Nothing rewards finishing early, so there is little reason to start before you must,
  beyond racing for stations.
- **D8.** Whether the forced 3/3 split (`DEC-010`) is dull in play. The recorded future move is
  relaxing "every contract sells" together with the cap — not either alone.

## Assumptions

- The v0.3 brief's requirements are accurately restated in PR #137's description. Nothing else
  in the repository can confirm this.
- The fourteen procurement and fifteen scheduling cases asserted in `scripts/subway-rules-test.ts`
  correspond to the brief's cases. The test file is the only surviving expression of them.
- Subway remains a two-player prototype (`minPlayers`/`maxPlayers` are both 2).
- Play-testing so far is the owner's own; there is no recorded session with outside players, so
  D5–D8 rest on one person's reading of the game.

## Non-Goals

- Survey Markers, Company Cards, multiple project cycles, a bot player, and additional maps —
  all pinned as future design in `RULES.md`, none implemented.
- Server-side filtering of hidden state. Schedules and committed Engineering cards are concealed
  by the client only; every client receives the whole room state. Real secrecy is an engine
  change, not a Subway change.
- More than two players.

## Build Card

**Not available — no Build Card was written.** The design predates Build OS adoption, and the
owner-facing brief it was built from is not in this repository.

What the reviewer should treat as the statement of intent, in this order: the "Current Mental
Model" above, `src/games/subway/RULES.md`, and PR #137's description. If the owner still has the
original brief, adding it to this workstream would make the review materially stronger, since
D1–D4 are precisely the places where the implementation and the brief may differ.

*After this change, the system should* let two companies settle ownership and the entire build
schedule before any construction begins, and then play out that locked plan — with the calendar,
not cash, as the binding constraint.

## Implementation State

**Merged.** PR #137 (2026-08-22) rebuilt the loop, Procurement, Scheduling, and Construction;
PR #139 (2026-08-22) applied three owner-requested corrections. Both are on `main`. Roughly
1,500 lines of `src/games/subway/config.ts`, 1,800 of `GameView.tsx`, and 545 of
`scripts/subway-rules-test.ts`.

## Review State

**Not started.** No independent review has been performed against design intent — which is why
this workstream is in `REVIEW` rather than `COMPLETE`, despite the code being merged.

The reviewer's job (`framework/REVIEW_PROTOCOL.md`): read the intent statements listed under
*Build Card*, then the code and tests, and answer — was the intended behavior built, were the
four rulings D1–D4 the right calls, are the procurement and scheduling edge cases right, do the
tests test behavior rather than implementation, and is anything else in the diff a silent
product change that nobody has flagged.

## Related Decisions

- `DEC-008` — Subway versions its persisted game state.
- `DEC-010` — cap of three Line Contracts, accepting a forced 3/3 split.
- `DEC-011` — a shelved contract receives no starter peg.
- `DEC-012` — Build OS upgrade to v0.4, which created this workstream.

## Related PRs

- [#137](https://github.com/50thycal/party-games/pull/137) — Subway v0.3: single-pass loop,
  first-refusal procurement, Gantt scheduling. **Merged** 2026-08-22.
- [#139](https://github.com/50thycal/party-games/pull/139) — contract cap 3, no starter peg for
  a shelved line, Long Segment 5. **Merged** 2026-08-22.

## Next Step

Independent design review of merged Subway v0.3 against the reconstructed intent above, and an
owner ruling on D1–D4.
