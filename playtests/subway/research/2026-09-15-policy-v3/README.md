# Policy v3 smoke comparison

2026-09-15 · historical rules v22, including Largest Cluster. Simulation only.

18 completed, exact-replay-verified games: policies v2/v3 each ran seeds
91021–91023 at 2/3/4 players. All seats use the named policy. Initial setup seeds
match; subsequent drafting and opponent responses can differ. This is a small
population-policy smoke comparison, not a controlled head-to-head win-rate study.

| Mean per company (27 company outcomes per policy) | v2 | v3 |
|---|---:|---:|
| Total VP | 27.37 | 30.00 |
| Full cards completed | 1.93 | 1.74 |
| Final debt ($M) | 0.78 | 0.37 |
| Unfinished lines | 0.30 | 0.19 |
| Total measured policy games runtime | 12.000 s | 12.817 s |

V3 improves total score and completion economics in this sample, while full-card
completion is lower. Runtime is about 7% higher. Neither difference establishes
human balance or a reliable probability; shared-server timings are not iPad
performance promises. The forecast includes approximate future crew costs and
bounded rather than exhaustive geometry. No card or money constants changed.

To reproduce the historical v22 result, use original PR source commit
`6b02eff56781424f83b238e665a96bc4f041f0e4` and its test script.

For a **new current-rules comparison**, run `./scripts/test-subway.sh` to compile:

```bash
node /tmp/subway-test/scripts/subway-policy-benchmark.js
```

The current benchmark uses `chooseBotAction(..., planning=false)` as the current
policy without lookahead, labeled `<BOT_VERSION>-no-lookahead`. It is not the
historical v2 executable. The script asserts accepted actions, RESULTS,
and exact replay for every game. Detailed measurements are in `benchmark.json`.

These results predate the merged card/no-stack/payment changes. They are not a
benchmark of integrated state v24 / bot v5. The benchmark script remains available
for a fresh comparison; no new balance claim is made during conflict resolution.
