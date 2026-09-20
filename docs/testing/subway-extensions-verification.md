# Paid-extension verification — PR #197

Date: 2026-09-20. Rules/state v30, bot policy 7, audit policy 6.

## Scope

Paid extensions after all three contracted lines finish. Three-line drafting and
the nine-round cap remain. Configurable draft size and intro implementation are
excluded; the intro handoff remains available for the separate session.

## Focused regression

`scripts/subway-extensions-test.ts` covers all-three unlock, rejection on the same
turn as the third completion, next-turn activation, any owned line's availability,
one line per turn, stale period/node count, duplicate and out-of-turn rejection,
occupied/out-of-range/backward targets, selection without charging, $1 borrowing,
no crew/completion duplication, skip without income, preserved recipe endpoint and
completion, added network length, crossing tolls, destination cash, Undo, companion
permissions/revision deduplication/reconnect, and round-nine scoring.

Three complete 2/3/4-company games deliberately finish early using the approved
flexible-length setup and real drafting/hiring/placement actions. Production bot
policy takes 24 paid extensions across those games. Every final state matches a
full deterministic replay. These are synthetic regression games, not human balance
playtests or claims that typical players finish that early.

Initial independent review found and prompted fixes for the fee-inclusive cost
preview, the selected extension's FROM marker and phone extension counts.

## Validation and limitations

Production build, lint and the full Subway suite pass (exit 0). Existing coverage
includes 36 complete multiplayer simulations, six bend-mode replays, twelve policy
simulations, three iPad API lab games, 51 audit fixtures and 105 card-art renders. The test runner now uses a unique temporary directory:
a simultaneous intro-session run had overwritten the old shared test compilation
path, so isolated output is necessary for trustworthy results.

The cloud browser rejected the local preview with `ERR_BLOCKED_BY_CLIENT`.
The published branch preview redirected to “Log in to Vercel”; no physical
iPhone/iPad or live v30 extension interaction is claimed by the automated checks
above. Runtime-browser acceptance remains outstanding behind preview sign-in.
