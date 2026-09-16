# JNCG playtest review

## Evidence and validation

Human versus human multiplayer; exported rules/state version 21. The owner describes this as Calvin versus Zoe; the exported first company is Diapie Change Express. Exact running build and rules hash are absent. The current repository head at intake was fc5bc3bd915bfb26e680250b61107ae0f6601491, not a verified deployment identity.

Original export preserved byte-for-byte under its SHA-256 directory. Parsed all 69 accepted actions; consecutive player before/after snapshots agree. There are 33 and 34 human gameplay actions plus host start/scoring actions; no recorded bot actions. Legacy Markdown lacks deterministic replay tapes: reference-only, replay unavailable, not a calibration baseline. Rejected attempts, screen appearance, highlights and player intentions cannot be verified from this file.

## Results and economy

Game start to construction end: 25m54s; ended at round 9 (ROUND_LIMIT). Zoe wins 38–16. Scores sum correctly from reported sources.

| Metric | Diapie Change Express | Zoe |
| --- | ---: | ---: |
| Route purchase spend | $24M | $22M |
| Crew spend | $20M | $21M |
| Tolls paid / received | $3M / $6M | $6M / $3M |
| Completion income | $6M | $9M |
| Final cash | $5M | $3M |
| Completed routes | 2/3 | 3/3 |
| Engineering VP | 7 | 7 |
| Destination VP | 4 | 11 |
| Net route VP | 5 | 15 |
| Longest-network VP | 0 | 5 |

Cash reconciles: Diapie 40-24-20-3+6+6=5; Zoe 40-22-21-6+3+9=3. Neither bought surveys or an extra destination. All nine recorded toll increments are $1M and go to the opponent. This validates bookkeeping, not an independent geometry/toll audit.

The 22-point gap consists of 10 route VP, 7 destination VP and 5 public-award VP; Engineering totals were equal. Do not attribute the loss solely to Engineering difficulty.

## Behavior and interpretation

Zoe built Yellow in rounds 1–4, Gray in 1–6 and Black in 5–9. Her three adjacent northern starters already permit company transfers under the stated rules. Diapie used three crews in round 1, prioritized Brown and White, then returned to Green; Green built only in rounds 1, 4, 8 and 9, leaving two segments unfinished. Ask whether this was intentional scheduling or misunderstood remaining work; the log cannot establish motive or counterfactual legal routes.

Both companies spent similar crew money for 14 versus 15 built segments. Diapie's Museum–Garden–University mission visited all three but failed the single-connected-network requirement. Zoe completed both destinations and Integrated Network, but missed On Budget by $2M. Neither player's full-tier Engineering completion tells the whole story: Diapie earned 2 VP from Loop and 5 VP from Four Corners.

Zero survey use supports considering removal alongside owner feedback, but one game does not establish universal uselessness. The label confusion is an owner observation, not something reproduced from action data. No cluster award appears in this export; resolve intended rules versus running build before evaluating it.

## Follow-up questions and reporting issues

- Was Green intentionally deferred, or was its remaining work/round deadline unclear?
- Did the UI show Museum–Garden–University as disconnected during play?
- A screenshot of the Harbor Exchange/Theatre confusion would help distinguish wrong names from misplaced labels/highlights; absence does not block planning.
- Green is correctly listed as 4/6 segments in the route table, but as 5/7 in the score row (apparently nodes versus segments). Standardize units later.
- Partial-tier cards show Met: No despite earning VP. Prefer Partial / Complete / Not met later.

## Scope

Only this evidence archive and index are published. Owner feedback is in observations.md. No gameplay, UI, scoring, bots or configuration changed; no deployment was requested. Survey removal and other rules remain planning discussions. Proposed first-item scope: remove surveys and Surveyed System without a replacement mechanic or cash rebalance; preserve starter pegs and ordinary station nodes. This recommendation is not an implementation authorization.
