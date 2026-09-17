import type { PlayerFeatures } from "./features";

// ============================================================================
// Strategy classifiers (analysis layer, version 1).
//
// Heuristics, deliberately: reproducible, explainable, cheap and comparable
// across thousands of games. Each classifier turns raw features into a 0-100
// match score, a confidence in the evidence behind it, and the numbers it used.
// Score and confidence are separate: behavior can look strongly like a strategy
// while the telemetry supporting that reading is thin.
// ============================================================================

export type Confidence = "low" | "medium" | "high";

export type StrategyId =
  | "leveraged_expander"
  | "tempo"
  | "network_engineer"
  | "infrastructure_landlord"
  | "route_portfolio"
  | "engineering_commitment"
  | "destination_specialist"
  | "spatial_denial"
  | "optionality"
  | "completion_abandonment"
  | "endgame_controller"
  | "specialist"
  | "opportunist";

export type StrategyResult = {
  strategy: StrategyId;
  label: string;
  score: number;
  confidence: Confidence;
  evidence: Record<string, number | string | boolean | null>;
  summary: string;
};

/** 0 below `lo`, 1 at or above `hi`, linear between. */
const ramp = (value: number, lo: number, hi: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (hi === lo) return value >= hi ? 1 : 0;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
};

const share = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/** Weighted mean of 0..1 signals, expressed as a 0-100 score. */
const weigh = (signals: [number, number][]): number => {
  const total = signals.reduce((sum, [weight]) => sum + weight, 0);
  if (total <= 0) return 0;
  return Math.round(100 * signals.reduce((sum, [weight, value]) => sum + weight * Math.max(0, Math.min(1, value)), 0) / total);
};

/**
 * How far above the rest of the table this value sits: 0 at the field average,
 * 1 at twice it. Keeps "everyone did this" from reading as a strategy while
 * staying comparable across games.
 */
const lead = (value: number, fieldMean: number): number =>
  fieldMean <= 0 ? (value > 0 ? 1 : 0) : ramp(value / fieldMean, 1, 2);

/** Confidence falls when the telemetry behind a reading is thin. */
const confide = (checks: boolean[]): Confidence => {
  const met = checks.filter(Boolean).length;
  if (met === checks.length) return "high";
  if (met >= Math.ceil(checks.length / 2)) return "medium";
  return "low";
};

type Classifier = { id: StrategyId; label: string; run: (f: PlayerFeatures) => Omit<StrategyResult, "strategy" | "label"> };

const CLASSIFIERS: Classifier[] = [
  {
    id: "leveraged_expander",
    label: "Leveraged Expander",
    run: f => {
      // Borrowing only counts as leverage when it bought construction. Ending
      // slightly negative by accident must not read as deliberate financing.
      const depth = ramp(f.peakDebt, 1, 6);
      const converted = ramp(f.buildsWhileNegative, 1, 5);
      const payoff = ramp(f.vpAfterFirstDebt, 3, 14);
      const finishes = ramp(f.completionsWhileNegative + f.destinationsMetWhileNegative, 1, 3);
      const timing = f.firstDebtPhase === "late" ? 1 : f.firstDebtPhase === "mid" ? 0.6 : f.firstDebtPhase === "early" ? 0.35 : 0;
      const immediacy = ramp(f.buildsWithinTwoActionsOfBorrowing, 1, 3);
      const accidental = f.peakDebt <= 1 && f.buildsWhileNegative <= 1;
      const score = accidental ? Math.min(20, weigh([[3, depth], [2, converted]])) : weigh([
        [3, depth], [3, converted], [2.5, payoff], [2, finishes], [1.5, timing], [1, immediacy],
      ]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.buildActions >= 4, f.peakDebt > 0]),
        evidence: {
          peak_debt: f.peakDebt,
          ending_debt: f.endingDebt,
          first_debt_period: f.firstDebtPeriod,
          first_debt_phase: f.firstDebtPhase,
          rounds_in_debt: f.roundsInDebt,
          segments_built_while_negative: f.buildsWhileNegative,
          lines_completed_while_negative: f.completionsWhileNegative,
          destinations_met_while_negative: f.destinationsMetWhileNegative,
          vp_generated_after_entering_debt: f.vpAfterFirstDebt,
          builds_within_two_actions_of_borrowing: f.buildsWithinTwoActionsOfBorrowing,
        },
        summary: f.peakDebt <= 0
          ? "Never borrowed."
          : accidental
            ? `Finished ${f.endingDebt ? `$${f.endingDebt}M down` : "level"} with a peak overdraft of $${f.peakDebt}M and little construction while negative: overspending rather than leverage.`
            : `Borrowed to a peak of $${f.peakDebt}M from round ${f.firstDebtPeriod}, built ${f.buildsWhileNegative} segments while negative and converted it into ${f.vpAfterFirstDebt} VP.`,
      };
    },
  },
  {
    id: "tempo",
    label: "Tempo Player",
    run: f => {
      // Either shape counts: establish geometry first, or bank and burst later.
      const early = ramp(f.buildShareEarly, 0.2, 0.45);
      const burst = ramp(f.largestRoundBurst, 2, 3);
      const banked = ramp(f.cashBeforeLargestBurst, 8, 25);
      const uneven = ramp(Math.abs(f.buildShareLate - f.buildShareEarly), 0.15, 0.5);
      const sustained = ramp(f.activeRounds, 3, f.rounds - 1);
      const score = weigh([[2.5, Math.max(early, uneven)], [2, burst], [1.5, banked], [1.5, sustained]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.buildActions >= 5, f.activeRounds >= 3]),
        evidence: {
          build_share_early: +f.buildShareEarly.toFixed(2),
          build_share_mid: +f.buildShareMid.toFixed(2),
          build_share_late: +f.buildShareLate.toFixed(2),
          largest_round_burst: f.largestRoundBurst,
          cash_before_largest_burst: f.cashBeforeLargestBurst,
          active_rounds: f.activeRounds,
          idle_rounds: f.idleRounds,
        },
        summary: `Built ${Math.round(f.buildShareEarly * 100)}% early, ${Math.round(f.buildShareMid * 100)}% mid and ${Math.round(f.buildShareLate * 100)}% late, peaking at ${f.largestRoundBurst} segments in one round on $${f.cashBeforeLargestBurst}M.`,
      };
    },
  },
  {
    id: "network_engineer",
    label: "Network Engineer",
    run: f => {
      const unified = ramp(f.connectedLineShare, 0.5, 1);
      const transfers = ramp(f.interLineTransfers, 2, 8);
      const merges = ramp(f.mergeEvents, 1, 4);
      const reach = lead(f.networkLength, f.fieldNetworkLengthMean);
      const denser = lead(f.interLineTransfers, f.fieldInterLineTransfersMean);
      const scattered = 1 - ramp(f.isolatedPegShare, 0.1, 0.6);
      const score = weigh([[2.5, unified], [2.5, transfers], [2, merges], [2, denser], [1.5, reach], [1, scattered]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.buildActions >= 4, f.linesOwned >= 2]),
        evidence: {
          network_components: f.networkComponents,
          largest_component_pegs: f.largestComponentPegs,
          connected_line_share: +f.connectedLineShare.toFixed(2),
          inter_line_transfer_pegs: f.interLineTransfers,
          component_merge_events: f.mergeEvents,
          network_length: +f.networkLength.toFixed(1),
          network_length_rank: f.networkLengthRank,
          isolated_peg_share: +f.isolatedPegShare.toFixed(2),
        },
        summary: `${Math.round(f.connectedLineShare * 100)}% of lines sit in one ${f.largestComponentPegs}-peg network with ${f.interLineTransfers} transfer pegs and ${f.mergeEvents} placements that merged separate components.`,
      };
    },
  },
  {
    id: "infrastructure_landlord",
    label: "Infrastructure Landlord",
    run: f => {
      // One incidental payment is not a rent roll: breadth and repetition matter.
      const income = ramp(f.tollsReceived, 4, 16);
      const richer = lead(f.tollsReceived, f.fieldTollsReceivedMean);
      const breadth = ramp(f.distinctOpponentPayers, 1, Math.max(1, f.playerCount - 1));
      const repeat = ramp(f.repeatPayerEvents, 2, 5);
      const holdings = ramp(f.sharedStationsOwned, 2, 7);
      const firstMover = ramp(f.firstMoverSharedStations, 1, 4);
      const incidental = f.opponentPaymentEvents <= 1;
      const score = incidental ? Math.min(25, weigh([[2, income], [1, holdings]])) : weigh([
        [3, richer], [2.5, income], [2, breadth], [2, repeat], [1.5, holdings], [1, firstMover],
      ]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.playerCount >= 2, f.opponentPaymentEvents >= 1]),
        evidence: {
          tolls_received: f.tollsReceived,
          opponent_payment_events: f.opponentPaymentEvents,
          distinct_opponent_payers: f.distinctOpponentPayers,
          repeat_payer_events: f.repeatPayerEvents,
          shared_stations_owned: f.sharedStationsOwned,
          first_mover_shared_stations: f.firstMoverSharedStations,
          tolls_paid: f.tollsPaid,
        },
        summary: f.opponentPaymentEvents === 0
          ? "No opponent ever paid to use this network."
          : `Collected $${f.tollsReceived}M across ${f.opponentPaymentEvents} payments from ${f.distinctOpponentPayers} opponent(s), holding ${f.sharedStationsOwned} shared station pegs.`,
      };
    },
  },
  {
    id: "route_portfolio",
    label: "Route Portfolio Strategist",
    run: f => {
      // Intent is weak here, so this classifier stays deliberately conservative.
      const lengthMix = ramp(f.contractLengthSpread, 1, 4);
      const costMix = ramp(f.contractCostSpread, 2, 7);
      const spreadOut = ramp(f.starterSpread, 6, 20);
      const delivered = ramp(f.linesComplete, 1, Math.max(1, f.linesOwned));
      const score = Math.round(0.8 * weigh([[2.5, lengthMix], [2, costMix], [2, spreadOut], [1.5, delivered]]));
      return {
        score,
        confidence: confide([f.hasTelemetry, f.linesOwned >= 3, f.contractsBought >= 3]),
        evidence: {
          contracts_bought: f.contractsBought,
          contract_spend: f.contractSpend,
          contract_length_spread: f.contractLengthSpread,
          contract_cost_spread: f.contractCostSpread,
          contract_segments: f.contractSegments,
          starter_spread: +f.starterSpread.toFixed(1),
          lines_complete: f.linesComplete,
          later_pick_complementarity: +f.laterPickComplementarity.toFixed(2),
        },
        summary: `Bought ${f.contractsBought} contracts spanning ${f.contractLengthSpread} segments and $${f.contractCostSpread}M in price, with starters up to ${f.starterSpread.toFixed(1)} spaces apart.`,
      };
    },
  },
  {
    id: "engineering_commitment",
    label: "Engineering Commitment Strategist",
    run: f => {
      // Meeting a card is not enough; look for construction that kept serving it.
      const achieved = ramp(f.goalsMet, 1, Math.max(1, f.goalsHeld));
      const alignment = ramp(f.goalAdvanceShare, 0.1, 0.4);
      const payoff = ramp(f.goalVpShare, 0.15, 0.5);
      const sustained = ramp(f.buildsAdvancingGoals, 1, 4);
      const score = weigh([[2.5, achieved], [3, alignment], [2, payoff], [1.5, sustained]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.goalsHeld >= 1, f.buildActions >= 4]),
        evidence: {
          goals_held: f.goalsHeld,
          goals_met: f.goalsMet,
          goal_vp: f.goalVp,
          goal_vp_share_of_score: +f.goalVpShare.toFixed(2),
          builds_advancing_goals: f.buildsAdvancingGoals,
          goal_advance_share: +f.goalAdvanceShare.toFixed(2),
        },
        summary: `Met ${f.goalsMet} of ${f.goalsHeld} Engineering commitments for ${f.goalVp} VP, with ${f.buildsAdvancingGoals} placements that moved a commitment forward.`,
      };
    },
  },
  {
    id: "destination_specialist",
    label: "Destination Specialist",
    run: f => {
      const met = ramp(f.destinationsMet, 1, Math.max(1, f.destinationsHeld));
      const pursuit = ramp(f.destinationAdvanceShare, 0.15, 0.5);
      const concentrated = ramp(f.destinationLineConcentration, 0.5, 0.9);
      const payoff = ramp(f.destinationVp, 4, 11);
      const bought = f.destinationPurchased ? 1 : 0;
      const score = weigh([[2.5, met], [3, pursuit], [1.5, concentrated], [2, payoff], [0.5, bought]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.destinationsHeld >= 1, f.buildActions >= 4]),
        evidence: {
          destinations_held: f.destinationsHeld,
          destinations_met: f.destinationsMet,
          destination_vp: f.destinationVp,
          builds_advancing_destinations: f.buildsAdvancingDestinations,
          destination_advance_share: +f.destinationAdvanceShare.toFixed(2),
          destination_line_concentration: +f.destinationLineConcentration.toFixed(2),
          destination_purchased: f.destinationPurchased,
        },
        summary: `Connected ${f.destinationsMet} of ${f.destinationsHeld} missions for ${f.destinationVp} VP, with ${Math.round(f.destinationAdvanceShare * 100)}% of placements serving a mission.`,
      };
    },
  },
  {
    id: "spatial_denial",
    label: "Spatial Denial Strategist",
    run: f => {
      // Measured interaction only: we never infer why a peg was placed.
      const contested = ramp(f.contestedBuildShare, 0.2, 0.6);
      const pushier = lead(f.contestedBuildShare, f.fieldContestedShareMean);
      const firstMover = ramp(f.firstMoverSharedStations, 2, 6);
      const claimed = ramp(f.firstIntoNeighborhoods, 2, 6);
      const imposed = lead(f.opponentTollsInduced, f.fieldTollsReceivedMean);
      const score = weigh([[2.5, contested], [3, pushier], [2, firstMover], [2, claimed], [1.5, imposed]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.playerCount >= 2, f.buildsAdjacentToOpponents >= 1]),
        evidence: {
          builds_adjacent_to_opponents: f.buildsAdjacentToOpponents,
          contested_build_share: +f.contestedBuildShare.toFixed(2),
          first_into_neighborhoods: f.firstIntoNeighborhoods,
          first_mover_shared_stations: f.firstMoverSharedStations,
          opponent_tolls_induced: f.opponentTollsInduced,
        },
        summary: `${Math.round(f.contestedBuildShare * 100)}% of placements landed against opponent track, reaching ${f.firstIntoNeighborhoods} neighborhoods first and drawing $${f.opponentTollsInduced}M in access payments.`,
      };
    },
  },
  {
    id: "optionality",
    label: "Optionality Player",
    run: f => {
      // Proxies, honestly labelled: continuations left open, cash kept back.
      const open = ramp(f.meanContinuations, 8, 30);
      const neverCornered = ramp(f.minContinuations, 2, 10);
      const reserves = ramp(f.meanCashHeld, 6, 22);
      const unspentCrews = ramp(f.roundsWithSpareCrews, 1, 4);
      const revisions = ramp(f.undoActions, 1, 3);
      const score = weigh([[3, open], [2, neverCornered], [2, reserves], [1.5, unspentCrews], [1, revisions]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.meanContinuations > 0, f.buildActions >= 4]),
        evidence: {
          mean_legal_continuations: +f.meanContinuations.toFixed(1),
          min_legal_continuations: f.minContinuations,
          mean_cash_held: +f.meanCashHeld.toFixed(1),
          rounds_with_spare_crews: f.roundsWithSpareCrews,
          undo_actions: f.undoActions,
          extra_cards_bought: f.extraCardsBought,
        },
        summary: f.meanContinuations === 0
          ? "Continuation counts were not computed for this game."
          : `Left ${f.meanContinuations.toFixed(1)} legal continuations on average (never fewer than ${f.minContinuations}) while holding about $${f.meanCashHeld.toFixed(0)}M.`,
      };
    },
  },
  {
    id: "completion_abandonment",
    label: "Completion / Abandonment Strategist",
    run: f => {
      // Both disciplines count: finishing what pays, and dropping what does not.
      // Finishing everything in a field where everyone finishes everything is
      // ordinary play; the strategy is the decision, so reward standing out and
      // either clean completion or a clean, redirected abandonment.
      const finished = ramp(share(f.linesComplete, Math.max(1, f.linesOwned)), 0.5, 1);
      const better = lead(f.linesComplete, f.fieldLinesCompleteMean);
      const decisive = f.linesAbandoned > 0 ? ramp(f.buildsAfterAbandonment, 2, 6) : 0;
      const noDrift = 1 - ramp(f.remainingSegmentsOnPartials, 1, 6);
      const score = weigh([[2.5, finished], [3, better], [2, Math.max(decisive, noDrift)], [1.5, noDrift]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.linesOwned >= 2, f.buildActions >= 4]),
        evidence: {
          lines_owned: f.linesOwned,
          lines_complete: f.linesComplete,
          lines_abandoned: f.linesAbandoned,
          sunk_in_partial_lines: f.sunkInPartialLines,
          remaining_segments_on_partials: f.remainingSegmentsOnPartials,
          builds_after_abandonment: f.buildsAfterAbandonment,
          completion_vp: f.completionVp,
          incomplete_penalty: f.incompletePenalty,
        },
        summary: `Completed ${f.linesComplete} of ${f.linesOwned} lines for ${f.completionVp} VP; ${f.linesAbandoned} line(s) were left with ${f.remainingSegmentsOnPartials} segments unbuilt, taking ${f.incompletePenalty} VP.`,
      };
    },
  },
  {
    id: "endgame_controller",
    label: "Endgame Controller",
    run: f => {
      const lateBuild = ramp(f.buildShareLate, 0.25, 0.55);
      const lift = ramp(f.lateTempoLift, 0.05, 0.4);
      const spent = ramp(f.crewSpendLate, 2, 8);
      const converted = ramp(f.vpLate, 3, 14);
      const emptied = 1 - ramp(f.unusedCashShare, 0.15, 0.6);
      const score = weigh([[2.5, lateBuild], [2, lift], [2, spent], [2.5, converted], [1.5, emptied]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.buildActions >= 4, f.buildsLate >= 1]),
        evidence: {
          build_share_late: +f.buildShareLate.toFixed(2),
          late_tempo_lift: +f.lateTempoLift.toFixed(2),
          crew_spend_late: f.crewSpendLate,
          vp_generated_late: f.vpLate,
          destinations_met_late: f.destinationsMetLate,
          goals_first_met_late: f.goalsFirstMetLate,
          debt_incurred_late: f.debtIncurredLate,
          unused_cash_share: +f.unusedCashShare.toFixed(2),
        },
        summary: `Put ${Math.round(f.buildShareLate * 100)}% of construction into the closing rounds, spending $${f.crewSpendLate}M on crews there and converting it into roughly ${f.vpLate} VP.`,
      };
    },
  },
  {
    id: "specialist",
    label: "Specialist",
    run: f => {
      const differentiated = ramp(f.roleDifferentiation, 0.12, 0.45);
      const enoughLines = ramp(f.lineProfiles.filter(p => p.pegs > 1).length, 2, 3);
      const distinctJobs = ramp(new Set(f.lineProfiles.map(p => p.destinationShare > 0.3 ? "destination" : p.transferPegs >= 2 ? "network" : p.complete ? "completion" : "other")).size, 2, 3);
      const score = weigh([[3.5, differentiated], [2, enoughLines], [2, distinctJobs]]);
      return {
        score,
        confidence: confide([f.hasTelemetry, f.linesOwned >= 3, f.buildActions >= 5]),
        evidence: {
          role_differentiation: +f.roleDifferentiation.toFixed(2),
          lines_with_track: f.lineProfiles.filter(p => p.pegs > 1).length,
          destination_lines: f.lineProfiles.filter(p => p.destinationShare > 0.3).length,
          network_lines: f.lineProfiles.filter(p => p.transferPegs >= 2).length,
          completed_lines: f.lineProfiles.filter(p => p.complete).length,
        },
        summary: `Line roles differ by ${(f.roleDifferentiation * 100).toFixed(0)}% on average across destination, transfer, completion and contact profiles.`,
      };
    },
  },
  {
    id: "opportunist",
    label: "Opportunist",
    run: f => {
      // Conservative by design: ordinary reactive play is not opportunism.
      const reactive = ramp(f.buildsFollowingOpponentBuild / Math.max(1, f.buildActions), 0.3, 0.8);
      const switching = ramp(f.lineSwitchRate, 0.4, 0.85);
      const reserves = ramp(f.reserveHeldThroughMid, 6, 20);
      const lateCommit = ramp(f.buildShareLate, 0.3, 0.6);
      const revisions = ramp(f.undoActions, 1, 3);
      const score = Math.round(0.85 * weigh([[2.5, reactive], [2.5, switching], [2, reserves], [1.5, lateCommit], [1, revisions]]));
      return {
        score,
        confidence: confide([f.hasTelemetry, f.playerCount >= 2, f.buildActions >= 5]),
        evidence: {
          builds_following_opponent_build: f.buildsFollowingOpponentBuild,
          line_switch_rate: +f.lineSwitchRate.toFixed(2),
          reserve_held_through_mid: +f.reserveHeldThroughMid.toFixed(1),
          build_share_late: +f.buildShareLate.toFixed(2),
          undo_actions: f.undoActions,
          extra_cards_bought: f.extraCardsBought,
        },
        summary: `Switched line focus on ${Math.round(f.lineSwitchRate * 100)}% of consecutive builds and kept about $${f.reserveHeldThroughMid.toFixed(0)}M available through the middle game.`,
      };
    },
  },
];

export const STRATEGY_IDS: StrategyId[] = CLASSIFIERS.map(c => c.id);
export const STRATEGY_LABELS: Record<StrategyId, string> = Object.fromEntries(CLASSIFIERS.map(c => [c.id, c.label])) as Record<StrategyId, string>;

/** Run every classifier over one company's features. */
export function classify(features: PlayerFeatures): StrategyResult[] {
  return CLASSIFIERS.map(c => ({ strategy: c.id, label: c.label, ...c.run(features) }));
}
