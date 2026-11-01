# WS-008 — Landmark Bearings

**Phase:** COMPLETE
**Status:** Active
**Created:** 2026-10-31
**Updated:** 2026-10-31
**Build OS:** v0.12

## Goal

Make the Santa Fe landmark-bearing guessing game a selectable Party Games option.

## Context

Calvin explicitly requested the build after live chat rounds. Existing active-board
rows are legacy entries and remain unchanged. This is the newly admitted mission,
not a continuation or reclassification of Subway work.

## Current Mental Model

Use the existing pure game-plugin pattern and room/hotseat transport. Host chooses
an origin and landmark pack; each player guesses a compass degree; host reveals
the initial true bearing and cumulative angular-error scores over several rounds.

## Decisions Made

- Owner authorized adding this game and preparing an implementation PR.
- Preserve the shared engine and all existing games.

## Open Decisions

None required to implement the bounded first version; defaults are reviewable.

## Assumptions

- A curated landmark catalog and coordinate/preset origin selection meet v1 needs.
- Cumulative degrees off is the score; ties share wins; missing guesses cost 180°.
- Default five rounds, selectable 1–10. Multiplayer and hotseat reuse existing UX.

## Non-Goals

See the Build Card. No new infrastructure, geocoding, voice input or engine changes.

## Build Card / Build Spec

[Landmark Bearings](../builds/landmark-bearings.md)

## Acceptance Checks

AC-1 through AC-6 in the Build Card cover registration, math, action rules,
multiplayer/hotseat, responsive presentation and required validation.

## Implementation State

Complete in [PR #203](https://github.com/50thycal/party-games/pull/203): pure plugin,
dual registration, 24-place
catalog, setup/guess/reveal/standings/history UI, isolated responsive lab and
focused math/rules/render/API persistence tests.

Validation: 26 focused checks and two real-API/local-libSQL three-round flows
passed; build/lint passed. Phone six-player three-round game and desktop tie,
replay, custom-origin, missing-guess and layout checks recorded in
[verification](../testing/landmark-bearings-verification.md). Full browser room
creation is unverified due to the existing HTTP preview randomUUID restriction;
production HTTPS/Turso were not exercised.

Final browser smoke after the review correction completed start → one-round
reveal → replay → fresh-match start. Match identifiers are sent correctly by the
setup UI. This documentation-only finalization records the completed state that
takes effect when PR #203 lands; it does not claim production deployment.

## Review State

**Verdict:** Approved
**Reviewed head:** 5083224dacd53175673735d76a666ca2204b0e8f
**Reviewed PR:** #203
**Finalization:** pushed

Independent reviewer identified stale previous-match lobby mutations in PR
comment 6551549881 on head 20af6a97a8790ebb33b368fdb85096511bb53942.
START_GAME and UPDATE_SETTINGS now validate match/round; Setup includes them,
API tests match the contract, and the replay regression is added. Independent
reviewer `codex-bearings-independent-review-20261031` approved the corrected head
in original PR comment 6551566729, independently rerunning all 26 checks and both
API/local-database flows. No Blocking or Should-fix finding remains open.
The reviewer records finalization-head verification on the PR after this commit
exists; this file does not attempt to name its own future SHA.

## Framework

Compared canonical `50thycal/build-os` VERSION.md and framework sync/handoff
protocol on 2026-10-31: adopted and canonical are v0.12; no migration required.

## Related Decisions

DEC-001/002: game plugins and separate client/server registries. Existing client
state disclosure limitation remains; this feature does not change transport.

## Related PRs

[PR #203](https://github.com/50thycal/party-games/pull/203)

## Next Step

None.
