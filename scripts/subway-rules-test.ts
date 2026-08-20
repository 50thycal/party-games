import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import {
  SUBWAY_CONFIG,
  actionsRemaining,
  buildableLines,
  hasLegalMove,
  objectiveMet,
  snakeOrder,
  subwayGame,
  validateNode,
  type SubwayAction,
  type SubwayPlayer,
  type SubwayState,
} from "../src/games/subway/config";

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

const players: Player[] = [
  { id: "red", name: "Red", role: "host" },
  { id: "blue", name: "Blue", role: "player" },
];
const room: Room = { roomCode: "TEST", gameId: "subway", hostId: "red", players, createdAt: 0, mode: "simulation" };
const context = (playerId: string): GameContext => ({ room, playerId, now: () => 1, random: () => 0 });

const dispatch = (s: SubwayState, playerId: string, type: SubwayAction["type"], payload?: SubwayAction["payload"]) =>
  subwayGame.reducer(s, { type, playerId, payload }, context(playerId));

const base = () => subwayGame.initialState(players);

/** Both companies commit for a period; returns the state after the reveal. */
const commitBoth = (
  s: SubwayState,
  red: SubwayAction["payload"],
  blue: SubwayAction["payload"]
): SubwayState => dispatch(dispatch(s, "red", "COMMIT_PERIOD", red), "blue", "COMMIT_PERIOD", blue);

// ----------------------------------------------------------------------------
// Draft order
// ----------------------------------------------------------------------------
{
  assert.deepEqual(
    snakeOrder(["a", "b"], 6),
    ["a", "b", "b", "a", "a", "b"],
    "the draft snakes so neither seat hoards the openers"
  );
  assert.equal(
    snakeOrder(["a", "b"], 6).length,
    4 + SUBWAY_CONFIG.extraProcurementPicks,
    "picks total = contracts on offer + 2, i.e. three each in a two-player game"
  );
}

// ----------------------------------------------------------------------------
// Placement validation: spacing, stations, strings, crossings
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.lines = [{ contractId: "short", route: [] }];
  s.players.blue.lines = [{ contractId: "short", route: [{ x: 4, y: 4, stationId: "garden", stationSlot: 0 }, { x: 4, y: 6 }] }];
  assert.match(validateNode(s, "red", 0, { x: 5, y: 5 }) ?? "", /empty hole/, "opposing normal nodes enforce spacing");
  assert.equal(validateNode(s, "red", 0, { x: 6, y: 5 }), null, "spacing stops one hole away (no walls)");
  assert.equal(validateNode(s, "red", 0, { x: 5, y: 4 }), null, "station nodes do not project spacing");
  assert.match(validateNode(s, "red", 0, { x: 2, y: 2 }, true) ?? "", /normal hole/, "starters cannot use stations");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 6 }) ?? "", /occupied/, "normal pegs are never shared");
}
{
  const s = base();
  s.players.red.lines = [{ contractId: "short", route: [{ x: 0, y: 3 }] }];
  s.players.blue.lines = [{ contractId: "short", route: [{ x: 2, y: 1 }, { x: 2, y: 5 }] }];
  assert.match(validateNode(s, "red", 0, { x: 2, y: 3 }) ?? "", /existing line/, "a peg cannot sit on a string");

  const t = base();
  t.players.red.lines = [{ contractId: "short", route: [{ x: 0, y: 3 }] }];
  t.players.blue.lines = [{ contractId: "short", route: [{ x: 2, y: 3 }] }];
  assert.match(validateNode(t, "red", 0, { x: 4, y: 3 }) ?? "", /occupied peg/, "a string cannot run through an occupied peg");
}
{
  const s = base();
  s.players.red.lines = [{ contractId: "short", route: [{ x: 0, y: 3 }] }];
  s.players.blue.lines = [{ contractId: "short", route: [{ x: 2, y: 1 }, { x: 2, y: 4 }] }];
  s.players.red.committedEngineering = [];
  assert.match(validateNode(s, "red", 0, { x: 4, y: 3 }) ?? "", /Crossing Design/, "crossing is illegal without the permit");
  s.players.red.committedEngineering = ["crossing"];
  assert.equal(validateNode(s, "red", 0, { x: 4, y: 3 }), null, "Crossing Design permits one crossing");
  s.players.red.crossingsUsed = 1;
  assert.match(validateNode(s, "red", 0, { x: 4, y: 3 }) ?? "", /only one/, "the permitted crossing is single-use");
}
{
  const s = base();
  s.players.red.lines = [{ contractId: "medium", route: [{ x: 0, y: 2 }] }];
  s.players.red.committedEngineering = ["crossing"];
  s.players.blue.lines = [
    { contractId: "medium", route: [{ x: 2, y: 1 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 1 }] },
  ];
  assert.match(validateNode(s, "red", 0, { x: 6, y: 2 }) ?? "", /only one/, "one segment cannot cross twice");
}
{
  // A company's own two lines may run alongside each other but never cross.
  const s = base();
  s.players.red.lines = [
    { contractId: "short", route: [{ x: 0, y: 0 }] },
    { contractId: "medium", route: [{ x: 0, y: 4 }, { x: 4, y: 0 }] },
  ];
  s.players.red.committedEngineering = ["crossing"];
  assert.match(validateNode(s, "red", 0, { x: 4, y: 4 }) ?? "", /own lines cannot cross/, "self-crossing is always illegal");
  assert.equal(validateNode(s, "red", 0, { x: 1, y: 1 }), null, "your own lines may run close together");
}

// ----------------------------------------------------------------------------
// Stations are docks: one slot per line connection, up to capacity
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.lines = [
    { contractId: "short", route: [{ x: 2, y: 4 }, { x: 4, y: 4, stationId: "garden", stationSlot: 0 }] },
  ];
  s.players.blue.lines = [{ contractId: "short", route: [{ x: 6, y: 4 }] }];
  assert.equal(validateNode(s, "blue", 0, { x: 4, y: 4 }), null, "a second company can dock while capacity is free");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 4 }) ?? "", /already connects/, "one line docks a station once");

  // Both of one company's lines may take the two slots, locking the rival out.
  s.players.red.lines.push({
    contractId: "medium",
    route: [{ x: 4, y: 2 }, { x: 4, y: 4, stationId: "garden", stationSlot: 1 }],
  });
  assert.match(validateNode(s, "blue", 0, { x: 4, y: 4 }) ?? "", /capacity/, "a full station rejects further connections");
}

// ----------------------------------------------------------------------------
// Blocked lines and action accounting
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.lines = [{ contractId: "short", route: [{ x: 0, y: 0 }] }];
  s.players.red.committedEngineering = [];
  s.players.blue.lines = [{ contractId: "short", route: [{ x: 0, y: 2 }, { x: 2, y: 0 }] }];
  assert.equal(hasLegalMove(s, "red", 0), false, "a cornered line has no legal moves");
  assert.deepEqual(buildableLines(s, "red"), [], "a cornered company cannot commit to build");
  assert.equal(hasLegalMove(s, "blue", 0), true, "the opposing line still has moves");
}
{
  const p = base().players.red;
  p.lines = [
    { contractId: "short", route: [{ x: 0, y: 0 }] }, // 5 nodes → 4 actions owed
    { contractId: "medium", route: [{ x: 8, y: 8 }, { x: 8, y: 6 }] }, // 7 nodes → 5 owed
  ];
  assert.equal(actionsRemaining(p), 9, "the starter peg is free, the rest are owed");
  p.lines = [{ contractId: "short", route: [] }];
  assert.equal(actionsRemaining(p), 4, "an unstarted line still owes only its construction actions");
}

// ----------------------------------------------------------------------------
// Engineering objectives read across both contracted lines
// ----------------------------------------------------------------------------
{
  const s = base();
  const red = s.players.red;
  red.lines = [
    { contractId: "short", route: [{ x: 0, y: 0 }, { x: 1, y: 2 }] },
    { contractId: "medium", route: [{ x: 8, y: 0 }, { x: 8, y: 3 }] }, // one 3-peg segment
  ];
  assert.equal(objectiveMet("long-segment", red, []), true, "an objective may be satisfied by either line");
  assert.equal(objectiveMet("minimal", red, []), false, "Minimal Footprint needs every contract finished");
  red.lines = [
    { contractId: "short", route: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }] },
  ];
  assert.equal(objectiveMet("minimal", red, []), true, "Minimal Footprint scores when the portfolio is delivered");
}

// ----------------------------------------------------------------------------
// Full game: draft → engineering → starters → per-period commit/reveal → score
// ----------------------------------------------------------------------------
{
  let s = base();
  s = dispatch(s, "red", "START_GAME");
  assert.equal(s.phase, "PROCUREMENT", "the host starts the game");
  assert.equal(s.priorityPlayerId, "red", "priority is assigned at start (random()=0 → seat 1)");
  assert.deepEqual(
    s.procurementOrder,
    ["blue", "red", "red", "blue", "blue", "red"],
    "the company without Priority 1 drafts first, then the snake runs"
  );

  assert.equal(dispatch(s, "red", "PROCURE", { choice: "contract", contractId: "medium" }), s, "the draft is turn-ordered");
  s = dispatch(s, "blue", "PROCURE", { choice: "contract", contractId: "medium" }); // $8M
  assert.equal(s.players.blue.money, SUBWAY_CONFIG.startingMoney - 8, "the contract cost is paid");
  assert.equal(s.contractMarket.includes("medium"), false, "a signed contract leaves the market");
  assert.equal(
    dispatch(s, "red", "PROCURE", { choice: "contract", contractId: "medium" }),
    s,
    "a contract cannot be signed twice"
  );

  s = dispatch(s, "red", "PROCURE", { choice: "contract", contractId: "short" }); // $6M
  s = dispatch(s, "red", "PROCURE", { choice: "construction" });
  s = dispatch(s, "blue", "PROCURE", { choice: "engineering" });
  s = dispatch(s, "blue", "PROCURE", { choice: "scheduling" });
  assert.equal(s.players.blue.lines.length, 1, "blue drafted one line and two cards");
  assert.equal(s.players.red.lines.length, 1, "red has one line and one pick left");

  s = dispatch(s, "red", "PROCURE", { choice: "pass" });
  assert.equal(s.phase, "ENGINEERING", "the draft ends after every pick is spent");

  s = dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["straight", "long-segment", "terminal"] });
  assert.deepEqual(s.players.red.engineeringHand, ["bend", "crossing"], "committed cards leave the hand");
  s = dispatch(s, "blue", "COMMIT_ENGINEERING", { cardIds: ["straight", "terminal", "bend"] });
  assert.equal(s.phase, "STARTER_PLACEMENT", "both commits advance to starter placement");

  assert.equal(dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 2, y: 2 }), s, "starters cannot use stations");
  s = dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 0, y: 1 });
  assert.equal(s.phase, "STARTER_PLACEMENT", "placement waits for every contracted line");
  s = dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 2, y: 5 });
  assert.equal(s.phase, "CONSTRUCTION", "construction opens once all starters are down");
  assert.equal(s.periodStep, "COMMIT", "each period opens with a secret commitment");
  assert.equal(s.currentPeriod, 1, "construction starts at period 1");

  // Period 1 — both build; Priority 1 (red) resolves first.
  s = dispatch(s, "red", "COMMIT_PERIOD", { lineIndex: 0 });
  assert.equal(s.periodStep, "COMMIT", "the reveal waits for both commitments");
  assert.equal(s.players.blue.commitment, undefined, "the opponent's commitment is still open");
  assert.equal(dispatch(s, "red", "BUILD", { lineIndex: 0, x: 1, y: 1 }), s, "nobody builds before the reveal");
  s = dispatch(s, "blue", "COMMIT_PERIOD", { lineIndex: 0 });
  assert.equal(s.periodStep, "RESOLVE", "both commitments reveal together");
  assert.deepEqual(s.resolveQueue, ["red", "blue"], "Priority 1 builds first in a shared period");

  assert.equal(dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 2, y: 6 }), s, "building out of order is rejected");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 3, y: 1 });
  assert.deepEqual(s.resolveQueue, ["blue"], "one node ends a plain committed action");
  s = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 2, y: 6 });
  assert.equal(s.currentPeriod, 2, "the period advances once everyone has built");
  assert.equal(s.periodStep, "COMMIT", "the next period opens for commitment");

  // Period 2 — red plays Overtime for a second node; blue passes.
  s = commitBoth(s, { lineIndex: 0 }, { pass: true });
  assert.deepEqual(s.resolveQueue, ["red"], "a passing company is not in the build order");
  s = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "overtime" });
  assert.deepEqual(s.players.red.pendingActions, [0, 0], "Overtime queues a second node on the same line");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 4, y: 1 });
  assert.equal(s.resolveQueue[0], "red", "the extra node resolves immediately");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 5, y: 1 });
  assert.equal(s.currentPeriod, 3, "the period ends when the queue drains");

  // Period 3 — blue plays Priority Permit and seizes the build order.
  s = commitBoth(s, { lineIndex: 0 }, { lineIndex: 0 });
  assert.deepEqual(s.resolveQueue, ["red", "blue"], "red still holds Priority 1");
  s = dispatch(s, "blue", "PLAY_SCHEDULING_CARD", { cardId: "priority" });
  assert.equal(s.priorityPlayerId, "blue", "Priority Permit transfers Priority 1");
  assert.deepEqual(s.resolveQueue, ["blue", "red"], "the remaining build order re-sorts immediately");
  s = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 2, y: 7 });
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 6, y: 1 }); // docks Museum, completing the Short Line
  assert.equal(s.players.red.lines[0].route[4].stationId, "museum", "a node placed on a station docks into it");
  assert.equal(s.players.red.lines[0].route[4].stationSlot, 0, "the first connection takes the first slot");

  // Periods 4-7 — red is finished, so only blue is asked to commit.
  for (const step of [{ x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }]) {
    assert.deepEqual(s.players.red.commitment, { kind: "pass" }, "a finished company auto-passes");
    assert.equal(dispatch(s, "red", "COMMIT_PERIOD", { pass: true }), s, "and cannot commit again");
    s = dispatch(s, "blue", "COMMIT_PERIOD", { lineIndex: 0 });
    assert.equal(s.periodStep, "RESOLVE", "one live company is enough to reveal");
    s = dispatch(s, "blue", "BUILD", { lineIndex: 0, ...step });
  }
  assert.equal(s.phase, "SCORING", "construction ends the moment every contract is delivered");
  assert.ok(s.currentPeriod <= SUBWAY_CONFIG.timelinePeriods, "and it ended inside the timeline");

  assert.equal(dispatch(s, "blue", "ADVANCE_SCORING"), s, "only the host reveals scoring");
  s = dispatch(s, "red", "ADVANCE_SCORING");
  assert.equal(s.phase, "RESULTS", "scoring advances to results");

  const scored = (p: SubwayPlayer) => (p.scoreBreakdown ?? []).filter((i) => i.met !== false).map((i) => i.label);
  assert.deepEqual(
    scored(s.players.red).sort(),
    ["Long Segment", "Museum connection", "Short Line completed", "Straightaway", "Terminal Approach"].sort(),
    "red scores its station, completion, and met objectives"
  );
  assert.equal(s.players.red.score, 2 + 4 + 4 + 3 + 4, "red totals 17");
  assert.deepEqual(
    scored(s.players.blue).sort(),
    ["Medium Line completed", "Straightaway"].sort(),
    "blue completes its line but misses the objectives it cannot reach"
  );
  assert.equal(s.players.blue.score, 6 + 4, "an unmet objective scores zero rather than a penalty");
  assert.deepEqual(s.winnerIds, ["red"], "the higher score wins");
}

// ----------------------------------------------------------------------------
// Two contracts: Extra Crew crosses lines, Early Mobilization rewrites a commit
// ----------------------------------------------------------------------------
{
  const twoLineState = (): SubwayState => {
    const s = base();
    s.phase = "CONSTRUCTION";
    s.periodStep = "COMMIT";
    s.currentPeriod = 1;
    s.priorityPlayerId = "red";
    s.players.red.lines = [
      { contractId: "short", route: [{ x: 0, y: 0 }] },
      { contractId: "medium", route: [{ x: 0, y: 8 }] },
    ];
    s.players.blue.lines = [{ contractId: "short", route: [{ x: 8, y: 8 }] }];
    // Expedite Materials is draft-only, so hand it over for these checks.
    s.players.red.constructionHand = ["overtime", "crew", "expedite"];
    return s;
  };

  // Extra Crew's bonus node may switch to the other contract; Overtime's cannot.
  let s = commitBoth(twoLineState(), { lineIndex: 0 }, { pass: true });
  s = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "crew" });
  assert.deepEqual(s.players.red.pendingActions, [0, null], "Extra Crew queues an unrestricted node");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 2, y: 0 });
  assert.equal(
    dispatch(s, "red", "BUILD", { lineIndex: 1, x: 2, y: 8 }).players.red.lines[1].route.length,
    2,
    "the extra node may go on the other line"
  );

  let t = commitBoth(twoLineState(), { lineIndex: 0 }, { pass: true });
  t = dispatch(t, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "overtime" });
  assert.deepEqual(t.players.red.pendingActions, [0, 0], "Overtime stays on the committed line");
  t = dispatch(t, "red", "BUILD", { lineIndex: 0, x: 2, y: 0 });
  assert.equal(dispatch(t, "red", "BUILD", { lineIndex: 1, x: 2, y: 8 }), t, "Overtime cannot jump to the other line");

  // Early Mobilization rewrites the commitment after the reveal.
  let u = commitBoth(twoLineState(), { lineIndex: 0 }, { pass: true });
  u = dispatch(u, "red", "PLAY_SCHEDULING_CARD", { cardId: "early", lineIndex: 1 });
  assert.deepEqual(u.players.red.commitment, { kind: "build", lineIndex: 1 }, "the commitment switches lines");
  assert.deepEqual(u.players.red.pendingActions, [1], "the queued action follows the new commitment");
  assert.equal(dispatch(u, "red", "BUILD", { lineIndex: 0, x: 2, y: 0 }), u, "the old line can no longer be built");

  // Switching everyone to a pass closes the period out.
  let v = commitBoth(twoLineState(), { lineIndex: 0 }, { pass: true });
  v = dispatch(v, "red", "PLAY_SCHEDULING_CARD", { cardId: "early", pass: true });
  assert.equal(v.currentPeriod, 2, "a period with nobody building advances immediately");
  assert.equal(v.periodStep, "COMMIT", "and reopens for commitment");

  // Float gives up first place deliberately; Expedite Materials seizes it.
  let w = commitBoth(twoLineState(), { lineIndex: 0 }, { lineIndex: 0 });
  assert.deepEqual(w.resolveQueue, ["red", "blue"], "priority sets the default order");
  w = dispatch(w, "red", "PLAY_SCHEDULING_CARD", { cardId: "float" });
  assert.deepEqual(w.resolveQueue, ["blue", "red"], "Float drops you to the back of the period");
  w = dispatch(w, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "expedite" });
  assert.deepEqual(w.resolveQueue, ["red", "blue"], "Expedite Materials takes the front back");
  assert.ok(w.players.red.schedulingHand.includes("early"), "Early Mobilization is still in hand");
  assert.equal(
    dispatch(w, "red", "PLAY_SCHEDULING_CARD", { cardId: "early", pass: true }),
    w,
    "but only one Scheduling card may be played per period"
  );
}

// ----------------------------------------------------------------------------
// A last pick with no contract must be spent on one
// ----------------------------------------------------------------------------
{
  let s = dispatch(base(), "red", "START_GAME");
  s = dispatch(s, "blue", "PROCURE", { choice: "engineering" });
  s = dispatch(s, "red", "PROCURE", { choice: "contract", contractId: "short" });
  s = dispatch(s, "red", "PROCURE", { choice: "pass" });
  s = dispatch(s, "blue", "PROCURE", { choice: "scheduling" });
  // Blue's final pick, still without a contract.
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "pass" }), s, "the last pick cannot be wasted with no contract");
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "engineering" }), s, "nor spent on a card");
  s = dispatch(s, "blue", "PROCURE", { choice: "contract", contractId: "long" });
  assert.equal(s.players.blue.lines.length, 1, "blue leaves the draft with a contract");
}

console.log(
  "Subway rules checks passed (snake draft, contract limits, spacing, station docks, string rules, crossing permits, per-period commit/reveal, priority order, scheduling + construction cards, multi-line objectives, scoring)."
);
