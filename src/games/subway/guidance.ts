import { cardDraftTurnId, starterTurnId, surveyTurnId, type SubwayState } from "./config";

export type PhoneTab = "destinations" | "lines" | "engineering" | "general";
/** One instruction model for active players and waiting players alike. */
export function phoneGuidance(game:SubwayState, playerId:string): {text:string;tab:PhoneTab;label:string} {
  const me = game.players[playerId];
  const turn = (id:string|undefined, task:string) => id===playerId ? `Your turn: ${task}` : `${game.players[id??""]?.name??"Another company"} is choosing. ${task}`;
  if (game.phase==="PROCUREMENT") return {text:turn(game.procurement.offer?.activeId,"Choose your next line on the Lines page."),tab:"lines",label:"Open Lines"};
  if (game.phase==="ENGINEERING") {
    if (game.engineeringStep==="CARD_DRAFT") return {text:turn(cardDraftTurnId(game),"Open Engineering to review the two goals or draw blind on your turn."),tab:"engineering",label:"Open Engineering"};
    if (game.engineeringStep==="BUY_SURVEYS") return {text:me?.engineeringLocked?"Survey choice saved. Waiting for the other companies; review your destinations.":"Choose 0–5 Survey Pins on General, then confirm—even if you want zero.",tab:me?.engineeringLocked?"destinations":"general",label:me?.engineeringLocked?"Open Destinations":"Choose Survey Pins"};
    return {text:surveyTurnId(game)===playerId?"Take the iPad, confirm your company, then place your Survey Pins on highlighted holes.":`${game.players[surveyTurnId(game)??""]?.name??"Another company"} is placing Survey Pins on the iPad. Review your destinations.`,tab:"destinations",label:"Open Destinations"};
  }
  if (game.phase==="STARTER_PLACEMENT") return {text:starterTurnId(game)===playerId?"Take the iPad, confirm your company, select a border hole and confirm your starter peg.":`${game.players[starterTurnId(game)??""]?.name??"Another company"} is placing a starter on the iPad. Review your lines.`,tab:"lines",label:"Open Lines"};
  if (game.phase==="CONSTRUCTION") {
    const active=game.resolveQueue[0]===playerId;
    return {text:active?(me?.crewsHired?"On the iPad, select a peg for each hired line and confirm each placement.":"Take the iPad and confirm your company. Choose crews above the board; you may buy a Destination on your phone before hiring."):`${game.players[game.resolveQueue[0]]?.name??"Another company"} is building on the iPad. Review your goals while you wait.`,tab:"destinations",label:"Open Destinations"};
  }
  return {text:game.phase==="RESULTS"?"Game complete. Open General for final scores and the company breakdown.":"Construction is complete. Reveal final scores on the iPad.",tab:"general",label:"Open General"};
}
