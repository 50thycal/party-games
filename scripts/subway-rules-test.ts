import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import {
  LINE_CONTRACTS,
  SUBWAY_CONFIG,
  blockPeriods,
  contractById,
  contractsOutstanding,
  crewCost,
  hasLegalMove,
  lineMobilization,
  marketEngineering,
  mobilizationCost,
  mobilizationFor,
  mustBuyOffer,
  objectiveMet,
  ownershipFeasible,
  scheduleCost,
  scheduleProblems,
  scheduledLines,
  starterTurnId,
  subwayGame,
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
const context = (playerId: string): GameContext => ({ room, playerId, now: () => 1, random: () => 0 });

const dispatch = (s: SubwayState, playerId: string, type: SubwayAction["type"], payload?: SubwayAction["payload"]) =>
  subwayGame.reducer(s, { type, playerId, payload }, context(playerId));

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

// With random()=0 the Fisher-Yates shuffle is fully determined.
const DECK_ORDER = ["branch", "medium", "express", "crosstown", "long", "short"];

// ============================================================================
// PART 9 — Procurement
// ============================================================================

// 14. procurement alternates the first-refusal player
{
  let s = started();
  assert.equal(s.phase, "PROCUREMENT", "the host starts straight into procurement");
  assert.equal(s.priorityPlayerId, "red", "priority is assigned at setup");
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
  assert.equal(
    s.players.red.lines.length + s.players.blue.lines.length,
    LINE_CONTRACTS.length,
    "all six contracts found an owner"
  );
  assert.ok(s.players.red.money >= 0 && s.players.blue.money >= 0, "nobody ends procurement in debt");
}

// 9. a company may not exceed four contracts
// 10. the split can therefore never leave anyone below two
// 12. a forced owner cannot refuse
{
  let s = started();
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // branch  $6  → red 1
  s = dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" });
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // medium  $8  → red 2
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // express $9  → red 3
  s = dispatch(s, "blue", "PROCURE", { choice: "pass", deck: "engineering" });
  s = dispatch(s, "red", "PROCURE", { choice: "buy" }); // crosstown $10 → red 4 (cap)
  assert.equal(s.players.red.lines.length, SUBWAY_CONFIG.maxContractsPerPlayer, "red is at the cap");

  // Offer 5 (long) — red has first refusal but can no longer hold a contract.
  assert.equal(offerOf(s).firstRefusalId, "red", "the alternation is unaffected by the cap");
  assert.equal(dispatch(s, "red", "PROCURE", { choice: "buy" }), s, "a capped company cannot buy");
  s = dispatch(s, "red", "PROCURE", { choice: "pass", deck: "engineering" });
  assert.equal(mustBuyOffer(s, "blue"), true, "blue is now the only company that can own it");
  assert.equal(dispatch(s, "blue", "PROCURE", { choice: "pass" }), s, "so blue may not refuse");
  s = dispatch(s, "blue", "PROCURE", { choice: "buy" });

  s = dispatch(s, "blue", "PROCURE", { choice: "buy" }); // short — forced again
  assert.equal(s.phase, "ENGINEERING", "the draft completes");
  assert.equal(s.players.red.lines.length, 4, "one company may run four projects");
  assert.equal(
    s.players.blue.lines.length,
    SUBWAY_CONFIG.minContractsPerPlayer,
    "which leaves the other exactly the minimum two"
  );
  assert.ok(ownershipFeasible(s, { red: 4, blue: 2 }), "a 4/2 split satisfies the ownership range");
  assert.equal(ownershipFeasible(s, { red: 5, blue: 1 }), false, "5/1 never is");
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
  s = dispatch(s, "red", "COMMIT_ENGINEERING", { cardIds: ["straight", "long-segment", "terminal"] });
  s = dispatch(s, "blue", "COMMIT_ENGINEERING", { cardIds: ["straight", "bend", "terminal"] });
  assert.equal(s.phase, "SCHEDULING", "engineering hands straight over to scheduling");
  assert.equal(s.schedulingStep, "PLANNING", "which opens in private planning");
  for (const p of [s.players.red, s.players.blue]) {
    const fits =
      p.lines.reduce((sum, l) => sum + (contractById(l.contractId)!.nodes - 1), 0) <=
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
        contractById(line.contractId)!.nodes - 1,
        "a block is exactly as long as the contract's construction actions"
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
    (p) => p.lines.reduce((sum, l) => sum + (contractById(l.contractId)!.nodes - 1), 0) > SUBWAY_CONFIG.timelinePeriods
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

  assert.equal(starterTurnId(s), "red", "the priority company places first");
  assert.equal(dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 8, y: 8 }), s, "placement alternates");
  s = dispatch(s, "red", "PLACE_STARTER", { lineIndex: 0, x: 0, y: 0 });
  assert.equal(starterTurnId(s), "blue", "then the other company");
  s = dispatch(s, "blue", "PLACE_STARTER", { lineIndex: 0, x: 8, y: 8 });
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
  s = dispatch(s, "blue", "BUILD", { lineIndex: 0, x: 8, y: 6 });
  assert.equal(s.currentPeriod, 2, "the period advances when everyone is done");
  assert.equal(s.players.red.lines[0].route.length, 1, "the lost action never came back");

  // 15. run the rest of the plan out; scoring waits for the last period
  let guard = 0;
  while (s.phase === "CONSTRUCTION" && guard++ < 40) {
    const actor = s.resolveQueue[0];
    const lineIndex = s.players[actor].pendingActions[0];
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
      for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
        if (!validateNode(s, actor, lineIndex, { x, y })) cells.push({ x, y });
      }
    }
    s = cells.length
      ? dispatch(s, actor, "BUILD", { lineIndex, ...cells[0] })
      : dispatch(s, actor, "SKIP_ACTION", {});
  }
  assert.equal(s.phase, "SCORING", "construction runs to the end of the plan, then scores");
  assert.ok(
    s.players.red.lines[0].route.length < contractById("short")!.nodes,
    "red's skipped action left its contract short"
  );

  s = dispatch(s, "red", "ADVANCE_SCORING", {});
  assert.equal(s.phase, "RESULTS", "the host reveals the scoring");
  const redPenalty = s.players.red.scoreBreakdown!.find((i) => i.label.includes("Short Line"))!;
  assert.equal(redPenalty.points, contractById("short")!.incompletePenalty, "an unfinished contract is penalised");
  const bluePaid = s.players.blue.scoreBreakdown!.find((i) => i.label.includes("Short Line"))!;
  assert.equal(bluePaid.points, contractById("short")!.completionVp, "a delivered one pays out");
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
// Spatial rules — unchanged by the redesign, still guarded
// ============================================================================
{
  const s = base();
  s.players.red.lines = [owned("short")];
  s.players.blue.lines = [owned("short", [{ x: 4, y: 4, stationId: "garden", stationSlot: 0 }, { x: 4, y: 6 }])];
  assert.match(validateNode(s, "red", 0, { x: 5, y: 5 }) ?? "", /empty hole/, "opposing normal nodes enforce spacing");
  assert.equal(validateNode(s, "red", 0, { x: 6, y: 5 }), null, "spacing stops one hole away (no walls)");
  assert.equal(validateNode(s, "red", 0, { x: 5, y: 4 }), null, "station nodes do not project spacing");
  assert.match(validateNode(s, "red", 0, { x: 2, y: 2 }, true) ?? "", /normal hole/, "starters cannot use stations");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 6 }) ?? "", /occupied/, "normal pegs are never shared");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 3 }])];
  s.players.blue.lines = [owned("short", [{ x: 2, y: 1 }, { x: 2, y: 4 }])];
  assert.match(validateNode(s, "red", 0, { x: 4, y: 3 }) ?? "", /Crossing Design/, "crossing needs the permit");
  s.players.red.committedEngineering = ["crossing"];
  assert.equal(validateNode(s, "red", 0, { x: 4, y: 3 }), null, "Crossing Design permits one crossing");
  s.players.red.crossingsUsed = 1;
  assert.match(validateNode(s, "red", 0, { x: 4, y: 3 }) ?? "", /only one/, "the permitted crossing is single-use");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 0 }]), owned("medium", [{ x: 0, y: 4 }, { x: 4, y: 0 }])];
  s.players.red.committedEngineering = ["crossing"];
  assert.match(validateNode(s, "red", 0, { x: 4, y: 4 }) ?? "", /own lines cannot cross/, "self-crossing stays illegal");
  assert.equal(validateNode(s, "red", 0, { x: 1, y: 1 }), null, "your own lines may run close together");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 2, y: 4 }, { x: 4, y: 4, stationId: "garden", stationSlot: 0 }])];
  s.players.blue.lines = [owned("short", [{ x: 6, y: 4 }])];
  assert.equal(validateNode(s, "blue", 0, { x: 4, y: 4 }), null, "a station dock takes one connection per line");
  assert.match(validateNode(s, "red", 0, { x: 4, y: 4 }) ?? "", /already connects/, "one line docks a station once");
  s.players.red.lines.push(owned("medium", [{ x: 4, y: 2 }, { x: 4, y: 4, stationId: "garden", stationSlot: 1 }]));
  assert.match(validateNode(s, "blue", 0, { x: 4, y: 4 }) ?? "", /capacity/, "a full station rejects further connections");
}
{
  const s = base();
  s.players.red.lines = [owned("short", [{ x: 0, y: 0 }])];
  s.players.blue.lines = [owned("short", [{ x: 0, y: 2 }, { x: 2, y: 0 }])];
  assert.equal(hasLegalMove(s, "red", 0), false, "a cornered line has no legal moves");
  assert.equal(hasLegalMove(s, "blue", 0), true, "the opposing line still has some");
}
{
  const p = base().players.red;
  p.lines = [owned("short", [{ x: 0, y: 0 }, { x: 1, y: 2 }]), owned("medium", [{ x: 8, y: 0 }, { x: 8, y: 3 }])];
  assert.equal(objectiveMet("long-segment", p, []), true, "an objective may be met by either line");
  assert.equal(objectiveMet("minimal", p, []), false, "Minimal Footprint needs every contract delivered");
}

console.log(
  "Subway rules checks passed (single-pass loop, six-contract first-refusal procurement, Discount Yard, ownership range, Gantt scheduling, mobilization + second-crew economics, simultaneous reveal, schedule lock, construction execution, skipping, scoring, spatial rules)."
);
