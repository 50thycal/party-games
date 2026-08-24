import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import {
  DESTINATION_CARDS,
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
  engineeringById,
  hasLegalMove,
  legalTargets,
  lengthMatches,
  lineComplete,
  lineMobilization,
  marketEngineering,
  mobilizationCost,
  mobilizationFor,
  mustBuyOffer,
  nextSegmentLength,
  objectiveMet,
  ownershipFeasible,
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
) => subwayGame.reducer(s, { type, playerId, payload }, context(playerId, random));

const base = () => subwayGame.initialState(players);

/** A started game. random()=0 gives a fixed shuffle and priority, so the deck
 *  order below is deterministic. */
const started = () => dispatch(base(), "red", "START_GAME");

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
  s.players.red.lines = [owned("short", [{ x: 0, y: 0 }])]; // recipe 3-4-3-4
  assert.equal(nextSegmentLength(s.players.red.lines[0]), 3, "the first segment of a Short Line spans 3");
  assert.equal(validateNode(s, "red", 0, { x: 3, y: 0 }), null, "a straight 3 is legal");
  assert.equal(validateNode(s, "red", 0, { x: 2, y: 2 }), null, "so is a 2-2 diagonal at 2.83");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 0 }) ?? "", /must span 3/, "a 4 is not a 3");
  assert.match(validateNode(s, "red", 0, { x: 2, y: 3 }) ?? "", /must span 3/, "and neither is 3.61");
  assert.match(validateNode(s, "red", 0, { x: 1, y: 0 }) ?? "", /must span 3/, "nor is a single peg");
}

// The recipe is ordered: the second segment must be the second length.
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 5, y: 0 }, { x: 8, y: 0 }])]; // 3 built, next is 4
  assert.equal(nextSegmentLength(s.players.red.lines[0]), 4, "the Short Line's second segment spans 4");
  assert.match(validateNode(s, "red", 0, { x: 11, y: 0 }) ?? "", /must span 4/, "a repeat 3 is rejected");
  assert.equal(validateNode(s, "red", 0, { x: 12, y: 0 }), null, "the ordered 4 is accepted");
}

// Turns: 90° exactly is legal, anything sharper is not. The first segment has
// no previous heading, so the rule starts at the second.
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 5, y: 0 }, { x: 8, y: 0 }])];
  assert.equal(validateNode(s, "red", 0, { x: 8, y: 4 }), null, "exactly 90° is legal");
  assert.match(
    validateNode(s, "red", 0, { x: 4, y: 1 }) ?? "",
    /turn at most 90/,
    "doubling back past 90° is not"
  );
  const first = base();
  first.players.red.lines = [owned("short", [{ x: 5, y: 5 }])];
  assert.equal(validateNode(first, "red", 0, { x: 5, y: 2 }), null, "the first segment has no turn to judge");
}

// A finished line takes no further placement, whatever the schedule says.
{
  const s = base();
  const c = contractById("short")!;
  s.players.red.lines = [
    owned("short", [
      { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 0 }, { x: 14, y: 0 },
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
  // Red approaches Garden from the left; 2.85 pegs to dock 0, 3.17 to dock 1.
  s.players.red.lines = [owned("short", [{ x: 11, y: 2 }])];
  assert.equal(validateNode(s, "red", 0, { x: 14, y: 2 }, false, 0), null, "dock 0 is within the 3-peg tolerance");
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
  s.players.blue.lines = [owned("short", [{ x: 17, y: 2 }])];
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
  s.players.red.lines = [owned("short", [{ x: 11, y: 2 }])];
  s.players.blue.lines = [owned("short", [{ x: 17, y: 2 }])];
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
  assert.equal(engineeringById("network")!.vp, 3, "worth +3 VP");
  assert.ok(
    SUBWAY_CONFIG.startingHands.engineering.includes("network"),
    "and it is what the opening hand holds instead"
  );

  const complete = (route: PlayerLine["route"]) => {
    const p = base().players.red;
    p.lines = [owned("short", route)];
    return p;
  };

  // A finished Short Line touching two different stations.
  const two = complete([
    { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 8, y: 3 }, { x: 10, y: 6, stationId: "museum", stationSlot: 0 },
  ]);
  assert.equal(objectiveMet("network", two, []), true, "two distinct stations on a completed line scores");

  const one = complete([
    { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 8, y: 3 }, { x: 11, y: 3 },
  ]);
  assert.equal(objectiveMet("network", one, []), false, "one station is not a link");

  const unfinished = complete([
    { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
    { x: 10, y: 6, stationId: "museum", stationSlot: 0 },
  ]);
  assert.equal(objectiveMet("network", unfinished, []), false, "an incomplete line does not score it");
}

// ============================================================================
// PART 5 — Destination cards
// ============================================================================
{
  assert.equal(DESTINATION_CARDS.length, 6, "there is one Destination card per station");
  assert.ok(
    DESTINATION_CARDS.every((c) => stationById(c.stationId)),
    "each names a real station"
  );
  assert.ok(
    DESTINATION_CARDS.every((c) => (MARKET_DECKS.engineering as readonly string[]).includes(c.id)),
    "and all of them share the face-up Engineering market"
  );
}

// Drafting: a Destination off the Engineering market lands in its own hand.
{
  let s = started();
  // Walk the market to the first Destination on offer.
  let guard = 0;
  while (!marketEngineering(s.market).destination && guard++ < 20) s.market.engineeringIndex++;
  const drafted = marketEngineering(s.market).id;
  assert.equal(marketEngineering(s.market).destination, true, "a Destination reaches the face-up slot");
  const after = dispatch(s, offerOf(s).activeId, "PROCURE", { choice: "pass", deck: "engineering" });
  const drafter = after.players[offerOf(s).activeId];
  assert.ok(drafter.destinationHand.includes(drafted), "it is drafted into the Destination hand");
  assert.equal(
    drafter.engineeringHand.length,
    SUBWAY_CONFIG.startingHands.engineering.length,
    "and never mixes into the objective hand"
  );
}

// Assignment rules at plan lock.
{
  const p = base().players.red;
  p.lines = [owned("short"), owned("medium")];
  p.destinationHand = ["dest-garden", "dest-museum", "dest-market", "dest-garden"];

  assert.deepEqual(destinationProblems(p, []), [], "assigning nothing is fine");
  assert.deepEqual(
    destinationProblems(p, [{ cardId: "dest-garden", lineIndex: 0 }]),
    [],
    "one card on an owned line is fine"
  );
  assert.deepEqual(
    destinationProblems(p, [
      { cardId: "dest-garden", lineIndex: 0 },
      { cardId: "dest-museum", lineIndex: 0 },
    ]),
    [],
    "two on one line is the cap, not a breach"
  );
  assert.ok(
    destinationProblems(p, [
      { cardId: "dest-garden", lineIndex: 0 },
      { cardId: "dest-museum", lineIndex: 0 },
      { cardId: "dest-market", lineIndex: 0 },
    ]).some((m) => /only two/.test(m)),
    "a third on one line is rejected"
  );
  assert.ok(
    destinationProblems(p, [
      { cardId: "dest-garden", lineIndex: 0 },
      { cardId: "dest-garden", lineIndex: 0 },
    ]).some((m) => /already assigned/.test(m)),
    "the same station twice on one line is rejected"
  );
  assert.deepEqual(
    destinationProblems(p, [
      { cardId: "dest-garden", lineIndex: 0 },
      { cardId: "dest-garden", lineIndex: 1 },
    ]),
    [],
    "but two copies may serve two different lines"
  );
  assert.ok(
    destinationProblems(p, [{ cardId: "dest-stadium", lineIndex: 0 }]).some((m) => /not in your hand/.test(m)),
    "a card you do not hold cannot be assigned"
  );
  assert.ok(
    destinationProblems(p, [{ cardId: "dest-garden", lineIndex: 4 }]).some((m) => /line you own/.test(m)),
    "and neither can a line you do not own"
  );
}

// ============================================================================
// PART 6 — Engineering plan lock (objectives + destinations + surveys)
// ============================================================================

/** A game parked at the start of Engineering with the given contracts. */
function engineering(red: string[], blue: string[]): SubwayState {
  const s = base();
  s.phase = "ENGINEERING";
  s.engineeringStep = "PLAN";
  s.oddPriorityId = "red";
  s.players.red.lines = red.map((id) => owned(id));
  s.players.blue.lines = blue.map((id) => owned(id));
  return s;
}

{
  const s = engineering(["short", "medium"], ["long"]);
  assert.equal(lockPlan(s, "red", { cardIds: ["straight", "bend"] }), s, "two objectives is not three");
  assert.equal(
    lockPlan(s, "red", { cardIds: ["straight", "straight", "bend"] }),
    s,
    "and neither is the same card twice"
  );
  assert.equal(
    lockPlan(s, "red", { cardIds: ["straight", "bend", "approach"] }),
    s,
    "a card you do not hold cannot be committed"
  );
  s.players.red.destinationHand = ["dest-garden"];
  assert.equal(
    lockPlan(s, "red", { cardIds: ["straight", "bend", "dest-garden"] }),
    s,
    "a Destination cannot stand in for one of the three objectives"
  );

  const locked = lockPlan(s, "red", { destinations: [{ cardId: "dest-garden", lineIndex: 0 }] });
  assert.deepEqual(locked.players.red.committedEngineering, OPENING_THREE, "three objectives commit");
  assert.equal(locked.players.red.engineeringHand.length, 2, "and leave the hand");
  assert.deepEqual(
    locked.players.red.destinationCommitments,
    [{ cardId: "dest-garden", stationId: "garden", lineIndex: 0 }],
    "the Destination is bound to its line, separately from the three"
  );
  assert.deepEqual(locked.players.red.destinationHand, [], "and leaves the Destination hand");
  assert.equal(lockPlan(locked, "red"), locked, "a locked plan cannot be locked again");
  assert.equal(locked.phase, "ENGINEERING", "the phase waits for the opposition");
}

// An unassigned Destination stays in hand and scores nothing.
{
  const s = engineering(["short"], ["long"]);
  s.players.red.destinationHand = ["dest-garden", "dest-harbor"];
  const locked = lockPlan(s, "red", { destinations: [{ cardId: "dest-garden", lineIndex: 0 }] });
  assert.deepEqual(locked.players.red.destinationHand, ["dest-harbor"], "the unassigned card is kept");
  assert.equal(locked.players.red.destinationCommitments.length, 1, "but is not a commitment");
}

// Survey purchase: 0 through 5, affordable, charged exactly once.
{
  const s = engineering(["short"], ["long"]);
  assert.equal(lockPlan(s, "red", { surveys: 6 }), s, "six pins is over the cap");
  assert.equal(lockPlan(s, "red", { surveys: -1 }), s, "and a negative count is nonsense");
  assert.equal(lockPlan(s, "red", { surveys: 1.5 }), s, "as is a fractional one");

  const none = lockPlan(s, "red", { surveys: 0 });
  assert.equal(none.players.red.money, s.players.red.money, "buying none costs nothing");
  assert.equal(none.players.red.surveysPurchased, 0, "and buys none");

  const five = lockPlan(s, "red", { surveys: 5 });
  assert.equal(five.players.red.surveysPurchased, 5, "five is the cap and is allowed");
  assert.equal(
    five.players.red.money,
    s.players.red.money - 5 * SUBWAY_CONFIG.survey.cost,
    "and costs $1M each, once"
  );
  assert.equal(lockPlan(five, "red", { surveys: 5 }), five, "re-locking cannot charge a second time");

  const broke = engineering(["short"], ["long"]);
  broke.players.red.money = 2;
  assert.equal(lockPlan(broke, "red", { surveys: 3 }), broke, "you cannot buy pins you cannot pay for");
  assert.equal(lockPlan(broke, "red", { surveys: 2 }).players.red.money, 0, "spending your last is allowed");
}

// Both plans locked with no pins goes straight through to Scheduling.
{
  let s = engineering(["short"], ["long"]);
  s = lockPlan(s, "red", { surveys: 0 });
  s = lockPlan(s, "blue", { surveys: 0 });
  assert.equal(s.phase, "SCHEDULING", "with nothing to place, Engineering closes immediately");
  assert.equal(s.schedulingStep, "PLANNING", "and private planning opens");
  assert.equal(s.players.red.lines[0].start, 1, "with the blocks laid out to start from");
}

// ============================================================================
// PART 7 — Survey Pin placement
// ============================================================================

/** A game parked at the Survey step with the given purchases. */
function surveying(redPins: number, bluePins: number): SubwayState {
  let s = engineering(["short", "medium"], ["long"]);
  s = lockPlan(s, "red", { surveys: redPins });
  s = lockPlan(s, "blue", { surveys: bluePins });
  return s;
}

{
  const s = surveying(2, 2);
  assert.equal(s.phase, "ENGINEERING", "purchases hold Engineering open");
  assert.equal(s.engineeringStep, "SURVEY", "at the Survey step");
  assert.equal(surveyTurnId(s), "red", "the odd-period company places first");
  assert.equal(
    dispatch(s, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 }),
    s,
    "the opposition may not jump the order"
  );

  let t = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  assert.equal(t.surveyPins.length, 1, "the pin goes on the board");
  assert.deepEqual(t.surveyPins[0], { playerId: "red", lineIndex: 0, x: 1, y: 1 }, "assigned to its line");
  assert.equal(surveyTurnId(t), "blue", "and placement alternates");

  assert.equal(
    dispatch(t, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 5, y: 3 }),
    t,
    "a station hole cannot carry a pin"
  );
  t = dispatch(t, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  assert.equal(t.surveyPins.length, 2, "both companies may pin the same hole");
  assert.equal(surveyTurnId(t), "red", "back to the first company");

  assert.equal(
    dispatch(t, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 }),
    t,
    "but one company may not stack its own pins"
  );
  assert.equal(
    dispatch(t, "red", "PLACE_SURVEY", { lineIndex: 7, x: 4, y: 4 }),
    t,
    "nor pin for a line it does not own"
  );

  t = dispatch(t, "red", "PLACE_SURVEY", { lineIndex: 1, x: 4, y: 4 });
  t = dispatch(t, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 8, y: 4 });
  assert.equal(t.phase, "SCHEDULING", "Scheduling opens once every bought pin is down");
  assert.equal(t.surveyPins.length, 4, "with all four pins public");
}

// Unequal purchases finish without deadlock.
{
  let s = surveying(3, 1);
  assert.equal(surveyTurnId(s), "red", "the odd company still opens");
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  assert.equal(surveyTurnId(s), "blue", "then the opposition");
  s = dispatch(s, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 3, y: 1 });
  assert.equal(surveyTurnId(s), "red", "and once the opposition is spent, the rest fall to one company");
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 5, y: 1 });
  assert.equal(surveyTurnId(s), "red", "which keeps placing");
  assert.equal(surveysPending(s, "blue"), 0, "with nothing owed by the other");
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 7, y: 1 });
  assert.equal(s.phase, "SCHEDULING", "and the phase still closes");
}

// One company buying nothing simply does not place.
{
  let s = surveying(1, 0);
  assert.equal(surveyTurnId(s), "red", "only the buyer places");
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  assert.equal(s.phase, "SCHEDULING", "and the phase closes on its last pin");
}

// Fulfilment is line-specific.
{
  const p = base().players.red;
  p.lines = [owned("short", [{ x: 4, y: 4 }]), owned("medium", [{ x: 9, y: 4 }])];
  assert.equal(surveyFulfilled(p, { playerId: "red", lineIndex: 0, x: 4, y: 4 }), true, "its own line pays out");
  assert.equal(
    surveyFulfilled(p, { playerId: "red", lineIndex: 1, x: 4, y: 4 }),
    false,
    "another of your own lines does not"
  );
  assert.equal(
    surveyFulfilled(p, { playerId: "red", lineIndex: 0, x: 7, y: 7 }),
    false,
    "and an unvisited hole does not"
  );
}

// ============================================================================
// PART 8 — Undo of the latest physical placement
// ============================================================================

// A Survey Pin comes back, and so does the placement turn.
{
  let s = surveying(2, 2);
  const before = s;
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  assert.equal(s.undo?.playerId, "red", "the placement is undoable by its actor");
  assert.equal(dispatch(s, "blue", "UNDO_PLACEMENT"), s, "but not by the opposition");

  const undone = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(undone.surveyPins.length, 0, "the pin is off the board");
  assert.equal(surveysPending(undone, "red"), 2, "and back in the company's hands");
  assert.equal(surveyTurnId(undone), "red", "with the placement turn restored");
  assert.equal(undone.players.red.money, before.players.red.money, "money is untouched either way");
  assert.equal(undone.undo, undefined, "and the opportunity is spent");
  assert.equal(dispatch(undone, "red", "UNDO_PLACEMENT"), undone, "a repeated undo is a no-op");
}

// The opposition acting expires it; a rejected action does not.
{
  let s = surveying(2, 2);
  s = dispatch(s, "red", "PLACE_SURVEY", { lineIndex: 0, x: 1, y: 1 });
  const refused = dispatch(s, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 5, y: 3 }); // a station
  assert.equal(refused, s, "an illegal action changes nothing");
  assert.equal(refused.undo?.playerId, "red", "so the undo opportunity stands");

  const acted = dispatch(s, "blue", "PLACE_SURVEY", { lineIndex: 0, x: 4, y: 1 });
  assert.equal(acted.undo?.playerId, "blue", "an accepted action replaces it with its own");
  assert.equal(dispatch(acted, "red", "UNDO_PLACEMENT"), acted, "red can no longer take its pin back");
}

/** A game parked at starter placement with one scheduled contract each. */
function starters(red: string[], blue: string[]): SubwayState {
  const s = base();
  s.phase = "STARTER_PLACEMENT";
  s.oddPriorityId = "red";
  s.players.red.lines = red.map((id, i) => ({ ...owned(id), start: 1 + i * 8 }));
  s.players.blue.lines = blue.map((id, i) => ({ ...owned(id), start: 1 + i * 8 }));
  return s;
}

// A starter peg, including the one that opens Construction.
{
  let s = starters(["short"], ["short"]);
  assert.equal(starterTurnId(s), "red", "the odd-period company places the first starter");
  s = dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 0, y: 0 });
  const mid = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(mid.players.red.lines[0].route.length, 0, "the peg comes off");
  assert.equal(starterTurnId(mid), "red", "and the turn returns to its owner");

  s = dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 8, y: 8 });
  assert.equal(s.phase, "CONSTRUCTION", "the final starter opens Construction");
  assert.equal(s.undo?.playerId, "blue", "and is still undoable across that transition");

  const back = dispatch(s, "blue", "UNDO_PLACEMENT");
  assert.equal(back.phase, "STARTER_PLACEMENT", "undo walks the phase back");
  assert.equal(back.players.blue.lines[0].route.length, 0, "and the peg with it");
  assert.equal(starterTurnId(back), "blue", "with the correct company still owing a peg");
}

/** A game parked in Construction, both companies building one line. */
function construction(red: PlayerLine[], blue: PlayerLine[]): SubwayState {
  const s = base();
  s.phase = "CONSTRUCTION";
  s.oddPriorityId = "red";
  s.currentPeriod = 1;
  s.players.red.lines = red;
  s.players.blue.lines = blue;
  s.players.red.pendingActions = [0];
  s.players.blue.pendingActions = [0];
  s.resolveQueue = ["red", "blue"];
  return s;
}

// A normal build, undone.
{
  let s = construction(
    [{ ...owned("short", [{ x: 0, y: 0 }]), start: 1 }],
    [{ ...owned("short", [{ x: 20, y: 8 }]), start: 1 }]
  );
  const before = s;
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 3, y: 0 });
  assert.equal(s.players.red.lines[0].route.length, 2, "the node is placed");
  assert.deepEqual(s.resolveQueue, ["blue"], "and red's turn is over");

  const undone = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(undone.players.red.lines[0].route.length, 1, "undo removes the node");
  assert.deepEqual(undone.resolveQueue, ["red", "blue"], "restores the resolution queue");
  assert.deepEqual(undone.players.red.pendingActions, [0], "and the scheduled action");
  assert.equal(undone.currentPeriod, before.currentPeriod, "in the same period");
  assert.equal(undone.message, "Red took back their Short Line node.", "and says so");
}

// A period-advancing build, undone.
{
  let s = construction(
    [{ ...owned("short", [{ x: 0, y: 0 }]), start: 1 }],
    [{ ...owned("short", [{ x: 20, y: 8 }]), start: 1 }]
  );
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 3, y: 0 });
  s = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 17, y: 8 });
  assert.equal(s.currentPeriod, 2, "the period rolls over when both are done");
  const undone = dispatch(s, "blue", "UNDO_PLACEMENT");
  assert.equal(undone.currentPeriod, 1, "undo rolls it back");
  assert.deepEqual(undone.resolveQueue, ["blue"], "with the right company still to act");
  assert.equal(undone.players.blue.lines[0].route.length, 1, "and the node gone");
}

// A crossing build, undone: the permit is handed back too.
{
  let s = construction(
    [{ ...owned("short", [{ x: 0, y: 3 }]), start: 1 }],
    [{ ...owned("medium", [{ x: 2, y: 0 }, { x: 2, y: 6 }]), start: 1 }]
  );
  s.players.red.committedEngineering = ["crossing", "straight", "bend"];
  assert.equal(validateNode(s, "red", 0, { x: 3, y: 3 }), null, "the permit allows the crossing");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 3, y: 3 });
  assert.equal(s.players.red.crossingsUsed, 1, "which is recorded as used");
  const undone = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(undone.players.red.crossingsUsed, 0, "and returned by undo");
  assert.equal(
    committedStatus(undone, "red").find((c) => c.cardId === "crossing")?.met,
    false,
    "so the objective's live status reverts with it"
  );
}

// The line-completing, phase-ending build, undone.
{
  let s = construction(
    [
      {
        ...owned("short", [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 0 }]),
        start: 1,
      },
    ],
    [
      {
        ...owned("short", [
          { x: 20, y: 8 }, { x: 23, y: 8 }, { x: 23, y: 4 }, { x: 26, y: 4 }, { x: 26, y: 8 },
        ]),
        start: 1,
      },
    ]
  );
  assert.equal(lineComplete(s.players.blue.lines[0]), true, "the opposition is already finished");
  s.players.blue.pendingActions = [];
  s.resolveQueue = ["red"];
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 14, y: 0 });
  assert.equal(lineComplete(s.players.red.lines[0]), true, "the last recipe segment completes the line");
  assert.equal(s.phase, "SCORING", "and with nothing else scheduled, Construction ends");
  assert.equal(s.undo?.playerId, "red", "the placement is still undoable");

  const undone = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(undone.phase, "CONSTRUCTION", "undo returns to Construction");
  assert.equal(lineComplete(undone.players.red.lines[0]), false, "with the line unfinished again");
  assert.deepEqual(undone.players.red.pendingActions, [0], "and the action back on the books");

  // Scoring is an accepted action, so it closes the window.
  const scored = dispatch(s, "red", "ADVANCE_SCORING");
  assert.equal(scored.phase, "RESULTS", "the host may reveal instead");
  assert.equal(scored.undo, undefined, "which expires the undo");
  assert.equal(dispatch(scored, "red", "UNDO_PLACEMENT"), scored, "for good");
}

// Live objective status reverts with an undone placement.
{
  let s = construction(
    [
      {
        ...owned("short", [{ x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 }, { x: 8, y: 3 }]),
        start: 1,
      },
    ],
    [{ ...owned("short", [{ x: 20, y: 8 }]), start: 1 }]
  );
  s.players.red.committedEngineering = ["network", "straight", "bend"];
  assert.equal(committedStatus(s, "red").find((c) => c.cardId === "network")?.met, false, "not yet linked");
  s = dispatch(s, "red", "BUILD", { lineIndex: 0, x: 10, y: 6, slot: 0 });
  assert.equal(
    committedStatus(s, "red").find((c) => c.cardId === "network")?.met,
    true,
    "docking the second station completes Network Link at once"
  );
  const undone = dispatch(s, "red", "UNDO_PLACEMENT");
  assert.equal(
    committedStatus(undone, "red").find((c) => c.cardId === "network")?.met,
    false,
    "and undoing that dock takes it back"
  );
}

// ============================================================================
// PART 9 — Procurement
// ============================================================================

// 14. procurement alternates the first-refusal player
{
  let s = started();
  assert.equal(s.phase, "PROCUREMENT", "the host starts straight into procurement");
  assert.equal(s.oddPriorityId, "red", "odd-period priority is assigned at setup");
  assert.equal(offerOf(s).contractId, DECK_ORDER[0], "one contract is revealed at a time, from a shuffled deck");
  assert.equal(contractsOutstanding(s), 6, "all six contracts need an owner");

  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    seen.push(offerOf(s).firstRefusalId);
    s = dispatch(s, offerOf(s).firstRefusalId, "PROCURE", { choice: "buy" });
  }
  assert.deepEqual(seen, ["red", "blue", "red", "blue"], "first refusal alternates contract by contract");
}

// 1. first player buys immediately
{
  const s = started();
  const before = s.players.red.money;
  const next = dispatch(s, "red", "PROCURE", { choice: "buy" });
  assert.deepEqual(contractNames(next.players.red), ["branch"], "the contract joins the buyer's company");
  assert.equal(next.players.red.money, before - contractById("branch")!.cost, "the list price is paid");
  assert.equal(next.players.red.lines[0].paid, contractById("branch")!.cost, "what was paid is recorded");
  assert.equal(offerOf(next).contractId, DECK_ORDER[1], "the next contract is revealed");
}

// 2. first player passes and drafts an Engineering card
// 13. the face-up slot refills afterwards
{
  const s = started();
  const nextUp = marketEngineering(s.market).id;
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" }), s, "only the active company decides");
  const after = dispatch(s, "red", "PROCURE", { choice: "pass", deck: "engineering" });
  assert.equal(after.players.red.engineeringHand.length, 6, "the pass is paid for with a face-up card");
  assert.equal(after.players.red.engineeringHand[5], nextUp, "the drafted card is the one that was face up");
  assert.notEqual(marketEngineering(after.market).id, nextUp, "the slot refills from the deck");
  assert.equal(offerOf(after).stage, "second", "the contract is then offered to the opposition");
  assert.equal(offerOf(after).activeId, "blue", "…who now decides");
  assert.equal(offerOf(after).contractId, "branch", "it is still the same contract");
}

// 3. first player passes and the opponent buys
{
  let s = dispatch(started(), "red", "PROCURE", { choice: "pass", deck: "scheduling" });
  s = dispatch(s, "blue", "PROCURE", { choice: "buy" });
  assert.deepEqual(contractNames(s.players.blue), ["branch"], "the second refusal can take it");
  assert.equal(s.players.red.schedulingHand.length, 4, "the first company keeps its drafted card");
  assert.equal(offerOf(s).contractId, DECK_ORDER[1], "play moves to the next contract");
}

// 4. both pass → the Discount Yard
// 5. the yard price is discounted
{
  let s = dispatch(started(), "red", "PROCURE", { choice: "pass", deck: "construction" });
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" }).players.blue.engineeringHand.length, 5, "a second pass earns no card");
  s = dispatch(s, "blue", "PROCURE", { choice: "pass" });
  assert.equal(s.procurement.yard.length, 1, "a doubly-declined contract is not discarded");
  assert.equal(s.procurement.yard[0].contractId, "branch", "it goes to the Discount Yard");
  assert.equal(
    s.procurement.yard[0].price,
    contractById("branch")!.cost - SUBWAY_CONFIG.discountStep,
    "and is marked down"
  );
  assert.equal(contractsOutstanding(s), 6, "it still needs an owner");
}

// 6. repeated passes discount it again
// 7. a yard contract is eventually purchased
// 8. every contract is owned when procurement ends
{
  let s = started();
  // Everyone declines every contract on its first pass round.
  for (let i = 0; i < 6; i++) {
    s = dispatch(s, offerOf(s).activeId, "PROCURE", { choice: "pass", deck: "engineering" });
    s = dispatch(s, offerOf(s).activeId, "PROCURE", { choice: "pass" });
  }
  assert.equal(s.phase, "PROCUREMENT", "procurement cannot end with contracts unowned");
  assert.equal(s.procurement.cleanup, true, "the Discount Yard cleanup begins");
  assert.equal(offerOf(s).fromYard, true, "yard contracts come back out one at a time");

  const firstYardPrice = offerOf(s).price;
  const yardId = offerOf(s).contractId;
  s = dispatch(s, offerOf(s).activeId, "PROCURE", { choice: "pass", deck: "engineering" });
  s = dispatch(s, offerOf(s).activeId, "PROCURE", { choice: "pass" });
  const requeued = s.procurement.yard.find((e) => e.contractId === yardId) ?? offerOf(s);
  assert.ok(
    requeued.price < firstYardPrice || firstYardPrice === SUBWAY_CONFIG.minContractPrice,
    "declining again in the yard cuts the price further"
  );

  // Let the cheapest offers get taken until the phase closes out.
  let guard = 0;
  while (s.phase === "PROCUREMENT" && guard++ < 60) {
    const offer = offerOf(s);
    const active = s.players[offer.activeId];
    const canBuy = active.lines.length < SUBWAY_CONFIG.maxContractsPerPlayer && active.money >= offer.price;
    s = canBuy
      ? dispatch(s, offer.activeId, "PROCURE", { choice: "buy" })
      : dispatch(s, offer.activeId, "PROCURE", {
          choice: "pass",
          ...(offer.stage === "first" ? { deck: "engineering" as const } : {}),
        });
  }
  assert.equal(s.phase, "ENGINEERING", "procurement ends once every contract is owned");
  assert.equal(s.engineeringStep, "PLAN", "and opens on the Engineering plan");
  assert.equal(
    s.players.red.lines.length + s.players.blue.lines.length,
    LINE_CONTRACTS.length,
    "all six contracts found an owner"
  );
  assert.ok(s.players.red.money >= 0 && s.players.blue.money >= 0, "nobody ends procurement in debt");
}

// 9. a company may not exceed the contract cap
// 10. the split therefore cannot leave anyone below the minimum
// 12. a forced owner cannot refuse
{
  let s = started();
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // branch  $6 → red 1
  s = dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" });
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // medium  $8 → red 2
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // express $9 → red 3 (cap)
  assert.equal(s.players.red.lines.length, SUBWAY_CONFIG.maxContractsPerPlayer, "red is at the cap");
  assert.equal(dispatch(s, "red", "PROCURE", { choice: "buy" }), s, "a capped company cannot buy again");

  // Offer 4 (crosstown) — blue has first refusal and is now the only possible owner.
  assert.equal(offerOf(s).firstRefusalId, "blue", "the alternation is unaffected by the cap");
  assert.equal(mustBuyOffer(s, "blue"), true, "blue is the only company that can still own it");
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" }), s, "so blue may not refuse");
  s = dispatch(s, "blue", "PROCURE", { choice: "buy" });

  // Offer 5 (long) — red has first refusal but is capped, so it may still pass for a card.
  assert.equal(offerOf(s).firstRefusalId, "red", "first refusal still alternates");
  s = dispatch(s, "red", "PROCURE", { choice: "pass", deck: "engineering" });
  s = dispatch(s, "blue", "PROCURE", { choice: "buy" });
  s = dispatch(s, "blue", "PROCURE", { choice: "buy" }); // short — forced again

  assert.equal(s.phase, "ENGINEERING", "the draft completes");
  assert.equal(s.players.red.lines.length, 3, "neither company exceeds three contracts");
  assert.equal(s.players.blue.lines.length, 3, "and six contracts across a cap of three forces an even split");
  assert.ok(ownershipFeasible(s, { red: 3, blue: 3 }), "3/3 satisfies the ownership range");
  assert.equal(ownershipFeasible(s, { red: 4, blue: 2 }), false, "4/2 no longer does");
}

// 11. a company that cannot pay cannot buy
{
  const s = started();
  s.players.red.money = contractById("branch")!.cost - 1;
  assert.equal(dispatch(s, "red", "PROCURE", { choice: "buy" }), s, "you cannot buy what you cannot afford");
  const passed = dispatch(s, "red", "PROCURE", { choice: "pass", deck: "engineering" });
  assert.equal(passed.procurement.offer!.stage, "second", "but you may always pass it along");
}

// ============================================================================
// PART 10 — Scheduling
// ============================================================================

/** A game parked at the start of scheduling with the given contracts. */
function scheduling(red: string[], blue: string[]): SubwayState {
  const s = base();
  s.phase = "SCHEDULING";
  s.schedulingStep = "PLANNING";
  s.oddPriorityId = "red";
  s.players.red.lines = red.map((id) => owned(id));
  s.players.blue.lines = blue.map((id) => owned(id));
  return s;
}

// 1. every owned contract receives a contiguous block
{
  let s = started();
  let guard = 0;
  while (s.phase === "PROCUREMENT" && guard++ < 60) {
    const offer = offerOf(s);
    const active = s.players[offer.activeId];
    s =
      active.lines.length < SUBWAY_CONFIG.maxContractsPerPlayer && active.money >= offer.price
        ? dispatch(s, offer.activeId, "PROCURE", { choice: "buy" })
        : dispatch(s, offer.activeId, "PROCURE", {
            choice: "pass",
            ...(offer.stage === "first" ? { deck: "engineering" as const } : {}),
          });
  }
  s = lockPlan(s, "red", { surveys: 0 });
  s = lockPlan(s, "blue", { surveys: 0 });
  assert.equal(s.phase, "SCHEDULING", "engineering hands over to scheduling");
  assert.equal(s.schedulingStep, "PLANNING", "which opens in private planning");
  for (const p of [s.players.red, s.players.blue]) {
    const fits =
      p.lines.reduce((sum, l) => sum + contractById(l.contractId)!.recipe.length, 0) <=
      SUBWAY_CONFIG.timelinePeriods;
    for (const line of p.lines) {
      const periods = blockPeriods(line);
      if (!periods.length) {
        // Only a portfolio too big to run end to end opens with anything shelved.
        assert.equal(fits, false, "a portfolio that fits is scheduled in full");
        continue;
      }
      assert.equal(
        periods.length,
        contractById(line.contractId)!.recipe.length,
        "a block is exactly as long as the contract's recipe"
      );
      assert.deepEqual(
        periods,
        Array.from({ length: periods.length }, (_, i) => periods[0] + i),
        "and it is contiguous"
      );
    }
    assert.equal(crewCost(p), 0, "the opening plan never charges for a second crew");
  }
  // A company holding more work than the horizon must compress or shelve.
  const heavy = [s.players.red, s.players.blue].filter(
    (p) => p.lines.reduce((sum, l) => sum + contractById(l.contractId)!.recipe.length, 0) > SUBWAY_CONFIG.timelinePeriods
  );
  for (const p of heavy) {
    assert.ok(
      p.lines.some((l) => l.start === undefined),
      "an over-committed portfolio opens with its overflow shelved"
    );
  }
}

// 4. mobilization cost by start period
{
  assert.equal(mobilizationFor(1), 3, "starting in period 1 carries the top surcharge");
  assert.equal(mobilizationFor(3), 3, "…through the end of that tier");
  assert.equal(mobilizationFor(4), 2, "the next tier is cheaper");
  assert.equal(mobilizationFor(7), 1, "and the next cheaper still");
  assert.equal(mobilizationFor(10), 0, "mobilizing late is free");

  let s = scheduling(["short"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  assert.equal(mobilizationCost(s.players.red), 3, "an early block is charged its tier");
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 10 });
  assert.equal(mobilizationCost(s.players.red), 0, "moving it late removes the charge");
}

// 2. own blocks may only overlap by paying for a second crew
// 3. opponent overlap is free
// 5. second-crew cost
{
  let s = scheduling(["short", "branch"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 }); // short: 4 actions → 1-4
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 1, start: 3 }); // branch: 5 actions → 3-7
  assert.equal(crewCost(s.players.red), 2 * SUBWAY_CONFIG.crewCostPerOverlapPeriod, "two shared periods cost two crews");
  assert.deepEqual(blockPeriods(s.players.red.lines[0]), [1, 2, 3, 4], "the first block is unchanged");

  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 1, start: 5 }); // now 5-9, no overlap
  assert.equal(crewCost(s.players.red), 0, "separating your own projects needs no extra crew");

  // The opposition sitting on the same periods costs nothing.
  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  assert.equal(crewCost(s.players.blue), 0, "opponent overlap is legal and free");
  assert.deepEqual(scheduleProblems(s.players.blue), [], "and raises no problem");
}

// 6. an unaffordable schedule cannot be submitted
// 7. schedules stay private until both are in
// 8. both reveal at once
{
  let s = scheduling(["short", "branch"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 1, start: 1 }); // fully overlapped
  s.players.red.money = 1;
  assert.ok(scheduleProblems(s.players.red).length > 0, "an unaffordable plan is flagged");
  assert.equal(dispatch(s, "red", "SUBMIT_SCHEDULE", {}), s, "and cannot be submitted");

  s.players.red.money = SUBWAY_CONFIG.startingMoney;
  s = dispatch(s, "red", "SUBMIT_SCHEDULE", {});
  assert.equal(s.players.red.scheduleSubmitted, true, "an affordable plan submits");
  assert.equal(s.schedulingStep, "PLANNING", "but the reveal waits for the opposition");
  assert.equal(dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 5 }), s, "a submitted plan is frozen");

  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 2 });
  s = dispatch(s, "blue", "SUBMIT_SCHEDULE", {});
  assert.equal(s.schedulingStep, "RESOLUTION", "both schedules reveal together");
}

// 9. a Scheduling card moves a legal block
// 10. the schedule then locks and is paid for
// 11. construction cannot begin until both confirm
{
  let s = scheduling(["medium"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 4 });
  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 4 });
  s = dispatch(s, "red", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "blue", "SUBMIT_SCHEDULE", {});
  assert.equal(s.schedulingStep, "RESOLUTION", "the cards window opens after the reveal");

  const before = mobilizationCost(s.players.red);
  s = dispatch(s, "red", "PLAY_SCHEDULING_CARD", { cardId: "early", lineIndex: 0 });
  assert.equal(s.players.red.lines[0].start, 3, "Early Mobilization pulls the block one period earlier");
  assert.equal(
    mobilizationCost(s.players.red),
    before,
    "and waives the surcharge that the earlier start would have added"
  );
  assert.equal(
    dispatch(s, "red", "PLAY_SCHEDULING_CARD", { cardId: "float", lineIndex: 0, direction: 1 }),
    s,
    "only one Scheduling card per company"
  );

  s = dispatch(s, "blue", "PLAY_SCHEDULING_CARD", { cardId: "float", lineIndex: 0, direction: 1 });
  assert.equal(s.players.blue.lines[0].start, 5, "Float slides a block after the reveal");

  const redCost = scheduleCost(s.players.red);
  const redCash = s.players.red.money;
  s = dispatch(s, "red", "CONFIRM_SCHEDULE", {});
  assert.equal(s.phase, "SCHEDULING", "construction waits for both confirmations");
  assert.equal(s.players.red.money, redCash, "and nothing is charged until both are in");
  s = dispatch(s, "blue", "CONFIRM_SCHEDULE", {});
  assert.equal(s.phase, "STARTER_PLACEMENT", "locking both schedules moves on to starter pegs");
  assert.equal(s.players.red.money, redCash - redCost, "mobilization and crew are paid at lock");
  assert.equal(s.players.red.schedulePaid, redCost, "and recorded");
}

// The Priority Permit still overrides exactly one contested period.
{
  let s = scheduling(["medium"], ["medium"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "blue", "SUBMIT_SCHEDULE", {});
  assert.equal(periodPriorityId(s, 2), "blue", "period 2 belongs to the even company");
  s = dispatch(s, "blue", "PLAY_SCHEDULING_CARD", { cardId: "priority", period: 1 });
  assert.equal(periodPriorityId(s, 1), "blue", "the permit takes an odd period from its owner");
  assert.equal(periodPriorityId(s, 3), "red", "and leaves the rest of the calendar alone");
}

// 12–15. construction executes the locked plan, then scoring
{
  let s = scheduling(["short"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "blue", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "red", "CONFIRM_SCHEDULE", {});
  s = dispatch(s, "blue", "CONFIRM_SCHEDULE", {});
  assert.equal(s.phase, "STARTER_PLACEMENT", "schedules are locked");

  assert.equal(starterTurnId(s), "red", "the odd-period company places first");
  assert.equal(dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 24, y: 8 }), s, "placement alternates");
  s = dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 0, y: 0 });
  assert.equal(starterTurnId(s), "blue", "then the other company");
  s = dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 24, y: 8 });
  assert.equal(s.phase, "CONSTRUCTION", "construction opens once every starter is down");
  assert.equal(s.currentPeriod, 1, "at period 1");

  // 12. scheduling is over for good
  assert.equal(dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 6 }), s, "blocks cannot move once building starts");
  assert.equal(dispatch(s, "red", "SUBMIT_SCHEDULE", {}), s, "and there is no second scheduling phase");

  // 13. the right line gets exactly one action in each scheduled period
  assert.deepEqual(s.players.red.pendingActions, scheduledLines(s.players.red, 1), "the scheduled line is queued");
  assert.equal(s.players.red.pendingActions.length, 1, "one action per scheduled period per line");
  assert.deepEqual(s.resolveQueue, ["red", "blue"], "priority orders the period");

  // 14. a skipped action is lost
  const beforeSkip = s.players.red.lines[0].route.length;
  s = dispatch(s, "red", "SKIP_ACTION", {});
  assert.equal(s.players.red.lines[0].route.length, beforeSkip, "skipping builds nothing");
  assert.deepEqual(s.resolveQueue, ["blue"], "and hands the period on");
  assert.equal(s.undo, undefined, "a skip is not a placement, so there is nothing to undo");
  s = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 24, y: 5 });
  assert.equal(s.currentPeriod, 2, "the period advances when everyone is done");
  assert.equal(s.players.red.lines[0].route.length, 1, "the lost action never came back");

  // 15. run the rest of the plan out; scoring waits for the last period
  let guard = 0;
  while (s.phase === "CONSTRUCTION" && guard++ < 40) {
    const actor = s.resolveQueue[0];
    const lineIndex = s.players[actor].pendingActions[0];
    // Build the recipe out, preferring a node that does not box the line in.
    const rivals = s.playerOrder
      .filter((id) => id !== actor)
      .flatMap((id) => s.players[id].lines.flatMap((l) => l.route));
    const clearance = (t: { x: number; y: number }) =>
      rivals.reduce((min, n) => Math.min(min, Math.hypot(n.x - t.x, n.y - t.y)), Infinity);
    const options = [...legalTargets(s, actor, lineIndex)].sort((a, b) => clearance(b) - clearance(a));
    let played: SubwayState | undefined;
    let fallback: SubwayState | undefined;
    for (const o of options) {
      const next = dispatch(s, actor, "BUILD", { lineIndex, x: o.x, y: o.y, slot: o.slot });
      if (next === s) continue;
      fallback ??= next;
      const line = next.players[actor].lines[lineIndex];
      if (lineComplete(line) || hasLegalMove(next, actor, lineIndex)) {
        played = next;
        break;
      }
    }
    s = played ?? fallback ?? dispatch(s, actor, "SKIP_ACTION", {});
  }
  assert.equal(s.phase, "SCORING", "construction runs to the end of the plan, then scores");
  assert.ok(
    s.players.red.lines[0].route.length < contractNodes(contractById("short")!),
    "red's skipped action left its contract short"
  );

  s = dispatch(s, "red", "ADVANCE_SCORING", {});
  assert.equal(s.phase, "RESULTS", "the host reveals the scoring");
  const redPenalty = s.players.red.scoreBreakdown!.find((i) => i.label.includes("Short Line"))!;
  assert.equal(redPenalty.points, contractById("short")!.incompletePenalty, "an unfinished contract is penalised");
  const bluePaid = s.players.blue.scoreBreakdown!.find((i) => i.label.includes("Short Line"))!;
  assert.equal(bluePaid.points, contractById("short")!.completionVp, "a delivered one pays out");
}

// A shelved contract gets no starter peg — it is never built, so a peg for it
// would just be a free blocker on the board.
{
  let s = scheduling(["short", "long"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 1, start: null });
  s = dispatch(s, "blue", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "blue", "SUBMIT_SCHEDULE", {});
  s = dispatch(s, "red", "CONFIRM_SCHEDULE", {});
  s = dispatch(s, "blue", "CONFIRM_SCHEDULE", {});
  assert.equal(s.phase, "STARTER_PLACEMENT", "schedules lock");
  assert.deepEqual(pendingStarters(s.players.red), [0], "only the scheduled contract is owed a peg");

  assert.equal(
    dispatch(s, "red", "PLACE_STARTER", { lineIndex: 1, x: 0, y: 0 }),
    s,
    "a shelved contract cannot take a starter peg"
  );
  s = dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 0, y: 0 });
  assert.deepEqual(pendingStarters(s.players.red), [], "red is finished after its one scheduled line");
  assert.equal(starterTurnId(s), "blue", "and play passes to the opposition");
  s = dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 8, y: 8 });
  assert.equal(s.phase, "CONSTRUCTION", "construction begins without a peg for the shelved line");
  assert.equal(s.players.red.lines[1].route.length, 0, "the shelved contract never reaches the board");
}

// A shelved contract simply scores its penalty rather than blocking the phase.
{
  let s = scheduling(["short", "long"], ["short"]);
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 0, start: 1 });
  s = dispatch(s, "red", "SET_SCHEDULE", { lineIndex: 1, start: null });
  assert.deepEqual(blockPeriods(s.players.red.lines[1]), [], "a shelved contract occupies no periods");
  assert.equal(lineMobilization(s.players.red.lines[1]), 0, "and costs nothing to mobilize");
  assert.deepEqual(scheduleProblems(s.players.red), [], "shelving is a legal, if costly, plan");
}

// ============================================================================
// PART 11 — Construction cards under ordered recipes
// ============================================================================
{
  // Overtime doubles a line's action; Surge Crew opens another. Both still stop
  // at the recipe's own limit.
  let s = construction(
    [{ ...owned("short", [{ x: 0, y: 0 }]), start: 1 }, { ...owned("medium", [{ x: 0, y: 8 }]), start: 1 }],
    [{ ...owned("short", [{ x: 20, y: 4 }]), start: 1 }]
  );
  s.players.red.pendingActions = [0];

  const surged = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "surge", lineIndex: 1 });
  assert.deepEqual(surged.players.red.pendingActions, [0, 1], "Surge Crew adds a second project");
  const overtimed = dispatch(s, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "overtime", lineIndex: 0 });
  assert.deepEqual(overtimed.players.red.pendingActions, [0, 0], "Overtime doubles up on the same line");

  // A line one node from done cannot be doubled — there is no second segment.
  const nearlyDone = construction(
    [
      {
        ...owned("short", [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 0 }]),
        start: 1,
      },
    ],
    [{ ...owned("short", [{ x: 20, y: 4 }]), start: 1 }]
  );
  assert.equal(
    dispatch(nearlyDone, "red", "PLAY_CONSTRUCTION_CARD", { cardId: "overtime", lineIndex: 0 }),
    nearlyDone,
    "Overtime cannot queue an action the recipe does not have"
  );
}

// A boxed-in line loses its queued action rather than deadlocking the period.
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 0 }])];
  s.players.blue.lines = [owned("medium", [{ x: 0, y: 2 }, { x: 2, y: 0 }])];
  assert.equal(hasLegalMove(s, "red", 0), false, "a cornered line has no legal move at its required length");
  assert.equal(hasLegalMove(s, "blue", 0), true, "the opposing line still has some");
}

// ============================================================================
// PART 12 — Spatial rules, retained under ordered geometry
// ============================================================================
{
  const s = base();
  s.players.red.lines = [owned("short")];
  s.players.blue.lines = [owned("short", [{ x: 14, y: 2, stationId: "garden", stationSlot: 0 }, { x: 4, y: 6 }])];
  assert.match(validateNode(s, "red", 0, { x: 5, y: 5 }) ?? "", /empty hole/, "opposing normal nodes enforce spacing");
  assert.equal(validateNode(s, "red", 0, { x: 6, y: 5 }), null, "spacing stops one hole away (no walls)");
  assert.equal(validateNode(s, "red", 0, { x: 15, y: 2 }), null, "station nodes do not project spacing");
  assert.match(validateNode(s, "red", 0, { x: 5, y: 3 }, true) ?? "", /normal hole/, "starters cannot use stations");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 6 }) ?? "", /occupied/, "normal pegs are never shared");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 3 }])];
  s.players.blue.lines = [owned("short", [{ x: 2, y: 0 }, { x: 2, y: 6 }])];
  assert.match(validateNode(s, "red", 0, { x: 3, y: 3 }) ?? "", /Crossing Design/, "crossing needs the permit");
  s.players.red.committedEngineering = ["crossing"];
  assert.equal(validateNode(s, "red", 0, { x: 3, y: 3 }), null, "Crossing Design permits one crossing");
  s.players.red.crossingsUsed = 1;
  assert.match(validateNode(s, "red", 0, { x: 3, y: 3 }) ?? "", /only one/, "the permitted crossing is single-use");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 3 }]), owned("medium", [{ x: 1, y: 1 }, { x: 1, y: 5 }])];
  s.players.red.committedEngineering = ["crossing"];
  assert.match(validateNode(s, "red", 0, { x: 3, y: 3 }) ?? "", /own lines cannot cross/, "self-crossing stays illegal");

  const close = base();
  close.players.red.lines = [owned("short", [{ x: 0, y: 0 }]), owned("medium", [{ x: 2, y: 1 }, { x: 2, y: 4 }])];
  assert.equal(validateNode(close, "red", 0, { x: 3, y: 0 }), null, "your own lines may run close together");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 12, y: 2 }, { x: 14, y: 2, stationId: "garden", stationSlot: 0 }])];
  assert.match(
    validateNode(s, "red", 0, { x: 14, y: 2 }, false, 1) ?? "",
    /already connects/,
    "one line docks a station once"
  );
}

// ============================================================================
// PART 13 — Scoring the new commitments
// ============================================================================
{
  let s = base();
  s.phase = "SCORING";
  s.players.red.lines = [
    owned("short", [
      { x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 },
      { x: 8, y: 3 }, { x: 10, y: 6, stationId: "museum", stationSlot: 0 },
    ]),
    owned("medium", [{ x: 20, y: 1 }, { x: 23, y: 1 }]),
  ];
  s.players.red.committedEngineering = ["network", "terminal", "minimal"];
  s.players.red.destinationCommitments = [
    { cardId: "dest-grand", stationId: "grand", lineIndex: 0 },
    { cardId: "dest-harbor", stationId: "harbor", lineIndex: 0 },
    { cardId: "dest-stadium", stationId: "stadium", lineIndex: 1 },
  ];
  s.players.red.destinationHand = ["dest-market"];
  s.surveyPins = [
    { playerId: "red", lineIndex: 0, x: 8, y: 3 }, // on the built route
    { playerId: "red", lineIndex: 1, x: 8, y: 3 }, // right hole, wrong line
    { playerId: "red", lineIndex: 0, x: 25, y: 8 }, // never reached
  ];
  s.players.blue.lines = [owned("long")];

  assert.equal(destinationMet(s.players.red, s.players.red.destinationCommitments[0]), true, "a served Destination is met");
  assert.equal(destinationMet(s.players.red, s.players.red.destinationCommitments[1]), false, "an unserved one is not");

  s = dispatch(s, "red", "ADVANCE_SCORING", {});
  const items = s.players.red.scoreBreakdown!;
  const byLabel = (needle: string) => items.filter((i) => i.label.includes(needle));

  assert.equal(byLabel("Destination: Grand Central")[0].points, SUBWAY_CONFIG.destinationVp, "a met Destination scores +3");
  assert.equal(byLabel("Destination: Harbor Exchange")[0].points, 0, "an unmet one scores nothing");
  assert.equal(byLabel("Destination: Stadium")[0].points, 0, "and a barely-started line earns nothing either");
  assert.equal(byLabel("Destination: Market").length, 0, "an unassigned Destination is not scored at all");

  const pins = byLabel("Survey Pin");
  assert.equal(pins.length, 3, "every bought and placed pin is accounted for");
  assert.equal(pins.filter((p) => p.met).length, 1, "only the pin whose own line reached it pays out");
  assert.equal(pins.find((p) => p.met)!.points, SUBWAY_CONFIG.survey.vp, "and it pays +1");

  assert.equal(byLabel("Network Link")[0].points, 3, "Network Link scores on a completed two-station line");
  assert.equal(byLabel("Minimal Footprint")[0].points, 0, "with one contract unfinished, Minimal Footprint does not");
}

// A Destination on an incomplete line still scores if the station was reached.
{
  const p = base().players.red;
  p.lines = [
    owned("long", [{ x: 1, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3, stationId: "grand", stationSlot: 0 }]),
  ];
  assert.equal(lineComplete(p.lines[0]), false, "the line is nowhere near finished");
  assert.equal(
    destinationMet(p, { cardId: "dest-grand", stationId: "grand", lineIndex: 0 }),
    true,
    "but the Destination it was assigned is served, so it scores"
  );
}

// ============================================================================
// PART 14 — Persisted state version
// ============================================================================
{
  const stale = { ...base(), version: SUBWAY_STATE_VERSION - 1 };
  assert.equal(
    dispatch(stale, "red", "LOCK_ENGINEERING_PLAN", { cardIds: OPENING_THREE }),
    stale,
    "a room saved by an older version accepts no play"
  );
  const restarted = dispatch(stale, "red", "START_GAME");
  assert.equal(restarted.version, SUBWAY_STATE_VERSION, "only a restart brings it current");
  assert.equal(restarted.phase, "PROCUREMENT", "as a brand new game");
  assert.ok(SUBWAY_STATE_VERSION >= 6, "and the version was bumped for the WS-002 shape");
}

console.log(
  "Subway rules checks passed (ordered contract recipes, ±0.5 segment lengths, the 90° turn cap, " +
    "explicit station docks and dock races, alternating odd/even priority, Network Link, Destination " +
    "drafting/assignment/scoring, Survey purchase/placement/fulfilment, one-deep placement undo, " +
    "single-pass loop, six-contract first-refusal procurement, Discount Yard, ownership range, Gantt " +
    "scheduling, mobilization + second-crew economics, simultaneous reveal, schedule lock, construction " +
    "execution, skipping, scoring, spatial rules, state versioning)."
);
