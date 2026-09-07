import assert from "node:assert/strict";
import { SUBWAY_CONFIG, LINE_CONTRACTS, ENGINEERING_CARDS, SCHEDULING_CARDS, CONSTRUCTION_CARDS, STATIONS, subwayGame, basePriorityId, contestedPeriods, destinationTurnId, starterTurnId, surveyTurnId, scheduleCost, lineComplete, autoSchedule, objectiveMet, nextCompanyId, routeContacts, contractById, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { startPlaytest, testRoom, runPlaytest } from "../src/games/subway/playtest";

let checks=0;
for(const count of [2,3,4]) {
  const {room,state} = startPlaytest(count,42);
  const dispatch=(s:SubwayState, playerId:string,type:SubwayAction["type"],payload?:SubwayAction["payload"])=>subwayGame.reducer(s,{type,playerId,payload},{room,playerId,random:()=>.5,now:()=>1});
  assert.equal(state.playerOrder.length,count);
  assert.equal(state.stations.length,STATIONS.length);
  assert.equal(new Set(state.stations.map((station)=>`${station.x},${station.y}`)).size,STATIONS.length,"station sites never overlap");
  assert.ok(state.stations.every((station)=>station.kind==='major' ? station.capacity===3 : station.capacity===2),"major stations have three docks and minors have two");
  assert.ok(state.stations.every((station,i)=>state.stations.slice(i+1).every((other)=>Math.hypot(station.x-other.x,station.y-other.y)>=3)),"random station sites remain spread apart");
  assert.equal(state.procurement.deck.length+1,count*3);
  assert.equal(new Set([...state.procurement.deck,state.procurement.offer!.contractId]).size,count*3);
  assert.equal(new Set(state.playerOrder.map((id)=>state.players[id].color)).size,count);
  for(let cycle=0;cycle<3;cycle++) assert.equal(new Set(Array.from({length:count},(_,i)=>basePriorityId(state,cycle*count+i+1))).size,count);
  let s=state;
  let decisions=0;
  // Adversarial all-pass policy must finish with equal portfolios and no debt.
  while(s.phase==="PROCUREMENT" && decisions++<300) {
    const id=s.procurement.offer!.activeId;
    const passed=dispatch(s,id,"PROCURE",{choice:"pass",deck:"construction"});
    s=passed===s ? dispatch(s,id,"PROCURE",{choice:"buy"}) : passed;
  }
  assert.equal(s.phase,"ENGINEERING");
  assert.ok(decisions<300);
  assert.ok(s.playerOrder.every((id)=>s.players[id].lines.length===3 && s.players[id].money>=0));
  const picks:string[]=[];
  while(s.engineeringStep==="DESTINATION_DRAFT") {
    const id=destinationTurnId(s)!;picks.push(id);
    s=dispatch(s,id,"PICK_DESTINATION",{destinationCardId:s.destinationRow[0]});
  }
  assert.equal(picks.length,count*2);
  assert.equal(new Set(picks.slice(0,count)).size,count,"all seats pick before any gets a second pick");
  // Three/four-player contention means ANY two, not all, companies overlap.
  for(const id of s.playerOrder) s.players[id].lines=[{contractId:"short",paid:5,start:1,route:[]}];
  s.players[s.playerOrder[count-1]].lines[0].start=8;
  if(count>2) assert.ok(contestedPeriods(s).includes(1));
  // Pin and starter turns visit every seat once before any gets a second.
  s.surveyPins=[];
  for(const id of s.playerOrder) s.players[id].surveysPurchased=2;
  const visited:string[]=[];
  for(let i=0;i<count;i++){const id=surveyTurnId(s)!;visited.push(id);s.surveyPins.push({playerId:id,x:i,y:0});}
  assert.equal(new Set(visited).size,count);
  checks+=12;
}
assert.equal(LINE_CONTRACTS.length,12);
assert.equal(ENGINEERING_CARDS.length,14);
assert.equal(SCHEDULING_CARDS.length,5);
assert.equal(CONSTRUCTION_CARDS.length,5);
assert.equal(LINE_CONTRACTS.filter((contract)=>contract.special).length,4,"four premium routes carry specials");
assert.ok(LINE_CONTRACTS.every((contract)=>contract.recipe.length<=7 && contract.recipe.every((length)=>length>=2 && length<=6)),"every route uses the 2–6 peg range with at most seven segments");
// Every three-contract portfolio gets a full, affordable programme at list price.
for(let a=0;a<12;a++) for(let b=a+1;b<12;b++) for(let c=b+1;c<12;c++) {
  const p=subwayGame.initialState(testRoom(2).players).players['seat-1'];
  p.lines=[a,b,c].map((i)=>({contractId:LINE_CONTRACTS[i].id,paid:LINE_CONTRACTS[i].cost,route:[]}));
  p.money-=p.lines.reduce((sum,l)=>sum+l.paid,0);
  autoSchedule(p);
  assert.ok(p.lines.every((l)=>l.start!==undefined));
  assert.ok(scheduleCost(p)<=p.money,`Unaffordable portfolio ${p.lines.map(l=>l.contractId)}: ${scheduleCost(p)} > ${p.money}`);
  checks++;
}
// Contact ownership, subsidy and Undo conserve all four companies' balances.
{
  const room=testRoom(4);let s=subwayGame.initialState(room.players);s.phase="CONSTRUCTION";
  for(const id of s.playerOrder) s.players[id].lines=[];
  s.players['seat-1'].lines=[{contractId:'university',paid:6,start:1,route:[{x:0,y:0}]}];
  s.players['seat-2'].lines=[{contractId:'branch',paid:6,route:[{x:1,y:0}]}];
  s.players['seat-3'].lines=[{contractId:'medium',paid:8,route:[{x:2,y:0}]}];
  s.players['seat-4'].lines=[{contractId:'long',paid:12,route:[{x:3,y:0}]}];
  s.resolveQueue=['seat-1'];s.players['seat-1'].pendingActions=[0,0];
  const dispatch=(state:SubwayState,type:SubwayAction['type'],payload?:SubwayAction['payload'])=>subwayGame.reducer(state,{type,payload,playerId:'seat-1'},{room,playerId:'seat-1',now:()=>1,random:()=>.5});
  assert.deepEqual(new Set(routeContacts(s,'seat-1',{x:0,y:0},{x:3,y:0}).map(c=>c.ownerId)),new Set(['seat-2','seat-3','seat-4']));
  const built=dispatch(s,'BUILD',{lineIndex:0,x:3,y:0});
  assert.equal(built.players['seat-1'].money,37);
  for(const id of ['seat-2','seat-3','seat-4']) assert.equal(built.players[id].money,41);
  const undone=dispatch(built,'UNDO_PLACEMENT');
  assert.ok(Object.values(undone.players).every(p=>p.money===40));
  const pass=dispatch(s,'PLAY_CONSTRUCTION_CARD',{cardId:'access'});
  const covered=dispatch(pass,'BUILD',{lineIndex:0,x:3,y:0});
  assert.equal(covered.players['seat-1'].money,40);
  assert.equal(covered.players['seat-1'].accessPass,false);
  for(const id of ['seat-2','seat-3','seat-4']) assert.equal(covered.players[id].money,41);
  const grant=dispatch(s,'PLAY_CONSTRUCTION_CARD',{cardId:'grant'});
  assert.equal(grant.players['seat-1'].money,43);
  assert.equal(dispatch(grant,'PLAY_CONSTRUCTION_CARD',{cardId:'grant'}),grant);
  checks+=10;
}
// Each replacement schedule card has an effect, boundaries, and the one-card limit.
for(const cardId of ['stagger','coordination'] as const){
  const room=testRoom(3);let s=subwayGame.initialState(room.players);s.phase='SCHEDULING';s.schedulingStep='RESOLUTION';
  const p=s.players['seat-1'];p.lines=[{contractId:'short',paid:5,start:3,route:[]},{contractId:'tram',paid:5,start:3,route:[]}];p.schedulingHand=[cardId];
  const action:SubwayAction={type:'PLAY_SCHEDULING_CARD',playerId:p.id,payload:{cardId,lineIndex:0,direction:1}};
  const ctx={room,playerId:p.id,now:()=>1,random:()=>.5};
  const next=subwayGame.reducer(s,action,ctx);
  assert.notEqual(next,s);assert.equal(next.players[p.id].lines[0].start,cardId==='stagger'?4:3);
  if(cardId==='coordination') assert.equal(scheduleCost(next.players[p.id]),scheduleCost(p)-2);
  assert.equal(subwayGame.reducer(next,action,ctx),next);
  checks+=3;
}
// New objectives distinguish their actual conditions from near misses.
{
  const p=subwayGame.initialState(testRoom(2).players).players['seat-1'];
  p.lines=[{contractId:'short',paid:5,route:[{x:5,y:0},{x:21,y:0}]}];
  assert.equal(objectiveMet('crosstown-service',p,[]),true);
  p.lines[0].route[1].x=20;assert.equal(objectiveMet('crosstown-service',p,[]),false);
  p.lines[0].route=[{x:3,y:7,stationId:'market'},{x:10,y:6,stationId:'museum'},{x:14,y:2,stationId:'garden'}];
  assert.equal(objectiveMet('local-service',p,[]),true);
  p.lines[0].route.pop();p.lines[0].route.pop();assert.equal(objectiveMet('local-service',p,[]),false);
  p.lines.push({contractId:'tram',paid:5,route:[{x:3,y:7,stationId:'market'}]});
  assert.equal(objectiveMet('interchange',p,[]),true);
  p.lines[1].route=[];assert.equal(objectiveMet('interchange',p,[]),false);
  for(const line of p.lines) line.route=Array.from({length:contractById(line.contractId)!.recipe.length+1},(_,i)=>({x:i,y:0}));
  p.money=3;assert.equal(objectiveMet('solvent',p,[]),true);
  p.money=2;assert.equal(objectiveMet('solvent',p,[]),false);
  checks+=8;
}
for(const count of [1,5]) {
  const room=testRoom(count);const s=subwayGame.initialState(room.players);
  assert.equal(subwayGame.reducer(s,{type:'START_GAME',playerId:room.hostId},{room,playerId:room.hostId,now:()=>1,random:()=>.5}),s);
}
console.log(`Multiplayer and content regressions: ${checks} checks passed.`);
// Complete games with the same legal-action heuristic in every seat. This is a
// mechanical/balance smoke test, not evidence of perfect human strategy balance.
const results=[];
for(const count of [2,3,4]) for(let seed=1;seed<=12;seed++){
  const {state,actions}=runPlaytest(count,seed);
  assert.equal(state.phase,'RESULTS');assert.ok(state.winnerIds.length);
  assert.ok(state.playerOrder.every(id=>Number.isFinite(state.players[id].score)));
  const players=Object.values(state.players);
  results.push({count,seed,actions,scores:players.map(p=>p.score),finished:players.map(p=>p.lines.filter(lineComplete).length),money:players.map(p=>p.money),winner:state.winnerIds});
}
console.log(JSON.stringify({games:results},null,2));
console.log('36 complete 2/3/4-player simulations reached RESULTS.');
