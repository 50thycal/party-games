# Subway Playtest Upgrade

Framework: Build OS v0.12 (canonical checked 2026-09-12, unchanged).
Workstream: WS-005 continuation. Significant; owner explicitly authorized building
the agreed plan in ChatGPT after PR #174. Baseline: main 46ad31b, state v20.

## Goal / Build Card

After this change, the system should let Calvin test production iPad/phone Subway
with 2–4 companies controlled by one person, friends or configurable bots; run
reproducible simulations and compare them with permanently archived human exports.

## Non-goals

No phone-only multiplayer board, replacement of the quick `/subway` tabletop,
game-balance changes, paid LLM requirement, automatic GitHub writes from browsers,
or claim of human calibration without supplied human data.

## Design

- `/subway/lab` is reached from the small testing link on multiplayer setup. It
  offers the real iPad testing room, batch simulation, and imported-record replay
  and comparison. Preserve `/subway` and the existing visual scene inspector.
- Test rooms use the production companion API, revision checks, request receipts,
  filtered private views and components. A separate controller credential grants
  one phone access only to locally managed company seats; external phones own
  reserved friend seats. The iPad remains the board and host.
- Each managed seat chooses human/bot, personality and skill. Bot advance is
  driven by the iPad with pause/step/run-until-human controls; every action passes
  the existing role/turn checks. Seat selection never grants a phone board powers.
- Shared deterministic bounded heuristic policy uses public information plus its
  own hand. Profiles: balanced, destination planner, completion first, cautious.
  Skill changes bounded candidate search/noise, not hidden-information access.
- Record reducer inputs, clock and random draws (including setup), roster,
  source rules fingerprint/build, controller changes and timestamped notes.
  Export contains no credentials. Replay requires matching rules fingerprint;
  divergent and legacy records remain readable but never claim exact replay.
- Export from normal multiplayer too, so friends' games form the human baseline.
  Rejected attempts are diagnostic records, not accepted replay actions.
- Repository ingestion preserves original bytes, creates a stable content-derived
  session ID, metadata and separate observations/analysis. Reimport is idempotent.
  Agent instructions require ingestion when an owner shares a playtest. No human
  records are fabricated. Bulk simulation stays downloadable; archive deliberately.
- Compare only compatible rules and player counts by default. Label human/mixed/
  bot/simulation populations; expose sample sizes and descriptive score, economy,
  completion, goal and action metrics. Holdout designation keeps validation games
  distinct from calibration data. Personalities initially remain uncalibrated.

## Acceptance Checks

1. v20 zero area VP, 30 cards, physical transfers unchanged; legacy tabletop works.
2. 2/3/4-seat iPad rooms support controller switching, friend join, bots, takeover,
   reconnect and persistence; normal rooms reject lab authority/actions.
3. Bot policies cover purchases, goals, surveys, crew spending and placements;
   all profiles terminate through real legal actions across a seeded matrix.
4. Identical seed/profile/version reproduces a simulation; recorded human/mixed
   games replay to the exact final state; mutation/version mismatch is reported.
5. Private cards, RNG tape, credentials and replay state never leak through polls.
6. Simulations report progress/cancel/errors, per-game export and cohort summaries;
   import/replay/comparison work without network rooms or human data present.
7. Ingestion preserves source, deduplicates and indexes records; malformed/legacy
   input is labeled honestly and never silently becomes calibration evidence.
8. Build, lint, full Subway tests and meaningful lab/API regression checks pass;
   browser checks at phone and iPad sizes where available. Independent review is
   required before merge; implementation agent does not merge.

## Interrupt risks

Private information leaks, illegal bot moves, duplicate submissions, wrong rules
versions, destructive archive overwrites or test actions affecting ordinary rooms
are FIX NOW in this same mission and PR.
