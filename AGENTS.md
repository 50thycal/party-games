# Agent instructions — Party Games

## Build OS

- Canonical framework: [50thycal/build-os](https://github.com/50thycal/build-os)
- Adopted version: v0.4
- Last compatibility check: v0.4 on 2026-08-23

Before substantial design or architectural work, compare the adopted version against
`VERSION.md` in the canonical repository and act on the delta — see `framework/FRAMEWORK_SYNC.md`.
A typo fix or a small bug fix on an existing design does not need a preflight; a change that
reshapes a subsystem does. Never record a check that did not happen. The framework is referenced,
not copied: read the protocol and handoff format in that repository rather than expecting it here.

Rules below marked **Project-specific:** are Party Games' own additions, not Build OS. If one
conflicts with a newer Build OS requirement, surface the conflict to the owner rather than
silently picking either.

## Project memory — three layers

| Layer | File | Answers |
|---|---|---|
| Architecture | [`docs/PROJECT_MODEL.md`](docs/PROJECT_MODEL.md) | How the system works today |
| Rationale | [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why it works this way |
| Active work | [`docs/workstreams/ACTIVE.md`](docs/workstreams/ACTIVE.md) + `WS-###-*.md` | What is being designed and built now, and what remains |

## Development protocol

1. **Read `docs/PROJECT_MODEL.md` before significant architectural work.** It describes
   components, control flow, persistence, invariants, and constraints as they are today.
2. **Read the relevant entries in `docs/DECISIONS.md`** before changing something that looks
   odd. It usually already explains why.
3. **Check `docs/workstreams/ACTIVE.md`** before starting or resuming design/build work. New
   requests are frequently the unresolved part of an open workstream. Read that workstream's
   phase, open decisions, assumptions, and next step, and continue from the unresolved point.
4. **Update `docs/PROJECT_MODEL.md`** in the same pull request whenever architecture, important
   flows, invariants, or component responsibilities materially change. Not for bug fixes, no-op
   refactors, copy changes, or a new game that follows the documented pattern.
5. **Add a `docs/DECISIONS.md` entry** when a consequential product or architecture decision is
   made — anything that constrains future work, is expensive to reverse, or accepts a known cost.
   Follow the "How to add an entry" instructions at the top of that file. Never rewrite an
   accepted entry; supersede it. A decision that is still *open* belongs in the workstream, not
   here.
6. **Checkpoint the workstream** at meaningful moments — implementation starts, a PR is opened,
   review finds something material, the thread completes, pauses, or blocks. A checkpoint updates
   the workstream file's changed sections, its `Phase`, `Status`, `Updated`, `Implementation
   State`, `Related PRs`, and `Next Step`, plus the matching row in `ACTIVE.md`. Not after every
   exchange. Persist conclusions and open questions — never chat transcripts.
7. **Apply any repository-update block supplied with a spec.** A design agent that can read but
   not write GitHub hands its checkpoint over as an exact update block; applying it is part of
   the implementation. If it conflicts with what was actually built, apply what is true and say
   so under *Spec Deviations*.
8. **GitHub pull requests are the authoritative implementation handoff.** Push a branch, open a
   PR ready for review, and write the full Implementation Handoff into the PR body per
   `framework/CLAUDE_HANDOFF.md`. Include the `Framework:` and `Workstream:` fields on anything
   significant. Memory updates ship in the same PR.
9. **Keep the final chat response short** — a PR reference, completion status, headline
   validation result, and whether there were deviations. The PR carries the detail.
10. **Never silently override an owner-approved product decision.** If a requirement is awkward
    or looks wrong, say so and ask; do not quietly implement something else. Technical choices
    with no owner-facing behavior change are yours to make.

Templates live in [`docs/templates/`](docs/templates); the PR body template is wired up as
`.github/pull_request_template.md`. The Design Room's ChatGPT Project instructions are in
[`docs/CHATGPT_PROJECT_INSTRUCTIONS.md`](docs/CHATGPT_PROJECT_INSTRUCTIONS.md).

## Project-specific: Party Games engineering notes

- **Validation before pushing:** `npm run build`, `npm run lint`, and — when touching Subway —
  `./scripts/test-subway.sh`. There is no CI and no broader test suite; play-test meaningful game
  changes in the browser, desktop and phone width.
- **Adding a game** is documented in `README.md`. It requires no engine changes, but the game must
  be registered in *both* `src/engine/gameRegistry.ts` (logic) and `src/games/views.ts`
  (view + `gameOptions` metadata).
- **Rules belong in the reducer.** Reducers are pure, JSON-serialisable, must tolerate being
  re-run, and take all randomness and time from `ctx.random()` / `ctx.now()`. UI-only enforcement
  is not enforcement.
- **Secret game state is not secret from clients.** Every client polls the whole room state, so
  hidden information (an opponent's schedule, the Oracle's band, unrevealed filings) is concealed
  by the view, not by the server. Do not design a mechanic whose fairness depends on the server
  withholding it until server-side filtering exists.
- **A game that changes its persisted state shape** should bump its state-version constant so
  in-flight rooms offer a restart instead of misreading old state (Subway does this; see DEC-008).
- Environment: `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are required for any room to work;
  `OPENAI_API_KEY` is optional and every AI path has a deterministic fallback.
