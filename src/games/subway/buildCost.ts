import { contactToll, SUBWAY_CONFIG, type RouteContact, type SubwayPlayer } from "./config";

/** Quote one real segment from the same priced contacts used by BUILD. */
export function quoteBuildCost(player: Pick<SubwayPlayer, "money" | "accessPass">, contacts: RouteContact[]) {
  const totalToll = contactToll(contacts);
  const playerCost = player.accessPass ? 0 : totalToll;
  const cashAfter = player.money - playerCost;
  const payments = new Map<string, number>();
  for (const contact of contacts) {
    payments.set(contact.ownerId, (payments.get(contact.ownerId) ?? 0) + SUBWAY_CONFIG.contact.toll);
  }
  return {
    totalToll,
    playerCost,
    cashAfter,
    debtPenalty: Math.min(0, cashAfter) * SUBWAY_CONFIG.contact.debtVpPerMillion,
    subsidized: !!player.accessPass,
    recipients: Array.from(payments, ([ownerId, amount]) => ({ ownerId, amount })),
  };
}
