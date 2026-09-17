import { cardDraftTurnId, starterTurnId,  type SubwayState } from "./config";

export type PhoneTab = "destinations" | "lines" | "engineering" | "general";
/** One instruction model for active players and waiting players alike. */
export function phoneGuidance(game:SubwayState, playerId:string): {text:string;tab:PhoneTab;label:string} {
  const me = game.players[playerId];
  const turn = (id:string|undefined, task:string) => id===playerId ? task : `Waiting for ${game.players[id??""]?.name??"another company"}.`;
  if (game.phase==="PROCUREMENT") return {text:turn(game.procurement.offer?.activeId,"Buy 1 line."),tab:"lines",label:"Open Lines"};
  if (game.phase==="ENGINEERING") {
    if (game.engineeringStep==="CARD_DRAFT") return {text:turn(cardDraftTurnId(game),"Choose 1 Engineering card or draw blind."),tab:"engineering",label:"Open Engineering"};
    return {text:"Review your Engineering cards.",tab:"engineering",label:"Open Engineering"};
  }
  if (game.phase==="STARTER_PLACEMENT") return {text:turn(starterTurnId(game),"Place 1 starter station on the iPad border."),tab:"lines",label:"Open Lines"};
  if (game.phase==="CONSTRUCTION") {
    const active=game.resolveQueue[0]===playerId;
    return {text:active?(me?.crewsHired?(game.bendMode==='delayed'?"Build on the iPad. Stopping at a bend uses this line’s activation.":"Build each hired line on the iPad."):"Choose crews on the iPad."):`Waiting for ${game.players[game.resolveQueue[0]]?.name??"another company"}.`,tab:"destinations",label:"Open Destinations"};
  }
  return {text:game.phase==="RESULTS"?"Final scores are in General.":"Reveal final scores on the iPad.",tab:"general",label:"Open General"};
}
