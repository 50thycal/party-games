import assert from "node:assert/strict";
import "./subway-plans-test";
import "./subway-bends-test";
import "./subway-status-test";
import "./subway-engineering-test";
import "./subway-objectives-test";
import "./subway-transfers-test";
import "./subway-companion-test";
import "./subway-guidance-test";
import "./subway-neighborhood-test";
import { constructionHistory } from "../src/games/subway/constructionHistory";
import { turnSummary } from "../src/games/subway/turnSummary";
import { DEVICE_SESSION_IDLE_MS, parseSavedIdentity, resumeDecision, staleRoomDecision, stamped } from "../src/games/subway/deviceSession";
import { quoteBuildCost } from "../src/games/subway/buildCost";
import { routeContacts, stationAt } from "../src/games/subway/config";
import { activationCost, affordableCrews, cashBand, cashScore, destinationReward, destinationById, buildableLines, constructionExhausted, lineActionsRemaining, LINE_CONTRACTS, ENGINEERING_CARDS, DESTINATION_CARDS, STATIONS, SUBWAY_CONFIG, SUBWAY_STATE_VERSION, subwayGame, nextCompanyId, draftPicks, draftTurnId, objectiveMet, scoreGame, legalTargets, lineComplete, contractById, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { generateAiPlaytestReport } from "../src/games/subway/report";
import { startPlaytest, testRoom, runPlaytest, seededRandom, stepPlaytest } from "../src/games/subway/playtest";

const dispatch=(s:SubwayState,id:string,type:SubwayAction["type"],payload?:SubwayAction["payload"])=>subwayGame.reducer(s,{playerId:id,type,payload},{room:testRoom(s.playerOrder.length),playerId:id,now:()=>s.nextEventSeq,random:()=>.4});
let checks=0;
for(const count of [2,3,4]) for(const category of ["engineering"] as const) {
  let {state:s}=startPlaytest(count,42);
  assert.equal(SUBWAY_STATE_VERSION,29);
  assert.ok(!("construction" in s.market.rows) && !("construction" in s.market.decks));
  assert.ok(!("priorityQueue" in s));
  assert.ok(Object.values(s.players).every(p=>!("constructionHand" in p)));
  assert.ok(Object.values(s.players).every(p=>draftPicks(p)===0));
  assert.equal(s.stations.length,10);
  assert.equal(new Set(s.stations.map(p=>`${p.x},${p.y}`)).size,10);
  assert.equal(new Set(s.stations.flatMap(p=>p.cells!.map(c=>`${c.x},${c.y}`))).size,124);
  assert.deepEqual(["minor","major","medium"].map(kind=>s.stations.filter(p=>p.kind===kind).length),[3,6,1]);
  assert.equal(s.market.rows.engineering.length+s.market.decks.engineering.length,21);
  assert.equal(new Set([...s.market.rows.engineering,...s.market.decks.engineering]).size,21);
  for(let pick=0;pick<count*3;pick++) {
    const id=nextCompanyId(s)!;
    assert.equal(id,draftTurnId(s,pick,0));
    assert.equal(s.procurement.row.length,Math.min(count,count*3+1-pick));
    assert.equal(dispatch(s,id,"PROCURE",{choice:"pass",deck:"engineering"}),s);
    const contractId=s.procurement.row.at(-1)!;
    const old=s;
    s=dispatch(s,id,"PROCURE",{choice:"buy",contractId});
    assert.equal(s.players[id].money,old.players[id].money-contractById(contractId)!.cost);
  }
  assert.equal(s.engineeringStep,"CARD_DRAFT");
  assert.equal(s.procurement.row.length+s.procurement.deck.length,1,"one unused contract");
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
  assert.equal(s.phase,"STARTER_PLACEMENT");
  assert.equal(Object.values(s.players).reduce((n,p)=>n+p.engineeringHand.length,0),category==="engineering"?count*3:0,"either category can supply every pick");
  for(const id of s.playerOrder) {
    assert.equal(dispatch(s,id,"LOCK_ENGINEERING_PLAN",{cardIds:[]}),s,"commitment removed");
    s=dispatch(s,id,"BUY_SURVEYS",{surveys:0});
  }
  assert.equal(s.phase,"STARTER_PLACEMENT","no separate destination or scheduling phase");
  checks+=10;
}
// Removed survey actions are rejected even when sent directly.
{
  const {state:s}=runPlaytest(2,3,"STARTER_PLACEMENT");
  for(const id of s.playerOrder){
    assert.equal(dispatch(s,id,"BUY_SURVEYS",{surveys:1}),s);
    assert.equal(dispatch(s,id,"PLACE_SURVEY",{x:4,y:4}),s);
  }
}
// Economy pressure is intentional: route purchases fit, but expensive portfolios
// must choose between speed, objectives, cash and debt within nine rounds.
let pressured = 0;
for(let a=0;a<LINE_CONTRACTS.length;a++)for(let b=a+1;b<LINE_CONTRACTS.length;b++)for(let c=b+1;c<LINE_CONTRACTS.length;c++){
  const routes=[LINE_CONTRACTS[a],LINE_CONTRACTS[b],LINE_CONTRACTS[c]];
  const segments=routes.reduce((n,r)=>n+r.recipe.length,0);
  const rounds=SUBWAY_CONFIG.timelinePeriods, baseCrews=Math.floor(segments/rounds);
  const minimumCrewBill=rounds*baseCrews*(baseCrews+1)/2 + (segments%rounds)*(baseCrews+1);
  const purchase=routes.reduce((n,r)=>n+r.cost,0);
  assert.ok(purchase<SUBWAY_CONFIG.startingMoney);
  if(purchase+minimumCrewBill>SUBWAY_CONFIG.startingMoney) pressured++;
  checks++;
}
assert.ok(pressured>0 && pressured<286);
assert.ok(LINE_CONTRACTS.every(c=>!("special" in c)&&!("stationBonus" in c)));
assert.ok(LINE_CONTRACTS.every(c=>c.recipe.length<=7&&c.recipe.every(n=>n>=2&&n<=6)));

// Direct construction fixture: first route spans 3, with multiple contacts.
function construction():SubwayState {
  const s=subwayGame.initialState(testRoom(4).players);
  s.phase="CONSTRUCTION";s.resolveQueue=[...s.playerOrder];s.currentPeriod=1;
  s.players["seat-1"].lines=[{contractId:"university",paid:6,start:1,route:[{x:0,y:2}]}];
  for(let i=2;i<=4;i++)s.players[`seat-${i}`].lines=[{contractId:"short",paid:5,start:1,route:[{x:i-1,y:0},{x:i-1,y:4}]}];
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
  const quote = quoteBuildCost(s.players["seat-1"], routeContacts(s, "seat-1", {x:0,y:2}, {x:3,y:2}));
  assert.deepEqual(s, before, "quoting cannot mutate the game");
  const built = dispatch(s, "seat-1", "BUILD", {lineIndex:0,x:3,y:2});
  assert.notEqual(built, s);
  assert.equal(quote.cashAfter, built.players["seat-1"].money);
  assert.equal(quote.playerCost, cash - built.players["seat-1"].money);
  assert.equal(quote.cashScoreAfter, cashScore(built.players["seat-1"].money));
  assert.equal(quote.cashScoreChange, cashScore(built.players["seat-1"].money)-cashScore(cash));
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
  assert.equal(dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:2}),s,"hire first");
  assert.equal(dispatch(s,"seat-2","HIRE_CREWS",{lineIndexes:[0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0,0],period:1}),s);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[1],period:1}),s);
  s=dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.equal(s.players[id].money,SUBWAY_CONFIG.startingMoney-1);
  assert.equal(dispatch(s,id,"HIRE_CREWS",{lineIndexes:[0],period:1}),s,"no double billing");
  const before=s;
  s=dispatch(s,id,"BUILD",{lineIndex:0,x:3,y:2});
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
  const broke=s;
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  if(SUBWAY_CONFIG.crewDebtAllowed) assert.equal(s.players["seat-1"].money,-1,"crew debt allowed");
  else {
    assert.equal(s,broke,"crews are paid from cash on hand: an unaffordable hire is rejected");
    assert.equal(affordableCrews(broke.players["seat-1"],3),0);
    s=structuredClone(broke);s.players["seat-1"].money=3;
    assert.equal(affordableCrews(s.players["seat-1"],3),2,"two crews cost exactly $3M");
    assert.equal(dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1}).players["seat-1"].money,2);
    s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
    s=dispatch(s,"seat-1","BUILD",{lineIndex:0,x:3,y:2});
    assert.equal(s.players["seat-1"].money,-1,"contact tolls may still create debt");
  }
  const scored=scoreGame(s,1);
  const position=scored.players["seat-1"].scoreBreakdown!.find(i=>i.label.startsWith("Cash position"))!;
  assert.equal(position.points,cashScore(s.players["seat-1"].money));
  assert.equal(position.points,-2,"a $1M overdraft costs 2 VP");
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
console.log("Draft, crew billing, fixed priority, toll/undo, debt, scoring and 286 portfolio economy checks passed.",checks);
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

// Destination completion cash: paid once, the first time the network connects
// a held mission, reversed by Undo and never paid twice.
{
  let s=construction();
  for(const id of s.playerOrder.slice(1)) s.players[id].lines=[];
  s.players["seat-1"].lines[0].route=[{x:0,y:7}];
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  const me=s.players["seat-1"];
  const target=legalTargets(s,"seat-1",0).find(t=>stationAt(t,s.stations));
  assert.ok(target,"fixture needs a legal station target");
  const stationB=stationAt(target!,s.stations)!.id;
  const card=DESTINATION_CARDS.find(c=>c.stationIds.length===2&&c.stationIds.includes(stationB))!;
  const stationA=card.stationIds.find(id=>id!==stationB)!;
  me.lines[0].route[0]={...me.lines[0].route[0],stationId:stationA};
  me.destinationHand=[card.id];
  const cash=me.money;
  assert.equal(destinationReward(card.id),SUBWAY_CONFIG.destinationCompletionReward.pair);
  assert.equal(destinationReward(DESTINATION_CARDS.find(c=>c.stationIds.length===3)!.id),SUBWAY_CONFIG.destinationCompletionReward.triple);
  const built=dispatch(s,"seat-1","BUILD",{lineIndex:0,...target!});
  assert.notEqual(built,s);
  assert.equal(built.players["seat-1"].money,cash+destinationReward(card.id),"connecting the mission pays cash");
  assert.deepEqual(built.players["seat-1"].destinationsPaid,[card.id]);
  assert.ok(built.moneyEvents!.at(-1)!.payments.some(p=>p.from==="bank"&&p.reason==="Destination connected"));
  assert.ok(built.events.some(e=>/Destination connected/.test(e.text)),"build narration mentions the destination cash");
  const undone=dispatch(built,"seat-1","UNDO_PLACEMENT");
  assert.equal(undone.players["seat-1"].money,cash,"Undo reverses the destination cash");
  assert.deepEqual(undone.players["seat-1"].destinationsPaid??[],[]);
  assert.equal(undone.moneyEvents!.at(-1)!.reversed,true);
  const again=dispatch(undone,"seat-1","BUILD",{lineIndex:0,...target!});
  assert.equal(again.players["seat-1"].money,cash+destinationReward(card.id),"rebuilding pays again after Undo, never twice in one state");
  // Buying a mission the network already connects pays at once.
  let b=construction();b.players["seat-1"].destinationHand=[];b.destinationDeck=[card.id];
  b.players["seat-1"].lines[0].route=[{x:0,y:7,stationId:stationA},{x:3,y:7,stationId:stationB}];
  const bought=dispatch(b,"seat-1","BUY_DESTINATION",{period:1});
  assert.equal(bought.players["seat-1"].money,SUBWAY_CONFIG.startingMoney-SUBWAY_CONFIG.destinationPurchaseCost+destinationReward(card.id));
  assert.deepEqual(bought.players["seat-1"].destinationsPaid,[card.id]);
  console.log("Destination completion cash: pay once, Undo reversal and connected purchase passed.");
}

// Saved device identity: fresh rejoins, idle asks, finished/missing rooms are forgotten.
{
  const now=1_800_000_000_000;
  assert.equal(parseSavedIdentity(null),null);assert.equal(parseSavedIdentity("{bad"),null);assert.equal(parseSavedIdentity(JSON.stringify({roomCode:"DGLE"})),null,"token required");
  const legacy=parseSavedIdentity(JSON.stringify({roomCode:"DGLE",token:"t",controllerKey:"c"}))!;
  assert.deepEqual(legacy,{roomCode:"DGLE",token:"t",controllerKey:"c"});
  assert.equal(resumeDecision(null,now),"none");
  assert.equal(resumeDecision(legacy,now),"resume","pre-stamp identities rejoin once");
  assert.equal(resumeDecision(stamped(legacy,now-DEVICE_SESSION_IDLE_MS),now),"resume","exactly the window still rejoins");
  assert.equal(resumeDecision(stamped(legacy,now-DEVICE_SESSION_IDLE_MS-1),now),"ask");
  assert.equal(resumeDecision(stamped(legacy,now-14*24*3600*1000),now),"ask","two weeks later asks instead of rejoining");
  assert.deepEqual(parseSavedIdentity(JSON.stringify(stamped(legacy,now))),{...legacy,seenAt:now},"stamps round-trip through storage");
  assert.equal(staleRoomDecision(false,undefined),"forget","missing room or rejected key");
  assert.equal(staleRoomDecision(true,"RESULTS"),"forget","finished game");
  assert.equal(staleRoomDecision(true,"CONSTRUCTION"),"ask");assert.equal(staleRoomDecision(true,null),"ask","lobby still asks");
  console.log("Device session: parse, idle window, stamp round-trip and stale-room decisions passed.");
}

// Hand-off summary: cash received, opposition completions and narration since
// the company last acted; nothing before its first action.
{
  let s=construction();
  assert.equal(turnSummary(s,"seat-1"),null,"no own action yet");
  s=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  s=dispatch(s,"seat-1","BUILD",{lineIndex:0,x:3,y:2});
  assert.equal(turnSummary(s,"seat-1"),null,"nothing happened since seat-1 acted");
  assert.ok(turnSummary(s,"seat-2"),"first construction turn summarises prior opponents");
  s=dispatch(s,"seat-2","HIRE_CREWS",{lineIndexes:[0],period:1});
  s=dispatch(s,"seat-2","BUILD",{lineIndex:0,x:1,y:5});
  const later=turnSummary(s,"seat-1")!;
  assert.ok(later.lines.some(t=>t.includes("hired 1 crew")),"opposition hire narrated");
  assert.ok(later.lines.every(t=>!t.startsWith(s.players["seat-1"].name)),"own narration excluded");
  assert.equal(later.cashDelta,s.players["seat-1"].money-(SUBWAY_CONFIG.startingMoney-4));
  assert.deepEqual(later.completions,[]);
  assert.equal(later.opponentIncome,later.cashDelta);
  assert.equal(later.bankIncome,0);
  assert.equal(later.receipts.reduce((sum,r)=>sum+r.amount,0),later.opponentIncome);
  assert.ok(later.receipts.every(r=>r.playerId==='seat-2'&&r.name===s.players['seat-2'].name));
  console.log("Hand-off summary: first-turn guard, cash delta and opposition narration passed.");
}

// Ending cash scores on a spectrum: every balance falls in exactly one band,
// bands never overlap, and the reducer's ledger agrees with the bar.
{
  const expected: [number, number][] = [
    [40, 3], [5, 3], [4, 2], [3, 1], [2, 1], [1, 0], [0, 0],
    [-1, -2], [-2, -4], [-3, -6], [-4, -8], [-9, -18],
  ];
  for (const [money, vp] of expected) assert.equal(cashScore(money), vp, `$${money}M scores ${vp} VP`);
  for (let money = -12; money <= 12; money++) {
    const band = cashBand(money);
    assert.equal(SUBWAY_CONFIG.cashBands.filter(b => b === band).length, 1, "one band per balance");
    assert.ok(money >= band.min, "a balance never scores a band it has not reached");
    assert.equal(money < 0 ? money * 2 : band.vp, cashScore(money));
  }
  assert.ok(SUBWAY_CONFIG.cashBands.every((b,i,all) => i === 0 || b.vp < all[i-1].vp), "bands worsen as cash falls");
  // The ledger line reports the same VP the bar shows, on both sides of zero.
  for (const money of [7, 3, 0, -1, -2, -6]) {
    let s = construction();
    s.players["seat-1"].money = money;
    const item = scoreGame(s,1).players["seat-1"].scoreBreakdown!.find(i => i.label.startsWith("Cash position"))!;
    assert.equal(item.points, cashScore(money));
    assert.ok(item.label.includes(cashBand(money).label), "the ledger names the band");
  }
  console.log("Ending cash spectrum: band boundaries, coverage, ordering and score ledger passed.");
}

// Borrowing is available again: hiring may take a company straight into debt.
{
  let s=construction();s.players["seat-1"].money=0;
  const hired=dispatch(s,"seat-1","HIRE_CREWS",{lineIndexes:[0],period:1});
  assert.notEqual(hired,s,"a company at $0 may still hire");
  assert.equal(hired.players["seat-1"].money,-1,"crews may borrow past zero");
  assert.equal(affordableCrews(s.players["seat-1"],3),3,"every crew count stays available while borrowing is allowed");
  console.log("Direct borrowing: hiring into debt from $0 accepted.");
}
