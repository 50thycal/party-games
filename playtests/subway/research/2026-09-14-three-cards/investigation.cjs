// Research-only planner; not the shipped bot. See README.md for limitations.
const fs=require('fs'),assert=require('assert/strict');
const compiled=process.argv[2];if(!compiled)throw Error('Pass the compiled repository root as the first argument');
const C=require(compiled+'/src/games/subway/config.js');
const B=require(compiled+'/src/games/subway/bots.js');
const R=require(compiled+'/src/games/subway/recording.js');
const P=require(compiled+'/src/games/subway/playtest.js');
const N=require(compiled+'/src/games/subway/network.js');
const checks=require(compiled+'/src/games/subway/cardAuditChecks.js').checkAuditCards().filter(x=>['through','terminal','four-corners'].includes(x.cardId));assert(checks.every(x=>x.passed));
const out=process.argv[3]||'/tmp/subway-card-investigation-rerun';fs.mkdirSync(out,{recursive:true});
const offsets=new Map();
function candidates(s,id,i){const line=s.players[id].lines[i],from=line.route.at(-1),length=C.contractById(line.contractId).recipe[line.route.length-1];if(!length)return [];
 if(!offsets.has(length)){const pts=[];for(let y=-length-1;y<=length+1;y++)for(let x=-length-1;x<=length+1;x++)if(Math.abs(Math.hypot(x,y)-length)<=.500001)pts.push({x,y});offsets.set(length,pts);}
 return offsets.get(length).map(p=>({x:from.x+p.x,y:from.y+p.y})).filter(p=>!C.validateNode(s,id,i,p));}
function append(s,id,i,t){const st=C.stationAt(t,s.stations);return {...s,players:{...s.players,[id]:{...s.players[id],lines:s.players[id].lines.map((l,j)=>j===i?{...l,route:[...l.route,{...t,...(st?{stationId:st.id}:{})}]}:l)}}};}
function visited(s,id){return new Set(s.players[id].lines.flatMap(l=>l.route).map(n=>n.stationId).filter(Boolean));}
function north(l){return l.route.some(p=>p.y===0)&&l.route.some(p=>p.y===8);}
function goal(s,id,i,card,target){const l=s.players[id].lines[i];return card==='through'?north(l):card==='four-corners'?l.route.some(p=>p.x===target.x&&p.y===target.y):visited(s,id).size===10;}
function value(s,id,i,card,target){const l=s.players[id].lines[i],p=l.route.at(-1);if(card==='through')return Number(north(l))*1000-Math.min(...[!l.route.some(p=>p.y===0)?p.y:100,!l.route.some(p=>p.y===8)?8-p.y:100]);
 if(card==='four-corners')return Number(goal(s,id,i,card,target))*1000-Math.hypot(target.x-p.x,target.y-p.y);
 const v=visited(s,id),d=Math.min(30,...s.stations.filter(st=>!v.has(st.id)).flatMap(st=>(st.cells||[st]).map(t=>Math.hypot(t.x-p.x,t.y-p.y))));return v.size*100-d;
}
let expanded=0;
function plan(state,id,i,card,target,start){let beam=[start?append(state,id,i,start):state],best=beam[0],bestScore=-Infinity;const initial=state.players[id].lines[i].route.length;
 for(let depth=0;depth<8;depth++){
  const next=[];
  for(const s of beam){const score=value(s,id,i,card,target);if(score>bestScore){best=s;bestScore=score;}if(card!=='terminal'&&goal(s,id,i,card,target))return s.players[id].lines[i].route.slice(initial);
   for(const t of candidates(s,id,i)){expanded++;const n=append(s,id,i,t);next.push({s:n,v:value(n,id,i,card,target)});}}
  next.sort((a,b)=>b.v-a.v);beam=next.slice(0,48).map(x=>x.s);if(!beam.length)break;
 }
 return best.players[id].lines[i].route.slice(initial);
}
function run(card,count,trial){let state,record,room,random,seed;const id='seat-1';
 for(let attempt=0;attempt<128;attempt++){
  seed=10000+trial*1000+count*100+attempt;room=P.testRoom(count);room.mode='simulation';random=P.seededRandom(seed);state=C.subwayGame.initialState(room.players);record=R.newRecord(room,state,'simulation');record.seed=seed;
  state=R.recordedReducer(state,{type:'START_GAME',playerId:room.hostId},{room,playerId:room.hostId,random,now:()=>record.actions.length+1},record,'bot');if(state.market.rows.engineering.includes(card))break;
 }
 const decisions=P.seededRandom(seed+12345);let owned=false,paths={},goals={},starts={};
 const step=a=>{if(a.type==='ADVANCE_SCORING')a.playerId=room.hostId;const next=R.recordedReducer(state,a,{room,playerId:a.playerId,random,now:()=>record.actions.length+1},record,'bot');if(next===state)throw Error('Rejected '+JSON.stringify(a));state=next;};
 while(state.phase!=='RESULTS'&&record.actions.length<500){const actor=C.nextCompanyId(state),me=state.players[id];let a;
  if(actor===id&&state.phase==='PROCUREMENT'&&card==='four-corners'){
   const choices=state.procurement.row.map(C.contractById).filter(Boolean).sort((a,b)=>b.recipe.reduce((x,y)=>x+y,0)-a.recipe.reduce((x,y)=>x+y,0));a={type:'PROCURE',playerId:id,payload:{choice:'buy',contractId:choices[0]?.id||state.procurement.offer.contractId}};
  }else if(actor===id&&state.phase==='ENGINEERING'&&state.engineeringStep==='CARD_DRAFT'&&state.market.rows.engineering.includes(card)&&!me.engineeringHand.includes(card))a={type:'DRAFT_CARD',playerId:id,payload:{deck:'engineering',cardId:card,expectedPick:state.market.picks}};
  else if(actor===id&&state.phase==='STARTER_PLACEMENT'){
   if(!owned){owned=me.engineeringHand.includes(card);if(!owned)return {card,count,trial,seed,unavailable:true};
    if(card==='four-corners'&&!me.lines.some(l=>l.contractId==='long'))return {card,count,trial,seed,blueprintUnavailable:true};
    const order=me.lines.map((l,i)=>({i,len:C.contractById(l.contractId).recipe.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.len-a.len);
    if(card==='four-corners'){starts[order[0].i]={x:0,y:0};goals[order[0].i]={x:26,y:0};starts[order[1].i]={x:26,y:8};goals[order[1].i]={x:26,y:0};starts[order[2].i]={x:0,y:8};goals[order[2].i]={x:0,y:0};}
   }
   const i=C.pendingStarters(me)[0];let start;
   if(card==='through')start={x:3+i*10,y:0};else if(card==='four-corners')start=starts[i];else start={x:2+i*11,y:i===1?0:8};
   if(start&&C.validateNode(state,id,i,start,true))start=undefined;
   if(!start){const options=C.legalTargets(state,id,i,true);const v=visited(state,id);options.sort((a,b)=>Math.min(...state.stations.filter(st=>!v.has(st.id)).map(st=>Math.hypot(st.x-a.x,st.y-a.y)))-Math.min(...state.stations.filter(st=>!v.has(st.id)).map(st=>Math.hypot(st.x-b.x,st.y-b.y))));start=options[0];}
   paths[i]=plan(state,id,i,card,goals[i],start);a={type:'PLACE_STARTER',playerId:id,payload:{lineIndex:i,...start}};
  }else if(actor===id&&state.phase==='CONSTRUCTION'){
   const active=C.buildableLines(state,id).filter(i=>!C.lineComplete(me.lines[i])&&(card!=='four-corners'||!goal(state,id,i,card,goals[i])));
   if(!me.crewsHired){active.sort((a,b)=>C.lineActionsRemaining(me.lines[b])-C.lineActionsRemaining(me.lines[a]));a={type:'HIRE_CREWS',playerId:id,payload:{lineIndexes:active.slice(0,2),period:state.currentPeriod}};}
   else {const i=me.pendingActions[0];let path=paths[i]||[];const built=me.lines[i].route.length;
    let target=card==='terminal'?undefined:path[built];if(!target||C.validateNode(state,id,i,target)){path=me.lines[i].route.concat(plan(state,id,i,card,goals[i]));paths[i]=path;target=path[built];}
    if(card==='through'&&north(me.lines[i])){const ordinary=B.chooseBotAction(state,decisions,B.DEFAULT_BOT);target=ordinary?.type==='BUILD'?ordinary.payload:undefined;}
    a=target?{type:'BUILD',playerId:id,payload:{lineIndex:i,x:target.x,y:target.y}}:{type:'SKIP_ACTION',playerId:id,payload:{lineIndex:i}};
   }
  }else a=B.chooseBotAction(state,decisions,B.DEFAULT_BOT);
  if(!a)throw Error('no action');step(a);
 }
 record.final=state;assert.equal(state.phase,'RESULTS');assert.equal(R.fingerprint(R.replayRecord(record)),R.fingerprint(state));
 const me=state.players[id],progress=C.objectiveProgress(card,me,Object.values(state.players).filter(p=>p.id!==id),state),result={card,count,trial,seed,progress,neighborhoods:visited(state,id).size,northSouthLines:me.lines.filter(north).length,cornersByComponent:N.companyComponents(me).map(ns=>[[0,0],[26,0],[0,8],[26,8]].filter(([x,y])=>ns.some(n=>n.x===x&&n.y===y)).length),cash:me.money,score:me.score,contracts:me.lines.map(l=>l.contractId),actions:record.actions.length,paths:me.lines.map(l=>l.route)};
 fs.writeFileSync(out+`/${card}-${count}-${trial}.json`,JSON.stringify(record));return result;
}
const results=[];for(const card of ['through','terminal','four-corners'])for(const count of [2,3,4]){let complete=0;for(let trial=0;trial<30&&complete<3;trial++){const r=run(card,count,trial);results.push(r);if(!r.unavailable&&!r.blueprintUnavailable)complete++;fs.writeFileSync(out+'/results.json',JSON.stringify({checks,expanded,results},null,2));console.log(JSON.stringify({...r,paths:undefined}));}}
