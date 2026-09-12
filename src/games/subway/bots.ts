/** Versioned, bounded heuristic policies. A policy receives only its own hand and public state. */
import { SUBWAY_CONFIG, buildableLines, lineActionsRemaining, nextCompanyId, pendingStarters, legalTargets, stationAt, lineComplete, contractById, routeContacts, contactToll, destinationById, objectiveProgress, surveyBlocker, type SubwayState, type SubwayAction, type PlacementTarget } from './config';

export const BOT_VERSION = '1';
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

function bestTarget(s:SubwayState,id:string,index:number,starter:boolean,random:()=>number,settings:BotSettings): PlacementTarget|undefined {
  const targets=legalTargets(s,id,index,starter), me=s.players[id], line=me.lines[index];
  const w=weights[settings.personality];
  const desired=me.destinationHand.flatMap(id=>destinationById(id)?.stationIds??[]);
  const visited=new Set(line.route.map(n=>n.stationId));
  const areas=s.stations.filter(st=>desired.includes(st.id)&&!visited.has(st.id));
  const pins=s.surveyPins.filter(p=>p.playerId===id);
  const otherNodes=me.lines.filter((_,i)=>i!==index).flatMap(l=>l.route);
  const candidates=targets.map(target=>{
    const st=stationAt(target,s.stations), from=line.route.at(-1);
    const toll=from?contactToll(routeContacts(s,id,from,target)):0;
    const distance=Math.min(20,...areas.flatMap(st=>(st.cells??[st]).map(p=>Math.hypot(p.x-target.x,p.y-target.y))));
    const transfer=otherNodes.some(n=>Math.abs(n.x-target.x)+Math.abs(n.y-target.y)<=1);
    const survey=pins.some(p=>p.x===target.x&&p.y===target.y);
    // No automatic neighborhood reward. Area utility comes from owned missions only.
    const value=(st&&desired.includes(st.id)&&!visited.has(st.id)?w.mission*2:0)-distance*w.mission*.12+Number(transfer)*w.mission+Number(survey)*3-toll*w.cost+random()*(settings.skill==='casual'?5:w.noise);
    return {target,value};
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

export function chooseBotAction(state:SubwayState,random:()=>number,settings:BotSettings=DEFAULT_BOT):SubwayAction|undefined {
  if(state.phase==='RESULTS') return;
  const id=nextCompanyId(state)!;
  const s=botObservation(state,id), me=s.players[id], w=weights[settings.personality];
  const action=(type:SubwayAction['type'],payload?:SubwayAction['payload']):SubwayAction=>({playerId:id,type,payload});
  switch(s.phase) {
    case 'PROCUREMENT': {
      const choices=s.procurement.row.map(contractById).filter((c):c is NonNullable<typeof c>=>!!c);
      const ranked=choices.map(c=>({c,v:c.completionVp-(c.recipe.length*w.cost*.4)-c.cost*w.cost*.2+random()*3})).sort((a,b)=>b.v-a.v);
      return action('PROCURE',{choice:'buy',contractId:ranked[0]?.c.id??s.procurement.offer!.contractId});
    }
    case 'ENGINEERING':
      if(s.engineeringStep==='CARD_DRAFT') {
        const visible=s.market.rows.engineering;
        const ranked=visible.map(cardId=>({cardId,v:objectiveProgress(cardId,me,Object.values(s.players).filter(p=>p.id!==id),s).max+random()*5})).sort((a,b)=>b.v-a.v);
        // Blind draw is chosen without inspecting the hidden deck. The public row is always a legal fallback.
        return action('DRAFT_CARD',{deck:'engineering',cardId:ranked[0]?.cardId,expectedPick:s.market.picks});
      }
      if(s.engineeringStep==='BUY_SURVEYS') return action('BUY_SURVEYS',{surveys:settings.personality==='cautious'?0:Math.min(me.money>10?1:0,SUBWAY_CONFIG.survey.max)});
      if(s.engineeringStep==='SURVEY') {
        const options:PlacementTarget[]=[];
        for(let y=1;y<SUBWAY_CONFIG.board.rows-1;y++) for(let x=1;x<SUBWAY_CONFIG.board.columns-1;x++) if(!surveyBlocker(s,id,{x,y})) options.push({x,y});
        const desired=me.destinationHand.flatMap(id=>destinationById(id)?.stationIds??[]);
        const targets=s.stations.filter(st=>desired.includes(st.id));
        options.sort((a,b)=>Math.min(...targets.map(st=>Math.hypot(st.x-a.x,st.y-a.y)))-Math.min(...targets.map(st=>Math.hypot(st.x-b.x,st.y-b.y))));
        return action('PLACE_SURVEY',options[Math.floor(random()*Math.min(5,options.length))]);
      }
      throw new Error(`Unsupported engineering stage ${s.engineeringStep}`);
    case 'STARTER_PLACEMENT': {
      const lineIndex=pendingStarters(me)[0], target=bestTarget(s,id,lineIndex,true,random,settings);
      if(!target) throw new Error('No legal starter');
      return action('PLACE_STARTER',{lineIndex,...target});
    }
    case 'CONSTRUCTION': {
      if(!me.crewsHired) {
        if(settings.personality==='destination'&&!me.destinationPurchased&&me.money>=15&&s.currentPeriod<=3) return action('BUY_DESTINATION',{period:s.currentPeriod});
        const available=buildableLines(s,id).sort((a,b)=>lineActionsRemaining(me.lines[a])-lineActionsRemaining(me.lines[b]));
        const total=available.reduce((n,i)=>n+lineActionsRemaining(me.lines[i]),0);
        let count=Math.min(3,available.length,Math.max(1,Math.ceil(total/(SUBWAY_CONFIG.timelinePeriods+1-s.currentPeriod))));
        if(settings.personality==='completion') count=Math.min(available.length,Math.max(count,2));
        if(settings.personality==='cautious'&&me.money<6) count=Math.min(count,1);
        return action('HIRE_CREWS',{lineIndexes:available.slice(0,count),period:s.currentPeriod});
      }
      const lineIndex=me.pendingActions[0], target=bestTarget(s,id,lineIndex,false,random,settings);
      return target?action('BUILD',{lineIndex,...target}):action('SKIP_ACTION',{lineIndex});
    }
    case 'SCORING': return action('ADVANCE_SCORING');
    default: throw new Error(`Unsupported phase ${s.phase}`);
  }
}
