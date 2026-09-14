# Reproduce the diagnostic experiment

This is a research script, not a new Lab button or a replacement for the shipped audit. It takes a compiled checkout directory and an output directory. It automatically handles all three cards at 2, 3, and 4 players, with three completed measured games per combination, bounded by 30 candidate trials each.

Source used: `acfe2396a4cd28ec41a7757ac19a1da1d57e39d1`. The relevant game sources were compared against main `fc5bc3bd915bfb26e680250b61107ae0f6601491` and were unchanged. Export build fields were not injected in this local run and remain `unrecorded-local-build`. Rules fingerprint is `83115475`; state version is 21.

From the repository root with dependencies installed, compile the modules and run:

```bash
node - <<'JS'
const fs = require('fs');
const root = process.cwd();
fs.writeFileSync('/tmp/subway-investigation-tsconfig.json', JSON.stringify({
  extends: root + '/tsconfig.json',
  compilerOptions: {
    noEmit: false, outDir: '/tmp/subway-investigation', rootDir: root,
    module: 'commonjs', moduleResolution: 'node', target: 'es2022',
    incremental: false, typeRoots: [root + '/node_modules/@types']
  },
  include: [root + '/src/games/subway/cardAudit.ts']
}));
JS
npx tsc -p /tmp/subway-investigation-tsconfig.json
mkdir -p /tmp/subway-investigation/node_modules/@
ln -sfn /tmp/subway-investigation/src/engine /tmp/subway-investigation/node_modules/@/engine
node playtests/subway/research/2026-09-14-three-cards/investigation.cjs /tmp/subway-investigation /tmp/subway-card-investigation-rerun
```

Use the recorded source version for exact numerical reproduction. New game code may produce different outcomes. Output includes `results.json` and a full replay for every completed game; the archive retains one successful replay per card. The path arguments are the only modifications from the script that produced the archived results.

## Experimental limitations

- One focal seat (`seat-1`), custom objective planner, standard default opponents. Not a randomized population study or a matched comparison with the owner audit.
- Candidate seed = `10000 + trial*1000 + playerCount*100 + attempt`. Each candidate searches up to 128 setups for a visible target card, falling back to the last setup if the search exhausts. Card acquisition is checked after drafting; unsuccessful acquisition is recorded as `unavailable`. These trials are excluded from the three measured games.
- Four Corners prefers long public contracts and excludes portfolios without `long` as `blueprintUnavailable`. This is a sufficient-plan constraint, not a rule requirement or a claim that other portfolios cannot succeed.
- The planner explores up to eight steps with a beam of 48 candidate states. All actual placements pass the production validator and recorded reducer. It replans when blocked; hypothetical search states never replace game state.
- Four Corners aims to link both vertical corner pairs with a horizontal line. If an intended starter is occupied, it uses a legal fallback. It stops lines once their corner target is reached. Thus unfinished-line penalties and inefficient spending partly reflect the chosen policy.
- North–South continues with the ordinary bot after reaching both borders. Citywide replans after each placement to pursue remaining neighborhoods. Neither policy guarantees optimal play.
- Every completed game reached RESULTS within 500 accepted actions and reproduced the same final-state fingerprint when replayed. Invalid actions abort the experiment. Existing predicate fixtures separately compare progress and final scoring ledgers.
- This run establishes at least one valid completion for every card, not completion probabilities, optimal strategies, or human balance. No live phone/iPad session was run for this report.
