# WS-007 — Subway strategy telemetry

**Phase:** REVIEW
**Status:** Active
**Created:** 2026-09-17
**Updated:** 2026-09-17
**Build OS:** v0.12

## Goal

Infer, after each game, which strategies every company actually exhibited, and preserve the
evidence so thousands of playtests can be aggregated into research about Subway's real strategy
space.

## Context

Reports described events, not play. The owner wants to answer which strategies occur, which
co-occur, which correlate with winning or with VP, how they differ at 2/3/4 players, which are
human versus bot behaviours, which are absent, and whether play diversifies with experience.

## Current Mental Model

```text
gameplay ─► accepted-action log (unchanged)
             ↓
        features.ts     rebuild geometry per action; behavioural + field-relative features
             ↓
      classifiers.ts    13 heuristics ─► score 0-100 + confidence + evidence + summary
             ↓
         index.ts       fingerprint (all 13) · top ≤3 · phase snapshots · dataset rows
             ↓
         report.ts      Strategy analysis section + archived JSON
             ↓
    cross-game dataset  occurrence · combinations · effectiveness, versioned
```

Nothing flows right to left. The reducer and bots never see a strategy label.

## Decisions Made

- Classification is post-hoc and heuristic; no declared strategies, no LLM in the pipeline (DEC-058).
- Whole fingerprint is stored, not just the top three, because combinations are the research target.
- Raw features are archived so historical games can be re-classified under a later version.
- Strategies that describe standing out are scored partly against the field of that game.

## Open Decisions

- **D1.** Are the v1 thresholds right? Against six simulations the landlord and completion
  classifiers still fire for roughly three quarters of companies, which may be true of the
  ruleset rather than a scoring fault.
- **D2.** Tempo, Endgame Controller and Opportunist barely fire against current bots. Real absence,
  bot monotony, or classifiers that are too strict?
- **D3.** Should phase evolution move from cumulative snapshots to per-phase windows? A fingerprint
  needs a board, which only exists cumulatively, so this needs a design answer, not a tweak.

## Assumptions

- Telemetry is complete for exported games; where it is absent, confidence drops rather than the
  classifier inventing a reading.
- Reconstructed geometry matches the final board, which the tests assert on real simulations.

## Non-Goals

- Rebalancing anything. No gameplay rule changed in this workstream.
- Strategy-specific bot personalities: a separate experiment, deliberately not part of the
  research dataset, to avoid circular evidence.

## Build Card

Owner handoff in chat on 2026-09-17 ("Subway Strategy Telemetry — Implementation Handoff").

## Implementation State

Feature extraction, 13 classifiers, scores/confidence/evidence, top-three reporting, complete
fingerprints, cumulative phase snapshots, dataset rows, occurrence and combination aggregates,
report section and archived JSON all implemented behind classifier version 1.0.0.

## Validation

`npm run build`, `npm run lint`, `./scripts/test-subway.sh` all pass. New tests cover the three
calibration cases from the handoff, fingerprint completeness, threshold behaviour, determinism,
analysis purity, dataset and aggregate maths, timeline reconstruction against the final board,
telemetry-free degradation and report integration. Not covered: human-playtest validation of the
readings, which is what the owner review is for.

## Review State

| PR | Verdict | Reviewed head | Finalization |
|---|---|---|---|
| (strategy telemetry PR) | Pending independent review | — | — |

## Next Step

Owner reads classifier 1.0.0 against a real playtest and rules on D1-D3.
