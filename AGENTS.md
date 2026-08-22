# Agent instructions — Party Games

## Development protocol

This repository follows **[Build OS v0.1](https://github.com/50thycal/build-os)**. The framework
is referenced, not copied: read the protocol, templates, and handoff format in that repository
rather than expecting them here.

1. **Read [`docs/PROJECT_MODEL.md`](docs/PROJECT_MODEL.md) before significant architectural
   work.** It describes how the system works today — components, control flow, persistence,
   invariants, and constraints.
2. **Read the relevant entries in [`docs/DECISIONS.md`](docs/DECISIONS.md)** before changing
   something that looks odd. It usually already explains why.
3. **Update `docs/PROJECT_MODEL.md`** in the same pull request whenever architecture, important
   flows, invariants, or component responsibilities materially change. Not for bug fixes,
   no-op refactors, copy changes, or a new game that follows the documented pattern.
4. **Add a `docs/DECISIONS.md` entry** when a consequential product or architecture decision is
   made — anything that constrains future work, is expensive to reverse, or accepts a known cost.
   Follow the "How to add an entry" instructions at the top of that file. Never rewrite an
   accepted entry; supersede it.
5. **GitHub pull requests are the authoritative implementation handoff.** Push a branch, open a PR
   ready for review, and write the full Implementation Handoff into the PR body per
   `framework/CLAUDE_HANDOFF.md` in the Build OS repository. Memory updates ship in the same PR.
6. **Keep the final chat response short** — a PR reference, completion status, headline validation
   result, and whether there were deviations. The PR carries the detail.
7. **Never silently override an owner-approved product decision.** If a requirement is awkward or
   looks wrong, say so and ask; do not quietly implement something else. Technical choices with no
   owner-facing behavior change are yours to make.

## Project-specific notes

- **Validation before pushing:** `npm run build`, `npm run lint`, and — when touching Subway —
  `./scripts/test-subway.sh`. There is no CI and no broader test suite; play-test meaningful game
  changes.
- **Adding a game** is documented in `README.md`. It requires no engine changes, but the game must
  be registered in *both* `src/engine/gameRegistry.ts` (logic) and `src/games/views.ts`
  (view + `gameOptions` metadata).
- **Rules belong in the reducer.** Reducers are pure, JSON-serialisable, must tolerate being
  re-run, and take all randomness and time from `ctx.random()` / `ctx.now()`. UI-only enforcement
  is not enforcement.
- Environment: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are required for any room to work;
  `OPENAI_API_KEY` is optional and every AI path has a deterministic fallback.
