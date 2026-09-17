import assert from "node:assert/strict";
import {
  SUBWAY_CONFIG,
  contractById,
  stationAt,
  subwayGame,
  type SubwayState,
  type SubwayTelemetryEvent,
} from "../src/games/subway/config";
import { testRoom, runPlaytest } from "../src/games/subway/playtest";
import { generateAiPlaytestReport } from "../src/games/subway/report";
import {
  aggregateStrategies,
  analyzeStrategies,
  datasetRows,
  extractFeatures,
  phaseOfPeriod,
  reconstructTimeline,
  strategyCombinations,
  STRATEGY_CLASSIFIER_VERSION,
  STRATEGY_EVIDENCE_FLOOR,
  STRATEGY_IDS,
  STRATEGY_OCCURRENCE_THRESHOLD,
} from "../src/games/subway/strategy";

// ----------------------------------------------------------------------------
// Synthetic fixtures. Hand-built telemetry lets each calibration case isolate
// exactly one behaviour, which a real simulation never does.
// ----------------------------------------------------------------------------

const room = testRoom(2);
const [A, B] = room.players.map(p => p.id);

type Scripted = { actor: string; action: string; lineIndex?: number; x?: number; y?: number; period: number; money?: Record<string, number>; tolls?: Record<string, number>; completed?: Record<string, string[]> };

function build(script: Scripted[], setup: (s: SubwayState) => void): SubwayState {
  const game = subwayGame.initialState(room.players);
  game.phase = "RESULTS";
  game.startedAt = 1;
  game.constructionEndedAt = 2;
  game.winnerIds = [A];
  setup(game);
  const money: Record<string, number> = Object.fromEntries(room.players.map(p => [p.id, SUBWAY_CONFIG.startingMoney]));
  const tolls: Record<string, number> = Object.fromEntries(room.players.map(p => [p.id, 0]));
  const completed: Record<string, string[]> = Object.fromEntries(room.players.map(p => [p.id, []]));
  const counts: Record<string, number[]> = Object.fromEntries(room.players.map(p => [p.id, game.players[p.id].lines.map(() => 0)]));
  const snap = (): SubwayTelemetryEvent["playersBefore"] => Object.fromEntries(room.players.map(p => [p.id, {
    money: money[p.id], crewPaid: 0, tollsPaid: tolls[p.id], engineeringCards: [...game.players[p.id].engineeringHand],
    destinationCards: [...game.players[p.id].destinationHand], destinationPurchased: false,
    lineNodeCounts: [...counts[p.id]], completedLines: [...completed[p.id]],
  }]));
  game.telemetry = script.map((step, i) => {
    const before = snap();
    if (step.money) for (const [id, value] of Object.entries(step.money)) money[id] = value;
    if (step.tolls) for (const [id, value] of Object.entries(step.tolls)) tolls[id] = value;
    if (step.completed) for (const [id, value] of Object.entries(step.completed)) completed[id] = value;
    if ((step.action === "BUILD" || step.action === "PLACE_STARTER") && step.lineIndex !== undefined) {
      counts[step.actor][step.lineIndex] = (counts[step.actor][step.lineIndex] ?? 0) + 1;
    }
    return {
      actionNumber: i + 1, acceptedAt: i + 1, actorId: step.actor, action: step.action as SubwayTelemetryEvent["action"],
      payload: step.lineIndex === undefined ? {} : { lineIndex: step.lineIndex, x: step.x, y: step.y },
      phaseBefore: "CONSTRUCTION", phaseAfter: "CONSTRUCTION",
      periodBefore: step.period, periodAfter: step.period,
      playersBefore: before, playersAfter: snap(),
    } as SubwayTelemetryEvent;
  });
  // Final routes must agree with the scripted placements.
  for (const p of room.players) {
    game.players[p.id].lines.forEach((line, index) => {
      line.route = script.filter(s => s.actor === p.id && s.lineIndex === index && s.x !== undefined).map(s => {
        const station = stationAt({ x: s.x!, y: s.y! }, game.stations);
        return { x: s.x!, y: s.y!, ...(station ? { stationId: station.id } : {}) };
      });
    });
    game.players[p.id].money = money[p.id];
    game.players[p.id].tollsPaid = tolls[p.id];
  }
  return game;
}

const lineOf = (contractId: string) => ({ contractId, paid: contractById(contractId)!.cost, start: 1, route: [] });
const scoreOf = (game: SubwayState, id: string, vp: number) => { game.players[id].score = vp; };

// ----------------------------------------------------------------------------
// Calibration: deliberate leverage must outscore an accidental overdraft.
// ----------------------------------------------------------------------------
{
  const deliberate = build([
    { actor: A, action: "PLACE_STARTER", lineIndex: 0, x: 0, y: 0, period: 1 },
    { actor: A, action: "BUILD", lineIndex: 0, x: 2, y: 0, period: 2, money: { [A]: 20 } },
    { actor: A, action: "HIRE_CREWS", period: 8, money: { [A]: -6 } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 4, y: 0, period: 8, money: { [A]: -6 } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 6, y: 0, period: 8, money: { [A]: -5 } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 8, y: 0, period: 9, money: { [A]: -5 } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 10, y: 0, period: 9, money: { [A]: -4 }, completed: { [A]: ["short"] } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 12, y: 0, period: 9, money: { [A]: -3 } },
  ], s => { s.players[A].lines = [lineOf("short")]; s.players[B].lines = []; scoreOf(s, A, 20); });

  const accidental = build([
    { actor: A, action: "PLACE_STARTER", lineIndex: 0, x: 0, y: 0, period: 1 },
    { actor: A, action: "BUILD", lineIndex: 0, x: 2, y: 0, period: 2, money: { [A]: 20 } },
    { actor: A, action: "BUILD", lineIndex: 0, x: 4, y: 0, period: 4, money: { [A]: 8 } },
    { actor: A, action: "HIRE_CREWS", period: 9, money: { [A]: -1 } },
  ], s => { s.players[A].lines = [lineOf("short")]; s.players[B].lines = []; scoreOf(s, A, 20); });

  const strong = analyzeStrategies(deliberate, { evolution: false }).players.find(p => p.playerId === A)!;
  const weak = analyzeStrategies(accidental, { evolution: false }).players.find(p => p.playerId === A)!;
  const strongScore = strong.fingerprint.leveraged_expander, weakScore = weak.fingerprint.leveraged_expander;
  assert.ok(strongScore >= STRATEGY_OCCURRENCE_THRESHOLD, `deliberate leverage should register: ${strongScore}`);
  assert.ok(weakScore < STRATEGY_EVIDENCE_FLOOR, `an accidental $1M overdraft should not: ${weakScore}`);
  assert.ok(strongScore - weakScore >= 30, "the gap between leverage and overspending must be substantial");
  assert.equal(strong.results.find(r => r.strategy === "leveraged_expander")!.evidence.peak_debt, 6);
  assert.equal(weak.results.find(r => r.strategy === "leveraged_expander")!.evidence.peak_debt, 1);
  console.log(`Leveraged Expander calibration: deliberate ${strongScore} vs accidental ${weakScore}.`);
}

// ----------------------------------------------------------------------------
// Calibration: one interconnected network must outscore three isolated lines.
// ----------------------------------------------------------------------------
{
  const connected = build([
    { actor: A, action: "PLACE_STARTER", lineIndex: 0, x: 5, y: 4, period: 1 },
    { actor: A, action: "PLACE_STARTER", lineIndex: 1, x: 5, y: 5, period: 1 },
    { actor: A, action: "PLACE_STARTER", lineIndex: 2, x: 6, y: 5, period: 1 },
    { actor: A, action: "BUILD", lineIndex: 0, x: 6, y: 4, period: 2 },
    { actor: A, action: "BUILD", lineIndex: 1, x: 5, y: 6, period: 3 },
    { actor: A, action: "BUILD", lineIndex: 2, x: 7, y: 5, period: 4 },
  ], s => { s.players[A].lines = [lineOf("short"), lineOf("tram"), lineOf("river")]; s.players[B].lines = []; scoreOf(s, A, 20); });

  const isolated = build([
    { actor: A, action: "PLACE_STARTER", lineIndex: 0, x: 0, y: 0, period: 1 },
    { actor: A, action: "PLACE_STARTER", lineIndex: 1, x: 13, y: 8, period: 1 },
    { actor: A, action: "PLACE_STARTER", lineIndex: 2, x: 26, y: 2, period: 1 },
    { actor: A, action: "BUILD", lineIndex: 0, x: 2, y: 0, period: 2 },
    { actor: A, action: "BUILD", lineIndex: 1, x: 15, y: 8, period: 3 },
    { actor: A, action: "BUILD", lineIndex: 2, x: 24, y: 2, period: 4 },
  ], s => { s.players[A].lines = [lineOf("short"), lineOf("tram"), lineOf("river")]; s.players[B].lines = []; scoreOf(s, A, 20); });

  const together = analyzeStrategies(connected, { evolution: false }).players[0].fingerprint.network_engineer;
  const apart = analyzeStrategies(isolated, { evolution: false }).players[0].fingerprint.network_engineer;
  assert.ok(together - apart >= 30, `connected ${together} should far exceed isolated ${apart}`);
  assert.ok(apart < STRATEGY_OCCURRENCE_THRESHOLD, "three isolated lines are not a network");
  console.log(`Network Engineer calibration: connected ${together} vs isolated ${apart}.`);
}

// ----------------------------------------------------------------------------
// Calibration: repeat rent from several opponents beats one incidental payment.
// ----------------------------------------------------------------------------
{
  const landlordRoom = testRoom(3);
  const [L, X, Y] = landlordRoom.players.map(p => p.id);
  const rent = (payments: { payer: string; to: number }[]) => {
    const game = subwayGame.initialState(landlordRoom.players);
    game.phase = "RESULTS"; game.winnerIds = [L];
    for (const p of landlordRoom.players) game.players[p.id].lines = [lineOf("short")];
    game.players[L].lines[0].route = [{ x: 5, y: 4 }, { x: 7, y: 4 }];
    game.players[L].score = 20;
    let balance: number = SUBWAY_CONFIG.startingMoney;
    game.telemetry = payments.map((payment, i) => {
      const before = balance; balance = payment.to;
      const snapshot = (value: number) => Object.fromEntries(landlordRoom.players.map(p => [p.id, {
        money: p.id === L ? value : SUBWAY_CONFIG.startingMoney, crewPaid: 0, tollsPaid: 0,
        engineeringCards: [], destinationCards: [], destinationPurchased: false,
        lineNodeCounts: [2], completedLines: [],
      }]));
      return {
        actionNumber: i + 1, acceptedAt: i + 1, actorId: payment.payer, action: "BUILD",
        payload: { lineIndex: 0, x: 6, y: 5 }, phaseBefore: "CONSTRUCTION", phaseAfter: "CONSTRUCTION",
        periodBefore: 3, periodAfter: 3, playersBefore: snapshot(before), playersAfter: snapshot(balance),
      } as SubwayTelemetryEvent;
    });
    game.players[L].money = balance;
    return game;
  };
  // A real rent roll: repeated access payments from both opponents all game.
  const busy = rent(Array.from({ length: 12 }, (_, i) => ({ payer: i % 2 ? X : Y, to: SUBWAY_CONFIG.startingMoney + i + 1 })));
  const incidental = rent([{ payer: X, to: 41 }]);
  const busyScore = analyzeStrategies(busy, { evolution: false }).players.find(p => p.playerId === L)!.fingerprint.infrastructure_landlord;
  const onceScore = analyzeStrategies(incidental, { evolution: false }).players.find(p => p.playerId === L)!.fingerprint.infrastructure_landlord;
  assert.ok(busyScore >= STRATEGY_OCCURRENCE_THRESHOLD, `a repeat rent roll should register: ${busyScore}`);
  assert.ok(busyScore - onceScore >= 30, `repeat rent ${busyScore} should far exceed one payment ${onceScore}`);
  assert.ok(onceScore < STRATEGY_EVIDENCE_FLOOR, "a single incidental payment is not a rent roll");
  console.log(`Infrastructure Landlord calibration: repeat rent ${busyScore} vs incidental ${onceScore}.`);
}

// ----------------------------------------------------------------------------
// Structure: fingerprints, thresholds, versioning, dataset and aggregation.
// ----------------------------------------------------------------------------
{
  const { state } = runPlaytest(3, 11);
  assert.equal(state.phase, "RESULTS", "the fixture game finished");
  const before = JSON.stringify(state);
  const analysis = analyzeStrategies(state, { gameId: "TEST", playerTypes: Object.fromEntries(state.playerOrder.map(id => [id, "Bot"])) });
  assert.equal(JSON.stringify(state), before, "analysis never mutates the game");

  assert.equal(analysis.classifierVersion, STRATEGY_CLASSIFIER_VERSION);
  assert.ok(analysis.rulesVersion.length > 0, "rules version is recorded");
  assert.equal(analysis.stateVersion, state.version);
  assert.equal(analysis.players.length, 3);

  for (const player of analysis.players) {
    assert.deepEqual(Object.keys(player.fingerprint).sort(), [...STRATEGY_IDS].sort(), "every strategy is scored, not just the top three");
    for (const [strategy, score] of Object.entries(player.fingerprint)) {
      assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `${strategy} score in range: ${score}`);
    }
    assert.ok(player.top.length <= 3, "at most three primary strategies");
    assert.ok(player.top.every(r => r.score >= STRATEGY_EVIDENCE_FLOOR), "never manufacture a classification below the evidence floor");
    assert.deepEqual(player.top.map(r => r.score), [...player.top.map(r => r.score)].sort((a, b) => b - a), "ranked strongest first");
    for (const result of player.results) {
      assert.ok(["low", "medium", "high"].includes(result.confidence));
      assert.ok(Object.keys(result.evidence).length > 0, `${result.strategy} carries its supporting metrics`);
      assert.ok(result.summary.length > 0);
    }
    assert.ok(player.features.playerId === player.playerId, "raw features travel with the result for re-classification");
    assert.ok(player.evolution?.throughEarly && player.evolution?.throughMid, "phase fingerprints recorded");
    assert.deepEqual(Object.keys(player.evolution!.throughEarly!).sort(), [...STRATEGY_IDS].sort(), "phase reads carry the whole vector");
    assert.notDeepEqual(player.evolution!.throughEarly, player.fingerprint, "an early read is not just a copy of the final one");
  }

  // Determinism: the same game classifies identically every time.
  const again = analyzeStrategies(state, { gameId: "TEST", playerTypes: Object.fromEntries(state.playerOrder.map(id => [id, "Bot"])) });
  assert.deepEqual(again.players.map(p => p.fingerprint), analysis.players.map(p => p.fingerprint));

  const rows = datasetRows(analysis);
  assert.equal(rows.length, analysis.players.length * STRATEGY_IDS.length, "one row per company per strategy");
  for (const row of rows) {
    assert.equal(row.game_id, "TEST");
    assert.equal(row.classifier_version, STRATEGY_CLASSIFIER_VERSION);
    assert.equal(row.rules_version, analysis.rulesVersion);
    assert.equal(row.player_count, 3);
    assert.equal(row.player_type, "Bot");
    assert.equal(row.occurred, row.strategy_score >= STRATEGY_OCCURRENCE_THRESHOLD, "occurrence uses the single shared threshold");
    assert.ok(row.final_rank >= 1 && row.final_rank <= 3);
    assert.equal(row.ending_debt, Math.max(0, -row.ending_cash));
  }
  assert.equal(rows.filter(r => r.won_game).length / STRATEGY_IDS.length, state.winnerIds.length, "winners are flagged once per strategy");

  const summary = aggregateStrategies(rows);
  assert.equal(summary.length, STRATEGY_IDS.length);
  for (const entry of summary) {
    assert.ok(entry.occurrence_rate >= 0 && entry.occurrence_rate <= 1);
    if (entry.occurrence_count === 0) assert.equal(entry.win_rate, null, "no occurrences means no rate, never a fabricated zero");
    else assert.ok(entry.win_rate !== null && entry.average_vp !== null);
  }
  const occurrences = rows.filter(r => r.occurred).length;
  assert.equal(summary.reduce((sum, e) => sum + e.occurrence_count, 0), occurrences);

  const combinations = strategyCombinations(rows);
  for (const combo of combinations) {
    assert.ok(combo.count >= 1 && combo.pair[0] < combo.pair[1], "pairs are ordered and real");
    assert.ok(combo.rate <= 1);
  }
  console.log(`Strategy structure: ${rows.length} dataset rows, ${occurrences} occurrences, ${combinations.length} co-occurring pairs.`);
}

// ----------------------------------------------------------------------------
// Timeline reconstruction and phase split.
// ----------------------------------------------------------------------------
{
  const { state } = runPlaytest(2, 5);
  const steps = reconstructTimeline(state);
  assert.equal(steps.length, state.telemetry.length, "every accepted action appears once");
  const last = steps.at(-1)!;
  for (const id of state.playerOrder) {
    state.players[id].lines.forEach((line, index) => {
      assert.equal(last.routes[id][index].length, line.route.length, "reconstructed pegs match the final board");
      line.route.forEach((node, i) => {
        assert.equal(last.routes[id][index][i].x, node.x);
        assert.equal(last.routes[id][index][i].y, node.y);
      });
    });
  }
  assert.equal(phaseOfPeriod(1), "early");
  assert.equal(phaseOfPeriod(2), "early");
  assert.equal(phaseOfPeriod(3), "mid");
  assert.equal(phaseOfPeriod(SUBWAY_CONFIG.timelinePeriods), "late");
  assert.equal(phaseOfPeriod(SUBWAY_CONFIG.timelinePeriods - 1), "late");
  assert.equal(phaseOfPeriod(SUBWAY_CONFIG.timelinePeriods - 2), "mid", "the final quarter is two of nine rounds, not three");
  const spans = Array.from({length: SUBWAY_CONFIG.timelinePeriods}, (_, i) => phaseOfPeriod(i + 1));
  assert.equal(spans.filter(p => p === "early").length, spans.filter(p => p === "late").length, "first and final quarters are the same width");
  assert.ok(spans.every((p, i) => i === 0 || ["early", "mid", "late"].indexOf(p) >= ["early", "mid", "late"].indexOf(spans[i - 1])), "phases never go backwards");

  // A game without telemetry degrades to low confidence instead of inventing one.
  const blind = { ...state, telemetry: [] } as SubwayState;
  const blindAnalysis = analyzeStrategies(blind, { evolution: false, deepOptionality: false });
  for (const player of blindAnalysis.players) {
    assert.equal(player.features.hasTelemetry, false);
    assert.ok(player.results.every(r => r.confidence !== "high"), "no telemetry can never read as high confidence");
  }
  console.log("Timeline reconstruction: action coverage, final-board agreement, phase split and telemetry-free degradation passed.");
}

// ----------------------------------------------------------------------------
// Report integration.
// ----------------------------------------------------------------------------
{
  const { state } = runPlaytest(2, 9);
  const report = generateAiPlaytestReport(state, { roomCode: "STRT", controllers: state.playerOrder.map(id => ({ id, humanActions: 0, botActions: 12, unknownActions: 0 })) });
  assert.match(report, /## Strategy analysis/);
  assert.match(report, /Primary strategies/);
  assert.match(report, /Supporting evidence/);
  assert.match(report, /### Strategy fingerprints and dataset/);
  assert.match(report, new RegExp(`classifier ${STRATEGY_CLASSIFIER_VERSION.replace(/\./g, "\\.")}`));
  const json = JSON.parse(report.split("### Strategy fingerprints and dataset")[1].split("```json")[1].split("```")[0]);
  assert.equal(json.analysis.players.length, 2);
  assert.equal(json.rows.length, 2 * STRATEGY_IDS.length);
  assert.ok(json.analysis.players[0].features, "raw features are archived with the report");
  assert.equal(json.rows[0].player_type, "Bot");
  for (const player of state.playerOrder) assert.ok(report.includes(state.players[player].name));
  console.log("Report integration: strategy section, evidence table and archived fingerprints/dataset passed.");
}

// ----------------------------------------------------------------------------
// Cheap mode: batch runs can skip the costliest feature.
// ----------------------------------------------------------------------------
{
  const { state } = runPlaytest(4, 13);
  const cheap = analyzeStrategies(state, { deepOptionality: false, evolution: false });
  for (const player of cheap.players) {
    assert.equal(player.features.meanContinuations, 0, "continuation counts are skipped");
    assert.notEqual(player.results.find(r => r.strategy === "optionality")!.confidence, "high", "and the affected classifier says so");
  }
  const full = extractFeatures(state, { deepOptionality: true });
  assert.ok(Object.values(full).some(f => f.meanContinuations > 0), "deep mode measures real continuations");
  console.log("Optionality modes: cheap batch mode and deep mode both behave as documented.");
}

console.log("Subway strategy telemetry: calibration, structure, dataset, aggregation and report checks passed.");
