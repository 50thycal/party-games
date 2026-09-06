# Review Summary — <feature name>

<!-- Owner-facing. Must be understandable without reading the PR. No file names, no
     function names, no diffs. Findings from the code, not from the handoff. -->

**PR:** <link> · **Workstream:** WS-### · **Build Card:** <link> · **Reviewer:** <name> · **Date:** YYYY-MM-DD

## Verdict

**Verdict:** <Not started | In review | Changes required | Approved | Approved with follow-ups | Owner-accepted>
**Reviewed head:** <full 40-character commit SHA, or —>
**Reviewed PR:** #<n>
**Head current at publication:** <yes | no — PR is now at abc1234...>

<!--
The reviewed head is the exact commit this verdict was reached against. A 40-character SHA,
never an abbreviation: a prefix cannot prove which commit was reviewed.

An approval with no reviewed head does not open the merge gate — treat it as `In review`.

If the PR has moved since, the approval is stale: say so above, and the new head needs
reviewing.

A change limited to the finalization surfaces may be verified against the final head instead of
re-reviewed in full. Record that verification by approving on the PR itself, after the
finalization commit exists — the review carries the commit id, and that is the only final-head
record that is not self-referential. A summary written before that commit cannot name it.

If GitHub will not let you file that review — it refuses one on a pull request your own account
authored, which is every PR in a single-account repository — post it as a comment instead, in
the form the protocol reads:

    Build OS review verdict: Approved
    Reviewed head: <full 40-character SHA>
    Review actor: <stable identifier for you, not the account you post from>
    Implementation actor reviewed: <who the PR says implemented it, as you see it now>

Same standing as a review, same requirement to name the commit. The actor is required and is
what distinguishes you from the account carrying the comment — in a single-account repository
several actors share one login, and without it the record cannot say who spoke.

Record the implementation actor here too, copied from the PR's handoff. Both names travel
inside your verdict so that a later edit to the PR body cannot change whether your review was
independent.

**Do not edit this comment afterwards.** An edited verdict cannot clear the gate, because an
approval could have been written after the fact. Corrections and retractions go in a *new*
comment, which keeps the history instead of replacing it.

It clears the independent-review gate only when the two actors differ. It records that a verdict
was given; it does not prove independence.

This verdict is about one PR. Name it above; it says nothing about the workstream's other PRs.

A finding only the owner can settle is `Changes required`, with the question under
*Decisions requiring owner attention* below.

`Owner-accepted` is not a reviewer's verdict and does not belong in a review summary written by
a reviewer — it is what the OWNER records in a `solo` project, where no independent actor
exists, against the head they merge. It names `Accepted head`, never `Reviewed head`, and it is
never an approval. If you are reviewing, you are not in that case.
-->

## What actually changed

<The reviewer's independent account, from the perspective of someone using the system.>

## Match to intended design

<Does the built behavior match the Build Card? Where it diverges, what and how much it
matters.>

## Issues found

<!-- Most severe first. Describe the consequence, not the mechanism.
     Severity: Blocking · Should fix · Consider · Note -->

| Severity | Issue | Consequence |
|---|---|---|
|  |  |  |

## Architecture implications

<What this means for the shape of the system going forward. Debt taken, flexibility gained
or lost, what will make the next change harder.>

## Decisions requiring owner attention

<!-- Each with options and a recommendation. `None` if there are none. -->

None

## Recommended next action

<One clear instruction. Where this belongs to a workstream, say what happens to it: does
this PR complete it, or does it return to BUILDING with the findings above?>

<!-- "Merge" is never the reviewer's own next action. The reviewer approves; the owner or an
     authorized merger merges, targeting the exact reviewed head, after the documentation-only
     merge-finalization commit. -->

---

<details>
<summary>Verification trace (for the implementation agent)</summary>

<!-- Optional. Where each owner decision and acceptance criterion was verified in code. -->

| Item | Verified at | Result |
|---|---|---|
| OD-1 |  |  |
| AC-1 |  |  |

</details>
