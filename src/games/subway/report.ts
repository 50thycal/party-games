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

export type SubwayReportContext = {
  roomCode?: string;
  mode?: string;
};

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
    row(["State version", SUBWAY_STATE_VERSION]),
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
    "## Rules and settings",
    "",
    "```json",
    JSON.stringify({
      startingMoneyMillions: SUBWAY_CONFIG.startingMoney,
      lineCompletionRewardMillions: SUBWAY_CONFIG.completionReward,
      constructionRounds: SUBWAY_CONFIG.timelinePeriods,
      routesPerPlayer: SUBWAY_CONFIG.maxContractsPerPlayer,
      crewActivationCostMillions: { zero: 0, one: 1, two: 3, three: 6 },
      debtPenaltyVpPerMillion: SUBWAY_CONFIG.contact.debtVpPerMillion,
      contactTollMillions: SUBWAY_CONFIG.contact.toll,
      survey: SUBWAY_CONFIG.survey,
      stationScores: SUBWAY_CONFIG.stationScores,
      board: SUBWAY_CONFIG.board,
      geometry: SUBWAY_CONFIG.geometry,
      engineeringPicks: SUBWAY_CONFIG.engineeringPicks,
      destinationPurchaseMillions: SUBWAY_CONFIG.destinationPurchaseCost,
      firstCompletedPlayerId: game.firstCompletedPlayerId,
      longestNetwork: "Peg-space length, no repeated segments; winner 5 VP, ties 3 VP each",
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
    row(["Rank", "Company", "Score", "Cash", "Crew spend", "Tolls paid", "Surveys", "Routes complete"]),
    row(["---:", "---", "---:", "---:", "---:", "---:", "---:", "---:"]),
    ...ranking.map((p, index) => row([
      index + 1,
      `${p.name}${game.winnerIds.includes(p.id) ? " (winner)" : ""}`,
      `${p.score ?? 0} VP`,
      `$${p.money}M`,
      `$${p.crewPaid ?? 0}M`,
      `$${p.tollsPaid}M`,
      `${game.surveyPins.filter((pin) => pin.playerId === p.id && p.lines.some((line) => line.route.some((node) => !node.stationId && node.x === pin.x && node.y === pin.y))).length}/${p.surveysPurchased}`,
      `${p.lines.filter(lineComplete).length}/${p.lines.length}`,
    ])),
    "",
  ];

  for (const p of ranking) {
    lines.push(
      `## ${p.name}`,
      "",
      "### Routes",
      "",
      row(["Route", "Paid", "Progress", "Status", "Node path"]),
      row(["---", "---:", "---", "---", "---"]),
      ...p.lines.map((line) => {
        const contract = contractOf(line);
        const path = line.route.map((node, index) => {
          const station = node.stationId ? stationById(node.stationId)?.name ?? node.stationId : undefined;
          return `${index + 1}:${station ? `${station} (${node.x + 1},${node.y + 1})` : `${node.x + 1},${node.y + 1}`}`;
        }).join(" → ");
        return row([
          contract?.name ?? line.contractId,
          `$${line.paid}M`,
          `${segmentsBuilt(line)}/${contract?.recipe.length ?? 0} segments`,
          lineComplete(line) ? "Complete" : "Incomplete",
          path || "No starter",
        ]);
      }),
      "",
      "### Cards and resources",
      "",
      `- Engineering and Destination cards held: ${p.engineeringHand.length + p.destinationHand.length ? [...p.engineeringHand, ...p.destinationHand].map(cardName).join("; ") : "None"}`,
      `- Survey Pins: ${p.surveysPurchased} purchased; ${game.surveyPins.filter((pin) => pin.playerId === p.id).length} placed`,
      "",
      "### Score sources",
      "",
      row(["Source", "Met", "Points"]),
      row(["---", "---", "---:"]),
      ...(p.scoreBreakdown ?? []).map((item) => row([item.label, item.met === undefined ? "n/a" : item.met ? "Yes" : "No", item.points])),
      "",
    );
  }

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
