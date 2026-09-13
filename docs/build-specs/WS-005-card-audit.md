# Build Card / Spec — Automatic full-deck Card Audit

Workstream: WS-005 · Significant continuation · Build OS v0.12
Owner authorization: Calvin approved the proposed full-deck circuit and said
“Yep, go ahead and build” in this conversation on 2026-09-13.

## Goal
After this change, one Lab action tests every current Engineering and Destination
card at 2, 3 and 4 players and produces a compact, honest completion-rate report.

## Approved scope
- Automatically enumerate the live catalogs, including new cards in future.
- Normal strategy versus single-card pursuit, matched starting situations.
- Scoring checks, negative cases and every partial tier; legal simulation/replay
  evidence remains distinct from synthetic predicate checks.
- Default 100 paired trials per card/count, configurable 1–1000. Round-robin
  coverage, progress, stopping and saved checkpoints. No individual-card labor.
- Chat report: one row/card, 2/3/4 completion rates, sample counts, targeted VP,
  important caveats. Detailed JSON carries economics, tier counts and Wilson
  confidence intervals. Bounded example replays remain separate.
- No automatic rebalance, no production rules/economy changes, no claim of
  human-calibrated probabilities or proof of impossibility from zero successes.

## Experimental design
Audit-only acquisition screening generates legal START_GAME/deal/draft prefixes.
Destinations must be in the focal seat's opening hand; Engineering must be in
the public opening row and be legally drafted by that seat. Screening is bounded
at 128 attempts; exhaustion is separate from a completed-game miss. Both arms
share the exact acquired prefix. The normal arm uses the existing balanced,
experienced policy; the targeted arm adds own-card utility only after ownership.
Opponents cycle through four existing personalities; focal seats rotate by trial.
Engineering drafting before acquisition deliberately selects the audited offer.
Therefore baseline is normal PLAY conditional on controlled acquisition, not
natural drafting frequency. No acquisition probability is inferred from screening.

Every played action uses recordedReducer. Game randomness resumes at the prefix's
recorded draw count; decisions use separate actor/turn streams. Later draws and
opponent reactions can differ after strategies diverge. Synthetic score fixtures
may violate recipe geometry and must never count as feasibility witnesses.

## Acceptance checks
- Exactly catalogs × {2,3,4} × trials matched tasks, including after resume.
- Explicit positive/negative scoring coverage for every card and each tier.
  Unknown Engineering fixtures visibly fail rather than being silently skipped.
- Paired acquisition prefixes match; full-game records replay; seeded results
  repeat. Rejected/stalled games excluded from completion denominators.
- One row/card and report below 14,000 characters for current catalogs; action
  logs absent from compact/detailed statistical exports. Confidence and sample
  limits disclosed, including interrupted/empty runs.
- Worker isolates CPU work. IndexedDB persists pairs incrementally and retains
  at most one full success/miss record per card/arm. Storage errors pause visibly.
  Run identity and sequence checks reject concurrent-tab overwrites.
- Build, lint, full Subway suite, all-card/all-count smoke sweep, independent
  review; browser start/stop/resume/copy/export/replay where preview is accessible.

## Limits and non-goals
No dedicated solver/proof search or natural acquisition-rate estimate in this
version. Targeted bots are bounded heuristics, not optimal players. Opening-only
Engineering sampling excludes late drafts. Browser background suspension pauses
work; no server scheduler, new external service or credentials. Checkpoints are
device-local, not cloud backups. User must export to retain beyond browser data
clearing. Larger statistical runs are owner-triggered, not a claim made by tests.
