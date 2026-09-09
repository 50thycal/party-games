import assert from "node:assert/strict";
import { activationCost, buildableLines, lineActionsRemaining, LINE_CONTRACTS, ENGINEERING_CARDS, DESTINATION_CARDS, STATIONS, SUBWAY_CONFIG, SUBWAY_STATE_VERSION, subwayGame, nextCompanyId, draftPicks, draftTurnId, objectiveMet, scoreGame, legalTargets, lineComplete, contractById, constructionCardBlocker, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { startPlaytest, testRoom, runPlaytest, seededRandom, stepPlaytest } from "../src/games/subway/playtest";

const dispatch=(s:SubwayState,id:string,type:SubwayAction["type"],payload?:SubwayAction["payload"])=>subwayGame.reducer(s,{playerId:id,type,payload},{room:testRoom(s.playerOrder.length),playerId:id,now:()=>s.nextEventSeq,random:()=>.4});
let checks=0;
for(const count of [2,3,4]) for(const category of ["engineering","construction"] as const) {
  let {state:s}=startPlaytest(count,42);
  assert.equal(SUBWAY_STATE_VERSION,12);
  assert.ok(Object.values(s.players).every(p=>draftPicks(p)===0));
  assert.equal(s.stations.length,10);
  assert.equal(new Set(s.stations.map(p=>`${p.x},${p.y}`)).size,10);
  assert.ok(s.stations.every((p,i)=>s.stations.slice(i+1).every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=3)));
  assert.ok(s.stations.every(p=>p.capacity===(p.kind==="major"?3:2)));
  assert.equal(s.market.rows.engineering.length+s.market.decks.engineering.length,24);
  assert.equal(new Set([...s.market.rows.engineering,...s.market.decks.engineering]).size,24);
  for(let pick=0;pick<count*3;pick++) {
    const id=nextCompanyId(s)!;
    assert.equal(id,draftTurnId(s,pick,0));
    assert.equal(s.procurement.row.length,Math.min(count,count*3-pick));
    assert.equal(dispatch(s,id,"PROCURE",{choice:"pass",deck:"engineering"}),s);
    const contractId=s.procurement.row.at(-1)!;
    const old=s;
    s=dispatch(s,id,"PROCURE",{choice:"buy",contractId});
    assert.equal(s.players[id].money,old.players[id].money-contractById(contractId)!.cost);
  }
  assert.equal(s.engineeringStep,"CARD_DRAFT");
  for(let pick=0;pick<count*6;pick++) {
    const id=nextCompanyId(s)!;
    assert.equal(id,draftTurnId(s,pick,1));
    const payload={deck:category,expectedPick:pick,cardId:pick%2===0||!s.market.decks[category].length?s.market.rows[category][0]:undefined};
    const previous=s;
    assert.equal(dispatch(s,id,"DRAFT_CARD",{...payload,expectedPick:pick-1}),s);
    s=dispatch(s,id,"DRAFT_CARD",payload);
    assert.notEqual(s,previous);
    assert.equal(dispatch(s,id,"DRAFT_CARD",payload),s);
  }
  assert.ok(Object.values(s.players).every(p=>draftPicks(p)===6));
  assert.equal(s.engineeringStep,"BUY_SURVEYS");
  assert.equal(Object.values(s.players).reduce((n,p)=>n+p.engineeringHand.length,0),category==="engineering"?count*6:0,"either category can supply every pick");
  for(const id of s.playerOrder) {
    assert.equal(dispatch(s,id,"LOCK_ENGINEERING_PLAN",{cardIds:[]}),s,"commitment removed");
    s=dispatch(s,id,"BUY_SURVEYS",{surveys:0});
  }
  assert.equal(s.phase,"STARTER_PLACEMENT","no separate destination or scheduling phase");
  checks+=10;
}
// Survey purchases are optional, paid once, and never allow commitment actions.
{
  let {state:s}=runPlaytest(2,3,"BUY_SURVEYS");
  const id=s.playerOrder[0], other=s.playerOrder[1], cash=s.players[id].money;
  for(const surveys of [-1,6,1.5])assert.equal(dispatch(s,id,"BUY_SURVEYS",{surveys}),s);
  s=dispatch(s,id,"BUY_SURVEYS",{surveys:1});
  assert.equal(s.players[id].money,cash-1);
  assert.equal(dispatch(s,id,"BUY_SURVEYS",{surveys:1}),s);
  s=dispatch(s,other,"BUY_SURVEYS",{surveys:0});
  assert.equal(s.engineeringStep,"SURVEY");
  const station=s.stations[0];
  assert.equal(dispatch(s,id,"PLACE_SURVEY",{x:station.x,y:station.y}),s);
  const target=Array.from({length:27},(_,x)=>({x,y:0})).find(p=>!s.stations.some(st=>st.x===p.x&&st.y===p.y))!;
  s=dispatch(s,id,"PLACE_SURVEY",target);
  assert.equal(s.phase,"STARTER_PLACEMENT");
  const undone=dispatch(s,id,"UNDO_PLACEMENT");
  assert.equal(undone.phase,"ENGINEERING");
  assert.equal(undone.surveyPins.length,0);
  assert.equal(undone.players[id].money,cash-1);
}
// All portfolio combinations can fund a 16-round programme plus five optional pins.
for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++){
  const routes=[LINE_CONTRACTS[a],LINE_CONTRACTS[b],LINE_CONTRACTS[c]];
  const segments=routes.reduce((n,r)=>n+r.recipe.length,0);
  const minimumCrewBill=segments+Math.max(0,segments-16);
  assert.ok(routes.reduce((n,r)=>n+r.cost,0)+minimumCrewBill+5<=SUBWAY_CONFIG.startingMoney);
  checks++;
}
assert.equal(LINE_CONTRACTS.filter(c=>c.special).length,4);
assert.ok(LINE_CONTRACTS.every(c=>c.recipe.length<=7&&c.recipe.every(n=>n>=2&&n<=6)));

// Direct construction fixture: first route spans 3, with multiple contacts.
function construction():SubwayState {
  const s=subwayGame.initialState(testRoom(4).players);
  s.phase="CONSTRUCTION";s.priorityQueue=[];s.resolveQueue=[...s.playerOrder];s.currentPeriod=1;
  s.players["seat-1"].lines=[{contractId:"university",paid:6,start:1,route:[{x:0,y:0}]}];
  for(let i=2;i<=4;i++)s.players[`seat-${i}`].lines=[{contractId:"short",paid:5,start:1,route:[{x:i-1,y:0}]}];
  return s;
}
for(const count of [0,1,2,3]) assert.equal(activationCost(construction().players["seat-1"],count),[0,1,3,6][count]);
{
  let s=construction();const id="seat-1";
  assert.equal(dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:0}),s,"hire first");
  assert.equal(dispatch(s,"seat-2","HIRE_CREWS",{lineIndexes:[0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0,0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[1],period:1}),s);
  s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players[id].money,59);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1}),s,"no double billing");
  const before=s;
  s=dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:0});
  assert.equal(s.players[id].money,56);
  for(const other of ["seat-2","seat-3","seat-4"])assert.equal(s.players[other].money,61);
  const undo=dispatch(s,id,"UNDO_PLACEMENT");
  assert.equal(undo.players[id].money,59,"Undo restores tolls but does not refund hired crew");
  assert.deepEqual(undo.players[id].pendingActions,[0]);
  assert.equal(undo.players[id].crewsHired,true);
  assert.ok(undo.nextEventSeq>s.nextEventSeq);
  assert.equal(dispatch(before,id,"BUILD",{lineIndex:0,x:12,y:8}),before,"illegal target costs nothing");
}
{
  let s=construction();const p=s.players["seat-1"];p.constructionHand=["grant","grant","relief","access","booking"];
  s=dispatch(s,"seat-1","PLAY_CONSTRUCTION_CARD",{cardId:"relief",period:1});
  assert.equal(activationCost(s.players["seat-1"],1),0);
  assert.equal(activationCost(s.players["seat-1"],2),2);
  assert.equal(activationCost(s.players["seat-1"],3),5);
  assert.equal(dispatch(s,"seat-1","PLAY_CONSTRUCTION_CARD",{cardId:"grant",period:1}),s,"one card per round");
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players["seat-1"].money,60);
}
{
  let s=construction();s.players["seat-1"].constructionHand=["booking"];
  s=dispatch(s,"seat-1","PLAY_CONSTRUCTION_CARD",{cardId:"booking",period:1});
  assert.equal(s.players["seat-1"].nextCrewDiscount,1);
  for(const id of s.playerOrder)s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[],period:1});
  assert.equal(s.currentPeriod,2);
  assert.equal(s.players["seat-1"].crewDiscount,1);
  assert.equal(s.players["seat-1"].money,60,"unused discount never pays cash");
  for(const id of [...s.resolveQueue])s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[],period:2});
  assert.equal(s.players["seat-1"].crewDiscount,0,"discount expires unused");
}
{
  let s=construction();s.priorityQueue=["seat-2","seat-3"];
  s.players["seat-2"].constructionHand=["expedite","grant"];s.players["seat-3"].constructionHand=["expedite"];
  assert.equal(dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1}),s);
  assert.equal(dispatch(s,"seat-3","PLAY_CONSTRUCTION_CARD",{cardId:"expedite",period:1}),s,"opening opportunities follow rotation");
  s=dispatch(s,"seat-2","PLAY_CONSTRUCTION_CARD",{cardId:"expedite",period:1});
  assert.equal(s.resolveQueue[0],"seat-2");
  assert.deepEqual(s.priorityQueue,[]);
  assert.equal(s.players["seat-2"].constructionCardThisPeriod,true);
  assert.equal(dispatch(s,"seat-2","PLAY_CONSTRUCTION_CARD",{cardId:"grant",period:1}),s);
  assert.equal(dispatch(s,"seat-3","PLAY_CONSTRUCTION_CARD",{cardId:"expedite",period:1}),s);
  assert.deepEqual(s.players["seat-3"].constructionHand,["expedite"],"second priority card not consumed");
}
{
  let s=construction();s.players["seat-1"].constructionHand=["access"];
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  s=dispatch(s,"seat-1","PLAY_CONSTRUCTION_CARD",{cardId:"access",period:1});
  s=dispatch(s,"seat-1","BUILD",{lineIndex:0,x:3,y:0});
  assert.equal(s.players["seat-1"].money,59);
  assert.equal(s.players["seat-2"].money,61);
  const undo=dispatch(s,"seat-1","UNDO_PLACEMENT");
  assert.equal(undo.players["seat-1"].accessPass,true);
  assert.equal(undo.players["seat-2"].money,60);
}
{
  let s=construction();s.players["seat-1"].money=0;
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players["seat-1"].money,-1,"crew debt allowed");
  const scored=scoreGame(s,1);
  assert.equal(scored.players["seat-1"].scoreBreakdown!.find(i=>i.label.startsWith("Construction debt"))!.points,-4);
  const p=s.players["seat-1"];p.engineeringHand=["dest-garden"];p.lines.push({contractId:"short",paid:5,route:[{x:14,y:2,stationId:"garden",stationSlot:0}]});
  assert.ok(objectiveMet("dest-garden",p,[]),"any line can satisfy a Destination");
  const result=scoreGame(s,2);
  assert.equal(result.players["seat-1"].scoreBreakdown!.find(i=>i.label==="Destination: Garden")!.points,3);
}
{
  let s=construction();s.currentPeriod=16;
  for(const id of s.playerOrder)s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[],period:16});
  assert.equal(s.phase,"SCORING","zero crews cannot extend the horizon");
}
// Full games exercise real drafting, activation, placement, turns, cards and scoring.
const summary=[];
for(const count of [2,3,4]){
  let finished=0,debt=0,lowest=Infinity;
  for(let seed=1;seed<=12;seed++){
    const {state:s,actions}=runPlaytest(count,seed);
    assert.equal(s.phase,"RESULTS");
    assert.ok(actions<500);
    for(const p of Object.values(s.players)){finished+=p.lines.filter(lineComplete).length;debt+=p.money<0?1:0;lowest=Math.min(lowest,p.money);}
    assert.ok(s.events.length<=20);
  }
  summary.push({players:count,games:12,averageFinished:finished/(count*12),debtCompanies:debt,lowestCash:lowest});
}
console.log("Draft, crew billing, cards, priority, toll/undo, debt, scoring and 220 portfolio affordability checks passed.",checks);
console.log(JSON.stringify(summary));
console.log("36 complete 2/3/4-player simulations reached RESULTS.");
