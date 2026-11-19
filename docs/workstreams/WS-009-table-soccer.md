# WS-009 — Table Soccer

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-11-18
**Updated:** 2026-11-18
**Build OS:** v0.12

## Goal

Play a spatial soccer game across two to four phones laid flat on a physical table.

## Context and decisions

Calvin approved manual table calibration, pull-and-release kicking, live goalie saves, one starting bumper per player and one extra bumper for each scorer before the match ends. The close-up goal is the primary view, with a mini-map during play. The owner approved the MVP card and Vercel playtest preview on 2026-11-18. The existing board rows are legacy entries as noted in WS-008.

## Model, boundaries and acceptance

See the [approved card and build spec](../builds/table-soccer.md). The material risk is an unfair save window caused by browser, network or room polling latency. Verify live timing and consistent results before calling the MVP complete.

## Framework

Compared the adopted v0.12 against canonical `50thycal/build-os` on 2026-11-18. Both are v0.12.

## Implementation State

The implementation is on `codex/table-soccer-mvp`. The game uses the regular create and join pages and a first-to-three match.

`npm run test:table-soccer`, `npm run test:bearings`, the standalone type check, lint and `npm run build` passed. Chromium touch sessions at iPhone 13 and iPhone SE viewports completed a full match with a straight shot, off-center bank, live save, bonus placement, disconnect settlement, rejoin and replay. The full two-player match also passed with 120 ms added to each game request. A separate four-player room accepted parallel starting placements and rejected a fifth seat. Screens were visually checked at setup, aim, incoming shot and bonus placement. Physical iPhone playtesting and deployment access remain to be verified.

## Review State

Pending independent review.

## Related PRs

[Implementation pull request for this branch](https://github.com/50thycal/party-games/pulls?q=is%3Apr+head%3Acodex%2Ftable-soccer-mvp).

## Next Step

Verify the Vercel preview and get independent review of the implementation head.
