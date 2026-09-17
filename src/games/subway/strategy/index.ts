import { SUBWAY_STATE_VERSION, type SubwayState } from "../config";
import { RULES_FINGERPRINT } from "../recording";
import { extractFeatures, phaseOfPeriod, reconstructTimeline, type GamePhase, type PlayerFeatures } from "./features";
import { classify, STRATEGY_IDS, STRATEGY_LABELS, type Confidence, type StrategyId, type StrategyResult } from "./classifiers";

export * from "./classifiers";
export * from "./features";

// ============================================================================
// Strategy analysis: the layer between raw telemetry and cross-game research.
//
// The game never learns that anyone is a "Network Engineer": classification
// reads the accepted-action log after the fact and writes nothing back.
// Raw features travel with every result so a later classifier version can be
// re-run against archived playtests instead of re-simulating them.
// ============================================================================

/** Bump on any change to features or scoring, so old rows stay interpretable. */
export const STRATEGY_CLASSIFIER_VERSION = "1.0.0";

/** One threshold, defined once: a strategy "occurred" at or above this score. */
export const STRATEGY_OCCURRENCE_THRESHOLD: number = 55;
/** Below this, a strategy is reported as insufficient evidence rather than ranked. */
export const STRATEGY_EVIDENCE_FLOOR: number = 40;
/** At most this many strategies are named as a company's primary read. */
export const STRATEGY_TOP_N: number = 3;

export type StrategyFingerprint = Record<StrategyId, number>;

export type PlayerStrategyAnalysis = {
  playerId: string;
  name: string;
  playerType: string;
  finalRank: number;
  finalVp: number;
  endingCash: number;
  won: boolean;
  /** Every strategy, scored. Never only the top three: combinations matter. */
  fingerprint: StrategyFingerprint;
  results: StrategyResult[];
  /** Strongest strategies with enough evidence, best first; may be fewer than three. */
  top: StrategyResult[];
  insufficientEvidence: StrategyId[];
  features: PlayerFeatures;
  /**
   * How the read looked at the end of each earlier phase. A fingerprint needs a
   * board, which only exists cumulatively, so these are the game as it stood at
   * that point rather than that phase in isolation. The end-of-game read is
   * `fingerprint`, which is why there is no separate late entry.
   */
  evolution?: { throughEarly?: StrategyFingerprint; throughMid?: StrategyFingerprint };
};

export type StrategyAnalysis = {
  gameId: string;
  timestamp: number | null;
  rulesVersion: string;
  stateVersion: number;
  classifierVersion: string;
  playerCount: number;
  players: PlayerStrategyAnalysis[];
};

export type StrategyAnalysisOptions = {
  gameId?: string;
  /** Human / Bot / Mixed per player, when the caller knows it. */
  playerTypes?: Record<string, string>;
  /** Legal-continuation counts: exact but the costliest feature. */
  deepOptionality?: boolean;
  /** Per-phase fingerprints. Off for batch runs where only the overall read matters. */
  evolution?: boolean;
};

const fingerprintOf = (results: StrategyResult[]): StrategyFingerprint =>
  Object.fromEntries(results.map(r => [r.strategy, r.score])) as StrategyFingerprint;

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/**
 * The game truncated to the end of `phase`, for per-phase fingerprints.
 * Scores and winners are absent mid-game, so phase reads describe behavior
 * only; the overall classification remains the authoritative one.
 */
function gameThroughPhase(game: SubwayState, phase: GamePhase): SubwayState | undefined {
  const steps = reconstructTimeline(game);
  const upTo = steps.filter(step => {
    const order: GamePhase[] = ["early", "mid", "late"];
    return order.indexOf(step.phase) <= order.indexOf(phase);
  });
  const last = upTo.at(-1);
  if (!last || !upTo.some(step => step.placed)) return undefined;
  return {
    ...game,
    players: Object.fromEntries(game.playerOrder.map(id => [id, {
      ...game.players[id],
      money: last.moneyAfter[id] ?? game.players[id].money,
      lines: game.players[id].lines.map((line, i) => ({ ...line, route: last.routes[id]?.[i] ?? [], work: undefined })),
    }])),
    telemetry: (game.telemetry ?? []).filter(e => phaseOfPeriod(e.periodAfter) === phase || upTo.some(s => s.index === e.actionNumber)),
  } as SubwayState;
}

/** Classify every company in one finished game. */
export function analyzeStrategies(game: SubwayState, options: StrategyAnalysisOptions = {}): StrategyAnalysis {
  const { deepOptionality = true, evolution = true } = options;
  const features = extractFeatures(game, { deepOptionality });
  const players: PlayerStrategyAnalysis[] = game.playerOrder.flatMap(id => {
    const f = features[id];
    if (!f) return [];
    const results = classify(f).sort((a, b) =>
      b.score - a.score || CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence] || a.strategy.localeCompare(b.strategy));
    const top = results.filter(r => r.score >= STRATEGY_EVIDENCE_FLOOR).slice(0, STRATEGY_TOP_N);
    return [{
      playerId: id,
      name: f.name,
      playerType: options.playerTypes?.[id] ?? "Unknown",
      finalRank: f.finalRank,
      finalVp: f.finalVp,
      endingCash: f.endingCash,
      won: f.won,
      fingerprint: fingerprintOf(results),
      results,
      top,
      insufficientEvidence: results.filter(r => r.score < STRATEGY_EVIDENCE_FLOOR).map(r => r.strategy),
      features: f,
    }];
  });

  if (evolution) {
    for (const [phase, key] of [["early", "throughEarly"], ["mid", "throughMid"]] as [GamePhase, "throughEarly" | "throughMid"][]) {
      const slice = gameThroughPhase(game, phase);
      if (!slice) continue;
      const sliced = extractFeatures(slice, { deepOptionality: false });
      for (const player of players) {
        const f = sliced[player.playerId];
        if (!f) continue;
        player.evolution = { ...player.evolution, [key]: fingerprintOf(classify(f)) };
      }
    }
  }

  return {
    gameId: options.gameId ?? `${game.startedAt ?? 0}`,
    timestamp: game.constructionEndedAt ?? game.startedAt ?? null,
    rulesVersion: RULES_FINGERPRINT,
    stateVersion: game.version ?? SUBWAY_STATE_VERSION,
    classifierVersion: STRATEGY_CLASSIFIER_VERSION,
    playerCount: game.playerOrder.length,
    players,
  };
}

// ----------------------------------------------------------------------------
// Cross-game dataset
// ----------------------------------------------------------------------------

/** One row per company per strategy: the long format aggregation reads. */
export type StrategyDatasetRow = {
  game_id: string;
  timestamp: number | null;
  rules_version: string;
  state_version: number;
  classifier_version: string;
  player_id: string;
  player_name: string;
  player_type: string;
  player_count: number;
  final_rank: number;
  final_vp: number;
  ending_cash: number;
  ending_debt: number;
  strategy: StrategyId;
  strategy_score: number;
  strategy_confidence: Confidence;
  occurred: boolean;
  won_game: boolean;
};

export function datasetRows(analysis: StrategyAnalysis): StrategyDatasetRow[] {
  return analysis.players.flatMap(player => player.results.map(result => ({
    game_id: analysis.gameId,
    timestamp: analysis.timestamp,
    rules_version: analysis.rulesVersion,
    state_version: analysis.stateVersion,
    classifier_version: analysis.classifierVersion,
    player_id: player.playerId,
    player_name: player.name,
    player_type: player.playerType,
    player_count: analysis.playerCount,
    final_rank: player.finalRank,
    final_vp: player.finalVp,
    ending_cash: player.endingCash,
    ending_debt: Math.max(0, -player.endingCash),
    strategy: result.strategy,
    strategy_score: result.score,
    strategy_confidence: result.confidence,
    occurred: result.score >= STRATEGY_OCCURRENCE_THRESHOLD,
    won_game: player.won,
  })));
}

export type StrategySummary = {
  strategy: StrategyId;
  label: string;
  occurrence_count: number;
  occurrence_rate: number;
  win_rate: number | null;
  average_vp: number | null;
  average_rank: number | null;
  average_cash: number | null;
  average_debt: number | null;
};

/**
 * Occurrence and outcome summary over any set of rows.
 * Correlation only: a strategy appearing in winning games does not make it the
 * cause, and these numbers exist to point at what deserves investigation.
 */
export function aggregateStrategies(rows: StrategyDatasetRow[]): StrategySummary[] {
  const players = new Set(rows.map(r => `${r.game_id}:${r.player_id}`)).size;
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return STRATEGY_IDS.map(strategy => {
    const occurrences = rows.filter(r => r.strategy === strategy && r.occurred);
    return {
      strategy,
      label: STRATEGY_LABELS[strategy],
      occurrence_count: occurrences.length,
      occurrence_rate: players ? occurrences.length / players : 0,
      win_rate: occurrences.length ? occurrences.filter(r => r.won_game).length / occurrences.length : null,
      average_vp: mean(occurrences.map(r => r.final_vp)),
      average_rank: mean(occurrences.map(r => r.final_rank)),
      average_cash: mean(occurrences.map(r => r.ending_cash)),
      average_debt: mean(occurrences.map(r => r.ending_debt)),
    };
  }).sort((a, b) => b.occurrence_count - a.occurrence_count || a.strategy.localeCompare(b.strategy));
}

/** How often pairs of strategies occur together in one company's play. */
export function strategyCombinations(rows: StrategyDatasetRow[]): { pair: [StrategyId, StrategyId]; count: number; rate: number }[] {
  const byPlayer = new Map<string, StrategyId[]>();
  for (const row of rows.filter(r => r.occurred)) {
    const key = `${row.game_id}:${row.player_id}`;
    byPlayer.set(key, [...(byPlayer.get(key) ?? []), row.strategy]);
  }
  const players = new Set(rows.map(r => `${r.game_id}:${r.player_id}`)).size;
  const counts = new Map<string, number>();
  for (const list of Array.from(byPlayer.values())) {
    const sorted = [...list].sort();
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const key = `${sorted[i]}|${sorted[j]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([key, count]) => {
    const [a, b] = key.split("|") as [StrategyId, StrategyId];
    return { pair: [a, b] as [StrategyId, StrategyId], count, rate: players ? count / players : 0 };
  }).sort((x, y) => y.count - x.count || x.pair[0].localeCompare(y.pair[0]));
}
