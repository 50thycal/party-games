import {
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  contractOf,
  destinationById,
  engineeringById,
  lineComplete,
  segmentsBuilt,
  stationById,
  neighborhoodSize,
  type SubwayState,
} from "./config";
import { objectiveExplanation } from './objectiveGuidance';
import { analyzeStrategies, datasetRows, STRATEGY_EVIDENCE_FLOOR, STRATEGY_OCCURRENCE_THRESHOLD } from './strategy';
import type { GameRecord } from './recording';
import type { LabSeat } from './lab';

export type SubwayReportContext = {
  roomCode?: string;
  mode?: string;
  botVersion?: string;
  controllers?: {id:string; humanActions:number; botActions:number; unknownActions:number; currentControl?:string; profile?:string}[];
};

/** Results-only metadata: no recording tapes, hidden hands or credentials. */
export function recordedReportContext(record?: GameRecord, seats: LabSeat[] = []): SubwayReportContext {
  if (!record) return {};
  return {botVersion:record.botVersion, controllers:record.room.players.map(p=>{
    const actions=record.actions.filter(e=>e.action.playerId===p.id&&!['START_GAME','ADVANCE_SCORING'].includes(e.action.type));
    const seat=seats.find(s=>s.id===p.id);
    return {id:p.id,humanActions:actions.filter(e=>e.controller==='human').length,botActions:actions.filter(e=>e.controller==='bot').length,unknownActions:actions.filter(e=>e.controller!=='human'&&e.controller!=='bot').length,currentControl:seat?.control,profile:seat?`${seat.bot.personality} / ${seat.bot.skill}`:undefined};
  })};
}

/** How a company was played, from recorded provenance only. */
export const controllerLabel = (c?: SubwayReportContext["controllers"] extends (infer T)[] | undefined ? T : never): string =>
  !c ? "Unknown"
  : c.unknownActions ? "Unknown / incomplete provenance"
  : c.humanActions && c.botActions ? "Mixed human + bot"
  : c.botActions ? "Bot"
  : c.humanActions ? "Human"
  : "No recorded gameplay";

const cell = (value: unknown): string => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
const row = (values: unknown[]): string => `| ${values.map(cell).join(" | ")} |`;
const when = (value?: number): string => value === undefined ? "Not recorded" : `${value} (${new Date(value).toISOString()})`;
const cardName = (id: string): string => engineeringById(id)?.name ?? destinationById(id)?.name ?? id;

/** A copy/paste-ready record designed for post-playtest analysis by an AI. */
export function generateAiPlaytestReport(game: SubwayState, context: SubwayReportContext = {}): string {
  const ranking = game.playerOrder
    .map((id) => game.players[id])
    .filter(Boolean)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.money - a.money);

  const lines: string[] = [
    "# Subway AI Playtest Report",
    "",
    "## Session",
    "",
    row(["Field", "Value"]),
    row(["---", "---"]),
    row(["Game", "Subway"]),
    row(["State version", game.version ?? SUBWAY_STATE_VERSION]),
    row(["Bot policy version", context.botVersion ?? "Not recorded"]),
    row(["Room", context.roomCode ?? "Local / not supplied"]),
    row(["Mode", context.mode ?? "Not supplied"]),
    row(["Players", game.playerOrder.length]),
    row(["Started", when(game.startedAt)]),
    row(["Construction ended", when(game.constructionEndedAt)]),
    row(["End reason", game.endReason ?? "Not recorded"]),
    row(["Final phase", game.phase]),
    row(["Accepted actions", game.telemetry?.length ?? 0]),
    row(["Rejected / invalid actions", "Not tracked; rejected reducer actions do not mutate game state"]),
    "",
    "## Controllers",
    "",
    "Counts are recorded gameplay actions, excluding setup and scoring advance. Current control/profile describes the final setting, not necessarily the whole game. Missing provenance is never inferred from names or timing.",
    "",
    row(["Company", "Played by", "Human actions", "Bot actions", "Unknown actions", "Current control", "Current bot profile"]),
    row(["---", "---", "---:", "---:", "---:", "---", "---"]),
    ...game.playerOrder.map(id=>{
      const c=context.controllers?.find(c=>c.id===id);
      return row([game.players[id].name,controllerLabel(c),c?.humanActions,c?.botActions,c?.unknownActions,c?.currentControl??'Not recorded',c?.profile??'Not recorded']);
    }),
    "",
    "## Rules and settings",
    "",
    "```json",
    JSON.stringify({
      startingMoneyMillions: SUBWAY_CONFIG.startingMoney,
      lineCompletionRewardMillions: SUBWAY_CONFIG.completionReward,
      destinationCompletionRewardMillions: SUBWAY_CONFIG.destinationCompletionReward,
      crewDebtAllowed: SUBWAY_CONFIG.crewDebtAllowed,
      constructionRounds: SUBWAY_CONFIG.timelinePeriods,
      routesPerPlayer: SUBWAY_CONFIG.maxContractsPerPlayer,
      crewActivationCostMillions: { zero: 0, one: 1, two: 3, three: 6 },
      endingCashBands: SUBWAY_CONFIG.cashBands.map(b => ({ band: b.label, vp: b.vp })),
      pegStackingAllowed: false,
      bendMode: game.bendMode??'straight',
      segmentLengthMode: game.segmentLengthMode??'exact',
      bendRules: 'Tokens: 3 per company, extras $3M cash; delayed: one leg per activation; max 90-degree curve; total path length; bends/worksites are not pegs; partial track excludes network length until finished',
      stationAccess: "$1M once per line/opponent/local transfer station; starter joins included; crossings always separate",
      routeDraftPool: game.playerOrder.length * 3 + 1,
      largestStation: "Uses Largest Transfer Station occupied-hole scoring and tied-largest aggregation",
      contactTollMillions: SUBWAY_CONFIG.contact.toll,
      stationScores: SUBWAY_CONFIG.stationScores,
      board: SUBWAY_CONFIG.board,
      geometry: SUBWAY_CONFIG.geometry,
      engineeringPicks: SUBWAY_CONFIG.engineeringPicks,
      destinationPurchaseMillions: SUBWAY_CONFIG.destinationPurchaseCost,
      engineeringPurchaseMillions: SUBWAY_CONFIG.destinationPurchaseCost,
      extraCardPurchases: "One random Engineering goal and one random Destination mission per company per game, before hiring crews, from the iPad or the phone",
      firstCompletedPlayerId: game.firstCompletedPlayerId,
      longestNetwork: "Actual path length of completed segments in peg spaces, no repeated segments; winner 5 VP, ties 3 VP each",
      largestCluster: "Horizontally/vertically adjacent occupied peg holes across all companies, including the same line; one peg per hole. Total each company’s stations across all equally largest transfer stations. Leader award once: 6 VP alone, 3 each for two leaders, 2 each for three, 0 for four. No diagonals, string links, bends or worksites.",
      starterOccupancy: "New starter pegs require an empty non-neighborhood outer-border hole",
    }, null, 2),
    "```",
    "",
    "## Neighborhood layout",
    "",
    row(["Neighborhood", "Size", "Holes", "Connections"]),
    row(["---", "---", "---", "---:"]),
    ...game.stations.map((station) => row([station.name, neighborhoodSize(station), (station.cells ?? [station]).map(p=>`${p.x+1},${p.y+1}`).join("; "), "Unlimited"])),
    "",
    "## Final ranking and economy",
    "",
    row(["Rank", "Company", "Score", "Cash", "Crew spend", "Tolls paid", "Lines complete"]),
    row(["---:", "---", "---:", "---:", "---:", "---:", "---:"]),
    ...ranking.map((p, index) => row([
      index + 1,
      `${p.name}${game.winnerIds.includes(p.id) ? " (winner)" : ""}`,
      `${p.score ?? 0} VP`,
      `$${p.money}M`,
      `$${p.crewPaid ?? 0}M`,
      `$${p.tollsPaid}M`,
      `${p.lines.filter(lineComplete).length}/${p.lines.length}`,
    ])),
    "",
  ];

  for (const p of ranking) {
    lines.push(
      `## ${p.name}`,
      "",
      "### Lines",
      "",
      row(["Line", "Paid", "Progress", "Status", "Station path"]),
      row(["---", "---:", "---", "---", "---"]),
      ...p.lines.map((line) => {
        const contract = contractOf(line);
        const path = line.route.map((node, index) => {
          const station = node.stationId ? stationById(node.stationId)?.name ?? node.stationId : undefined;
          return `${index + 1}${node.via?.length?` via ${node.via.map(p=>`${p.x+1},${p.y+1}`).join(" → ")}`:""}:${station ? `${station} (${node.x + 1},${node.y + 1})` : `${node.x + 1},${node.y + 1}`}`;
        }).join(" → ");
        return row([
          contract?.name ?? line.contractId,
          `$${line.paid}M`,
          `${segmentsBuilt(line)}/${contract?.recipe.length ?? 0} segments`,
          lineComplete(line) ? "Complete" : "Incomplete",
          (path || "No starter")+(line.work?.length?` · Unfinished work: ${line.work.map(p=>`${p.x+1},${p.y+1}`).join(" → ")}`:""),
        ]);
      }),
      "",
      "### Cards and resources",
      `- Bend tokens remaining: ${p.bendTokens??0}`,
      "",
      `- Engineering and Destination cards held: ${p.engineeringHand.length + p.destinationHand.length ? [...p.engineeringHand, ...p.destinationHand].map(cardName).join("; ") : "None"}`,
      "",
      "### Score sources",
      "",
      row(["Source", "Met", "Points"]),
      row(["---", "---", "---:"]),
      ...(p.scoreBreakdown ?? []).map((item) => row([item.label, item.met === undefined ? "n/a" : item.met ? "Yes" : "No", item.points])),
      "",
      "### Objective explanations",
      "",
      row(["Objective", "Points / maximum", "Explanation"]),
      row(["---", "---", "---"]),
      ...[...p.engineeringHand,...p.destinationHand].map(id=>{
        const card=engineeringById(id)??destinationById(id);
        const points=p.scoreBreakdown?.find(item=>item.label===card?.name)?.points;
        return row([cardName(id),`${points??'Not scored'} / ${card?.vp??0}`,objectiveExplanation(id,game,p)]);
      }),
      "",
    );
  }

  // Strategy analysis is derived, never gameplay: it reads the log after the
  // fact and nothing here feeds back into the game or the bots.
  const strategies = analyzeStrategies(game, {
    gameId: context.roomCode ?? `${game.startedAt ?? 0}`,
    playerTypes: Object.fromEntries(game.playerOrder.map(id => [id, controllerLabel(context.controllers?.find(c => c.id === id))])),
  });
  lines.push(
    "## Strategy analysis",
    "",
    `Inferred from the accepted-action log by classifier ${strategies.classifierVersion}; nobody declared a strategy before or during play. Scores are 0-100 strategy-match strength, not probabilities, and are deliberately not mutually exclusive: a company can strongly exhibit several at once. A strategy counts as present in aggregate research at ${STRATEGY_OCCURRENCE_THRESHOLD}; below ${STRATEGY_EVIDENCE_FLOOR} it is reported as insufficient evidence rather than ranked.`,
    "",
  );
  for (const player of strategies.players) {
    lines.push(
      `### ${player.name}`,
      "",
      "Primary strategies",
      "",
      ...(player.top.length
        ? player.top.map((result, index) => `${index + 1}. ${result.label} — ${result.score}% — ${result.confidence} confidence`)
        : ["No strategy reached the evidence floor for this company."]),
      "",
      "Interpretation",
      "",
      player.top.length ? player.top.map(result => result.summary).join(" ") : "Recorded play did not match any classifier strongly enough to characterise.",
      "",
      "Supporting evidence",
      "",
      row(["Strategy", "Score", "Confidence", "Key metrics"]),
      row(["---", "---:", "---", "---"]),
      ...player.results.filter(r => r.score >= STRATEGY_EVIDENCE_FLOOR).map(result => row([
        result.label, result.score, result.confidence,
        Object.entries(result.evidence).map(([key, value]) => `${key}=${value ?? "n/a"}`).join("; "),
      ])),
      "",
    );
  }
  lines.push(
    "### Strategy fingerprints and dataset",
    "",
    "Complete per-company vectors, the raw features behind them and one dataset row per company per strategy, so historical playtests can be re-classified under a future classifier version without replaying them.",
    "",
    "```json",
    JSON.stringify({ analysis: strategies, rows: datasetRows(strategies) }, null, 2),
    "```",
    "",
  );

  lines.push(
    "## Structured accepted-action log",
    "",
    "This is the chronological source for draft order, cards played, crew choices, placements, Undo actions, round progression, and every recorded before/after budget or resource change. Invalid/rejected attempts are not recorded.",
    "",
    "```json",
    JSON.stringify(game.telemetry ?? [], null, 2),
    "```",
    ""
  );

  return lines.join("\n");
}
