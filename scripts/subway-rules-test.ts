import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import {
  hasLegalMove,
  legalScheduleStart,
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

// ----------------------------------------------------------------------------
// Schedule block bounds
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.contractId = "medium"; // 6-period block
  assert.equal(legalScheduleStart(s.players.red, 1), true, "a six-period block may start at period 1");
  assert.equal(legalScheduleStart(s.players.red, 5), true, "a six-period block may start at period 5");
  assert.equal(legalScheduleStart(s.players.red, 6), false, "a schedule block may not exceed period 10");
  s.players.red.contractId = "short"; // 4-period block
  assert.equal(legalScheduleStart(s.players.red, 7), true, "a four-period block may start at period 7");
  assert.equal(legalScheduleStart(s.players.red, 8), false, "a four-period block may not exceed period 10");
}

// ----------------------------------------------------------------------------
// Placement validation: spacing, stations, strings, crossings
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.blue.route = [{ x: 4, y: 4, stationId: "garden" }, { x: 4, y: 6 }];
  assert.match(validateNode(s, "red", { x: 5, y: 5 }) ?? "", /empty hole/, "opposing normal nodes enforce spacing");
  assert.equal(validateNode(s, "red", { x: 6, y: 5 }), null, "spacing stops one hole away (no walls)");
  assert.equal(validateNode(s, "red", { x: 5, y: 4 }), null, "station nodes do not project spacing");
  assert.match(validateNode(s, "red", { x: 2, y: 2 }, true) ?? "", /normal hole/, "starters cannot use stations");
  assert.match(validateNode(s, "red", { x: 4, y: 6 }) ?? "", /occupied/, "normal pegs are never shared");
}
{
  // Pegs cannot sit on strings; strings cannot run through occupied pegs.
  const s = base();
  s.players.red.route = [{ x: 0, y: 3 }];
  s.players.blue.route = [{ x: 2, y: 1 }, { x: 2, y: 5 }];
  assert.match(validateNode(s, "red", { x: 2, y: 3 }) ?? "", /existing line/, "a peg cannot sit on a string");

  const t = base();
  t.players.red.route = [{ x: 0, y: 3 }];
  t.players.blue.route = [{ x: 2, y: 3 }];
  assert.match(validateNode(t, "red", { x: 4, y: 3 }) ?? "", /occupied peg/, "a string cannot run through an occupied peg");
}
{
  // Crossing needs the committed permit and allows exactly one crossing.
  const s = base();
  s.players.red.route = [{ x: 0, y: 3 }];
  s.players.blue.route = [{ x: 2, y: 1 }, { x: 2, y: 4 }];
  s.players.red.committedEngineering = [];
  assert.match(validateNode(s, "red", { x: 4, y: 3 }) ?? "", /Crossing Design/, "crossing is illegal without the permit");
  s.players.red.committedEngineering = ["crossing"];
  assert.equal(validateNode(s, "red", { x: 4, y: 3 }), null, "Crossing Design permits one crossing");
  s.players.red.crossingsUsed = 1;
  assert.match(validateNode(s, "red", { x: 4, y: 3 }) ?? "", /only one/, "the permitted crossing is single-use");
}
{
  // A single segment crossing two opposing segments exceeds the permit.
  const s = base();
  s.players.red.route = [{ x: 0, y: 2 }];
  s.players.red.committedEngineering = ["crossing"];
  s.players.blue.route = [{ x: 2, y: 1 }, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 1 }];
  assert.match(validateNode(s, "red", { x: 6, y: 2 }) ?? "", /only one/, "one segment cannot cross twice");
}
{
  // Two strings may not occupy exactly the same path (station-to-station).
  const s = base();
  s.players.red.route = [{ x: 0, y: 2 }, { x: 2, y: 2, stationId: "grand" }, { x: 6, y: 6, stationId: "harbor" }];
  s.players.blue.route = [{ x: 0, y: 4 }, { x: 2, y: 2, stationId: "grand" }];
  assert.match(validateNode(s, "blue", { x: 6, y: 6 }) ?? "", /overlap/, "identical paths are illegal");
}

// ----------------------------------------------------------------------------
// Stations: shared docking up to capacity (regression: stations used to be
// single pegs, so a second company could never connect)
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.route = [{ x: 2, y: 4 }, { x: 4, y: 4, stationId: "garden" }];
  s.players.blue.route = [{ x: 6, y: 4 }];
  assert.equal(validateNode(s, "blue", { x: 4, y: 4 }), null, "a second company can dock a station with free capacity");
  assert.match(validateNode(s, "red", { x: 4, y: 4 }) ?? "", /already connect/, "a company claims a station at most once");

  s.players.blue.route.push({ x: 4, y: 4, stationId: "garden" });
  const green: SubwayPlayer = { ...structuredClone(s.players.red), id: "green", name: "Green", route: [{ x: 4, y: 8 }], committedEngineering: [] };
  s.players.green = green;
  s.playerOrder.push("green");
  assert.match(validateNode(s, "green", { x: 4, y: 4 }) ?? "", /capacity/, "a full station rejects further connections");
}

// ----------------------------------------------------------------------------
// hasLegalMove detects a blocked-in endpoint (pass support)
// ----------------------------------------------------------------------------
{
  const s = base();
  s.players.red.route = [{ x: 0, y: 0 }];
  s.players.red.committedEngineering = [];
  s.players.blue.route = [{ x: 0, y: 2 }, { x: 2, y: 0 }];
  assert.equal(hasLegalMove(s, "red"), false, "a cornered line has no legal moves");
  assert.equal(hasLegalMove(s, "blue"), true, "the opposing line still has moves");
}

// ----------------------------------------------------------------------------
// Construction card edge cases
// ----------------------------------------------------------------------------
{
  // Expedite moves the earliest movable future period one earlier — never the
  // current period, and never stacking onto an existing period.
  const craft = () => {
    const s = base();
    s.phase = "CONSTRUCTION";
    s.currentPeriod = 3;
    s.constructionQueue = ["red"];
    s.players.red.contractId = "medium";
    s.players.red.route = [{ x: 0, y: 0 }];
    s.players.red.constructionHand = ["expedite"];
    return s;
  };
  let s = craft();
  s.players.red.schedulePeriods = [3, 4, 5];
  assert.equal(dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "expedite" }), s, "expedite with no movable period is rejected");
  s = craft();
  s.players.red.schedulePeriods = [3, 5, 6];
  const next = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "expedite" });
  assert.deepEqual(next.players.red.schedulePeriods, [3, 4, 6], "expedite moves period 5 to period 4");
  assert.deepEqual(next.players.red.constructionHand, [], "expedite is consumed");
}
{
  // Playing one copy of a duplicated card removes exactly one copy.
  const s = base();
  s.phase = "SCHEDULING_RESOLUTION";
  s.players.red.contractId = "short";
  s.players.red.scheduleStart = 2;
  s.players.red.schedulingHand = ["float", "float"];
  const next = dispatch(s, "red", "PLAY_SCHEDULING_CARD", { cardId: "float", direction: -1 });
  assert.deepEqual(next.players.red.schedulingHand, ["float"], "duplicates are removed one at a time");
  assert.equal(next.players.red.scheduleStart, 1, "float shifted the block earlier");
}
{
  // Passing frees a blocked player and lets the game finish.
  const s = base();
  s.phase = "CONSTRUCTION";
  s.currentPeriod = 2;
  s.constructionQueue = ["red", "blue"];
  s.players.red.contractId = "short";
  s.players.blue.contractId = "short";
  s.players.red.schedulePeriods = [2];
  s.players.blue.schedulePeriods = [2];
  s.players.red.route = [{ x: 0, y: 0 }];
  s.players.blue.route = [{ x: 8, y: 8 }];
  const afterRed = dispatch(s, "red", "SKIP_ACTION");
  assert.deepEqual(afterRed.constructionQueue, ["blue"], "passing hands the period to the next builder");
  const afterBlue = dispatch(afterRed, "blue", "SKIP_ACTION");
  assert.equal(afterBlue.phase, "SCORING", "construction ends when no scheduled actions remain");
}

// ----------------------------------------------------------------------------
// Full game simulation: procurement → engineering → scheduling → starters →
// construction (priority order, overtime, station docking, crossing) → scoring
// ----------------------------------------------------------------------------
{
  let s = base();
  s = dispatch(s, "red", "START_GAME");
  assert.equal(s.phase, "PROCUREMENT", "the host starts the game");
  assert.equal(s.defaultPriorityPlayerId, "red", "priority is assigned at start (random()=0 → seat 1)");

  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "contract" }), s, "procurement is turn-ordered");
  s = dispatch(s, "red", "PROCURE", { choice: "contract" }); // Short Line, $7M
  assert.equal(s.players.red.contractId, "short", "red bought the face-up Short Line");
  assert.equal(s.players.red.money, 8, "contract cost is paid");
  s = dispatch(s, "blue", "PROCURE", { choice: "contract" }); // refilled slot: Medium Line, $9M
  assert.equal(s.players.blue.contractId, "medium", "the contract slot refills from the deck");
  assert.equal(s.phase, "ENGINEERING", "procurement ends when both companies own contracts");

  assert.equal(dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["straight", "straight", "bend"] }), s, "duplicate commits are rejected");
  assert.equal(dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["gentle", "straight", "bend"] }), s, "commits must come from the hand");
  s = dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["straight", "long-segment", "terminal"] });
  assert.deepEqual(s.players.red.engineeringHand, ["bend", "crossing"], "committed cards leave the hand");
  assert.equal(dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["bend", "crossing", "straight"] }), s, "commits lock");
  s = dispatch(s, "blue", "COMMIT_ENGINEERING", { cardIds: ["crossing", "terminal", "bend"] });
  assert.equal(s.phase, "SCHEDULING_PROPOSAL", "both commits advance to scheduling");

  s = dispatch(s, "red", "PROPOSE_SCHEDULE", { start: 1 });
  assert.equal(s.phase, "SCHEDULING_PROPOSAL", "reveal waits for both proposals");
  assert.equal(dispatch(s, "red", "PROPOSE_SCHEDULE", { start: 2 }), s, "a locked proposal cannot change");
  s = dispatch(s, "blue", "PROPOSE_SCHEDULE", { start: 1 });
  assert.equal(s.phase, "SCHEDULING_RESOLUTION", "proposals auto-reveal simultaneously");
  assert.equal(s.players.red.scheduleStart, 1, "red block revealed");
  assert.equal(s.players.blue.scheduleStart, 1, "blue block revealed");

  // Scheduling-card window (on a throwaway branch of the real state).
  {
    let branch = structuredClone(s);
    assert.equal(dispatch(branch, "red", "PLAY_SCHEDULING_CARD", { cardId: "early" }), branch, "early cannot shift before period 1");
    branch = dispatch(branch, "red", "PLAY_SCHEDULING_CARD", { cardId: "float", direction: 1 });
    assert.equal(branch.players.red.scheduleStart, 2, "float shifts the revealed block");
    assert.equal(dispatch(branch, "red", "PLAY_SCHEDULING_CARD", { cardId: "priority" }), branch, "one scheduling card max per company");
    branch = dispatch(branch, "blue", "PLAY_SCHEDULING_CARD", { cardId: "priority" });
    assert.equal(branch.defaultPriorityPlayerId, "blue", "Priority Permit takes Priority 1");
  }

  s = dispatch(s, "red", "CONFIRM_SCHEDULE");
  s = dispatch(s, "blue", "CONFIRM_SCHEDULE");
  assert.equal(s.phase, "STARTER_PLACEMENT", "schedule lock moves straight to starter placement");
  assert.deepEqual(s.players.red.schedulePeriods, [1, 2, 3, 4], "short line locks a 4-period block");
  assert.deepEqual(s.players.blue.schedulePeriods, [1, 2, 3, 4, 5, 6], "medium line locks a 6-period block");

  assert.equal(dispatch(s, "red", "PLACE_STARTER", { x: 2, y: 2 }), s, "starters cannot use stations");
  s = dispatch(s, "red", "PLACE_STARTER", { x: 0, y: 1 });
  assert.equal(dispatch(s, "blue", "PLACE_STARTER", { x: 0, y: 2 }), s, "starters obey opposing spacing");
  s = dispatch(s, "blue", "PLACE_STARTER", { x: 2, y: 3 });
  assert.equal(s.phase, "CONSTRUCTION", "both starters begin construction");
  assert.deepEqual(s.constructionQueue, ["red", "blue"], "Priority 1 builds first in a shared period");

  // Period 1: red plays Overtime for an extra node, blue follows.
  assert.equal(dispatch(s, "blue", "BUILD", { x: 2, y: 4 }), s, "building out of turn is rejected");
  s = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "overtime" });
  assert.deepEqual(s.players.red.constructionHand, ["crew"], "overtime is consumed");
  s = dispatch(s, "red", "BUILD", { x: 3, y: 1 });
  assert.equal(s.constructionQueue[0], "red", "overtime grants an immediate extra build");
  s = dispatch(s, "red", "BUILD", { x: 4, y: 1 });
  assert.equal(s.constructionQueue[0], "blue", "after the extra build, play passes on");
  s = dispatch(s, "blue", "BUILD", { x: 2, y: 4 });

  // Period 2.
  assert.equal(s.currentPeriod, 2, "the period advances when the queue empties");
  s = dispatch(s, "red", "BUILD", { x: 5, y: 1 });
  s = dispatch(s, "blue", "BUILD", { x: 2, y: 5 });

  // Period 3: red cannot waste Extra Crew with one node left, then docks the
  // Museum station and completes the Short Line early.
  assert.equal(dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "crew" }), s, "extra crew is rejected with one node left");
  s = dispatch(s, "red", "BUILD", { x: 6, y: 1 });
  assert.equal(s.players.red.route[4]?.stationId, "museum", "a node placed on a station docks into it");
  s = dispatch(s, "blue", "BUILD", { x: 2, y: 6 });

  // Period 4: red is complete and is skipped; blue builds alone.
  assert.equal(s.currentPeriod, 4, "period 4 starts");
  assert.deepEqual(s.constructionQueue, ["blue"], "a completed line skips its remaining actions");
  s = dispatch(s, "blue", "BUILD", { x: 3, y: 3 });

  // Period 5: blue crosses red's line using the committed Crossing Design.
  s = dispatch(s, "blue", "BUILD", { x: 7, y: 0 });
  assert.equal(s.players.blue.crossingsUsed, 1, "the permitted crossing is recorded");

  // Period 6: blue finishes at Stadium station.
  s = dispatch(s, "blue", "BUILD", { x: 7, y: 3 });
  assert.equal(s.phase, "SCORING", "construction ends after the last scheduled action");

  assert.equal(dispatch(s, "blue", "ADVANCE_SCORING"), s, "only the host reveals scoring");
  s = dispatch(s, "red", "ADVANCE_SCORING");
  assert.equal(s.phase, "RESULTS", "scoring advances to results");

  const labels = (p: SubwayPlayer) => (p.scoreBreakdown ?? []).filter((i) => i.met !== false).map((i) => i.label);
  assert.deepEqual(
    labels(s.players.red).sort(),
    ["Long Segment", "Museum connection", "Short Line completed", "Straightaway", "Terminal Approach"].sort(),
    "red scores stations, completion, and met objectives"
  );
  assert.equal(s.players.red.score, 2 + 4 + 4 + 3 + 4, "red total is 17");
  assert.deepEqual(
    labels(s.players.blue).sort(),
    ["45° Bend", "Crossing Design", "Medium Line completed", "Stadium connection", "Terminal Approach"].sort(),
    "blue scores its crossing, bend, and terminal"
  );
  assert.equal(s.players.blue.score, 2 + 6 + 2 + 3 + 4, "blue total is 17");
  assert.deepEqual(s.winnerIds, ["red"], "ties break by majors, then remaining money");
}

console.log(
  "Subway rules checks passed (schedule blocks, spacing, station docking/capacity, string rules, crossing permits, construction cards, pass, priority order, completion, scoring, tiebreaks)."
);
