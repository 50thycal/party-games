# Analysis

Owner-supplied bot audit, rules v21, build 2da259aeeec2f582170cb1f8b45ab82723556cec,
bot v2/audit v1, seed 1. Ten trials per card/player count; 46 cards at 2/3/4
players: 1,380 complete matched pairs, 2,760 games. No failed or exhausted pairs.
All 46 synthetic scoring fixture groups pass. Independently checked exact task
coverage and recomputed successes and mean metrics for all 138 cells from pairs.
The supplied file has aggregate outcomes, not action tapes; no replay verification
of this uploaded run is claimed. Archive source is simulation/reference, not human
calibration; original.txt preserves the original JSON bytes without modification.

## Interpretation

The owner's impression that every card is at least 50% complete is not supported
by full-objective completion in this export. Fifteen of 46 cards are below 50%
when pooling targeted outcomes across player counts; 41 of 138 targeted cells
are below 50%. Pooling counts is descriptive; each count has only ten trials.

Engineering normal full completion: 104/480 (21.7%); targeted: 148/480 (30.8%).
Destination normal: 603/900 (67.0%); targeted: 663/900 (73.7%). All 15 two-stop
Destinations have targeted completion at least 50% at each count. Three-stop
Garden–Stadium–Library is 9/30 (30%), Museum–Garden–University 12/30 (40%),
and Market–Theatre–Airport 14/30 (46.7%).

Engineering priorities (targeted full completions, pooled n=30):
- North–South Lines: 0/30; partial points in 7/30.
- Citywide Service: 0/30; no points.
- Four Corners: 0/30; no points, including its lower tier.
- Local Service and Perimeter Service: each 1/30 (3.3%). Perimeter has some
  points in 14/30 despite its rare maximum tier.
- Loop: 2/30 (6.7%); some points in 25/30.
- Three-Way Service: 5/30 (16.7%); some points in all 30 trials.
At the easy end Regional Service is 29/30 (96.7%) and Integrated Network 26/30
(86.7%). Difficulty need not be uniform, but rewards and partial tiers matter.

Targeting Engineering increases full completion but reduces mean total score
from 26.59 to 24.40 and increases mean debt from 0.69M to 1.53M. This is a
descriptive strategy tradeoff, not statistical proof or a reason to tune cash now.
Targeting is not uniformly better, so a low rate may reflect bot planning limits
as well as geometry/economics. Rates are conditional on legal opening acquisition;
they do not measure natural draft frequency or human completion probability.

## Recommendation

Most Destinations look promising, but do not sign off the entire Engineering
deck from these results. Inspect a legal success path (or targeted search) for
the three zero-completion Engineering objectives before altering rewards/rules;
more trials alone cannot repair a bot that cannot plan the objective. Then focus
25–100-trial follow-up on weak cards rather than rerunning everything immediately.
Five successes in ten has an approximate 95% Wilson interval of 24–76%, so a
displayed 50% is a rough signal. Zero observed successes is not impossibility.
No gameplay, bot policy, cash settings or UI changes authorized or made here.
