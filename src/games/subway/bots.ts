/** Versioned, bounded heuristic policies. A policy receives only its own hand and public state. */
import { SUBWAY_CONFIG, lineActionsRemaining, nextCompanyId, pendingStarters, legalTargets, stationAt, lineComplete, contractById, routeContacts, contactToll, destinationById, objectiveProgress,  type SubwayState, type SubwayAction, type PlacementTarget } from './config';
import { planBotCrews, immediateObjectiveBuild } from './botPlanning';
import { missionPotential, engineeringPotential, remainingReach } from './objectiveGuidance';
import { auditPotential, completionGoals } from './auditPolicy';
import { plannedBotRoute } from './botRoutes';
import { stationAccessContacts } from './stationAccess';

export const BOT_VERSION = '5';
export const PERSONALITIES = ['balanced', 'destination', 'completion', 'cautious'] as const;
export const SKILLS = ['casual', 'experienced'] as const;
export type BotSettings = { personality: typeof PERSONALITIES[number]; skill: typeof SKILLS[number] };
export const DEFAULT_BOT: BotSettings = {personality:'balanced',skill:'experienced'};
export const BOT_LABELS = {balanced:'Balanced',destination:'Destination planner',completion:'Completion first',cautious:'Cautious spender'};
export const validBot = (v: unknown): v is BotSettings => !!v && typeof v === 'object' && PERSONALITIES.includes((v as BotSettings).personality) && SKILLS.includes((v as BotSettings).skill);
const weights = {balanced:{mission:2,finish:8,cost:2,noise:.7},destination:{mission:5,finish:6,cost:1.5,noise:.7},completion:{mission:1,finish:16,cost:1.5,noise:.5},cautious:{mission:2,finish:8,cost:5,noise:.4}};

export function botObservation(state: SubwayState, id: string): SubwayState {
  const s=structuredClone(state);
  s.destinationDeck=[]; s.procurement.deck=[]; s.market.decks={engineering:[],scheduling:[]};
  s.undo=undefined; s.telemetry=[];
  for(const p of Object.values(s.players)) if(p.id!==id) {
    p.engineeringHand=[];p.destinationHand=[];p.committedEngineering=[];p.destinationCommitments=[];p.schedulingHand=[];p.scoreBreakdown=undefined;
  }
  return s;
}

function bestTarget(s:SubwayState,id:string,index:number,starter:boolean,random:()=>number,settings:BotSettings,focus?:string): PlacementTarget|undefined {
  const targets=legalTargets(s,id,index,starter), me=s.players[id], line=me.lines[index];
  const w=weights[settings.personality];
  const desired=me.destinationHand.flatMap(id=>destinationById(id)?.stationIds??[]);
  const visited=new Set(line.route.map(n=>n.stationId));
  const areas=s.stations.filter(st=>desired.includes(st.id)&&!visited.has(st.id));
  const otherNodes=me.lines.filter((_,i)=>i!==index).flatMap(l=>l.route);
  const candidates=targets.map(target=>{
    const st=stationAt(target,s.stations), from=line.route.at(-1);
    const toll=contactToll(starter?stationAccessContacts(s,id,index,target):from?routeContacts(s,id,from,target,index):[]);
    const reach=remainingReach(me,index);
    const distance=Math.min(20,...areas.flatMap(st=>(st.cells??[st]).map(p=>Math.hypot(p.x-target.x,p.y-target.y))).filter(d=>d<=reach));
    const transfer=otherNodes.some(n=>Math.abs(n.x-target.x)+Math.abs(n.y-target.y)<=1);
    // No automatic neighborhood reward. Area utility comes from owned missions only.
    const trial={...me,lines:me.lines.map((l,i)=>i===index?{...l,route:[...l.route,{...target,...(st?{stationId:st.id}:{})}]}:l)};
    const value=(st&&desired.includes(st.id)&&!visited.has(st.id)?w.mission*2:0)-distance*w.mission*.12+Number(transfer)*w.mission-toll*w.cost+missionPotential(s,trial)*w.mission+engineeringPotential(s,trial)*2+random()*(settings.skill==='casual'?5:w.noise);
    return {target,value:value+(focus?auditPotential(s,trial,focus):0)};
  }).sort((a,b)=>b.value-a.value).slice(0,settings.skill==='casual'?5:16);
  const opponents=Object.values(s.players).filter(p=>p.id!==id);
  const base=me.engineeringHand.reduce((sum,id)=>sum+objectiveProgress(id,me,opponents,s).points,0);
  const beforeMission=me.destinationHand.reduce((sum,id)=>sum+objectiveProgress(id,me,opponents,s).points,0);
  for(const c of candidates) {
    const station=stationAt(c.target,s.stations);
    const trial={...me,lines:me.lines.map((l,i)=>i===index?{...l,route:[...l.route,{...c.target,...(station?{stationId:station.id}:{})}]}:l)};
    const next={...s,players:{...s.players,[id]:trial}};
    const finished=lineComplete(trial.lines[index]);
    const continues=finished||legalTargets(next,id,index,false).length>0;
    c.value+=finished?w.finish:continues?1:-150;
    c.value+=(trial.engineeringHand.reduce((n,id)=>n+objectiveProgress(id,trial,opponents,next).points,0)-base)*2;
    c.value+=(trial.destinationHand.reduce((n,id)=>n+objectiveProgress(id,trial,opponents,next).points,0)-beforeMission)*w.mission;
  }
  return candidates.sort((a,b)=>b.value-a.value)[0]?.target;
}

export function chooseBotAction(state:SubwayState,random:()=>number,settings:BotSettings=DEFAULT_BOT,focus?:string,planning=true):SubwayAction|undefined {
  if(state.phase==='RESULTS') return;
  const id=nextCompanyId(state)!;
  const s=botObservation(state,id), me=s.players[id], w=weights[settings.personality];
  if(focus&&!me.engineeringHand.includes(focus)&&!me.destinationHand.includes(focus)) focus=undefined;
  const action=(type:SubwayAction['type'],payload?:SubwayAction['payload']):SubwayAction=>({playerId:id,type,payload});
  switch(s.phase) {
    case 'PROCUREMENT': {
      const choices=s.procurement.row.map(contractById).filter((c):c is NonNullable<typeof c>=>!!c);
      const ranked=choices.map(c=>{
        const work=me.lines.reduce((n,l)=>n+lineActionsRemaining(l),0)+c.recipe.length;
        const reserve=work+Math.max(0,work-SUBWAY_CONFIG.timelinePeriods);
        const projected=me.money-c.cost-reserve+(me.lines.length+1)*SUBWAY_CONFIG.completionReward;
        return {c,v:c.completionVp-(c.recipe.length*w.cost*.4)-c.cost*w.cost*.2+random()*3-(planning?Math.max(0,-projected)*4:0)};
      }).sort((a,b)=>b.v-a.v);
      return action('PROCURE',{choice:'buy',contractId:ranked[0]?.c.id??s.procurement.offer!.contractId});
    }
    case 'ENGINEERING':
      if(s.engineeringStep==='CARD_DRAFT') {
        const visible=s.market.rows.engineering;
        const ranked=visible.map(cardId=>({cardId,v:objectiveProgress(cardId,me,Object.values(s.players).filter(p=>p.id!==id),s).max+random()*5})).sort((a,b)=>b.v-a.v);
        // Blind draw is chosen without inspecting the hidden deck. The public row is always a legal fallback.
        return action('DRAFT_CARD',{deck:'engineering',cardId:ranked[0]?.cardId,expectedPick:s.market.picks});
      }
      throw new Error(`Unsupported engineering stage ${s.engineeringStep}`);
    case 'STARTER_PLACEMENT': {
      const lineIndex=pendingStarters(me)[0], target=(planning?plannedBotRoute(s,id,lineIndex,true,settings,focus).target:undefined)??bestTarget(s,id,lineIndex,true,random,settings,focus);
      if(!target) throw new Error('No legal starter');
      return action('PLACE_STARTER',{lineIndex,...target});
    }
    case 'CONSTRUCTION': {
      if(!me.crewsHired) {
        if(settings.personality==='destination'&&!me.destinationPurchased&&me.money>=15&&s.currentPeriod<=3) return action('BUY_DESTINATION',{period:s.currentPeriod});
        return action('HIRE_CREWS',{lineIndexes:planBotCrews(s,id,settings.personality==='cautious',!!focus&&completionGoals.has(focus)),period:s.currentPeriod});
      }
      const lineIndex=me.pendingActions[0];
      const opportunity=lineActionsRemaining(me.lines[lineIndex])>SUBWAY_CONFIG.timelinePeriods+1-s.currentPeriod?immediateObjectiveBuild(s,id,lineIndex):undefined;
      const target=(!focus?opportunity?.target:undefined)??(planning?plannedBotRoute(s,id,lineIndex,false,settings,focus).target:undefined)??bestTarget(s,id,lineIndex,false,random,settings,focus);
      return target?action('BUILD',{lineIndex,...target}):action('SKIP_ACTION',{lineIndex});
    }
    case 'SCORING': return action('ADVANCE_SCORING');
    default: throw new Error(`Unsupported phase ${s.phase}`);
  }
}
