# WS-006 — Subway DGLE playtest follow-up

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-09-17
**Updated:** 2026-09-17
**Build OS:** v0.12

## Goal

Act on the owner's DGLE (Calvin–Zoe, state v25) playtest comments: rebalance the debt lever,
add Destination completion cash, and fix the iPad/phone readability items raised.

## Context

The archived DGLE report (`playtests/subway/a001f0af…`) showed same-turn bridging debt was
free and late-game cash starvation; the owner's notes also asked for public card glyphs on
the pads, a hand-off recap, one Buy-a-card button, a slim Destination face, a round badge and
stale-session handling. Consolidated comments live in that archive's `observations.md`.

## Current Mental Model

```text
BUILD ─► tolls ─► route grows ─► line complete? +$3M ─► destinations newly connected? +$2/3M each
HIRE_CREWS ─► canAffordCrews (borrowing allowed: crewDebtAllowed) ─► pendingActions
scoring ─► cashBand(ending cash) ─► one VP item; CashSpectrum shows the same bands live
placement preview ─► lookaheadTargets ─► yellow next-step (or post-bend finish) markers
BUY_ENGINEERING / BUY_DESTINATION ─► cardPurchaseBlocker (phase, turn, once, $5M, deck) ─► hand
iPad: ACK_COMPANY ─► turnSummary(telemetry, events) flash ─► pads show CardGlyphs per company
Companion identity: stamped seenAt ─► idle > 20 min ─► peek room ─► forget (RESULTS/missing) | ask
```

## Decisions Made

- Crews from cash on hand; tolls may still create debt; old rule kept behind `crewDebtAllowed` (DEC-056).
- Superseded by DEC-057: borrowing restored, and ending cash scores on a six-band spectrum
  (+2 VP at $4M or more through −5 VP at −$4M or worse) shown publicly on the iPad.
- Next-step lookahead is always on during placement, including beyond a bend; ghost plans unchanged.
- "Curve" replaces "turn" for a line's change of heading, everywhere.
- Destination completion cash $2M pair / $3M triple, paid once, Undo-reversible (DEC-056).
- Held card ids are public on the shared iPad pads (DEC-056, owner request).
- Extra Engineering purchase mirrors the Destination purchase: $5M, once per game, before crews.
- Stale sessions ask before rejoining; the recovery key is never deleted silently.

## Open Decisions

- **D1.** Resolved by DEC-057: borrowing is back, priced by the ending-cash bands.
- **D4.** Are the band boundaries right after a human playtest, especially +2 VP for $4M or more,
  which may reward hoarding over building?
- **D2.** Destination payout values ($2M/$3M) and whether the extra-card price should rise now
  that a mission also returns cash.
- **D3.** Should phones' General page also show other companies' card glyphs now that the iPad does?

## Assumptions

- Destination connectivity only grows between Undos, so "first connected" is well defined.
- The phone Destination met-indicator issue was a visibility problem (gray text on dark), not a logic bug; not reproduced on a device.

## Non-Goals

- Debt penalty rate changes; new Engineering cards; bot policy retuning beyond affordability clamps.

## Build Card

Owner authorized the six items in chat on 2026-09-17 after the DGLE review; no separate card.

## Implementation State

DGLE follow-up merged in PR #191 (state v26). Second iteration on the same branch:
borrowing restored, ending-cash spectrum and public bar, always-on next-step lookahead
including beyond a bend, and the curve terminology pass; state v27.

## Validation

`npm run build`, `npm run lint`, `./scripts/test-subway.sh` (full suite) pass. New tests: crew
affordability and zero-crew turns in debt, destination payout/Undo/purchase, Engineering
purchase guards, device-session decisions, hand-off summary, pad glyph rendering, slim card
face, round badge. Not covered: browser/device acceptance of the phone and iPad layouts.

## Review State

| PR | Verdict | Reviewed head | Finalization |
|---|---|---|---|
| [#191](https://github.com/50thycal/party-games/pull/191) | Merged by owner without a recorded independent verdict | 4ade2478e802c9c4923903af204ce3599a8c3446 | merged 2026-09-17 |
| (spectrum/lookahead PR) | Pending independent review | — | — |

## Next Step

Owner playtest of the ending-cash spectrum and the restored borrowing; rule on D2–D4.
