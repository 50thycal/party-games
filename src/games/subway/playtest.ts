/** Deterministic heuristic playtester, shared by the CLI and the visual lab.
 * Drives only real reducer actions; it is not an AI opponent shipped in rooms.
 */
import type { Room } from "@/engine/types";
import { STATIONS, SUBWAY_CONFIG, subwayGame, nextCompanyId, pendingStarters, legalTargets, stationAt, lineComplete, contractOf, routeContacts, contactToll, destinationById, type SubwayState, type SubwayAction, type PlacementTarget } from "./config";

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
export function testRoom(count: number): Room {
  const players = Array.from({length:count}, (_,i) => ({id:`seat-${i+1}`, name:["Ember Transit", "Bluebird Rail", "Evergreen Metro", "Violet Lines"][i], role:i===0 ? "host" as const : "player" as const}));
  return {roomCode:`LAB${count}`, hostId:players[0].id, players, gameId:"subway", mode:"hotseat", createdAt:0};
}
export function startPlaytest(count: number, seed: number) {
  const room = testRoom(count);
  const random = seededRandom(seed);
  const state = subwayGame.reducer(subwayGame.initialState(room.players), {type:"START_GAME",playerId:room.hostId}, {room,playerId:room.hostId,now:()=>1,random});
  return {room,state};
}

function bestTarget(s: SubwayState, id: string, lineIndex: number, starter: boolean, random: () => number): PlacementTarget | undefined {
  const targets = legalTargets(s,id,lineIndex,starter);
  if (!targets.length) return undefined;
  const me = s.players[id];
  const line = me.lines[lineIndex];
  const desired = me.destinationCommitments.filter((c)=>c.lineIndex===lineIndex).map((c)=>destinationById(c.cardId)?.stationId);
  const unvisited = STATIONS.filter((station)=>!line.route.some((n)=>n.stationId===station.id));
  const clone = {...s, players:{...s.players, [id]:{...me, lines:me.lines.map((l)=>({...l, route:[...l.route]}))}}};
  const trial = clone.players[id].lines[lineIndex];
  // Prefer real station points and reachable destinations, but retain a
  // continuation. A small seeded tie-break removes fixed coordinate bias.
  return targets.map((target) => {
    const station = stationAt(target);
    trial.route = [...line.route, {...target, ...(station ? {stationId:station.id,stationSlot:target.slot} : {})}];
    const finished = lineComplete(trial);
    const options = finished ? [] : legalTargets(clone,id,lineIndex,false);
    const from = line.route[line.route.length-1];
    const toll = from ? contactToll(routeContacts(s,id,from,target)) : 0;
    const distance = Math.min(12,...unvisited.map((st)=>Math.hypot(st.x-target.x,st.y-target.y) / (desired.includes(st.id) ? 1.6 : 1)));
    const value = (station ? (station.kind==='major' ? 13 : 8) + (desired.includes(station.id) ? 8 : 0) : 0) + (finished ? 8 : options.length ? Math.min(3,options.length*.15) : -100) - distance*.6 - toll*1.5 + random()*.25;
    return {target,value};
  }).sort((a,b)=>b.value-a.value)[0].target;
}

export function playtestAction(s: SubwayState, random: () => number): SubwayAction | undefined {
  if (s.phase === "RESULTS") return undefined;
  const playerId = nextCompanyId(s)!;
  const me = s.players[playerId];
  const action = (type:SubwayAction["type"], payload?:SubwayAction["payload"]):SubwayAction => ({playerId,type,payload});
  switch(s.phase) {
    case "PROCUREMENT": {
      const offer = s.procurement.offer!;
      return action("PROCURE", me.lines.length<3 && me.money>=offer.price ? {choice:"buy"} : {choice:"pass",deck:"engineering"});
    }
    case "ENGINEERING":
      if(s.engineeringStep==="DESTINATION_DRAFT") return action("PICK_DESTINATION",{destinationCardId:s.destinationRow[0]});
      if(s.engineeringStep==="SURVEY") throw new Error("Playtester does not buy speculative survey pins.");
      return action("LOCK_ENGINEERING_PLAN",{cardIds:["straight","bend","network"],destinations:me.destinationHand.map((cardId,i)=>({cardId,lineIndex:i%me.lines.length})),surveys:0});
    case "SCHEDULING":
      return action(s.schedulingStep==="PLANNING" ? "SUBMIT_SCHEDULE" : "CONFIRM_SCHEDULE");
    case "STARTER_PLACEMENT": {
      const lineIndex=pendingStarters(me)[0];
      const target=bestTarget(s,playerId,lineIndex,true,random);
      if(!target) throw new Error("No starter target");
      return action("PLACE_STARTER",{lineIndex,...target});
    }
    case "CONSTRUCTION": {
      if(!me.constructionCardThisPeriod && me.constructionHand.includes("grant") && me.money<6) return action("PLAY_CONSTRUCTION_CARD",{cardId:"grant"});
      const lineIndex=me.pendingActions[0];
      const target=bestTarget(s,playerId,lineIndex,false,random);
      if(!target) return action("SKIP_ACTION",{lineIndex});
      const from=me.lines[lineIndex].route.at(-1)!;
      if(!me.constructionCardThisPeriod && !me.accessPass && me.constructionHand.includes("access") && routeContacts(s,playerId,from,target).length) return action("PLAY_CONSTRUCTION_CARD",{cardId:"access"});
      return action("BUILD",{lineIndex,...target});
    }
    case "SCORING": return action("ADVANCE_SCORING");
    default: throw new Error(`Unsupported phase ${s.phase}`);
  }
}

export function stepPlaytest(s:SubwayState, room:Room, random:()=>number): SubwayState {
  const action = playtestAction(s,random);
  if(!action) return s;
  const next=subwayGame.reducer(s,action,{room,playerId:action.playerId,now:()=>s.nextEventSeq,random});
  if(next===s) throw new Error(`Rejected playtest action ${JSON.stringify(action)} in ${s.phase}: ${s.message}`);
  return next;
}
export function runPlaytest(count:number, seed:number, until="RESULTS") {
  const {room,state}=startPlaytest(count,seed);
  const random=seededRandom(seed+1234);
  let game=state;
  let actions=0;
  while(game.phase!==until && game.phase!=="RESULTS" && actions<500) {
    game=stepPlaytest(game,room,random);actions++;
  }
  if(actions>=500) throw new Error("Game exceeded the 500-action termination bound");
  return {room,state:game,actions};
}
