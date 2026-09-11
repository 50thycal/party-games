import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import {
  cardDraftTurnId,
  DESTINATION_CARDS,
  STATIONS,
  LINE_CONTRACTS,
  MARKET_DECKS,
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  basePriorityId,
  blockPeriods,
  committedStatus,
  contractById,
  contractNodes,
  contractsOutstanding,
  crewCost,
  destinationById,
  destinationMet,
  destinationProblems,
  destinationTurnId,
  engineeringById,
  hasLegalMove,
  legalTargets,
  lengthMatches,
  lineComplete,
  lineMobilization,
  mobilizationCost,
  mobilizationFor,
  nextSegmentLength,
  objectiveMet,
  routeContacts,
  properCrossingCount,
  contactToll,
  contractActions,
  pendingStarters,
  periodPriorityId,
  scheduleCost,
  scheduleProblems,
  scheduledLines,
  slotPoint,
  starterTurnId,
  stationById,
  subwayGame,
  surveyFulfilled,
  surveyTurnId,
  surveysPending,
  validateNode,
  type PlayerLine,
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
const context = (playerId: string, random = () => 0): GameContext => ({ room, playerId, now: () => 1, random });

const dispatch = (
  s: SubwayState,
  playerId: string,
  type: SubwayAction["type"],
  payload?: SubwayAction["payload"],
  random?: () => number
) => subwayGame.reducer(s, { type, playerId, payload: type === "PROCURE" && payload?.choice === "buy" ? {...payload, contractId:payload.contractId ?? s.procurement.row[0]} : payload }, context(playerId, random));

// Isolated downstream fixtures explicitly provision hands; real setup starts empty.
const base = () => {
  const s = subwayGame.initialState(players);
  for (const p of Object.values(s.players)) {
    p.crewsHired = true; // Geometry fixtures begin after crew activation.
    p.engineeringHand = ["straight","bend","network","terminal","crossing"];
    p.schedulingHand = ["early","float","priority"];
  }
  return s;
};

/** A started game. random()=0 gives a fixed shuffle and priority, so the deck
 *  order below is deterministic. */
// Fixed legacy portfolio for geometry/economics regression fixtures.
// The multiplayer suite separately exercises the actual shuffled 12-route pool.
const started = () => {
  const s = dispatch(base(), "red", "START_GAME");
  s.procurement.row = ["branch","medium"];
  s.procurement.deck = ["express","crosstown","long","short"];
  s.procurement.offer = {contractId:"branch",price:6,activeId:"red"};
  s.oddPriorityId = "red";
  return s;
};

const owned = (contractId: string, route: PlayerLine["route"] = []): PlayerLine => ({
  contractId,
  paid: contractById(contractId)!.cost,
  route,
});

const offerOf = (s: SubwayState) => s.procurement.offer!;
const contractNames = (p: SubwayPlayer) => p.lines.map((l) => l.contractId).sort();

/** The three objectives every company starts able to commit. */
const OPENING_THREE = ["straight", "bend", "terminal"];
const lockPlan = (
  s: SubwayState,
  playerId: string,
  extra: Partial<NonNullable<SubwayAction["payload"]>> = {}
) => dispatch(s, playerId, "LOCK_ENGINEERING_PLAN", { cardIds: OPENING_THREE, ...extra });

/** Provision known draws through real actions for downstream goal fixtures. */
function runCardDraft(state: SubwayState): SubwayState {
  let s = state;
  while(s.phase === "ENGINEERING" && s.engineeringStep === "CARD_DRAFT") {
    const id = cardDraftTurnId(s)!;
    const p = s.players[id];
    const wanted = ["straight","bend","terminal","network","crossing"][p.engineeringHand.length];
    if(wanted) s.market.decks!.engineering = [wanted, ...s.market.decks!.engineering];
    s = dispatch(s,id,"DRAFT_CARD",{deck:"engineering",expectedPick:s.market.picks});
  }
  return s;
}

/** Plays the Destination draft out so a test can reach the planning step. */
function runDraft(s: SubwayState): SubwayState {
  let out = runCardDraft(s);
  let guard = 0;
  while (out.engineeringStep === "DESTINATION_DRAFT" && guard++ < 10) {
    const actor = destinationTurnId(out);
    if (!actor) break;
    out = dispatch(out, actor, "PICK_DESTINATION", { destinationCardId: out.destinationRow[0] });
  }
  return out;
}

/** Every drafted Destination, assigned to the company's first line. */
const assignAll = (s: SubwayState, id: string) =>
  s.players[id].destinationHand.map((cardId, i) => ({ cardId, lineIndex: i === 0 ? 0 : 0 }));

/** A real game run through Procurement to the Destination draft. */
function engineeringDraft(): SubwayState {
  let s = started();
  let guard = 0;
  while (s.phase === "PROCUREMENT" && guard++ < 60) {
    const offer = s.procurement.offer!;
    const active = s.players[offer.activeId];
    s =
      active.lines.length < SUBWAY_CONFIG.maxContractsPerPlayer && active.money >= offer.price
        ? dispatch(s, offer.activeId, "PROCURE", { choice: "buy" })
        : dispatch(s, offer.activeId, "PROCURE", {
            choice: "pass",
            deck: "engineering" as const,
          });
  }
  return runCardDraft(s);
}

// With random()=0 the Fisher-Yates shuffle is fully determined.
const DECK_ORDER = ["branch", "medium", "express", "crosstown", "long", "short"];

// ============================================================================
// PART 1 — Contract recipes and route geometry (WS-002)
// ============================================================================

// Recipes are the single source of truth for length, actions, and completion.
{
  for (const c of LINE_CONTRACTS) {
    assert.ok(c.recipe.length >= 4, `${c.name} has a recipe`);
    assert.equal(
      contractNodes(c),
      c.recipe.length + 1,
      `${c.name}: nodes are the recipe plus the free starter peg`
    );
    const line = owned(c.id);
    line.start = 1;
    assert.equal(blockPeriods(line).length, c.recipe.length, `${c.name}: one build period per recipe segment`);
  }
  assert.ok(
    LINE_CONTRACTS.every((c) => c.recipe.length <= SUBWAY_CONFIG.timelinePeriods),
    "no single contract outruns the 16-period horizon"
  );
  const colors = new Set(LINE_CONTRACTS.map((c) => c.color));
  assert.equal(colors.size, LINE_CONTRACTS.length, "every contract has its own line color");
  const codes = new Set(LINE_CONTRACTS.map((c) => c.code));
  assert.equal(codes.size, LINE_CONTRACTS.length, "and its own letter code, so color is never the only cue");
}

// Every approved recipe can actually be built in order on an open board.
{
  for (const c of LINE_CONTRACTS) {
    const s = base();
    s.players.red.lines = [owned(c.id, [{ x: 0, y: 0 }])];
    const line = s.players.red.lines[0];
    let steps = 0;
    const walk = (): boolean => {
      if (line.route.length === contractNodes(c)) return true;
      if (steps++ > 4000) return false;
      for (const t of legalTargets(s, "red", 0)) {
        line.route.push({ x: t.x, y: t.y, ...(t.slot !== undefined ? { stationSlot: t.slot } : {}) });
        if (walk()) return true;
        line.route.pop();
      }
      return false;
    };
    assert.ok(walk(), `${c.name}: its ordered recipe is buildable on the board`);
    assert.equal(lineComplete(line), true, `${c.name}: finishing the recipe completes the line`);
  }
}

// Segment length: whole pegs with a half-peg tolerance, boundaries included.
{
  assert.equal(lengthMatches(3, 3), true, "an exact length passes");
  assert.equal(lengthMatches(2.5, 3), true, "so does exactly L − 0.5");
  assert.equal(lengthMatches(3.5, 3), true, "and exactly L + 0.5");
  assert.equal(lengthMatches(2.49, 3), false, "just under the tolerance fails");
  assert.equal(lengthMatches(3.51, 3), false, "and so does just over it");

  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 0 }])]; // recipe 2-3-2-3
  assert.equal(nextSegmentLength(s.players.red.lines[0]), 2, "the first segment of Market Shuttle spans 2");
  assert.equal(validateNode(s, "red", 0, { x: 2, y: 0 }), null, "a straight 2 is legal");
  assert.equal(validateNode(s, "red", 0, { x: 1, y: 2 }), null, "so is a 1-2 diagonal at 2.24");
  assert.match(validateNode(s, "red", 0, { x: 3, y: 0 }) ?? "", /must span 2/, "a 3 is not a 2");
  assert.match(validateNode(s, "red", 0, { x: 2, y: 2 }) ?? "", /must span 2/, "and neither is 2.83");
  assert.match(validateNode(s, "red", 0, { x: 0, y: 0 }) ?? "", /must span 2/, "nor is no distance");
}

// The recipe is ordered: the second segment must be the second length.
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 5, y: 0 }, { x: 7, y: 0 }])]; // 2 built, next is 3
  assert.equal(nextSegmentLength(s.players.red.lines[0]), 3, "Market Shuttle's second segment spans 3");
  assert.match(validateNode(s, "red", 0, { x: 9, y: 0 }) ?? "", /must span 3/, "a repeat 2 is rejected");
  assert.equal(validateNode(s, "red", 0, { x: 10, y: 0 }), null, "the ordered 3 is accepted");
}

// Turns: 90° exactly is legal, anything sharper is not. The first segment has
// no previous heading, so the rule starts at the second.
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 5, y: 0 }, { x: 7, y: 0 }])];
  assert.equal(validateNode(s, "red", 0, { x: 7, y: 3 }), null, "exactly 90° is legal");
  assert.match(
    validateNode(s, "red", 0, { x: 4, y: 1 }) ?? "",
    /turn at most 90/,
    "doubling back past 90° is not"
  );
  const first = base();
  first.players.red.lines = [owned("short", [{ x: 5, y: 5 }])];
  assert.equal(validateNode(first, "red", 0, { x: 7, y: 5 }), null, "the first segment has no turn to judge");
}

// A finished line takes no further placement, whatever the schedule says.
{
  const s = base();
  const c = contractById("short")!;
  s.players.red.lines = [
    owned("short", [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 0 },
    ]),
  ];
  assert.equal(lineComplete(s.players.red.lines[0]), true, "the recipe is exhausted");
  assert.equal(s.players.red.lines[0].route.length, contractNodes(c), "at exactly the contract's node count");
  assert.match(validateNode(s, "red", 0, { x: 17, y: 0 }) ?? "", /already finished/, "so nothing more may be built");
  assert.equal(hasLegalMove(s, "red", 0), false, "and it offers no legal move");
}

// ============================================================================
// PART 2 — Station docks are chosen, never assigned
// ============================================================================
{
  const garden = stationById("garden")!;
  const s = base();
  // Red approaches Garden from the left; both docks are within a 2-peg segment.
  s.players.red.lines = [owned("short", [{ x: 12, y: 2 }])];
  assert.equal(validateNode(s, "red", 0, { x: 14, y: 2 }, false, 0), null, "dock 0 is within the 2-peg tolerance");
  assert.equal(validateNode(s, "red", 0, { x: 14, y: 2 }, false, 1), null, "so is dock 1 from here");
  assert.match(
    validateNode(s, "red", 0, { x: 14, y: 2 }) ?? "",
    /which dock/,
    "docking without naming a dock is rejected"
  );
  assert.match(
    validateNode(s, "red", 0, { x: 14, y: 2 }, false, 2) ?? "",
    /no such dock/,
    "and so is a dock that does not exist"
  );
  assert.match(
    validateNode(s, "red", 0, { x: 14, y: 2 }, false, -1) ?? "",
    /no such dock/,
    "including a negative one"
  );
  assert.equal(
    legalTargets(s, "red", 0).filter((t) => t.x === garden.x && t.y === garden.y).length,
    2,
    "both open docks are offered as separate targets"
  );

  // Dock geometry is real: the slot offset is what distance is measured to.
  const slot0 = slotPoint(garden, 0);
  const slot1 = slotPoint(garden, 1);
  assert.notEqual(slot0.x, slot1.x, "two docks are two different physical places");
}

// A taken dock is never silently swapped for the other one.
{
  const s = base();
  s.players.red.lines = [owned("medium", [{ x: 14, y: 5 }, { x: 14, y: 2, stationId: "garden", stationSlot: 0 }])];
  s.players.blue.lines = [owned("short", [{ x: 16, y: 2 }])];
  assert.match(
    validateNode(s, "blue", 0, { x: 14, y: 2 }, false, 0) ?? "",
    /already taken/,
    "the occupied dock is refused"
  );
  assert.equal(validateNode(s, "blue", 0, { x: 14, y: 2 }, false, 1), null, "the open one is still available");
  assert.deepEqual(
    legalTargets(s, "blue", 0).filter((t) => t.x === 14 && t.y === 2).map((t) => t.slot),
    [1],
    "and only the open dock is offered"
  );

  // One line docks a station once, however many docks are free.
  assert.match(
    validateNode(s, "red", 0, { x: 14, y: 2 }, false, 1) ?? "",
    /already connects/,
    "a line cannot dock the same station twice"
  );

  // Both docks filled closes the station to everyone.
  s.players.red.lines.push(owned("long", [{ x: 14, y: 6 }, { x: 14, y: 2, stationId: "garden", stationSlot: 1 }]));
  assert.equal(
    legalTargets(s, "blue", 0).filter((t) => t.x === 14 && t.y === 2).length,
    0,
    "a full station offers no docks at all"
  );
}

// Two clients racing for one dock: first committed action wins, the loser is
// rejected outright rather than moved to the other dock.
{
  let s = base();
  s.phase = "CONSTRUCTION";
  s.resolveQueue = ["red", "blue"];
  s.players.red.lines = [owned("short", [{ x: 12, y: 2 }])];
  s.players.blue.lines = [owned("short", [{ x: 16, y: 2 }])];
  s.players.red.pendingActions = [0];
  s.players.blue.pendingActions = [0];

  const stale = s;
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 14, y: 2, slot: 0 });
  assert.equal(s.players.red.lines[0].route[1].stationSlot, 0, "red takes the dock it named");
  // Blue's client was looking at the stale board and asks for the same dock.
  const raced = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 14, y: 2, slot: 0 });
  assert.equal(raced, s, "the loser's action is a no-op, not a silent re-dock");
  assert.equal(stale.players.red.lines[0].route.length, 1, "and the stale state it read is untouched");
}

// ============================================================================
// PART 3 — Alternating construction priority
// ============================================================================
{
  const redFirst = dispatch(base(), "red", "START_GAME", undefined, () => 0);
  assert.equal(redFirst.oddPriorityId, "red", "a low roll gives the first seat the odd periods");
  const blueFirst = dispatch(base(), "red", "START_GAME", undefined, () => 0.99);
  assert.equal(blueFirst.oddPriorityId, "blue", "a high roll gives them to the second seat");

  const s = redFirst;
  assert.equal(basePriorityId(s, 1), "red", "odd periods belong to the odd company");
  assert.equal(basePriorityId(s, 2), "blue", "even periods belong to the opposition");
  assert.equal(basePriorityId(s, 15), "red", "and it keeps alternating to the end of the calendar");
  assert.equal(basePriorityId(s, 16), "blue", "…for both companies");
  assert.equal(periodPriorityId(s, 4), "blue", "with no permit, priority is the calendar's");

  const overridden = { ...s, priorityOverrides: { 4: "red" } };
  assert.equal(periodPriorityId(overridden, 4), "red", "a Priority Permit overrides its own period");
  assert.equal(periodPriorityId(overridden, 6), "blue", "and only its own period");
}

// ============================================================================
// PART 4 — Network Link replaces Long Segment
// ============================================================================
{
  assert.equal(engineeringById("long-segment"), undefined, "Long Segment is gone");
  assert.ok(engineeringById("network"), "Network Link took its place");
  assert.equal(engineeringById("network")!.vp, 7, "network overhaul is worth +7 VP");
  assert.ok(
    SUBWAY_CONFIG.startingHands.engineering.length === 0,
    "players start without cards"
  );

  const complete = (route: PlayerLine["route"]) => {
    const p = base().players.red;
    p.lines = [owned("short", route)];
    return p;
  };

  // A finished Market Shuttle touching three different stations.
  const three = complete([
    { x: 1, y: 3 }, { x: 4, y: 3, stationId: "market", stationSlot: 0 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 8, y: 3 }, { x: 10, y: 6, stationId: "museum", stationSlot: 0 },
  ]);
  assert.equal(objectiveMet("network", three, []), false, "one completed line does not satisfy the three-line network objective");

  const one = complete([
    { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 8, y: 3 }, { x: 11, y: 3 },
  ]);
  assert.equal(objectiveMet("network", one, []), false, "one station is not a network");

  const unfinished = complete([
    { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 10, y: 6, stationId: "museum", stationSlot: 0 },
  ]);
  assert.equal(objectiveMet("network", unfinished, []), false, "an incomplete line does not score it");
}


console.log("Subway geometry, dock, recipe and network-goal regressions passed.");
