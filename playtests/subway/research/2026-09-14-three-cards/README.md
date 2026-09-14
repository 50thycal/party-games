# Subway: three-card investigation

2026-09-14 · rules v21 · simulation evidence, not human playtests.

**All three cards can be completed legally. No scoring mismatch with the current card text was found. Their balance is not yet established.**

| Card | Full completions: 2 players | 3 players | 4 players | Finding |
|---|---:|---:|---:|---|
| North–South Lines | 3/3 | 3/3 | 3/3 | Longer-range planning overcame the shipped audit's zero completions. |
| Citywide Service | 1/3 | 1/3 | 2/3 | Doable; planning visits to unvisited neighborhoods helped. |
| Four Corners | 1/3 | 0/3 | 0/3 | One legal completion; reliable, economical play remains unresolved. |

These are **selected diagnostic games, not estimated normal-game probabilities**. The experiment screened seeds for card availability, required the focal bot to acquire the card, and used a custom planner. Four Corners also required the Long contract for its chosen plan. Of 73 candidate trials, 27 reached the measured cohort. Each completed game passed exact replay through the production reducer. Preliminary development runs are excluded.

## Rules versus implementation

- **North–South:** each of the three lines must visit both borders. Full line completion is not required. The scorer implements this; the shipped bot's short lookahead can miss a feasible route.
- **Citywide:** company nodes must visit all ten neighborhoods. Lines may be disconnected or unfinished. The scorer counts distinct neighborhood identities correctly; the diagnostic planner explicitly pursues unvisited neighborhoods.
- **Four Corners:** all four exact corners must belong to one connected company network. Visiting corners in separate networks is insufficient. Different lines transfer at shared or orthogonally adjacent nodes; crossing strings alone does not connect them. The scorer follows those rules.

The three existing scoring fixtures passed all 12 checks. Fixtures alone do not prove legal reachability; the recorded games supply that evidence.

## Cost and recommendation

Retained successful examples: North–South finished at **32 VP / $4M**, Citywide at **5 VP / $6M**, and Four Corners at **−45 VP / −$10M**. Four Corners earned its 10 card VP, but the planner left routes unfinished and incurred debt. That demonstrates an expensive strategy, not that every successful strategy must be expensive.

Improve objective planning before changing rules or points. Prioritize Four Corners for a follow-up that also optimizes route completion and cash; then compare targeted and ordinary bots on fresh matched seeds. Citywide needs a larger sample, while North–South has strong feasibility evidence. There is no basis here to call any card impossible, balanced, or reliably above 50%.

Full observations: [results.json](results.json). Reproducibility and source provenance: [REPRODUCE.md](REPRODUCE.md), [manifest.json](manifest.json). No production game changes were made.
