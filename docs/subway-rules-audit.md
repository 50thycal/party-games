# Subway rules-vs-code audit

**Date:** 2026-09-25 · **Code audited:** `main` at `4fe5c3f` (state v30) · **Scope:** Subway only.

The reducer (`src/games/subway/config.ts`, `bends.ts`, `engineering.ts`, `network.ts`,
`clusters.ts`) is the source of truth for what the game does. Every player-facing surface was
checked against it:

| Surface | File |
|---|---|
| Full rulebook (§1–3 owner-approved 2026-09-23, rest draft) | `src/games/subway/RULEBOOK.md` |
| Rules reference (draft) | `src/games/subway/RULES.md` |
| Quick start (draft) | `src/games/subway/QUICK_START.md` |
| Practice tutorial, 12 lessons | `src/games/subway/tutorial.ts` |
| Host walkthrough slides | `src/games/subway/Intro.tsx` |
| Setup, crew, card and lobby copy | `BendModeSelect.tsx`, `SegmentLengthSelect.tsx`, `terminology.ts`, `CrewBoard.tsx`, `GameView.tsx`, `table.tsx`, `CardArt.tsx`, `engineering.ts` card text |
| Terminology audit | `src/games/subway/TERMINOLOGY.md` |

## What already agrees

These were checked and match the code on every surface that states them: $40M start;
3n+1 contract pool with n face-up; 3 lines each; 21 unique Engineering cards, two face-up;
crew bills 0/1/3/6; borrowing on crews and tolls; $3M completion cash; ±0.5 tolerance and
Euclidean length; 90° curve cap; one peg per hole; self-crossing ban; overlap ban; $1M per
distinct contact per owner, free station joins; bend tokens (3 each, $3M extra, cash only);
delayed-mode one bend per segment; 4/7 VP Destinations and the 30-card deck distribution;
all 21 Engineering card requirements and VP; Longest Network 5 / 3-tied; Largest Transfer
Station 6/3/2/0; ending-cash bands; tie-breaks; extensions ($1M, 1–2 spaces, straight, once
per turn, after all three lines); nine-round cap and early end.

## Gap register

Severity: **High** = a player following the text makes a wrong decision or wrong score;
**Medium** = material omission or contradiction a player would notice; **Low** = wording or
internal hygiene. Disposition uses Build OS v0.12: FIX NOW, OWNER DECISION, PARK, DISCARD.

### A. Player-facing rules gaps

| ID | Sev | Gap | Code truth | Where the text is wrong | Recommended disposition |
|---|---|---|---|---|---|
| G1 | High | **Destination cash reward missing.** Connecting a held Destination pays $2M (pair) / $3M (triple) once; Undo reverses it (DEC-056). | `config.ts:53`, `payConnectedDestinations` | Absent from RULEBOOK §8 and QUICK_START §6. Present in RULES, tutorial, intro. | FIX NOW — add to RULEBOOK §8 and QUICK_START §6. |
| G2 | High | **"Peg space" defined as one step, diagonal included.** Approved RULEBOOK §2 says a peg space is "the distance from one peg to the next neighboring peg, either orthogonally or diagonally", which reads as Chebyshev counting. The code measures straight-line (Euclidean) distance: a diagonal step is ≈1.41; two diagonal steps are ≈2.83 and fail a length-2 segment. DEC on ordered recipes explicitly rejected Chebyshev/Manhattan. RULEBOOK §5 then says the opposite ("measure straight-line distance… rather than adding steps"). | `lengthMatches`, `validatePath` (`bends.ts`) | RULEBOOK §2 (approved text) | OWNER DECISION — reword §2 to Euclidean (recommended), or change the geometry. |
| G3 | Medium | **"Peg" vs "hole" swapped in approved §2.** §2 calls a board location a *peg* ("the board is a grid of pegs"; "each peg can hold only one station"). Everywhere else, including TERMINOLOGY.md and the UI, a *hole* is a location and a *peg* is a placed station ("one peg per hole"). | — | RULEBOOK §2, and §3 "empty peg along one of the four outer borders" | OWNER DECISION — fold into the G2 rewording. |
| G4 | Medium | **Held cards are public on the iPad, docs say private.** DEC-056 made every company's Engineering and Destination card ids public on the iPad player pads (glyphs plus live met/unmet state). | `companion.ts:84-90`, `PlayerStatus.tsx:75-77` | RULEBOOK §8 "Cards remain private until results", RULES "Missions stay private until results", tutorial lesson 6 "Goals remain private until results", `table.tsx:1098` "private until results" | OWNER DECISION — align text to DEC-056 (recommended) or restore privacy in the tablet projection. |
| G5 | Medium | **Flexible segment-length mode undocumented.** Host setup offers "Flexible length" (1 up to printed length + 0.5), DEC-059. | `START_GAME`, `validatePath`, `SegmentLengthSelect.tsx` | Only the intro slide mentions it. RULEBOOK §5, RULES and QUICK_START state exact length unconditionally. | OWNER DECISION — document as an optional variant beside bend modes (recommended), or remove the option. |
| G6 | Medium | **Extensions change the early-end condition, older text does not.** Play continues while any company can extend. | `constructionExhausted` → `hasLegalMove` includes extensions | RULES "Game flow" item 5 and "Construction rounds" ("no incomplete line has a legal next segment"); QUICK_START §7 ("no player has a legal next segment") | FIX NOW — add "or paid extension", as RULEBOOK §12 already says. |
| G7 | Medium | **Extensions absent from QUICK_START and tutorial.** A company that finishes early has a new action (DEC-062). | `HIRE_CREWS`/`BUILD` extension path | QUICK_START (no mention), tutorial (no lesson or line) | FIX NOW for QUICK_START (one short section). PARK the tutorial lesson (needs a practice state). |
| G8 | Medium | **Intro says Destinations are drafted.** Slide 3: "Draft three Engineering goals and two Destinations." They are dealt at start: one pair and one triple. | `START_GAME` deals | `Intro.tsx:14` | FIX NOW. |
| G9 | Low | **Starting Destination split omitted.** RULEBOOK §3 says "two Destination missions" without saying one pair and one triple. | `START_GAME` | RULEBOOK §3 (approved) | OWNER DECISION (approved text) — suggest adding "one two-neighborhood and one three-neighborhood". |
| G10 | Low | **"Three cards" scored.** Scoring counts the whole hand, so a bought Engineering goal makes four. | `scoreGame` | RULEBOOK §9 "each of your three cards"; RULES "All three drafted goals" | FIX NOW — "each Engineering card you hold". |
| G11 | Low | **Lobby says "a pool of thirteen services".** The pool is 7/10/13 cards drawn from 13. | `START_GAME` slice | `GameView.tsx:756` | FIX NOW. |
| G12 | Low | **"Areas may touch boundaries".** The layout never places a neighborhood on the outer border (x 1–25, y 1–7), so no starter can be in a neighborhood and border rows are always clear. | `randomStationLayout` | RULES placement section | FIX NOW — say neighborhoods may touch each other, never the border. |
| G13 | Low | **Delayed stop minimum reads as a full space.** "A stop must leave at least one space available" includes the +0.5 tolerance; the nominal remainder can be 0.5. Correct but opaque. | `validatePath` pause check | RULEBOOK §5, RULES | DISCARD — correct as written; the UI enforces it. |
| G14 | Low | **Stale TERMINOLOGY row.** "Transfer access: $1M once per line, opponent and station, including starter joins." Joins have been free since DEC-060. | `stationAccessContacts` returns `[]` | `TERMINOLOGY.md:30` (and "separately from transfer access" in the next row) | FIX NOW. |
| G15 | Low | **Sentence fragment in approved §1.** "You may go into debt during construction. To finish your lines." | — | RULEBOOK §1 | OWNER DECISION (approved text) — trivial rejoin. |

### B. Knob (configuration) gaps

These do not mislead players today, but they are why the text drifts: numbers live in several
places, and some knobs don't actually control the game.

| ID | Sev | Gap | Evidence | Recommended disposition |
|---|---|---|---|---|
| K1 | Medium | **One knob prices two cards.** The Engineering purchase uses `destinationPurchaseCost`, so tuning the Destination price silently re-prices Engineering. (DEC-056 once had them at different prices.) | `config.ts:1771`, `report.ts:113` | FIX NOW — add `engineeringPurchaseCost: 3`; no behavior change. |
| K2 | Medium | **Rule numbers hard-coded outside `SUBWAY_CONFIG`.** Bend tokens (3) and token price ($3M); extension fee ($1M) and reach (2); Longest Network 5/3 VP; Largest Transfer 6 VP; lines per company (3) in draft, pool and extension checks; face-up Engineering row (2); board size 27×9 in `bends.ts`, `engineering.ts` and `network.ts`. | `config.ts:1478,1701,1714,1729,1860,1298`; `bends.ts:10-13,73`; `clusters.ts:30`; `engineering.ts:87-93` | PARK as one refactor: move to `SUBWAY_CONFIG`, behavior-neutral. Do it only if balance tuning is coming. |
| K3 | Low | **Dead or duplicated knobs.** `crewCostPerOverlapPeriod`, `mobilizationTiers`, `tolerances`, `stationScores`, `destinationRow`, `destinationsPerPlayer`, `minContractsPerPlayer`/`maxContractsPerPlayer` (the reducer hard-codes 3). The debt rate is defined twice: `contact.debtVpPerMillion` (used) and `cashBands[-1].vp` (display only). DEC-057 still says `debtVpPerMillion` is "only for archived reports"; since DEC-060 it is the live rate. | `config.ts:41-117` | PARK — prune with K2; mark the retired schedule knobs as legacy. |
| K4 | Medium | **No test ties text to config.** Rulebook, quick start, rules reference, tutorial and intro hard-code every number, and nothing checks them against `SUBWAY_CONFIG`. G1, G6, G8 and G14 are all drift of this kind. | No script reads the `.md` files | FIX NOW — add a small rules-consistency check to `test-subway.sh` that asserts the key numbers (start cash, crew bills, rewards, VP, bands, tokens, extension fee) appear correctly in each surface. |

## Owner rulings — 2026-09-25

| ID | Ruling | Result in this PR |
|---|---|---|
| G4 | The iPad shows only the current company's cards; everyone else's stay hidden until results. | Code: the tablet projection and `PlayerPads` carry only the current company's cards; text updated everywhere. DEC-063. |
| G5 | Exact length only; no shortened segments; bends remain. | Code: setup selector removed, START_GAME rejects `flexible`; intro slide updated. DEC-063. |
| Scope | Docs + drift test + K1. | Done: all FIX NOW items, `engineeringPurchaseCost`, `scripts/subway-docs-test.ts` in `test-subway.sh`. |
| G2, G3 | **Open.** The owner asked how distance is measured and whether a diagonal step equals one orthogonal step. | Approved §1–3 left untouched pending the ruling; G9 and G15 wait with them. |

## Status after this PR

Fixed: G1, G4, G5, G6, G7 (quick start and a tutorial line; no new practice lesson),
G8, G10, G11, G12, G14, K1, K4. Discarded: G13. Open for the owner: G2, G3, G9, G15.
Parked: K2, K3.

## Recommended path (as originally proposed)

1. **Owner rulings:** G2/G3 (approved §2 wording), G4 (card privacy), G5 (flexible length),
   G9/G15 (approved-text touch-ups).
2. **One docs-and-copy PR** for every FIX NOW item plus the owner's rulings: G1, G6–G8,
   G10–G12, G14, K1, K4. Markdown and copy changes leave the rules fingerprint alone
   (`recording.ts` hashes config and card data only). K1 adds a config key, so it changes the
   fingerprint but not behavior. No state-version bump is needed unless G4 or G5 is ruled
   toward changing code.
3. **Parked:** tutorial extension lesson (G7), knob consolidation (K2, K3).
