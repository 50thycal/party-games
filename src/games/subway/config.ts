import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

export const SUBWAY_CONFIG = {
  startingMoney: 15,
  timelinePeriods: 10,
  board: { columns: 9, rows: 9 },
  straightTolerance: 15,
  gentleCurveTolerance: 30,
  bendTolerance: 50,
  stationScores: { major: 5, minor: 2 },
} as const;

export type Point = { x: number; y: number };
export type Station = Point & { id: string; name: string; kind: "major" | "minor"; capacity: number };
export const STATIONS: Station[] = [
  { id: "grand", name: "Grand Central", kind: "major", x: 2, y: 2, capacity: 2 },
  { id: "harbor", name: "Harbor Exchange", kind: "major", x: 6, y: 6, capacity: 2 },
  { id: "museum", name: "Museum", kind: "minor", x: 6, y: 1, capacity: 2 },
  { id: "market", name: "Market", kind: "minor", x: 1, y: 5, capacity: 2 },
  { id: "garden", name: "Garden", kind: "minor", x: 4, y: 4, capacity: 2 },
  { id: "stadium", name: "Stadium", kind: "minor", x: 7, y: 3, capacity: 2 },
];

export type LineContract = { id: string; name: string; nodes: number; cost: number; completionVp: number; stationBonus: number; incompletePenalty: number; special?: string };
export const LINE_CONTRACTS: LineContract[] = [
  { id: "short", name: "Short Line", nodes: 5, cost: 7, completionVp: 4, stationBonus: 4, incompletePenalty: -5 },
  { id: "medium", name: "Medium Line", nodes: 7, cost: 9, completionVp: 6, stationBonus: 4, incompletePenalty: -6 },
  { id: "long", name: "Long Line", nodes: 9, cost: 11, completionVp: 8, stationBonus: 4, incompletePenalty: -8 },
  { id: "express", name: "Express Line", nodes: 7, cost: 10, completionVp: 6, stationBonus: 5, incompletePenalty: -7, special: "+3 VP when the completed line connects two Major Stations." },
];

export type EngineeringCard = { id: string; name: string; description: string; vp: number; permission?: "crossing" };
export const ENGINEERING_CARDS: EngineeringCard[] = [
  { id: "gentle", name: "Gentle Curve", description: "Three sequential segments, each turn ≤30°.", vp: 4 },
  { id: "bend", name: "45 Degree Bend", description: "Include a direction change >30° and ≤50°.", vp: 3 },
  { id: "straight", name: "Straightaway", description: "Three consecutive segments aligned within 15°.", vp: 4 },
  { id: "approach", name: "Station Approach", description: "Enter a Major Station nearly straight.", vp: 4 },
  { id: "through", name: "Through Station", description: "Enter and leave a station in continuous alignment.", vp: 5 },
  { id: "long-segment", name: "Long Segment", description: "Build a segment at least 3 peg spaces long.", vp: 3 },
  { id: "parallel", name: "Parallel Corridor", description: "Run parallel to an opponent segment within 15°.", vp: 4 },
  { id: "terminal", name: "Terminal Approach", description: "Finish at any station.", vp: 4 },
  { id: "minimal", name: "Minimal Footprint", description: "Finish using exactly the contracted node count.", vp: 3 },
  { id: "crossing", name: "Crossing Design", description: "May cross one opposing segment; +2 VP when used.", vp: 2, permission: "crossing" },
];

export type SchedulingCardId = "early" | "float" | "priority";
export const SCHEDULING_CARDS = [
  { id: "early" as const, name: "Early Mobilization", description: "Shift the proposed block one period earlier." },
  { id: "float" as const, name: "Float", description: "After reveal, shift the block ±1 period." },
  { id: "priority" as const, name: "Priority Permit", description: "Take Priority 1 for the locked schedule." },
];
export type ConstructionCardId = "overtime" | "expedite" | "field" | "crew";
export const CONSTRUCTION_CARDS = [
  { id: "overtime" as const, name: "Overtime", description: "After this action, immediately build one extra node." },
  { id: "expedite" as const, name: "Expedite Materials", description: "Move your next remaining action one period earlier." },
  { id: "field" as const, name: "Field Adjustment", description: "Reconfirm that your next segment may target any legal destination." },
  { id: "crew" as const, name: "Extra Crew", description: "Place two legal sequential nodes on this action." },
];

export type SubwayPhase = "SETUP" | "PROCUREMENT" | "ENGINEERING" | "SCHEDULING_PROPOSAL" | "SCHEDULING_REVEAL" | "SCHEDULING_RESOLUTION" | "SCHEDULE_LOCKED" | "STARTER_PLACEMENT" | "CONSTRUCTION" | "SCORING" | "RESULTS";
export type RouteNode = Point & { stationId?: string };
export type ScoreItem = { label: string; points: number };
export type SubwayPlayer = {
  id: string; name: string; color: "#e5484d" | "#3b82f6"; money: number;
  engineeringHand: string[]; committedEngineering: string[]; engineeringLocked: boolean;
  schedulingHand: SchedulingCardId[]; constructionHand: ConstructionCardId[];
  contractId?: string; proposedStart?: number; scheduleStart?: number; scheduleCardPlayed?: SchedulingCardId;
  scheduleConfirmed: boolean; route: RouteNode[]; crossingsUsed: number; overtimeActions: number;
  score?: number; scoreBreakdown?: ScoreItem[];
};
export type Market = { contractIndex: number; engineeringIndex: number; schedulingIndex: number; constructionIndex: number };
export interface SubwayState {
  phase: SubwayPhase; playerOrder: string[]; players: Record<string, SubwayPlayer>; defaultPriorityPlayerId: string;
  procurementTurn: number; market: Market; currentPeriod: number; constructionQueue: string[];
  winnerIds: string[]; message: string;
}
export type SubwayActionType = "START_GAME" | "PROCURE" | "COMMIT_ENGINEERING" | "PROPOSE_SCHEDULE" | "REVEAL_SCHEDULES" | "PLAY_SCHEDULING_CARD" | "CONFIRM_SCHEDULE" | "PLACE_STARTER" | "BUILD" | "PLAY_CONSTRUCTION_CARD" | "ADVANCE_SCORING";
export interface SubwayAction extends BaseAction { type: SubwayActionType; payload?: { choice?: "contract" | "engineering" | "scheduling" | "construction" | "pass"; cardIds?: string[]; start?: number; cardId?: string; direction?: number; x?: number; y?: number; destinations?: Point[] } }

export const contractFor = (p: SubwayPlayer) => LINE_CONTRACTS.find(c => c.id === p.contractId);
const stationAt = (p: Point) => STATIONS.find(s => s.x === p.x && s.y === p.y);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const cross = (a: Point, b: Point, c: Point, d: Point) => {
  const orient = (p: Point, q: Point, r: Point) => Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));
  return orient(a,b,c) * orient(a,b,d) < 0 && orient(c,d,a) * orient(c,d,b) < 0;
};
export const angleChange = (a: Point,b: Point,c: Point) => {
  const u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-b.x,y:c.y-b.y};
  const n=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y); if(!n)return 180;
  return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/n)))*180/Math.PI;
};
const headingDiff = (a: Point,b: Point,c: Point,d: Point) => { const h1=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI; const h2=Math.atan2(d.y-c.y,d.x-c.x)*180/Math.PI; const raw=Math.abs(h1-h2)%180; return Math.min(raw,180-raw); };

export function validateNode(state: SubwayState, playerId: string, p: Point, starter=false): string | null {
  const me=state.players[playerId];
  if (!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=SUBWAY_CONFIG.board.columns||p.y>=SUBWAY_CONFIG.board.rows) return "Outside the pegboard.";
  const station=stationAt(p);
  if (starter && station) return "Starter pegs must use normal holes.";
  for (const other of Object.values(state.players)) for (const n of other.route) {
    if (same(n,p)) return "That peg is occupied.";
    if (other.id!==playerId && !station && !n.stationId && Math.max(Math.abs(n.x-p.x),Math.abs(n.y-p.y))<=1) return "Leave one empty hole beside opposing pegs.";
  }
  if (station) {
    const claimants=Object.values(state.players).filter(pl=>pl.route.some(n=>n.stationId===station.id)).length;
    if (!me.route.some(n=>n.stationId===station.id) && claimants>=station.capacity) return "That station is at capacity.";
  }
  if (!starter && me.route.length) {
    const from=me.route[me.route.length-1];
    for (const other of Object.values(state.players)) if(other.id!==playerId) for(let i=1;i<other.route.length;i++) {
      const a=other.route[i-1],b=other.route[i];
      if (cross(from,p,a,b) && !(me.committedEngineering.includes("crossing") && me.crossingsUsed<1)) return "Crossing Design is required.";
      if ((same(from,a)&&same(p,b))||(same(from,b)&&same(p,a))) return "Segments cannot overlap.";
      const area=Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x));
      const on=area===0&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
      if(on) return "A peg cannot sit on an opposing segment.";
    }
  }
  return null;
}

function objectiveMet(id:string, me:SubwayPlayer, opponents:SubwayPlayer[]):boolean {
  const r=me.route, angles=r.slice(2).map((_,i)=>angleChange(r[i],r[i+1],r[i+2]));
  if(id==="gentle") return angles.some((_,i)=>angles.slice(i,i+2).length===2&&angles.slice(i,i+2).every(a=>a<=30));
  if(id==="bend") return angles.some(a=>a>30&&a<=50);
  if(id==="straight") return angles.some((_,i)=>angles.slice(i,i+2).length===2&&angles.slice(i,i+2).every(a=>a<=15));
  if(id==="approach") return r.some((n,i)=>i>=2&&stationAt(n)?.kind==="major"&&angleChange(r[i-2],r[i-1],n)<=15);
  if(id==="through") return r.some((n,i)=>i>0&&i<r.length-1&&!!stationAt(n)&&angleChange(r[i-1],n,r[i+1])<=30);
  if(id==="long-segment") return r.some((n,i)=>i>0&&Math.hypot(n.x-r[i-1].x,n.y-r[i-1].y)>=3);
  if(id==="parallel") return r.some((n,i)=>i>0&&opponents.some(o=>o.route.some((q,j)=>j>0&&headingDiff(r[i-1],n,o.route[j-1],q)<=15)));
  if(id==="terminal") return !!r.length&&!!stationAt(r[r.length-1]);
  if(id==="minimal") return r.length===contractFor(me)?.nodes;
  if(id==="crossing") return me.crossingsUsed>0;
  return false;
}

export function scoreGame(state: SubwayState): SubwayState {
  const players={...state.players};
  for(const p of Object.values(players)) {
    const contract=contractFor(p)!; const items:ScoreItem[]=[];
    const uniqueStations=STATIONS.filter(s=>p.route.some(n=>n.stationId===s.id));
    for(const s of uniqueStations) items.push({label:s.name,points:SUBWAY_CONFIG.stationScores[s.kind]});
    const complete=p.route.length>=contract.nodes;
    items.push({label:complete?`${contract.name} completed`:`${contract.name} incomplete`,points:complete?contract.completionVp:contract.incompletePenalty});
    if(complete&&uniqueStations.some(s=>s.kind==="major")) items.push({label:"Contract major-station bonus",points:contract.stationBonus});
    if(complete&&contract.id==="express"&&uniqueStations.filter(s=>s.kind==="major").length>=2) items.push({label:"Express special",points:3});
    for(const id of p.committedEngineering) { const card=ENGINEERING_CARDS.find(c=>c.id===id)!; if(objectiveMet(id,p,Object.values(players).filter(o=>o.id!==p.id))) items.push({label:card.name,points:card.vp}); }
    p.scoreBreakdown=items;p.score=items.reduce((n,i)=>n+i.points,0);
  }
  const ranked=Object.values(players).sort((a,b)=>(b.score!-a.score!)||(majorCount(b)-majorCount(a))||(b.money-a.money));
  const top=ranked[0], winners=ranked.filter(p=>p.score===top.score&&majorCount(p)===majorCount(top)&&p.money===top.money).map(p=>p.id);
  return {...state,players,winnerIds:winners,phase:"RESULTS",message:winners.length>1?"Shared victory!":`${top.name} wins!`};
}
const majorCount=(p:SubwayPlayer)=>STATIONS.filter(s=>s.kind==="major"&&p.route.some(n=>n.stationId===s.id)).length;

function initial(players:Player[]):SubwayState { const order=players.slice(0,2).map(p=>p.id); const ps:Record<string,SubwayPlayer>={}; players.slice(0,2).forEach((p,i)=>ps[p.id]={id:p.id,name:p.name,color:i===0?"#e5484d":"#3b82f6",money:15,engineeringHand:["straight","bend","long-segment","terminal","crossing"],committedEngineering:[],engineeringLocked:false,schedulingHand:SCHEDULING_CARDS.slice(0,3).map(c=>c.id),constructionHand:["overtime","crew"],scheduleConfirmed:false,route:[],crossingsUsed:0,overtimeActions:0}); return {phase:"SETUP",playerOrder:order,players:ps,defaultPriorityPlayerId:order[0]??"",procurementTurn:0,market:{contractIndex:0,engineeringIndex:0,schedulingIndex:0,constructionIndex:0},currentPeriod:1,constructionQueue:[],winnerIds:[],message:"Waiting for two players."}; }
export function legalScheduleStart(p:SubwayPlayer,start:number){const duration=(contractFor(p)?.nodes??1)-1;return Number.isInteger(start)&&start>=1&&start+duration-1<=SUBWAY_CONFIG.timelinePeriods;}
function nextConstruction(state:SubwayState):SubwayState { let period=state.currentPeriod, queue:string[]=[]; while(period<=SUBWAY_CONFIG.timelinePeriods&&!queue.length){ queue=state.playerOrder.filter(id=>{const p=state.players[id],c=contractFor(p);return c&&p.route.length<c.nodes&&p.scheduleStart!==undefined&&period>=p.scheduleStart&&period<p.scheduleStart+c.nodes-1;}).sort((a,b)=>a===state.defaultPriorityPlayerId?-1:b===state.defaultPriorityPlayerId?1:0); if(!queue.length)period++; } if(period>SUBWAY_CONFIG.timelinePeriods)return {...state,phase:"SCORING",currentPeriod:period,message:"Construction complete. Reveal scoring."}; return {...state,currentPeriod:period,constructionQueue:queue,message:`Period ${period}: ${state.players[queue[0]].name} acts.`}; }

export const subwayGame=defineGame<SubwayState,SubwayAction>({id:"subway",name:"Subway",description:"Race to engineer and construct a competitive transit network.",minPlayers:2,maxPlayers:2,initialState:initial,getPhase:s=>s.phase,
 reducer(state,action,ctx){const p=state.players[action.playerId];if(!p)return state;let s=structuredClone(state) as SubwayState;const me=s.players[action.playerId];
  if(action.type==="START_GAME"&&state.phase==="SETUP"&&ctx.room.hostId===action.playerId&&ctx.room.players.length===2){s.phase="PROCUREMENT";s.defaultPriorityPlayerId=s.playerOrder[Math.floor(ctx.random()*2)];s.message=`${s.players[s.playerOrder[0]].name} shops first.`;return s;}
  if(action.type==="PROCURE"&&state.phase==="PROCUREMENT"&&s.playerOrder[s.procurementTurn%2]===me.id){const choice=action.payload?.choice;if(choice==="contract"&&!me.contractId){const c=LINE_CONTRACTS[s.market.contractIndex%LINE_CONTRACTS.length];if(me.money<c.cost)return state;me.money-=c.cost;me.contractId=c.id;s.market.contractIndex++;}else if(choice==="engineering"){me.engineeringHand.push(ENGINEERING_CARDS[s.market.engineeringIndex++%ENGINEERING_CARDS.length].id);}else if(choice==="scheduling"){me.schedulingHand.push(SCHEDULING_CARDS[s.market.schedulingIndex++%SCHEDULING_CARDS.length].id);}else if(choice==="construction"){me.constructionHand.push(CONSTRUCTION_CARDS[s.market.constructionIndex++%CONSTRUCTION_CARDS.length].id);}else if(choice!=="pass")return state;s.procurementTurn++;if(Object.values(s.players).every(x=>x.contractId)){s.phase="ENGINEERING";s.message="Commit exactly three Engineering cards.";}return s;}
  if(action.type==="COMMIT_ENGINEERING"&&state.phase==="ENGINEERING"&&!me.engineeringLocked){const ids=action.payload?.cardIds??[];if(ids.length!==3||new Set(ids).size!==3||ids.some(id=>!me.engineeringHand.includes(id)))return state;me.committedEngineering=ids;me.engineeringLocked=true;if(Object.values(s.players).every(x=>x.engineeringLocked)){s.phase="SCHEDULING_PROPOSAL";s.message="Secretly propose a schedule start.";}return s;}
  if(action.type==="PROPOSE_SCHEDULE"&&state.phase==="SCHEDULING_PROPOSAL"){const start=action.payload?.start??0;if(!legalScheduleStart(me,start))return state;me.proposedStart=start;if(Object.values(s.players).every(x=>x.proposedStart!==undefined)){s.phase="SCHEDULING_REVEAL";s.message="Both proposals are ready to reveal.";}return s;}
  if(action.type==="REVEAL_SCHEDULES"&&state.phase==="SCHEDULING_REVEAL"){if(ctx.room.hostId!==me.id)return state;for(const x of Object.values(s.players))x.scheduleStart=x.proposedStart;s.phase="SCHEDULING_RESOLUTION";s.message="Play up to one Scheduling card, then confirm.";return s;}
  if(action.type==="PLAY_SCHEDULING_CARD"&&state.phase==="SCHEDULING_RESOLUTION"&&!me.scheduleCardPlayed){const id=action.payload?.cardId as SchedulingCardId;if(!me.schedulingHand.includes(id))return state;let start=me.scheduleStart!;if(id==="early")start--;if(id==="float")start+=action.payload?.direction===-1?-1:1;if(!legalScheduleStart(me,start))return state;if(id==="priority")s.defaultPriorityPlayerId=me.id;else me.scheduleStart=start;me.scheduleCardPlayed=id;me.schedulingHand=me.schedulingHand.filter(c=>c!==id);return s;}
  if(action.type==="CONFIRM_SCHEDULE"&&state.phase==="SCHEDULING_RESOLUTION"){me.scheduleConfirmed=true;if(Object.values(s.players).every(x=>x.scheduleConfirmed)){s.phase="SCHEDULE_LOCKED";s.message="Schedules locked. Continue to starter placement.";}return s;}
  if(action.type==="PLACE_STARTER"&&(state.phase==="SCHEDULE_LOCKED"||state.phase==="STARTER_PLACEMENT")){if(me.route.length)return state;s.phase="STARTER_PLACEMENT";const pt={x:action.payload?.x??-1,y:action.payload?.y??-1};if(validateNode(s,me.id,pt,true))return state;me.route=[pt];if(Object.values(s.players).every(x=>x.route.length)){s.phase="CONSTRUCTION";s.currentPeriod=1;return nextConstruction(s);}return s;}
  if(action.type==="PLAY_CONSTRUCTION_CARD"&&state.phase==="CONSTRUCTION"&&s.constructionQueue[0]===me.id){const id=action.payload?.cardId as ConstructionCardId;if(!me.constructionHand.includes(id))return state;if(id==="overtime")me.overtimeActions++;else if(id==="expedite")me.scheduleStart=Math.max(1,(me.scheduleStart??1)-1);else if(id==="crew")me.overtimeActions++;me.constructionHand=me.constructionHand.filter(c=>c!==id);s.message=id==="field"?"Field adjustment armed: choose any legal destination.":"Construction card played.";return s;}
  if(action.type==="BUILD"&&state.phase==="CONSTRUCTION"&&s.constructionQueue[0]===me.id){const c=contractFor(me)!;if(me.route.length>=c.nodes)return state;const pt={x:action.payload?.x??-1,y:action.payload?.y??-1};if(validateNode(s,me.id,pt))return state;const from=me.route[me.route.length-1];for(const o of Object.values(s.players))if(o.id!==me.id)for(let i=1;i<o.route.length;i++)if(cross(from,pt,o.route[i-1],o.route[i]))me.crossingsUsed++;const st=stationAt(pt);me.route.push({...pt,...(st?{stationId:st.id}:{})});if(me.overtimeActions>0&&me.route.length<c.nodes){me.overtimeActions--;s.message="Extra construction action: place another node.";return s;}s.constructionQueue.shift();if(!s.constructionQueue.length){s.currentPeriod++;return nextConstruction(s);}s.message=`Period ${s.currentPeriod}: ${s.players[s.constructionQueue[0]].name} acts.`;return s;}
  if(action.type==="ADVANCE_SCORING"&&state.phase==="SCORING"&&ctx.room.hostId===me.id)return scoreGame({...s,phase:"SCORING"});return state;
 }});
