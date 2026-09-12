import assert from "node:assert/strict";
import "./subway-plans-test";
import "./subway-objectives-test";
import "./subway-companion-test";
import "./subway-guidance-test";
import "./subway-neighborhood-test";
import { constructionHistory } from "../src/games/subway/constructionHistory";
import { quoteBuildCost } from "../src/games/subway/buildCost";
import { routeContacts, stationAt } from "../src/games/subway/config";
import { activationCost, buildableLines, constructionExhausted, lineActionsRemaining, LINE_CONTRACTS, ENGINEERING_CARDS, DESTINATION_CARDS, STATIONS, SUBWAY_CONFIG, SUBWAY_STATE_VERSION, subwayGame, nextCompanyId, draftPicks, draftTurnId, objectiveMet, scoreGame, legalTargets, lineComplete, contractById, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { generateAiPlaytestReport } from "../src/games/subway/report";
import { startPlaytest, testRoom, runPlaytest, seededRandom, stepPlaytest } from "../src/games/subway/playtest";

const dispatch=(s:SubwayState,id:string,type:SubwayAction["type"],payload?:SubwayAction["payload"])=>subwayGame.reducer(s,{playerId:id,type,payload},{room:testRoom(s.playerOrder.length),playerId:id,now:()=>s.nextEventSeq,random:()=>.4});
let checks=0;
for(const count of [2,3,4]) for(const category of ["engineering"] as const) {
  let {state:s}=startPlaytest(count,42);
  assert.equal(SUBWAY_STATE_VERSION,18);
  assert.ok(!("construction" in s.market.rows) && !("construction" in s.market.decks));
  assert.ok(!("priorityQueue" in s));
  assert.ok(Object.values(s.players).every(p=>!("constructionHand" in p)));
  assert.ok(Object.values(s.players).every(p=>draftPicks(p)===0));
  assert.equal(s.stations.length,10);
  assert.equal(new Set(s.stations.map(p=>`${p.x},${p.y}`)).size,10);
  assert.equal(new Set(s.stations.flatMap(p=>p.cells!.map(c=>`${c.x},${c.y}`))).size,49);
  assert.deepEqual(["minor","major","medium"].map(kind=>s.stations.filter(p=>p.kind===kind).length),[3,6,1]);
  assert.equal(s.market.rows.engineering.length+s.market.decks.engineering.length,16);
  assert.equal(new Set([...s.market.rows.engineering,...s.market.decks.engineering]).size,16);
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
  for(let pick=0;pick<count*3;pick++) {
    const id=nextCompanyId(s)!;
    assert.equal(id,draftTurnId(s,pick,1));
    const payload={deck:category,expectedPick:pick,cardId:pick%2===0||!s.market.decks[category].length?s.market.rows[category][0]:undefined};
    const previous=s;
    assert.equal(dispatch(s,id,"DRAFT_CARD",{...payload,expectedPick:pick-1}),s);
    s=dispatch(s,id,"DRAFT_CARD",payload);
    assert.notEqual(s,previous);
    assert.equal(dispatch(s,id,"DRAFT_CARD",payload),s);
  }
  assert.ok(Object.values(s.players).every(p=>draftPicks(p)===3));
  assert.equal(s.engineeringStep,"BUY_SURVEYS");
  assert.equal(Object.values(s.players).reduce((n,p)=>n+p.engineeringHand.length,0),category==="engineering"?count*3:0,"either category can supply every pick");
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
  for (const pt of [{x:0,y:4},{x:26,y:4},{x:12,y:0},{x:12,y:8}]) assert.equal(dispatch(s,id,"PLACE_SURVEY",pt),s,"Starter borders reject surveys");
  const target=Array.from({length:25},(_,i)=>({x:i+1,y:1})).find(p=>!stationAt(p,s.stations))!;
  s=dispatch(s,id,"PLACE_SURVEY",target);
  assert.equal(s.phase,"STARTER_PLACEMENT");
  const undone=dispatch(s,id,"UNDO_PLACEMENT");
  assert.equal(undone.phase,"ENGINEERING");
  assert.equal(undone.surveyPins.length,0);
  assert.equal(undone.players[id].money,cash-1);
}
// Economy pressure is intentional: route purchases fit, but expensive portfolios
// must choose between speed, objectives, cash and debt within nine rounds.
let pressured = 0;
for(let a=0;a<12;a++)for(let b=a+1;b<12;b++)for(let c=b+1;c<12;c++){
  const routes=[LINE_CONTRACTS[a],LINE_CONTRACTS[b],LINE_CONTRACTS[c]];
  const segments=routes.reduce((n,r)=>n+r.recipe.length,0);
  const rounds=SUBWAY_CONFIG.timelinePeriods, baseCrews=Math.floor(segments/rounds);
  const minimumCrewBill=rounds*baseCrews*(baseCrews+1)/2 + (segments%rounds)*(baseCrews+1);
  const purchase=routes.reduce((n,r)=>n+r.cost,0);
  assert.ok(purchase<SUBWAY_CONFIG.startingMoney);
  if(purchase+minimumCrewBill>SUBWAY_CONFIG.startingMoney) pressured++;
  checks++;
}
assert.ok(pressured>0 && pressured<220);
assert.ok(LINE_CONTRACTS.every(c=>!("special" in c)&&!("stationBonus" in c)));
assert.ok(LINE_CONTRACTS.every(c=>c.recipe.length<=7&&c.recipe.every(n=>n>=2&&n<=6)));

// Direct construction fixture: first route spans 3, with multiple contacts.
function construction():SubwayState {
  const s=subwayGame.initialState(testRoom(4).players);
  s.phase="CONSTRUCTION";s.resolveQueue=[...s.playerOrder];s.currentPeriod=1;
  s.players["seat-1"].lines=[{contractId:"university",paid:6,start:1,route:[{x:0,y:0}]}];
  for(let i=2;i<=4;i++)s.players[`seat-${i}`].lines=[{contractId:"short",paid:5,start:1,route:[{x:i-1,y:0}]}];
  return s;
}
for(const count of [0,1,2,3]) assert.equal(activationCost(construction().players["seat-1"],count),[0,1,3,6][count]);
// The displayed quote must agree with actual BUILD transfers, including
// already-negative balances. Quotes never mutate state.
for (const cash of [10, 1, -2]) for (const hasContacts of [false, true]) {
  let s = construction();
  if (!hasContacts) for (const id of s.playerOrder.slice(1)) s.players[id].lines = [];
  s = dispatch(s, "seat-1", "HIRE_CREWS", {lineIndexes:[0], period:1});
  s.players["seat-1"].money = cash;
  const before = structuredClone(s);
  const quote = quoteBuildCost(s.players["seat-1"], routeContacts(s, "seat-1", {x:0,y:0}, {x:3,y:0}));
  assert.deepEqual(s, before, "quoting cannot mutate the game");
  const built = dispatch(s, "seat-1", "BUILD", {lineIndex:0,x:3,y:0});
  assert.notEqual(built, s);
  assert.equal(quote.cashAfter, built.players["seat-1"].money);
  assert.equal(quote.playerCost, cash - built.players["seat-1"].money);
  assert.equal(quote.debtPenalty, Math.min(0,built.players["seat-1"].money)*4);
  for (const id of s.playerOrder.slice(1)) assert.equal(quote.recipients.find(p=>p.ownerId===id)?.amount ?? 0, built.players[id].money - s.players[id].money);
  assert.equal(quote.totalToll, hasContacts ? 3 : 0);
}
assert.deepEqual(quoteBuildCost({money:5}, [
  {ownerId:"one", key:"a", kind:"peg", x:1,y:0},
  {ownerId:"one", key:"b", kind:"crossing", x:2,y:0},
]).recipients, [{ownerId:"one", amount:2}], "multiple contacts aggregate per recipient");
console.log("Build-cost previews: 6 reducer comparisons and recipient aggregation passed.");
{
  let s=construction();const id="seat-1";
  assert.equal(dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:0}),s,"hire first");
  assert.equal(dispatch(s,"seat-2","HIRE_CREWS",{lineIndexes:[0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0,0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[1],period:1}),s);
  s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players[id].money,SUBWAY_CONFIG.startingMoney-1);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1}),s,"no double billing");
  const before=s;
  s=dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:0});
  assert.equal(s.players[id].money,SUBWAY_CONFIG.startingMoney-4);
  for(const other of ["seat-2","seat-3","seat-4"])assert.equal(s.players[other].money,SUBWAY_CONFIG.startingMoney+1);
  const undo=dispatch(s,id,"UNDO_PLACEMENT");
  assert.equal(undo.players[id].money,SUBWAY_CONFIG.startingMoney-1,"Undo restores tolls but does not refund hired crew");
  assert.deepEqual(undo.players[id].pendingActions,[0]);
  assert.equal(undo.players[id].crewsHired,true);
  assert.ok(undo.nextEventSeq>s.nextEventSeq);
  assert.equal(undo.telemetry.at(-2)?.action,"BUILD","Undo keeps the reverted build in the playtest ledger");
  assert.equal(undo.telemetry.at(-1)?.action,"UNDO_PLACEMENT");
  assert.equal(dispatch(before,id,"BUILD",{lineIndex:0,x:12,y:8}),before,"illegal target costs nothing");
}
{
  let s=construction();s.players["seat-1"].money=0;
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players["seat-1"].money,-1,"crew debt allowed");
  const scored=scoreGame(s,1);
  assert.equal(scored.players["seat-1"].scoreBreakdown!.find(i=>i.label.startsWith("Construction debt"))!.points,-4);
  const p=s.players["seat-1"];p.engineeringHand=["dest-garden"];p.lines.push({contractId:"short",paid:5,route:[{x:14,y:2,stationId:"garden",stationSlot:0}]});
  assert.equal(objectiveMet("dest-garden",p,[]),false,"retired single-station cards cannot score");
  const result=scoreGame(s,2);
  assert.equal(result.players["seat-1"].scoreBreakdown!.find(i=>i.label==="Destination: Garden"),undefined);
}
{
  let s=construction();s.currentPeriod=SUBWAY_CONFIG.timelinePeriods;
  for(const id of s.playerOrder)s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[],period:SUBWAY_CONFIG.timelinePeriods});
  assert.equal(s.phase,"SCORING","zero crews cannot extend the horizon");
  assert.equal(s.endReason,"ROUND_LIMIT");
}
// Construction ends immediately once the final legal segment is built.
{
  let s=construction();
  s.resolveQueue=["seat-1","seat-2","seat-3","seat-4"];
  s.players["seat-1"].lines=[{contractId:"short",paid:5,start:1,route:[{x:0,y:0},{x:2,y:0},{x:5,y:0},{x:7,y:0}]}];
  for(const id of ["seat-2","seat-3","seat-4"]) {
    s.players[id].lines=[{contractId:"short",paid:5,start:1,route:[{x:0,y:8},{x:2,y:8},{x:5,y:8},{x:7,y:8},{x:10,y:8}]}];
  }
  assert.equal(constructionExhausted(s),false);
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  s=dispatch(s,"seat-1","BUILD",{lineIndex:0,x:10,y:0});
  assert.equal(s.phase,"SCORING");
  assert.equal(s.currentPeriod,1,"empty rounds are not advanced");
  assert.equal(s.endReason,"NO_LEGAL_CONSTRUCTION");
  assert.equal(constructionExhausted(s),true);
  const report=generateAiPlaytestReport(scoreGame(s,999),{roomCode:"TEST",mode:"simulation"});
  assert.match(report,/Copy|Subway AI Playtest Report/);
  assert.match(report,/NO_LEGAL_CONSTRUCTION/);
  assert.match(report,/Structured accepted-action log/);
  assert.match(report,/"action": "BUILD"/);
}
// Full games exercise real drafting, activation, placement, turns, cards and scoring.
const summary=[];
for(const count of [2,3,4]){
  let finished=0,debt=0,lowest=Infinity;
  for(let seed=1;seed<=12;seed++){
    const {state:s,actions}=runPlaytest(count,seed);
    assert.equal(s.phase,"RESULTS");
    assert.ok(actions<500);
    assert.ok(s.currentPeriod<=SUBWAY_CONFIG.timelinePeriods);
    for(const p of Object.values(s.players)){finished+=p.lines.filter(lineComplete).length;debt+=p.money<0?1:0;lowest=Math.min(lowest,p.money);}
    assert.ok(s.events.length<=20);
  }
  assert.ok(finished>0,"simulation must exercise actual route completions");
  summary.push({players:count,games:12,averageFinished:finished/(count*12),debtCompanies:debt,lowestCash:lowest});
}
console.log("Draft, crew billing, fixed priority, toll/undo, debt, scoring and 220 portfolio economy checks passed.",checks);
console.log(JSON.stringify(summary));
console.log("36 complete 2/3/4-player simulations reached RESULTS.");

// Schedule history follows public builds and their Undo, without card disclosures.
{
  let {state:s}=runPlaytest(2,7,"CONSTRUCTION");
  const room=testRoom(2);
  for(let i=0;i<100&&!s.telemetry.some(e=>e.action==="BUILD");i++)s=stepPlaytest(s,room,seededRandom(i+1));
  const event=s.telemetry.find(e=>e.action==="BUILD")!;
  assert.ok(event);
  assert.equal(constructionHistory(s,event.periodBefore).builds.filter(b=>!b.undone).length,1);
  const undone=dispatch(s,event.actorId,"UNDO_PLACEMENT");
  assert.notEqual(undone,s);
  assert.equal(constructionHistory(undone,event.periodBefore).builds.filter(b=>!b.undone).length,0);
  assert.equal(constructionHistory(undone,event.periodBefore).builds[0].undone,true);
}
