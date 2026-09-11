import { quoteBuildCost } from "./buildCost";
import { money } from "./cards";
import type { RouteContact, SubwayPlayer, SubwayState } from "./config";

export function BuildCostPreview({ player, contacts, game }: {
  player: SubwayPlayer;
  contacts: RouteContact[];
  game: SubwayState;
}) {
  const quote = quoteBuildCost(player, contacts);
  return <div aria-label="Cost of next real segment" className="rounded-lg border border-stone-300 bg-white/80 px-2 py-1.5 text-xs text-stone-700">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <b>You pay {money(quote.playerCost)}</b>
      <span>Cash {money(player.money)} → <b className={quote.cashAfter < 0 ? "text-red-800" : "text-stone-900"}>{money(quote.cashAfter)}</b></span>
    </div>
    <p className="mt-1">
      {quote.recipients.length
        ? <>{quote.subsidized ? "City pays" : "Paid to"}: {quote.recipients.map(p => `${game.players[p.ownerId]?.name ?? "Route owner"} ${money(p.amount)}`).join(" · ")}</>
        : "No contact toll."}
      {quote.subsidized && <span> Access Pass used on this build.</span>}
    </p>
    {quote.debtPenalty < 0 && <p className="mt-1 font-bold text-red-800">If the game ended here: {quote.debtPenalty} VP from debt.</p>}
  </div>;
}
