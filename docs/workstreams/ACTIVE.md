# Active Work

<!-- The project's active-work control board. What are we working on and where is each
     effort? One line per workstream; anything needing a paragraph belongs in its file. -->

**Updated:** 2026-09-20 · **Build OS v0.12**

| ID | Workstream | Phase | Status | Current Next Step | Related PR |
|---|---|---|---|---|---|
| [WS-007](WS-007-subway-strategy-telemetry.md) | Subway strategy telemetry | REVIEW | Active | Owner review of classifier 1.0.0 readings against real playtests; calibrate thresholds | Strategy telemetry PR open |
| [WS-006](WS-006-subway-dgle-playtest.md) | Subway DGLE playtest follow-up | REVIEW | Active | Owner playtest of the ending-cash spectrum and restored borrowing; rule on D2–D4 | [#191](https://github.com/50thycal/party-games/pull/191) merged; spectrum/lookahead PR open |
| [WS-005](WS-005-subway-finished-edition.md) | Subway 2–4 player finished edition | REVIEW | Active | Finish independent review of polished intro; #197 extensions remain separate | [#196](https://github.com/50thycal/party-games/pull/196) verification; #194/#195 merged |
| [WS-001](WS-001-subway-v0-3-redesign.md) | Subway v0.3 gameplay redesign | REVIEW | Active | Independent design review of merged v0.3 against the reconstructed Build Card; owner to rule on D1–D4 | [#137](https://github.com/50thycal/party-games/pull/137), [#139](https://github.com/50thycal/party-games/pull/139) (both merged) |
| [WS-002](WS-002-subway-route-engineering.md) | Subway route engineering and playtest UX | REVIEW | Active | Record the merged closeout; playtest follow-ups moved to WS-003 | [#141](https://github.com/50thycal/party-games/pull/141), [#142](https://github.com/50thycal/party-games/pull/142) (merged) |
| [WS-003](WS-003-subway-construction-access.md) | Subway construction access and route lookahead | REVIEW | Active | Owner's balance playtest of the merged toll/debt/recipe changes; browser debt case and hotseat still unexercised | [#143](https://github.com/50thycal/party-games/pull/143) (merged design-only), [#144](https://github.com/50thycal/party-games/pull/144) (implementation, merged), [#145](https://github.com/50thycal/party-games/pull/145) (Build OS v0.5) |
| [WS-004](WS-004-subway-tabletop-console.md) | Subway tabletop console and playtest clarity | REVIEW | Active | Owner playtest of the merged single-surface tabletop; owner to rule on company-wide vs per-line Engineering objectives and on the card audit | [#147](https://github.com/50thycal/party-games/pull/147), [#148](https://github.com/50thycal/party-games/pull/148), [#149](https://github.com/50thycal/party-games/pull/149), [#150](https://github.com/50thycal/party-games/pull/150) (all merged) |

<!-- Phase: IDEA · EXPLORE · MODEL · DECIDE · BUILD_CARD · READY_TO_BUILD · BUILDING · REVIEW
     Status: Active · Paused · Blocked · Abandoned
     Completed and abandoned workstreams leave this table; their files remain. -->

## Recently completed

None yet. WS-001 is the first workstream on this board.

## Parking lot

- PARK — Engineering card live phone/tablet layout and Rules & symbols touch acceptance; browser local access blocked, static diagrams/SSR reviewed.
- PARK — Alternate end trigger requires first/last-company clarification; no rule change authorized. Engineering card-face work admitted to current mission.
- PARK — QNHT hands-on tablet/phone layout and payment-animation acceptance; browser access was blocked. Automated UI/API tests passed.

- PARK — Rulebook owner review and graphics await wording approval. Bend modes are admitted to current implementation.

- PARK — Subway blocked-move explanations and scoring highlights: considered but not selected for the active-route guidance iteration; no separate tickets.
- PARK — Subway station finder and crew completion preview: considered but not selected for the build-cost iteration; no separate tickets.

---

**Note on this board's history.** The workstream layer was installed on 2026-08-23, after
Subway v0.3 had already been built and merged. WS-001 is retrofitted onto work that did not
run under Build OS; every workstream after it starts at `IDEA`/`EXPLORE` in the Design Room.
Efforts completed before that date — the engine, and the six games other than Subway — were
not retrofitted as workstreams: they are finished, and `PROJECT_MODEL.md` plus `DECISIONS.md`
already carry what is worth keeping about them.

## YMIF parked observations

- PARK — Simulate extra lines at lower player counts first; no rules changed.
- PARK — Monitor KC early three-line income, split station/crossing receipts and final placement.
- PARK — Remaining YMIF notes await one-by-one design decisions.

- Polished introduction admitted 2026-09-20; see current WS-005 continuation.

- PARK — Early third-line completion/endgame behavior awaits owner design decision.
- PARK — Physical iPhone/iPad Safari and multitouch acceptance remains hardware-only; YMIF public-browser portrait/shared-board verification is recorded in docs/testing/YMIF-playtest-verification.md.
