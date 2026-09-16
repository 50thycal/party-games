/** Bounded, deterministic company-aware lookahead. No I/O or hidden information. */
import { SUBWAY_CONFIG, contractOf, destinationById, lineComplete, lineActionsRemaining, objectiveProgress, stationAt, validateNode, routeContacts, contactToll, type SubwayState, type SubwayPlayer, type PlacementTarget } from './config';
import { companyComponents } from './network';
import { largestCluster } from './clusters';
import { stationAccessContacts } from './stationAccess';
import { engineeringPotential } from './objectiveGuidance';
import type { BotSettings } from './bots';

export const ROUTE_SEARCH_LIMIT = 480;
const CACHE_LIMIT = 96;
type Result = {target?: PlacementTarget; path: PlacementTarget[]; expanded: number};
const cache = new Map<string, Result>();
export const clearBotRouteCache = () => cache.clear();
const dist = (a: PlacementTarget,b: PlacementTarget) => Math.hypot(a.x-b.x,a.y-b.y);

/** Assign whole destination missions to a line; distribute Citywide areas by reach/load.
 * This is guidance, not a binding restriction: better economic alternatives may win.
 */
export type LineJob = {destination:string[]; citywide:string[]};
export function companyJobs(s: SubwayState,id:string): LineJob[] {
  const me=s.players[id], jobs=me.lines.map(()=>({destination:[],citywide:[]} as LineJob));
  const anchors=me.lines.map((l,i)=>l.route.at(-1)??{x:3+i*10,y:i%2?0:8});
  const available=me.lines.map((_,i)=>i).filter(i=>!lineComplete(me.lines[i]));
  const assign=(ids:string[],kind:keyof LineJob)=>{
    const ranked=available.map(i=>({i,cost:ids.reduce((v,id)=>{
      const st=s.stations.find(st=>st.id===id);return v+(st?dist(anchors[i],st):0);
    },0)+(jobs[i].destination.length+jobs[i].citywide.length)*3-lineActionsRemaining(me.lines[i])*.5})).sort((a,b)=>a.cost-b.cost||a.i-b.i);
    if(ranked[0]) jobs[ranked[0].i][kind].push(...ids);
  };
  for(const card of me.destinationHand) {
    if(!objectiveProgress(card,me,Object.values(s.players).filter(p=>p.id!==id),s).met) assign(destinationById(card)?.stationIds??[],'destination');
  }
  if(me.engineeringHand.includes('citywide-coverage')&&!objectiveProgress('citywide-coverage',me,Object.values(s.players).filter(p=>p.id!==id),s).met) {
    // Component-aware filtering happens per line; a disconnected visit cannot
    // remove an area from the company's candidate jobs.
    for(const st of s.stations) assign([st.id],'citywide');
  }
  return jobs.map(j=>({destination:Array.from(new Set(j.destination)),citywide:Array.from(new Set(j.citywide))}));
}

export function missingJobStops(me:SubwayPlayer,index:number,job:LineJob):string[] {
  const own=new Set(me.lines[index].route.map(n=>n.stationId));
  const anchor=me.lines[index].route[0];
  const component=anchor?companyComponents(me).find(ns=>ns.some(n=>n.x===anchor.x&&n.y===anchor.y)):undefined;
  const all=new Set(me.lines.flatMap(l=>l.route).filter(n=>component?.some(p=>p.x===n.x&&p.y===n.y)).map(n=>n.stationId));
  return Array.from(new Set([...job.destination.filter(id=>!own.has(id)),...job.citywide.filter(id=>!all.has(id))]));
}

const offsetCache=new Map<number,PlacementTarget[]>();
function options(s:SubwayState,id:string,index:number,starter:boolean):PlacementTarget[] {
  const l=s.players[id].lines[index];
  let targets:PlacementTarget[]=[];
  if(starter) {
    for(let x=0;x<27;x++) targets.push({x,y:0},{x,y:8});
    for(let y=1;y<8;y++) targets.push({x:0,y},{x:26,y});
  } else {
    const length=contractOf(l)?.recipe[l.route.length-1],end=l.route.at(-1);
    if(!length||!end) return [];
    if(!offsetCache.has(length)) {
      const offsets:PlacementTarget[]=[];
      for(let y=-length-1;y<=length+1;y++) for(let x=-length-1;x<=length+1;x++)
        if(Math.abs(Math.hypot(x,y)-length)<=SUBWAY_CONFIG.geometry.lengthTolerance) offsets.push({x,y});
      offsetCache.set(length,offsets);
    }
    targets=offsetCache.get(length)!.map(p=>({x:end.x+p.x,y:end.y+p.y}));
  }
  return targets.filter(p=>!validateNode(s,id,index,p,starter));
}

export function forecastBotBuild(s:SubwayState,id:string,index:number,target:PlacementTarget,starter:boolean,first:boolean):SubwayState {
  const me=s.players[id],line=me.lines[index],st=stationAt(target,s.stations),from=line.route.at(-1);
  const next={...line,route:[...line.route,{...target,...(st?{stationId:st.id}:{})}]};
  const contacts=starter?stationAccessContacts(s,id,index,target):from?routeContacts(s,id,from,target,index):[];
  const toll=contactToll(contacts);
  // Already hired work is paid. Future work uses a conservative $2M marginal
  // estimate; the exact crew scheduler still chooses the real bill each round.
  const crew=starter||first&&me.crewsHired?0:2;
  const money=me.money-toll-crew+(lineComplete(next)?SUBWAY_CONFIG.completionReward:0);
  const lines=me.lines.map((l,i)=>i===index?next:l);
  const players={...s.players,[id]:{...me,money,lines,tollsPaid:me.tollsPaid+toll,stationAccess:[...(me.stationAccess??[]),...contacts.filter(c=>c.kind==='station').map(c=>({contractId:line.contractId,ownerId:c.ownerId,anchors:c.stationAnchors!}))]}};
  for(const c of contacts) players[c.ownerId]={...players[c.ownerId],money:players[c.ownerId].money+SUBWAY_CONFIG.contact.toll};
  return {...s,firstCompletedPlayerId:s.firstCompletedPlayerId??(lines.length===3&&lines.every(lineComplete)?id:undefined),players};
}

function value(s:SubwayState,id:string,index:number,jobs:LineJob[],settings:BotSettings,focus?:string):number {
  const me=s.players[id],others=Object.values(s.players).filter(p=>p.id!==id),line=me.lines[index],end=line.route.at(-1)!;
  const missionWeight=settings.personality==='destination'?1.3:settings.personality==='completion'?.8:1;
  let score=me.lines.reduce((n,l)=>n+(lineComplete(l)?contractOf(l)!.completionVp:contractOf(l)!.incompletePenalty),0);
  for(const card of [...me.engineeringHand,...me.destinationHand]) score+=objectiveProgress(card,me,others,s).points*missionWeight*(card===focus?2:1);
  score-=Math.max(0,-me.money)*SUBWAY_CONFIG.contact.debtVpPerMillion;
  score+=me.money*(settings.personality==='cautious'?.3:.1);
  score+=largestCluster(s.players).points[id]*.7;
  const missing=missingJobStops(me,index,jobs[index]);
  score+=(new Set([...jobs[index].destination,...jobs[index].citywide]).size-missing.length)*1.2;
  if(missing.length) score-=Math.min(...s.stations.filter(st=>missing.includes(st.id)).flatMap(st=>(st.cells??[st]).map(p=>dist(end,p))))*.3;
  // Current card guidance includes endpoint-only and connected-network semantics.
  score+=engineeringPotential(s,me)*2;
  return score;
}

/** Memoize the observable decision, not RNG or reducer state. Any changed board,
 * cash, rounds, owned goals, profile or focus invalidates it. Cache eviction cannot
 * change choices, so worker scheduling, cold starts and replay regeneration agree.
 */
export function plannedBotRoute(s:SubwayState,id:string,index:number,starter:boolean,settings:BotSettings,focus?:string):Result {
  const key=JSON.stringify([s.players,s.stations,s.currentPeriod,s.firstCompletedPlayerId,id,index,starter,settings,focus]);
  const saved=cache.get(key); if(saved) return structuredClone(saved);
  const jobs=companyJobs(s,id),limit=settings.skill==='casual'?120:ROUTE_SEARCH_LIMIT,width=settings.skill==='casual'?3:6;
  type Candidate={s:SubwayState;path:PlacementTarget[];v:number};
  let beam:Candidate[]=[{s,path:[],v:-Infinity}],best:Candidate|undefined,expanded=0;
  const rounds=SUBWAY_CONFIG.timelinePeriods+1-(s.phase==='STARTER_PLACEMENT'?1:s.currentPeriod);
  const depthLimit=Math.min(8,lineActionsRemaining(s.players[id].lines[index])+Number(starter),rounds+Number(starter));
  for(let depth=0;depth<depthLimit&&beam.length&&expanded<limit;depth++) {
    const next:Candidate[]=[];
    // Round-robin expansion prevents the first branch consuming the whole budget.
    const choices=beam.map(b=>{
      const me=b.s.players[id];
      const missing=missingJobStops(me,index,jobs[index]);
      const desired=b.s.stations.filter(st=>missing.includes(st.id));
      const priority=(p:PlacementTarget)=>{
        let v=desired.length?-Math.min(...desired.map(st=>dist(p,st))):0;
        return v;
      };
      return options(b.s,id,index,starter&&depth===0).map(p=>({p,v:priority(p)})).sort((a,b)=>b.v-a.v).slice(0,8).map(c=>c.p);
    });
    for(let n=0;choices.some(c=>c.length>n)&&expanded<limit;n++) for(let b=0;b<beam.length&&expanded<limit;b++) {
      const target=choices[b][n];if(!target) continue;
      const trial=forecastBotBuild(beam[b].s,id,index,target,starter&&depth===0,depth===0);
      const candidate={s:trial,path:[...beam[b].path,target],v:value(trial,id,index,jobs,settings,focus)};
      expanded++;next.push(candidate);
      if(!best||candidate.v>best.v) best=candidate;
    }
    next.sort((a,b)=>b.v-a.v);
    const seen=new Set<string>();
    beam=next.filter(c=>{const route=c.s.players[id].lines[index].route;const k=JSON.stringify(route.slice(-2));if(seen.has(k))return false;seen.add(k);return !lineComplete(c.s.players[id].lines[index]);}).slice(0,width);
  }
  const result={target:best?.path[0],path:best?.path??[],expanded};
  if(cache.size>=CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key,result);return structuredClone(result);
}
