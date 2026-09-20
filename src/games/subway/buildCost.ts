import { cashScore, contactToll, SUBWAY_CONFIG, type RouteContact, type SubwayPlayer } from "./config";

/** Quote one real segment from the same priced contacts used by BUILD. */
export function quoteBuildCost(player: Pick<SubwayPlayer, "money" | "extending">, contacts: RouteContact[]) {
  const totalToll = contactToll(contacts);
  const playerCost = totalToll + (player.extending ? 1 : 0);
  const cashAfter = player.money - playerCost;
  const payments = new Map<string, number>();
  for (const contact of contacts) {
    payments.set(contact.ownerId, (payments.get(contact.ownerId) ?? 0) + SUBWAY_CONFIG.contact.toll);
  }
  return {
    totalToll,
    playerCost,
    cashAfter,
    /** Cash-band VP this balance would score if the game ended here. */
    cashScoreAfter: cashScore(cashAfter),
    cashScoreChange: cashScore(cashAfter) - cashScore(player.money),
    recipients: Array.from(payments, ([ownerId, amount]) => ({ ownerId, amount })),
  };
}
