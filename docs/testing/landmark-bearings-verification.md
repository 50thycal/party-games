# Landmark Bearings — Verification

**Date:** 2026-10-31 · **Workstream:** WS-008

## Story

Select Landmark Bearings in Create Room, set the origin, collect guesses, reveal
the true bearing and follow cumulative scores through the final round and replay.

## Automated evidence

- `npm run test:bearings`: 25 rules/math/rendering checks passed. Includes the
  five chat-coordinate regressions (12.3073°, 68.8406°, 132.8451°, 108.7718°,
  62.1197°), cardinal/dateline bearings, undefined bearings, shortest angular
  error, zero/360°, ties, missing guesses, host/membership/phase/round/match guards,
  no-repeat decks, frozen rosters, serialization, replay, UI concealment and
  final/history rendering.
- Two API integration flows passed: multiplayer and hotseat each create a room,
  submit concurrent guesses, complete three rounds, re-read results from the
  database, and replay. These invoke the **real Next route handlers**, room action
  pipeline, optimistic writes and local libSQL database. The temporary database
  and test credentials are isolated; this is not a production Turso test.
- `npm run build`: passed, including the isolated lab routes and TypeScript checks.
  The existing get-room handler logs Next's caught dynamic-server-usage probe
  during static generation; the build succeeds and lists that endpoint as dynamic.
- `npm run lint`: passed without warnings/errors. `git diff --check`: passed.
- React quality check: hook order stable, draft/derived state separated, guess
  forms keyed by match/round/seat, input labels and native buttons/tables used,
  no new dependencies or synchronous network work in render/reducers.

## Browser evidence

Managed Chrome preview, `/test/bearings`, with independent **390 × 844 phone**
and **800 × 900 desktop** iframes. This lab runs the real game reducer and view
without the room transport; it is explicitly labeled unsaved local play.

- Create Room visibly lists Landmark Bearings (2–12), preserving Subway as the
  existing default. Both Multiplayer and Hotseat remain offered.
- Phone: submitted all six chat Bourbon Street guesses; reveal showed 108.8°,
  Abby 1.2° off, and the correct sorted result/leaderboard.
- Desktop: completed the Niagara Falls round with the six chat guesses; reveal
  showed 62.1°, shared Abby/Linda/George round and overall wins, and replay
  returned to setup with prior settings.
- Phone: completed a fresh **three-round, six-player game** (Bourbon Street,
  Niagara Falls, Alamo). Guesses reset each round; three different landmarks;
  history retained every result. The final totals correctly shared a 56.2° win
  between Abby and George for the submitted test guesses. Expanded history
  exposed all three rounds.
- Blank guesses disabled submission. Switching seats showed a neutral empty
  guess form and concealed the previous player's value. Opponent guesses and
  answer rays were absent before reveal. 360° saved as 0°.
- Early reveal required a second click, supported Keep waiting, and applied
  180° to each missed seat after confirmation. Missing seats did not win a round.
- Desktop custom Kansas City coordinates + World tour + Eiffel Tower started
  correctly and revealed 45.9°. Clearing latitude disabled Start with guidance.
- Visual inspection: readable compass, player colors, reveal, leaderboard and
  expanded history at phone and desktop widths. Phone document width and scroll
  width both measured 373 px (390 px iframe minus border/scrollbar); desktop both
  measured 783 px. No horizontal overflow at those tested sizes.

## Verification limits and findings

- Full browser → persisted room testing was stopped at an **existing HTTP preview
  issue**: `src/app/create/page.tsx` calls `crypto.randomUUID()`, unavailable on
  this non-secure `http://terminal.local` origin. No engine/creation change was
  made to compensate for the preview. Production uses HTTPS; production behavior
  and real remote Turso were not exercised in this session. Browser UI/reducer
  checks and the real API/local-database checks above are distinct evidence.
- The managed preview briefly consumed production `.next` output from a build
  and reported a missing webpack chunk. Stopping preview, clearing generated
  output and restarting resolved it. Final browser checks ran on the clean
  preview; subsequent builds run after stopping preview.
- Device geolocation permission, physical iPhone Safari, magnetic heading, and
  production Vercel deployment were not tested. Location presets/manual entry
  require no permission and were exercised.
- Legacy shared room state is observable by clients. UI concealment is not an
  anti-cheat boundary; documented in the rules and handoff.
- PARK: The existing HTTP `crypto.randomUUID()` room-creation restriction is
  unrelated to bearing rules and not changed by this PR.
