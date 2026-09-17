import assert from "node:assert/strict";
import { borderSides, distinctSides, longestNetwork } from "../src/games/subway/network";
import { DESTINATION_CARDS, ENGINEERING_CARDS, LINE_CONTRACTS, SUBWAY_CONFIG, cardPurchaseBlocker, contractNodes, contractById, destinationMet, nodePoint, objectiveMet, scoreGame, subwayGame, type PlayerLine, type RouteNode, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { runPlaytest, startPlaytest, testRoom } from "../src/games/subway/playtest";

const dispatch = (s:SubwayState, id:string, type:SubwayAction["type"], payload?:SubwayAction["payload"]) => subwayGame.reducer(s,{playerId:id,type,payload},{room:testRoom(s.playerOrder.length),playerId:id,now:()=>1234,random:()=>.2});
const line = (nodes:RouteNode[], id="short"):PlayerLine => ({contractId:id,paid:5,start:1,route:nodes});
const pt = (x:number,y:number):RouteNode => ({x,y});
const station = (id:string,x:number,y:number,slot=0):RouteNode => ({x,y,stationId:id,stationSlot:slot});
// Scoring fixtures deliberately isolate predicates from recipe geometry.
const finished = (start:RouteNode,end:RouteNode,id="short") => line([start,pt(5,3),pt(8,4),pt(11,4),end].slice(0,contractNodes(contractById(id)!)),id);
const base = () => subwayGame.initialState(testRoom(2).players);
const met = (id:string,s:SubwayState) => objectiveMet(id,s.players["seat-1"],[s.players["seat-2"]],s);

assert.equal(ENGINEERING_CARDS.length,21);
assert.equal(new Set(ENGINEERING_CARDS.map(c=>c.id)).size,21);
assert.equal(ENGINEERING_CARDS.some(c=>c.id==="parallel"),false);
assert.equal(new Set(LINE_CONTRACTS.map(c=>c.code)).size,13);
assert.ok(LINE_CONTRACTS.every(c=>/^[A-Z]{2}$/.test(c.code)));
assert.deepEqual(new Set(LINE_CONTRACTS.map(c=>c.name)),new Set(["Red","Blue","Green","Yellow","Orange","Purple","Pink","Black","White","Gray","Teal","Brown","Copper"].map(c=>`${c} Line`)));
assert.equal(DESTINATION_CARDS.length,30);
assert.equal(new Set(DESTINATION_CARDS.map(c=>c.id)).size,30);
assert.ok(DESTINATION_CARDS.every(c=>c.vp===(c.stationIds.length===2?4:7)));

assert.deepEqual(borderSides(pt(1,1)),[]);
assert.deepEqual(borderSides(pt(0,0)),["north","west"]);
assert.equal(distinctSides([pt(0,0),pt(0,0),pt(26,8)],3),false,"one corner peg cannot count twice");
assert.equal(distinctSides([pt(0,0),pt(26,0),pt(0,8)],3),true,"corners allow a distinct-side assignment");
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[line([station("garden",2,2),pt(4,2)]),line([pt(4,2),station("market",8,2)]),line([station("market",8,2,1),station("grand",12,2)])];
  const pair=DESTINATION_CARDS.find(c=>c.stationIds.length===2&&c.stationIds.includes("market")&&c.stationIds.includes("grand"))!;
  const triple=DESTINATION_CARDS.find(c=>c.stationIds.length===3&&["garden","market","grand"].every(id=>c.stationIds.includes(id)))!;
  assert.equal(destinationMet(p,pair.id),true);
  assert.equal(destinationMet(p,triple.id),true,"unfinished lines can provide a mission path");
  p.destinationHand=[pair.id,triple.id];
  const scored=scoreGame(s,1).players[p.id];
  assert.equal(scored.scoreBreakdown!.find(i=>i.label===pair.name)!.points,4);
  assert.equal(scored.scoreBreakdown!.find(i=>i.label===triple.name)!.points,7);
  p.lines[2].route[0]=pt(10,2);
  assert.equal(destinationMet(p,pair.id),false,"separated lines do not satisfy a mission");
  s.players["seat-2"].lines=[line([pt(8,2),pt(10,2)])];
  assert.equal(destinationMet(p,pair.id),false,"opponents cannot supply a connection");

}
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[line([pt(0,2),pt(4,2)]),line([pt(4,0),pt(4,2),pt(4,6)])];
  assert.equal(longestNetwork(p),8,"a branch cannot be revisited to add all its arms");
  p.lines=[line([pt(0,0),pt(4,0),pt(4,3)]),line([pt(4,3),pt(0,3),pt(0,0)]),line([pt(0,0),pt(0,8)])];
  assert.equal(longestNetwork(p),22,"closed circuit and tail allowed; each segment used once");
  p.lines=[line([pt(0,2),pt(8,2)]),line([pt(4,0),pt(4,6)])];
  assert.equal(longestNetwork(p),8,"raw crossing is not a transfer");
  s.players["seat-2"].lines=[line([pt(0,0),pt(8,0)])];
  let result=scoreGame(s,1);
  assert.ok(Object.values(result.players).every(p=>p.scoreBreakdown!.find(i=>i.label.startsWith("Longest network"))!.points===3));
  s.players["seat-2"].lines[0].route.at(-1)!.x=7;
  result=scoreGame(s,1);assert.equal(result.players[p.id].scoreBreakdown!.find(i=>i.label.startsWith("Longest network"))!.points,5);
  assert.ok(result.players[p.id].scoreBreakdown!.every(i=>!i.label.includes("special")&&!i.label.includes("major-station bonus")));
}
for(const count of [2,3,4]) {
  const s=startPlaytest(count,42).state;
  const hands=Object.values(s.players).flatMap(p=>p.destinationHand);
  assert.equal(hands.length,count*2);
  assert.equal(new Set(hands).size,count*2);
  assert.ok(hands.every(id=>DESTINATION_CARDS.some(c=>c.id===id)));
  assert.equal(s.destinationDeck.length,30-count*2);
  assert.ok(s.telemetry[0].playersAfter[s.playerOrder[0]].destinationCards.length===2);
}
{
  let s=runPlaytest(2,7,"CONSTRUCTION").state;
  const id=s.resolveQueue[0], other=s.playerOrder.find(p=>p!==id)!;
  const cash=s.players[id].money, held=s.players[id].destinationHand.length;
  assert.equal(dispatch(s,other,"BUY_DESTINATION",{period:s.currentPeriod}),s);
  assert.equal(dispatch(s,id,"BUY_DESTINATION",{period:s.currentPeriod-1}),s);
  const poor=structuredClone(s);poor.players[id].money=4;
  assert.equal(dispatch(poor,id,"BUY_DESTINATION",{period:s.currentPeriod}),poor);
  const hired=structuredClone(s);hired.players[id].crewsHired=true;
  assert.equal(dispatch(hired,id,"BUY_DESTINATION",{period:s.currentPeriod}),hired);
  const empty=structuredClone(s);empty.destinationDeck=[];
  assert.equal(dispatch(empty,id,"BUY_DESTINATION",{period:s.currentPeriod}),empty);
  s=dispatch(s,id,"BUY_DESTINATION",{period:s.currentPeriod});
  assert.equal(s.players[id].money,cash-5);
  assert.equal(s.players[id].destinationHand.length,held+1);
  assert.equal(dispatch(s,id,"BUY_DESTINATION",{period:s.currentPeriod}),s);
  assert.ok(!s.events.at(-1)!.text.includes(s.players[id].destinationHand.at(-1)!));
  // Extra Engineering goal: same price and timing, never a goal already held, once per game.
  assert.equal(cardPurchaseBlocker(s,id,"destination"),"One extra Destination card per game.");
  assert.equal(cardPurchaseBlocker(s,id,"engineering"),undefined);
  assert.equal(dispatch(s,other,"BUY_ENGINEERING",{period:s.currentPeriod}),s);
  assert.equal(dispatch(s,id,"BUY_ENGINEERING",{period:s.currentPeriod-1}),s);
  const eng=structuredClone(s);const goals=eng.players[id].engineeringHand;eng.market.decks.engineering=[goals[0],"citywide-coverage",...eng.market.decks.engineering.filter(c=>c!=="citywide-coverage"&&!goals.includes(c))];
  const cashBefore=eng.players[id].money;
  const bought=dispatch(eng,id,"BUY_ENGINEERING",{period:s.currentPeriod});
  assert.equal(bought.players[id].money,cashBefore-5);
  assert.deepEqual(bought.players[id].engineeringHand,[...goals,"citywide-coverage"],"skips the goal already held");
  assert.ok(!bought.market.decks.engineering.includes("citywide-coverage"));
  assert.equal(bought.players[id].engineeringPurchased,true);
  assert.equal(dispatch(bought,id,"BUY_ENGINEERING",{period:s.currentPeriod}),bought,"once per game");
  assert.equal(cardPurchaseBlocker(bought,id,"engineering"),"One extra Engineering card per game.");
  const onlyHeld=structuredClone(s);onlyHeld.market.decks.engineering=[...onlyHeld.players[id].engineeringHand];
  assert.equal(dispatch(onlyHeld,id,"BUY_ENGINEERING",{period:s.currentPeriod}),onlyHeld,"no drawable goal");
  assert.equal(cardPurchaseBlocker(onlyHeld,id,"engineering"),"No cards left to draw.");
  const poorEng=structuredClone(s);poorEng.players[id].money=4;assert.equal(cardPurchaseBlocker(poorEng,id,"engineering"),"Needs $5M in cash.");
  const hiredEng=structuredClone(s);hiredEng.players[id].crewsHired=true;assert.equal(cardPurchaseBlocker(hiredEng,id,"engineering"),"Buy before hiring crews.");
  console.log("Extra Engineering purchase: price, timing, held-goal skip and once-per-game passed.");
}
{
  let s=base();s.phase="CONSTRUCTION";s.resolveQueue=["seat-1","seat-2"];
  const p=s.players["seat-1"];
  p.lines=[line([pt(0,0),pt(2,0),pt(5,0),pt(7,0)]),finished(pt(0,4),pt(12,4)),finished(pt(0,8),pt(12,8))];
  s=dispatch(s,p.id,"HIRE_CREWS",{lineIndexes:[0],period:1});
  const beforeCompletion=s.players[p.id].money;
  s=dispatch(s,p.id,"BUILD",{lineIndex:0,x:10,y:0});
  assert.equal(s.players[p.id].money,beforeCompletion+3,"completion pays once");
  assert.equal(dispatch(s,p.id,"BUILD",{lineIndex:0,x:10,y:0}),s,"duplicate build does not pay again");
  assert.equal(s.firstCompletedPlayerId,p.id);
  s=dispatch(s,p.id,"UNDO_PLACEMENT");
  assert.equal(s.players[p.id].money,beforeCompletion,"undo reverses completion reward");
  assert.equal(s.firstCompletedPlayerId,undefined,"undo restores the race opportunity");
}
{
  let s=startPlaytest(2,5).state;s.phase="CONSTRUCTION";s.resolveQueue=["seat-1","seat-2"];
  const st=s.stations.find(st=>st.kind==="minor" && st.x>2)!;
  assert.equal(st.cells!.length,6);
  const p=s.players["seat-1"];p.lines=[line([pt(st.x-2,st.y)])];p.crewsHired=true;p.pendingActions=[0];
  s=dispatch(s,p.id,"BUILD",{lineIndex:0,x:st.x,y:st.y,});
  assert.equal(s.players[p.id].lines[0].route.length,2);
  const node=s.players[p.id].lines[0].route[1];
  assert.equal(node.stationCapacity,undefined);
  assert.deepEqual(nodePoint(node),{x:st.x,y:st.y},"built segment uses the same exact peg as the preview");
}
assert.equal(SUBWAY_CONFIG.startingMoney,40);assert.equal(SUBWAY_CONFIG.timelinePeriods,9);
console.log("Network mission, 21 objective, border, deal/purchase, longest trail, race Undo and neighborhood geometry regressions passed.");
