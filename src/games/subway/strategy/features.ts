import {
  SUBWAY_CONFIG,
  contractById,
  contractOf,
  destinationById,
  destinationMet,
  engineeringById,
  legalTargets,
  lineComplete,
  objectiveMet,
  segmentsBuilt,
  stationAt,
  type RouteNode,
  type SubwayPlayer,
  type SubwayState,
  type SubwayTelemetryEvent,
} from "../config";
import { companyComponents, longestNetwork, networkNodeKey, nodesTransfer } from "../network";

// ============================================================================
// Strategy feature extraction (analysis layer).
//
// Gameplay ─► raw telemetry ─► THESE FEATURES ─► classifiers ─► fingerprint.
//
// Nothing here decides anything about the game: the reducer never sees a
// strategy, and no feature feeds back into play. Features are raw, numeric and
// serialisable so a future classifier version can be re-run against archived
// playtests without replaying them.
// ============================================================================

export type GamePhase = "early" | "mid" | "late";

/** Rounds are split by fraction of the configured schedule, not hard-coded numbers. */
export const PHASE_SPLIT = { earlyThrough: 0.25, lateAfter: 0.75 } as const;

/**
 * A round's phase by where it sits in the schedule: a round ending inside the
 * first quarter is early, one starting inside the final quarter is late. Nine
 * rounds therefore split 1-2 early, 3-7 mid, 8-9 late.
 */
export function phaseOfPeriod(period: number, rounds = SUBWAY_CONFIG.timelinePeriods): GamePhase {
  if (period <= rounds * PHASE_SPLIT.earlyThrough) return "early";
  if (period - 1 >= rounds * PHASE_SPLIT.lateAfter) return "late";
  return "mid";
}

const PHASES: GamePhase[] = ["early", "mid", "late"];
const byPhase = <T,>(make: () => T): Record<GamePhase, T> =>
  ({ early: make(), mid: make(), late: make() });

type Money = Record<string, number>;

/** One accepted action, with the board as it stood immediately afterwards. */
export type TimelineStep = {
  index: number;
  actorId: string;
  action: string;
  period: number;
  phase: GamePhase;
  moneyBefore: Money;
  moneyAfter: Money;
  tollsBefore: Money;
  tollsAfter: Money;
  /** Reconstructed company routes after this action, keyed by player id. */
  routes: Record<string, RouteNode[][]>;
  /** The node this action placed, when it placed one. */
  placed?: { lineIndex: number; node: RouteNode };
};

const cloneRoutes = (routes: Record<string, RouteNode[][]>): Record<string, RouteNode[][]> =>
  Object.fromEntries(Object.entries(routes).map(([id, lines]) => [id, lines.map(route => [...route])]));

/**
 * Rebuild each company's geometry action by action from the accepted-action log.
 *
 * Placements carry their coordinates, and `lineNodeCounts` in every snapshot is
 * the authority on how many pegs each line holds, so an Undo (whose payload
 * names no line) is repaired from the counts rather than guessed.
 */
export function reconstructTimeline(game: SubwayState): TimelineStep[] {
  const telemetry = game.telemetry ?? [];
  const ids = game.playerOrder;
  const routes: Record<string, RouteNode[][]> = Object.fromEntries(
    ids.map(id => [id, (game.players[id]?.lines ?? []).map(() => [] as RouteNode[])]),
  );
  const steps: TimelineStep[] = [];
  const snapshot = (e: SubwayTelemetryEvent, side: "playersBefore" | "playersAfter", field: "money" | "tollsPaid"): Money =>
    Object.fromEntries(ids.map(id => [id, e[side][id]?.[field] ?? 0]));

  for (const event of telemetry) {
    const counts = event.playersAfter[event.actorId]?.lineNodeCounts ?? [];
    // Lines a company owns can appear over time; keep the arrays wide enough.
    const owner = routes[event.actorId];
    if (owner) while (owner.length < counts.length) owner.push([]);

    let placed: TimelineStep["placed"];
    if ((event.action === "BUILD" || event.action === "PLACE_STARTER") && owner) {
      const lineIndex = Number(event.payload?.lineIndex ?? -1);
      const x = Number(event.payload?.x ?? NaN);
      const y = Number(event.payload?.y ?? NaN);
      const paused = event.payload?.pause === true;
      if (owner[lineIndex] && Number.isInteger(x) && Number.isInteger(y) && !paused) {
        const station = stationAt({ x, y }, game.stations);
        const node: RouteNode = { x, y, ...(station ? { stationId: station.id } : {}) };
        owner[lineIndex] = [...owner[lineIndex], node];
        placed = { lineIndex, node };
      }
    }
    // Repair against the authoritative peg counts (covers Undo and pauses).
    if (owner) {
      counts.forEach((count, lineIndex) => {
        const route = owner[lineIndex] ?? [];
        if (route.length > count) owner[lineIndex] = route.slice(0, count);
      });
      if (placed && (counts[placed.lineIndex] ?? 0) < owner[placed.lineIndex].length + 1) {
        // The placement was rolled back within the same action; forget it.
        if ((counts[placed.lineIndex] ?? 0) <= owner[placed.lineIndex].length - 1) placed = undefined;
      }
    }

    steps.push({
      index: event.actionNumber,
      actorId: event.actorId,
      action: event.action,
      period: event.periodAfter,
      phase: phaseOfPeriod(event.periodAfter),
      moneyBefore: snapshot(event, "playersBefore", "money"),
      moneyAfter: snapshot(event, "playersAfter", "money"),
      tollsBefore: snapshot(event, "playersBefore", "tollsPaid"),
      tollsAfter: snapshot(event, "playersAfter", "tollsPaid"),
      routes: cloneRoutes(routes),
      ...(placed ? { placed } : {}),
    });
  }
  return steps;
}

/** A company as it stood at one step, for reusing the game's own scoring helpers. */
function playerAt(game: SubwayState, step: TimelineStep, id: string): SubwayPlayer {
  const base = game.players[id];
  return { ...base, lines: base.lines.map((line, i) => ({ ...line, route: step.routes[id]?.[i] ?? [], work: undefined })) };
}

export type LineProfile = {
  contractId: string;
  complete: boolean;
  segmentsBuilt: number;
  segmentsTotal: number;
  cost: number;
  pegs: number;
  neighborhoods: number;
  destinationShare: number;
  networkShare: number;
  transferPegs: number;
  opponentContacts: number;
};

/** Everything the classifiers read. Flat, numeric and safe to archive. */
export type PlayerFeatures = {
  playerId: string;
  name: string;
  playerCount: number;
  rounds: number;
  telemetryActions: number;
  hasTelemetry: boolean;

  finalVp: number;
  finalRank: number;
  won: boolean;
  endingCash: number;
  endingDebt: number;
  peakCash: number;
  peakDebt: number;
  crewPaid: number;
  tollsPaid: number;
  tollsReceived: number;

  linesOwned: number;
  linesComplete: number;
  linesAbandoned: number;
  segmentsBuilt: number;
  buildActions: number;
  undoActions: number;
  skipActions: number;
  starterSpread: number;

  buildsEarly: number;
  buildsMid: number;
  buildsLate: number;
  buildShareEarly: number;
  buildShareMid: number;
  buildShareLate: number;
  largestRoundBurst: number;
  activeRounds: number;
  idleRounds: number;
  cashBeforeLargestBurst: number;
  crewSpendLate: number;

  firstDebtPeriod: number | null;
  firstDebtPhase: GamePhase | null;
  roundsInDebt: number;
  buildsWhileNegative: number;
  buildShareWhileNegative: number;
  completionsWhileNegative: number;
  destinationsMetWhileNegative: number;
  vpAfterFirstDebt: number;
  debtIncurredLate: number;
  buildsWithinTwoActionsOfBorrowing: number;

  networkComponents: number;
  largestComponentPegs: number;
  connectedLineShare: number;
  interLineTransfers: number;
  mergeEvents: number;
  networkLength: number;
  networkLengthRank: number;
  isolatedPegShare: number;

  opponentPaymentEvents: number;
  distinctOpponentPayers: number;
  repeatPayerEvents: number;
  incomeShareFromOpponents: number;
  sharedStationsOwned: number;
  firstMoverSharedStations: number;

  contractsBought: number;
  contractSpend: number;
  contractLengthSpread: number;
  contractCostSpread: number;
  contractSegments: number;
  laterPickComplementarity: number;

  goalsHeld: number;
  goalsMet: number;
  goalVp: number;
  goalVpShare: number;
  buildsAdvancingGoals: number;
  goalAdvanceShare: number;

  destinationsHeld: number;
  destinationsMet: number;
  destinationVp: number;
  buildsAdvancingDestinations: number;
  destinationAdvanceShare: number;
  destinationLineConcentration: number;
  destinationPurchased: boolean;

  buildsAdjacentToOpponents: number;
  contestedBuildShare: number;
  firstIntoNeighborhoods: number;
  opponentTollsInduced: number;

  meanContinuations: number;
  minContinuations: number;
  meanCashHeld: number;
  roundsWithSpareCrews: number;
  extraCardsBought: number;

  sunkInPartialLines: number;
  remainingSegmentsOnPartials: number;
  completionPushes: number;
  buildsAfterAbandonment: number;
  completionVp: number;
  incompletePenalty: number;

  vpLate: number;
  destinationsMetLate: number;
  goalsFirstMetLate: number;
  unusedCashShare: number;
  lateTempoLift: number;

  lineProfiles: LineProfile[];
  roleDifferentiation: number;

  /**
   * The same measures across every company in this game. Several strategies
   * describe standing out from the field rather than doing a thing at all:
   * in a game where everyone collects access payments, collecting some is
   * ordinary play, not a rent roll.
   */
  fieldTollsReceivedMean: number;
  fieldLinesCompleteMean: number;
  fieldContestedShareMean: number;
  fieldConnectedShareMean: number;
  fieldInterLineTransfersMean: number;
  fieldNetworkLengthMean: number;
  fieldPeakDebtMean: number;
  fieldBuildsMean: number;

  buildsFollowingOpponentBuild: number;
  lineSwitchRate: number;
  reserveHeldThroughMid: number;
};

const spread = (values: number[]): number => (values.length < 2 ? 0 : Math.max(...values) - Math.min(...values));
const share = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/**
 * Derive every behavioural feature for one game.
 *
 * `deepOptionality` walks legal continuations after each placement; it is exact
 * but the most expensive feature, so batch simulation can switch it off and the
 * affected classifier drops its confidence rather than inventing a number.
 */
export function extractFeatures(game: SubwayState, { deepOptionality = true } = {}): Record<string, PlayerFeatures> {
  const steps = reconstructTimeline(game);
  const ids = game.playerOrder;
  const rounds = SUBWAY_CONFIG.timelinePeriods;
  const ranking = ids.map(id => game.players[id]).filter(Boolean).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.money - a.money);
  const lengths = Object.fromEntries(ids.map(id => [id, longestNetwork(game.players[id])]));
  const lengthRank = (id: string) => 1 + ids.filter(other => lengths[other] > lengths[id]).length;

  const out: Record<string, PlayerFeatures> = {};
  for (const id of ids) {
    const me = game.players[id];
    if (!me) continue;
    const opponents = ids.filter(other => other !== id).map(other => game.players[other]);
    const mine = steps.filter(step => step.actorId === id);
    const builds = mine.filter(step => step.action === "BUILD" && step.placed);
    const buildsIn = byPhase(() => 0);
    for (const step of builds) buildsIn[step.phase]++;

    // Cash history, including money received while another company acted.
    const cashSeries = steps.map(step => step.moneyAfter[id] ?? 0);
    const peakCash = Math.max(me.money, ...cashSeries, 0);
    const peakDebt = Math.max(0, ...cashSeries.map(v => -v), -me.money);
    const debtSteps = steps.filter(step => (step.moneyAfter[id] ?? 0) < 0);
    const firstDebt = debtSteps[0];
    const roundsInDebt = new Set(debtSteps.map(step => step.period)).size;

    // Money arriving from opponents: their action, our balance rising.
    const payments = steps.filter(step => step.actorId !== id && (step.moneyAfter[id] ?? 0) > (step.moneyBefore[id] ?? 0));
    const payers = payments.map(step => step.actorId);
    const tollsReceived = payments.reduce((sum, step) => sum + ((step.moneyAfter[id] ?? 0) - (step.moneyBefore[id] ?? 0)), 0);
    const repeatPayers = payers.filter((payer, i) => payers.indexOf(payer) !== i).length;

    // Per-step derived state: objectives met, components, destination progress.
    let metGoals = new Set<string>();
    let metDestinations = new Set<string>();
    const goalFirstMet: Record<string, TimelineStep> = {};
    const destinationFirstMet: Record<string, TimelineStep> = {};
    let advancingGoals = 0, advancingDestinations = 0, mergeEvents = 0;
    let previousComponents = Infinity;
    const continuations: number[] = [];
    const destinationBuildsByLine: number[] = me.lines.map(() => 0);

    for (const step of mine) {
      if (!step.placed) continue;
      const snapshotPlayer = playerAt(game, step, id);
      const heldGoals = me.engineeringHand;
      const heldDestinations = me.destinationHand;
      const nowGoals = new Set(heldGoals.filter(card => objectiveMet(card, snapshotPlayer, opponents, game)));
      const nowDestinations = new Set(heldDestinations.filter(card => destinationMet(snapshotPlayer, card)));
      for (const card of Array.from(nowGoals)) if (!metGoals.has(card)) goalFirstMet[card] = step;
      for (const card of Array.from(nowDestinations)) if (!metDestinations.has(card)) destinationFirstMet[card] = step;
      if (nowGoals.size > metGoals.size) advancingGoals++;
      if (nowDestinations.size > metDestinations.size) {
        advancingDestinations++;
        destinationBuildsByLine[step.placed.lineIndex] = (destinationBuildsByLine[step.placed.lineIndex] ?? 0) + 1;
      } else if (heldDestinations.some(card => {
        // A placement inside a neighborhood the mission still needs counts as pursuit.
        const wanted = destinationById(card)?.stationIds ?? [];
        return !!step.placed?.node.stationId && wanted.includes(step.placed.node.stationId);
      })) {
        advancingDestinations++;
        destinationBuildsByLine[step.placed.lineIndex] = (destinationBuildsByLine[step.placed.lineIndex] ?? 0) + 1;
      }
      metGoals = nowGoals;
      metDestinations = nowDestinations;

      const components = companyComponents(snapshotPlayer).length;
      if (components < previousComponents && previousComponents !== Infinity) mergeEvents++;
      previousComponents = components;

      if (deepOptionality && !lineComplete(snapshotPlayer.lines[step.placed.lineIndex])) {
        // A finished line has no continuations by definition; counting its zero
        // would read as "cornered" rather than "done".
        const projection = { ...game, players: { ...game.players, [id]: snapshotPlayer } } as SubwayState;
        continuations.push(legalTargets(projection, id, step.placed.lineIndex, false).length);
      }
    }

    const vpOf = (cards: string[]) => cards.reduce((sum, card) => sum + ((engineeringById(card) ?? destinationById(card))?.vp ?? 0), 0);
    const afterFirstDebt = (step?: TimelineStep) => !!firstDebt && !!step && step.index >= firstDebt.index;
    const completionsAfter = (predicate: (step: TimelineStep) => boolean) => mine.filter(step => {
      const before = (step.moneyBefore[id] ?? 0), after = (step.moneyAfter[id] ?? 0);
      return predicate(step) && step.action === "BUILD" && after - before > 0;
    }).length;

    const completedLines = me.lines.filter(lineComplete);
    const partials = me.lines.filter(line => !lineComplete(line) && line.route.length > 1);
    const lastBuildRound = Object.fromEntries(me.lines.map((line, i) => [i, Math.max(0, ...builds.filter(step => step.placed?.lineIndex === i).map(step => step.period))]));
    const abandoned = me.lines.filter((line, i) => !lineComplete(line) && line.route.length > 1 && (lastBuildRound[i] || 0) <= rounds - 3);

    // Opponent interaction: how often our pegs sit against theirs, and who was first.
    const opponentNodes = opponents.flatMap(p => p.lines.flatMap(l => l.route));
    const adjacentBuilds = builds.filter(step => opponentNodes.some(node => nodesTransfer(node, step.placed!.node))).length;
    const firstIntoArea = game.stations.filter(area => {
      const mineHere = builds.find(step => step.placed?.node.stationId === area.id);
      if (!mineHere) return false;
      const theirsHere = steps.find(step => step.actorId !== id && step.placed?.node.stationId === area.id);
      return !theirsHere || mineHere.index < theirsHere.index;
    }).length;

    const sharedStations = me.lines.flatMap(l => l.route).filter(node => opponentNodes.some(other => nodesTransfer(node, other))).length;
    const firstMoverShared = builds.filter(step => {
      const later = steps.find(other => other.actorId !== id && other.index > step.index && other.placed && nodesTransfer(other.placed.node, step.placed!.node));
      return !!later;
    }).length;

    const contracts = me.lines.map(line => contractById(line.contractId)).filter(Boolean) as NonNullable<ReturnType<typeof contractById>>[];
    const procurement = steps.filter(step => step.actorId === id && step.action === "PROCURE");
    const laterPicks = contracts.slice(1);
    const complementarity = laterPicks.length
      ? laterPicks.reduce((sum, c, i) => sum + (Math.abs(c.recipe.length - contracts[i].recipe.length) > 0 ? 1 : 0), 0) / laterPicks.length
      : 0;

    const starters = me.lines.map(l => l.route[0]).filter(Boolean) as RouteNode[];
    const starterSpread = starters.length < 2 ? 0 : Math.max(...starters.flatMap((a, i) => starters.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));

    const components = companyComponents(me);
    const largestComponent = Math.max(0, ...components.map(c => c.length));
    const placedPegs = me.lines.flatMap(l => l.route).length;
    const transferPegs = me.lines.flatMap((line, i) => line.route.filter(node =>
      me.lines.some((other, j) => j !== i && other.route.some(n => nodesTransfer(n, node))))).length;

    const goalVp = me.engineeringHand.filter(card => objectiveMet(card, me, opponents, game)).reduce((sum, card) => sum + (engineeringById(card)?.vp ?? 0), 0);
    const destinationVp = me.destinationHand.filter(card => destinationMet(me, card)).reduce((sum, card) => sum + (destinationById(card)?.vp ?? 0), 0);
    const completionVp = completedLines.reduce((sum, line) => sum + (contractOf(line)?.completionVp ?? 0), 0);
    const incompletePenalty = me.lines.filter(l => !lineComplete(l)).reduce((sum, line) => sum + (contractOf(line)?.incompletePenalty ?? 0), 0);

    const lateSteps = mine.filter(step => step.phase === "late");
    const vpLate = Object.values(goalFirstMet).filter(step => step.phase === "late").length * 4
      + Object.values(destinationFirstMet).filter(step => step.phase === "late").reduce((sum, step) => sum + 4, 0)
      + completedLines.filter((line, i) => phaseOfPeriod(lastBuildRound[me.lines.indexOf(line)] || 0) === "late").reduce((sum, line) => sum + (contractOf(line)?.completionVp ?? 0), 0);

    const roundBuilds = new Map<number, number>();
    for (const step of builds) roundBuilds.set(step.period, (roundBuilds.get(step.period) ?? 0) + 1);
    const largestBurst = Math.max(0, ...Array.from(roundBuilds.values()));
    const burstRound = Array.from(roundBuilds.entries()).find(([, n]) => n === largestBurst)?.[0];
    const cashBeforeBurst = burstRound === undefined ? 0 : (steps.filter(step => step.period === burstRound)[0]?.moneyBefore[id] ?? 0);

    const hires = mine.filter(step => step.action === "HIRE_CREWS");
    const crewSpendLate = hires.filter(step => step.phase === "late").reduce((sum, step) => sum + Math.max(0, (step.moneyBefore[id] ?? 0) - (step.moneyAfter[id] ?? 0)), 0);
    const spareCrewRounds = hires.filter(step => {
      const spent = Math.max(0, (step.moneyBefore[id] ?? 0) - (step.moneyAfter[id] ?? 0));
      return spent < 6 && (step.moneyAfter[id] ?? 0) >= 6;
    }).length;

    const lineSwitches = builds.slice(1).filter((step, i) => step.placed!.lineIndex !== builds[i].placed!.lineIndex).length;
    const followingOpponent = builds.filter(step => {
      const previous = steps.find(other => other.index === step.index - 1);
      return !!previous && previous.actorId !== id && !!previous.placed;
    }).length;

    const lineProfiles: LineProfile[] = me.lines.map((line, i) => {
      const contract = contractOf(line);
      const pegs = line.route.length;
      const neighborhoods = new Set(line.route.map(n => n.stationId).filter(Boolean)).size;
      const componentOf = components.find(c => c.some(n => line.route.some(r => r.x === n.x && r.y === n.y)));
      return {
        contractId: line.contractId,
        complete: lineComplete(line),
        segmentsBuilt: segmentsBuilt(line),
        segmentsTotal: contract?.recipe.length ?? 0,
        cost: line.paid,
        pegs,
        neighborhoods,
        destinationShare: share(destinationBuildsByLine[i] ?? 0, Math.max(1, builds.filter(s => s.placed?.lineIndex === i).length)),
        networkShare: share(componentOf?.length ?? 0, Math.max(1, placedPegs)),
        transferPegs: line.route.filter(node => me.lines.some((other, j) => j !== i && other.route.some(n => nodesTransfer(n, node)))).length,
        opponentContacts: line.route.filter(node => opponentNodes.some(other => nodesTransfer(other, node))).length,
      };
    });

    // Functional differentiation: how far apart the lines' roles are.
    const dims = (p: LineProfile) => [p.destinationShare, share(p.transferPegs, Math.max(1, p.pegs)), share(p.segmentsBuilt, Math.max(1, p.segmentsTotal)), share(p.opponentContacts, Math.max(1, p.pegs))];
    const pairs = lineProfiles.flatMap((a, i) => lineProfiles.slice(i + 1).map(b => {
      const x = dims(a), y = dims(b);
      return Math.sqrt(x.reduce((sum, v, k) => sum + (v - y[k]) ** 2, 0)) / Math.sqrt(x.length);
    }));
    const roleDifferentiation = pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : 0;

    const midCash = steps.filter(step => phaseOfPeriod(step.period) === "mid").map(step => step.moneyAfter[id] ?? 0);

    out[id] = {
      playerId: id,
      name: me.name,
      playerCount: ids.length,
      rounds,
      telemetryActions: steps.length,
      hasTelemetry: steps.length > 0,

      finalVp: me.score ?? 0,
      finalRank: 1 + ranking.findIndex(p => p.id === id),
      won: game.winnerIds.includes(id),
      endingCash: me.money,
      endingDebt: Math.max(0, -me.money),
      peakCash,
      peakDebt,
      crewPaid: me.crewPaid ?? 0,
      tollsPaid: me.tollsPaid,
      tollsReceived,

      linesOwned: me.lines.length,
      linesComplete: completedLines.length,
      linesAbandoned: abandoned.length,
      segmentsBuilt: me.lines.reduce((sum, line) => sum + segmentsBuilt(line), 0),
      buildActions: builds.length,
      undoActions: mine.filter(step => step.action === "UNDO_PLACEMENT").length,
      skipActions: mine.filter(step => step.action === "SKIP_ACTION").length,
      starterSpread,

      buildsEarly: buildsIn.early,
      buildsMid: buildsIn.mid,
      buildsLate: buildsIn.late,
      buildShareEarly: share(buildsIn.early, builds.length),
      buildShareMid: share(buildsIn.mid, builds.length),
      buildShareLate: share(buildsIn.late, builds.length),
      largestRoundBurst: largestBurst,
      activeRounds: roundBuilds.size,
      idleRounds: Math.max(0, rounds - roundBuilds.size),
      cashBeforeLargestBurst: cashBeforeBurst,
      crewSpendLate,

      firstDebtPeriod: firstDebt?.period ?? null,
      firstDebtPhase: firstDebt ? firstDebt.phase : null,
      roundsInDebt,
      buildsWhileNegative: builds.filter(step => (step.moneyBefore[id] ?? 0) < 0 || (step.moneyAfter[id] ?? 0) < 0).length,
      buildShareWhileNegative: share(builds.filter(step => (step.moneyBefore[id] ?? 0) < 0 || (step.moneyAfter[id] ?? 0) < 0).length, builds.length),
      completionsWhileNegative: completionsAfter(step => (step.moneyBefore[id] ?? 0) < 0),
      destinationsMetWhileNegative: Object.values(destinationFirstMet).filter(step => (step.moneyBefore[id] ?? 0) < 0).length,
      vpAfterFirstDebt: firstDebt
        ? vpOf(Object.entries(goalFirstMet).filter(([, step]) => afterFirstDebt(step)).map(([card]) => card))
          + vpOf(Object.entries(destinationFirstMet).filter(([, step]) => afterFirstDebt(step)).map(([card]) => card))
          + completedLines.filter(line => afterFirstDebt(builds.filter(step => step.placed?.lineIndex === me.lines.indexOf(line)).at(-1))).reduce((sum, line) => sum + (contractOf(line)?.completionVp ?? 0), 0)
        : 0,
      debtIncurredLate: Math.max(0, ...lateSteps.map(step => Math.max(0, -(step.moneyAfter[id] ?? 0)))),
      buildsWithinTwoActionsOfBorrowing: firstDebt ? builds.filter(step => step.index >= firstDebt.index && step.index <= firstDebt.index + 2).length : 0,

      networkComponents: components.length,
      largestComponentPegs: largestComponent,
      connectedLineShare: share(me.lines.filter(line => line.route.some(node => components.find(c => c.length === largestComponent)?.some(n => n.x === node.x && n.y === node.y))).length, me.lines.filter(l => l.route.length).length),
      interLineTransfers: transferPegs,
      mergeEvents,
      networkLength: lengths[id],
      networkLengthRank: lengthRank(id),
      isolatedPegShare: share(placedPegs - largestComponent, Math.max(1, placedPegs)),

      opponentPaymentEvents: payments.length,
      distinctOpponentPayers: new Set(payers).size,
      repeatPayerEvents: repeatPayers,
      incomeShareFromOpponents: share(tollsReceived, Math.max(1, tollsReceived + SUBWAY_CONFIG.startingMoney)),
      sharedStationsOwned: sharedStations,
      firstMoverSharedStations: firstMoverShared,

      contractsBought: procurement.length || contracts.length,
      contractSpend: me.lines.reduce((sum, line) => sum + line.paid, 0),
      contractLengthSpread: spread(contracts.map(c => c.recipe.length)),
      contractCostSpread: spread(contracts.map(c => c.cost)),
      contractSegments: contracts.reduce((sum, c) => sum + c.recipe.length, 0),
      laterPickComplementarity: complementarity,

      goalsHeld: me.engineeringHand.length,
      goalsMet: me.engineeringHand.filter(card => objectiveMet(card, me, opponents, game)).length,
      goalVp,
      goalVpShare: share(goalVp, Math.max(1, me.score ?? 1)),
      buildsAdvancingGoals: advancingGoals,
      goalAdvanceShare: share(advancingGoals, builds.length),

      destinationsHeld: me.destinationHand.length,
      destinationsMet: me.destinationHand.filter(card => destinationMet(me, card)).length,
      destinationVp,
      buildsAdvancingDestinations: advancingDestinations,
      destinationAdvanceShare: share(advancingDestinations, builds.length),
      destinationLineConcentration: share(Math.max(0, ...destinationBuildsByLine), Math.max(1, destinationBuildsByLine.reduce((a, b) => a + b, 0))),
      destinationPurchased: !!me.destinationPurchased,

      buildsAdjacentToOpponents: adjacentBuilds,
      contestedBuildShare: share(adjacentBuilds, builds.length),
      firstIntoNeighborhoods: firstIntoArea,
      opponentTollsInduced: tollsReceived,

      meanContinuations: continuations.length ? continuations.reduce((a, b) => a + b, 0) / continuations.length : 0,
      minContinuations: continuations.length ? Math.min(...continuations) : 0,
      meanCashHeld: cashSeries.length ? cashSeries.reduce((a, b) => a + b, 0) / cashSeries.length : me.money,
      roundsWithSpareCrews: spareCrewRounds,
      extraCardsBought: Number(!!me.destinationPurchased) + Number(!!me.engineeringPurchased),

      sunkInPartialLines: partials.reduce((sum, line) => sum + line.paid, 0),
      remainingSegmentsOnPartials: partials.reduce((sum, line) => sum + ((contractOf(line)?.recipe.length ?? 0) - segmentsBuilt(line)), 0),
      completionPushes: completedLines.length,
      buildsAfterAbandonment: abandoned.length ? builds.filter(step => step.period > Math.min(...abandoned.map(line => lastBuildRound[me.lines.indexOf(line)] || 0))).length : 0,
      completionVp,
      incompletePenalty,

      vpLate,
      destinationsMetLate: Object.values(destinationFirstMet).filter(step => step.phase === "late").length,
      goalsFirstMetLate: Object.values(goalFirstMet).filter(step => step.phase === "late").length,
      unusedCashShare: share(Math.max(0, me.money), Math.max(1, peakCash)),
      lateTempoLift: share(buildsIn.late, Math.max(1, builds.length)) - share(buildsIn.early, Math.max(1, builds.length)),

      lineProfiles,
      roleDifferentiation,

      buildsFollowingOpponentBuild: followingOpponent,
      lineSwitchRate: share(lineSwitches, Math.max(1, builds.length - 1)),
      reserveHeldThroughMid: midCash.length ? midCash.reduce((a, b) => a + b, 0) / midCash.length : 0,

      fieldTollsReceivedMean: 0,
      fieldLinesCompleteMean: 0,
      fieldContestedShareMean: 0,
      fieldConnectedShareMean: 0,
      fieldInterLineTransfersMean: 0,
      fieldNetworkLengthMean: 0,
      fieldPeakDebtMean: 0,
      fieldBuildsMean: 0,
    };
  }

  // Second pass: every company learns what the field did, so "distinctive" can
  // be told apart from "ordinary for this game".
  const all = Object.values(out);
  const mean = (pick: (f: PlayerFeatures) => number) => (all.length ? all.reduce((sum, f) => sum + pick(f), 0) / all.length : 0);
  const fields = {
    fieldTollsReceivedMean: mean(f => f.tollsReceived),
    fieldLinesCompleteMean: mean(f => f.linesComplete),
    fieldContestedShareMean: mean(f => f.contestedBuildShare),
    fieldConnectedShareMean: mean(f => f.connectedLineShare),
    fieldInterLineTransfersMean: mean(f => f.interLineTransfers),
    fieldNetworkLengthMean: mean(f => f.networkLength),
    fieldPeakDebtMean: mean(f => f.peakDebt),
    fieldBuildsMean: mean(f => f.buildActions),
  };
  for (const f of all) Object.assign(f, fields);
  return out;
}
