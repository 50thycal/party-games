import assert from "node:assert/strict";
import { borderSides, distinctSides, longestNetwork } from "../src/games/subway/network";
import { DESTINATION_CARDS, ENGINEERING_CARDS, LINE_CONTRACTS, SUBWAY_CONFIG, contractNodes, contractById, destinationMet, nodePoint, objectiveMet, scoreGame, subwayGame, type PlayerLine, type RouteNode, type SubwayState, type SubwayAction } from "../src/games/subway/config";
import { runPlaytest, startPlaytest, testRoom } from "../src/games/subway/playtest";

const dispatch = (s:SubwayState, id:string, type:SubwayAction["type"], payload?:SubwayAction["payload"]) => subwayGame.reducer(s,{playerId:id,type,payload},{room:testRoom(s.playerOrder.length),playerId:id,now:()=>1234,random:()=>.2});
const line = (nodes:RouteNode[], id="short"):PlayerLine => ({contractId:id,paid:5,start:1,route:nodes});
const pt = (x:number,y:number):RouteNode => ({x,y});
const station = (id:string,x:number,y:number,slot=0):RouteNode => ({x,y,stationId:id,stationSlot:slot});
// Scoring fixtures deliberately isolate predicates from recipe geometry.
const finished = (start:RouteNode,end:RouteNode,id="short") => line([start,pt(5,3),pt(8,4),pt(11,4),end].slice(0,contractNodes(contractById(id)!)),id);
const base = () => subwayGame.initialState(testRoom(2).players);
const met = (id:string,s:SubwayState) => objectiveMet(id,s.players["seat-1"],[s.players["seat-2"]],s);

assert.equal(ENGINEERING_CARDS.length,16);
assert.equal(new Set(ENGINEERING_CARDS.map(c=>c.id)).size,16);
assert.equal(ENGINEERING_CARDS.some(c=>c.id==="parallel"),false);
assert.equal(new Set(LINE_CONTRACTS.map(c=>c.code)).size,12);
assert.ok(LINE_CONTRACTS.every(c=>/^[A-Z]{2}$/.test(c.code)));
assert.deepEqual(new Set(LINE_CONTRACTS.map(c=>c.name)),new Set(["Red","Blue","Green","Yellow","Orange","Purple","Pink","Black","White","Gray","Teal","Brown"].map(c=>`${c} Line`)));
assert.equal(DESTINATION_CARDS.length,30);
assert.equal(new Set(DESTINATION_CARDS.map(c=>c.id)).size,30);
assert.ok(DESTINATION_CARDS.every(c=>c.vp===(c.stationIds.length===2?4:7)));

assert.deepEqual(borderSides(pt(1,1)),[]);
assert.deepEqual(borderSides(pt(0,0)),["north","west"]);
assert.equal(distinctSides([pt(0,0),pt(0,0),pt(26,8)],3),false,"one corner peg cannot count twice");
assert.equal(distinctSides([pt(0,0),pt(26,0),pt(0,8)],3),true,"corners allow a distinct-side assignment");
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[finished(pt(0,1),pt(5,0)),finished(pt(26,3),pt(26,6)),finished(pt(0,6),pt(12,8))];
  assert.equal(met("gentle",s),true);
  p.lines[1].route.at(-1)!.x=25;
  assert.equal(met("gentle",s),false,"near an edge is not a border endpoint");
  p.lines[1].route[p.lines[1].route.length-1]=pt(10,0);
  assert.equal(met("gentle",s),false,"two north ends do not cover three sides");
  assert.equal(met("bend",s),true);
  p.lines[0].route[0]=pt(1,1);
  assert.equal(met("bend",s),false,"start must be on east/west border");
  p.lines=[finished(pt(0,1),pt(0,7)),finished(pt(5,0),pt(18,0)),finished(pt(26,2),pt(26,6))];
  assert.equal(met("straight",s),true);
  p.lines[0].route.at(-1)!.x=1;
  assert.equal(met("straight",s),false);
  p.lines=[finished(pt(0,1),pt(6,8)),finished(pt(10,0),pt(12,8)),finished(pt(26,2),pt(20,8))];
  assert.equal(met("three-fronts",s),true);
  p.lines[2].route.at(-1)!.y=7;
  assert.equal(met("three-fronts",s),false);
  p.lines=[finished(pt(2,0),pt(2,8)),finished(pt(8,0),pt(8,8)),finished(pt(16,0),pt(16,8))];
  assert.equal(met("through",s),true);
  p.lines[2].route[0].y=1;
  assert.equal(met("through",s),false);
  p.lines=[line([pt(0,3),pt(3,1),pt(5,0),pt(10,2),pt(26,4)])];
  assert.equal(met("perimeter",s),false,"one line is only the first tier");
  p.lines[0].route.pop();
  assert.equal(met("perimeter",s),false,"line must be complete");
  p.lines=[finished(pt(2,4),pt(24,4))];
  assert.equal(met("crosstown-service",s),false,"near-border nodes never qualify");
  p.lines[0].route[0].x=3;
  assert.equal(met("crosstown-service",s),false);
}
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[finished(station("grand",5,3),station("airport",20,3))];
  assert.equal(met("approach",s),false,"two large areas are insufficient");
  p.lines[0].route[2].stationId="museum";
  assert.equal(met("approach",s),true);
  p.lines[0].route.at(-1)!.stationId="grand";
  assert.equal(met("approach",s),false,"must visit different majors");
  p.lines=[finished(pt(0,1),station("grand",10,4)),finished(pt(0,3),station("grand",10,4,1)),finished(pt(26,2),station("museum",20,4))];
  assert.equal(met("terminal",s),false,"Citywide Service needs ten areas");
  assert.equal(met("interchange",s),false,"all three lines required at two seats");
  p.lines[2].route[p.lines[2].route.length-1]=station("grand",11,4);
  assert.equal(met("interchange",s),true,"shared/adjacent nodes form a hub");
  s.playerOrder.push("third");
  assert.equal(met("interchange",s),true,"same rule at three seats");
  p.lines=[line([station("market",3,1),station("garden",6,1)]),line([station("library",22,3)])];
  assert.equal(met("local-service",s),false,"all three small areas must be on one line");
  p.lines[0].route.push(station("library",22,3));
  assert.equal(met("local-service",s),true,"one unfinished line serving three small areas qualifies");
  p.lines[0].route[2].stationId="garden";
  assert.equal(met("local-service",s),false,"repeated small area only counts once");
}
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[finished(pt(0,1),pt(7,7)),finished(pt(0,3),pt(9,7)),finished(pt(0,6),pt(12,7))];
  p.money=5;
  assert.equal(met("solvent",s),true);
  p.money=4;assert.equal(met("solvent",s),false);
  assert.equal(met("minimal",s),false);
  s.surveyPins=[{playerId:p.id,x:5,y:3}];assert.equal(met("minimal",s),true);
  s.surveyPins[0].playerId="seat-2";assert.equal(met("minimal",s),false);
  assert.equal(met("crossing",s),false);
  s.firstCompletedPlayerId=p.id;assert.equal(met("crossing",s),true);
  s.firstCompletedPlayerId="seat-2";assert.equal(met("crossing",s),false);
}
{
  const s=base(),p=s.players["seat-1"];
  p.lines=[line([station("garden",2,2),pt(4,2)]),line([pt(4,2),station("market",8,2)]),line([station("market",8,2,1),station("grand",12,2)])];
  const pair=DESTINATION_CARDS.find(c=>c.stationIds.length===2&&c.stationIds.includes("market")&&c.stationIds.includes("grand"))!;
  const triple=DESTINATION_CARDS.find(c=>c.stationIds.length===3&&["garden","market","grand"].every(id=>c.stationIds.includes(id)))!;
  assert.equal(destinationMet(p,pair.id),true);
  assert.equal(destinationMet(p,triple.id),true,"unfinished lines can provide a mission path");
  assert.equal(met("network",s),false,"Integrated Network additionally requires all lines complete");
  p.destinationHand=[pair.id,triple.id];
  const scored=scoreGame(s,1).players[p.id];
  assert.equal(scored.scoreBreakdown!.find(i=>i.label===pair.name)!.points,4);
  assert.equal(scored.scoreBreakdown!.find(i=>i.label===triple.name)!.points,7);
  p.lines[2].route[0]=pt(10,2);
  assert.equal(destinationMet(p,pair.id),false,"separated lines do not satisfy a mission");
  s.players["seat-2"].lines=[line([pt(8,2),pt(10,2)])];
  assert.equal(destinationMet(p,pair.id),false,"opponents cannot supply a connection");
  p.lines=[line([pt(0,0),pt(5,3)]),line([pt(5,3),pt(16,5)]),line([pt(16,5),pt(26,8)])];
  assert.equal(met("four-corners",s),false,"opposite corners earn the first tier, not full completion");
  p.lines[2].route.at(-1)!.x=25;assert.equal(met("four-corners",s),false,"exact opposite corner required");
  p.lines=[line([pt(26,0),pt(18,3)]),line([pt(18,3),pt(8,5)]),line([pt(8,5),pt(0,8)])];
  assert.equal(met("four-corners",s),false,"other diagonal is also first tier");
  p.lines.push(line([pt(0,1),pt(1,1)]));assert.equal(met("four-corners",s),false);
  p.lines=[finished(pt(0,0),pt(7,7)),finished(pt(7,7),pt(19,7)),finished(pt(19,7),pt(26,8))];
  assert.equal(met("network",s),true);
  p.lines[2].route=[pt(21,7),pt(22,7),pt(23,7),pt(24,7),pt(26,8)];
  assert.equal(met("network",s),false);
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
  assert.equal(met("crossing",s),true);
  s=dispatch(s,p.id,"UNDO_PLACEMENT");
  assert.equal(s.players[p.id].money,beforeCompletion,"undo reverses completion reward");
  assert.equal(s.firstCompletedPlayerId,undefined,"undo restores the race opportunity");
  assert.equal(met("crossing",s),false);
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
console.log("Network mission, 16 objective, border, deal/purchase, longest trail, race Undo and neighborhood geometry regressions passed.");
