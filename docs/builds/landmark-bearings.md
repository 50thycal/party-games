# Landmark Bearings — Build Card and Spec

**Workstream:** WS-008 · **Date:** 2026-10-31 · **Classification:** Significant

## Goal and authorization

After this change, the system should let a group play the landmark-bearing guessing
game as an option in Party Games, with accurate compass bearings and a running score.
Calvin requested implementation after playing Santa Fe landmark rounds in chat.
That authorizes this bounded game implementation and a reviewable PR; it does not
authorize merging. Product defaults below are implementation assumptions, not
separately owner-ratified decisions.

## New behavior / Build Spec

- Register `landmark-bearings` in both game registries. Reuse room creation,
  multiplayer and hotseat transport without modifying the engine or other games.
- Setup: Santa Fe by default; city presets, explicit device-location request, or
  named latitude/longitude entry. US/world landmark packs; 1–10 rounds (default 5).
  Host may pick the first landmark or use a randomized no-repeat deck.
- Flow: lobby → guessing → round results → next round → final standings.
  Host controls setup/start/reveal/advance/replay. In hotseat, return to the host
  seat for these controls. Every participant submits their own integer guess;
  360° is accepted as 0°. Guesses are locked until the reveal.
- Always explain north 0°, east 90°, south 180°, west 270°. Answers use the
  initial great-circle bearing from true north, not magnetic north or a flat-map
  angle. No answer/direction clue or opponents' guesses rendered before reveal.
- Score the shortest angular difference (359° versus 1° is 2°). Closest players
  share a round win; cumulative degrees off determines final ranking (lower wins).
  A host can reveal with missing guesses; missing seats receive 180° error,
  explicitly explained before reveal. No guessing player is treated as 0° by default.
- All rules, identity/phase/round validation, scoring, and randomness live in the
  pure reducer. Explicit round numbers make stale/retried actions no-ops. Freeze
  the roster at start; late joiners wait until replay. Curated coordinates need
  no API key, paid geocoding, or AI call.
- Reveal a compass with answer/guess rays, sorted round results, cumulative
  standings, and completed round history. Keep the current landmark and origin
  visible throughout play. Include source links after reveal.

## Non-goals

Live magnetic/device heading, map/geocoding integration, speech transcription,
server-side secret filtering, changes to Subway, deployment/merging before review.

## Acceptance checks

- AC-1: New game appears in Create Room and resolves through both registries.
- AC-2: Santa Fe examples match chat bearings to within 0.1°; cardinal directions,
  dateline crossing and angular wraparound score correctly. Ties share wins.
- AC-3: Invalid, unauthorized, duplicate and stale actions cannot alter scores or
  skip rounds; no-repeat decks, missing guesses and replay work as specified.
- AC-4: Multiplayer and hotseat complete multiple rounds with multiple players;
  results/history/standings persist in the room state and refresh correctly.
- AC-5: Phone and desktop views are readable with no horizontal overflow. Blank
  guesses cannot submit; answer/other guesses stay unrendered before reveal.
- AC-6: `npm run build`, `npm run lint`, and focused rules checks pass. Record
  actual browser verification and distinguish any unavailable database transport.

## Material interrupt risks

No new secrets or infrastructure are required. Legacy multiplayer exposes whole
room state to clients; concealment is a UI convention, not anti-cheat protection.
Unavailable Turso credentials may limit real persisted-room testing; report that
explicitly and verify the game flow separately rather than claim a live-room test.
