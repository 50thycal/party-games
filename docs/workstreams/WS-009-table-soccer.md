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

`npm run test:table-soccer`, `npm run test:bearings`, the standalone type check, lint and `npm run build` passed. Chromium touch sessions at iPhone 13 and iPhone SE viewports completed a full match with a straight shot, off-center bank, live save, bonus placement, disconnect settlement, rejoin and replay. The full two-player match also passed with 120 ms added to each game request. A separate four-player room accepted parallel starting placements and rejected a fifth seat. Screens were visually checked at setup, aim, incoming shot and bonus placement. Independent review reproduced a late on-screen save that became a goal when a prior goalie request was in flight. The input sequence, receipt timing and settlement fixes passed a browser replay of that case with 225 ms of goalie delay and a move about 110 ms before contact. The rules suite also covers a bank near a rail and stale goalkeeping writes. The original preview Vercel smoke test created and joined a room and persisted a bank-shot save. Physical iPhone hardware playtesting remains open.

### Solo Playtest and full multi-seat verification

The owner authorized local practice and broader end-to-end testing. Solo Playtest is selectable from Create a Room and supports one to three CPU opponents. It uses the same table editor, rules, ball flight and goal controls, with browser-local state and bot actions. A fresh setup resets the solo match. CPU placement uses a finer scan on crowded layouts and lets the user restart if it cannot find a clear spot. An independent review reproduced the original stall on a custom 65 × 50 cm table. The regression now finds the last starting bumper and advances to kickoff.

A full mobile touch solo match covered a human goal, bonus placement, a live human save, CPU goals and automatic bonuses, the CPU win and replay. Three CPU seats also placed bumpers and kicked without room API calls. Separate touch browser sessions completed full multiplayer matches at two, three and four seats through the normal create and join screens. The larger layouts moved and rotated every phone on a 160 × 96 cm table, placed all starting bumpers, exercised a rotated side-goal save, rotated the turn across every player, scored to three and replayed with the same calibration. A two-phone run also reproduced and passed the late-save regression under 225 ms of defender request delay. The reducer, Bearings suite, lint and production build passed.

## Review State

Independent review reproduced and reported goalie timing and rail clearance findings. The previous preview head passed independent recheck. The solo extension requires review on its own head.

## Related PRs

[PR #204](https://github.com/50thycal/party-games/pull/204).

## Next Step

Verify the Solo Playtest route on the Vercel preview and get an independent review of the updated head.

## Solo release feedback

The first phone playtest found that the ball paused after release and the mini-map showed an aim line. Human solo kicks now start on release, and the main playfield is the sole location for the aim guide. The mini-map keeps the ball marker. Solo CPU and multiplayer shots retain their scheduled notice for defenders. The gameplay surface also blocks native text selection and long-press menus. Aim and goalie movement use the latest touch sample each animation frame. The changes are scoped to the playtest follow-up PR from `codex/table-soccer-release`.
