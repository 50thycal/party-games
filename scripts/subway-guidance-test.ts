import assert from "node:assert/strict";
import { phoneGuidance } from "../src/games/subway/guidance";
import { subwayGame, draftTurnId, basePriorityId, objectiveProgress, scoreGame, validateNode, contractById, type PlayerLine, type RouteNode } from "../src/games/subway/config";
import { testRoom } from "../src/games/subway/playtest";

for (const count of [2,3,4]) {
  const s=subwayGame.initialState(testRoom(count).players);
  s.oddPriorityId=s.playerOrder[0];
  for(let pick=0;pick<count*3;pick++) for(const stage of [0,1]) assert.equal(draftTurnId(s,pick,stage),s.playerOrder[pick%count]);
  for(let round=1;round<=9;round++) assert.equal(basePriorityId(s,round),s.playerOrder[0]);
  s.phase="PROCUREMENT";
  for(const id of s.playerOrder) assert.equal(phoneGuidance(s,id).tab,"lines");
  s.phase="ENGINEERING";s.engineeringStep="CARD_DRAFT";
  for(const id of s.playerOrder) {assert.equal(phoneGuidance(s,id).tab,"engineering");assert.match(phoneGuidance(s,id).text,/Engineering/);}
  s.engineeringStep="BUY_SURVEYS";
  assert.equal(phoneGuidance(s,s.playerOrder[0]).tab,"general");
  s.players[s.playerOrder[0]].engineeringLocked=true;
  assert.equal(phoneGuidance(s,s.playerOrder[0]).tab,"destinations");
  s.phase="STARTER_PLACEMENT";
  assert.equal(phoneGuidance(s,s.playerOrder[0]).tab,"lines");
  s.phase="CONSTRUCTION";s.resolveQueue=[s.playerOrder[0]];
  assert.match(phoneGuidance(s,s.playerOrder[0]).text,/crews/);
  s.players[s.playerOrder[0]].crewsHired=true;
  assert.match(phoneGuidance(s,s.playerOrder[0]).text,/confirm each/);
  s.phase="RESULTS";assert.equal(phoneGuidance(s,s.playerOrder[0]).tab,"general");
}
{
  const s=subwayGame.initialState(testRoom(2).players), me=s.players[s.playerOrder[0]];
  const line=(end:RouteNode):PlayerLine=>({contractId:"short",paid:5,route:[{x:0,y:2},{x:3,y:3},{x:4,y:4},{x:3,y:5},end]});
  for(const [id,end] of [["straight",{x:0,y:6}],["bend",{x:8,y:0}],["terminal",{x:8,y:3,stationId:"market"}]] as [string,RouteNode][]) {
    for(let n=0;n<=3;n++) {
      me.lines=Array.from({length:n},()=>line(end));
      const p=objectiveProgress(id,me,[],s);
      assert.equal(p.points,[0,2,4,p.max][n]);
      assert.equal(p.met,n===3);
    }
  }
  me.lines=[line({x:0,y:6})];me.engineeringHand=["straight"];
  assert.equal(scoreGame(s,1234).players[me.id].scoreBreakdown!.find(p=>p.label==="Loop")!.points,2,"partial points enter the real score ledger");
  me.lines[0].route.pop();
  assert.equal(objectiveProgress("straight",me,[],s).points,0,"Undo recomputes completion tiers");
  for(let n=0;n<=3;n++) {
    me.lines=Array.from({length:n},(_,i)=>line([{x:5,y:0},{x:26,y:3},{x:12,y:8}][i]));
    assert.equal(objectiveProgress("gentle",me,[],s).points,[0,2,4,6][n]);
    me.lines=Array.from({length:n},(_,i)=>({...line({x:8+i,y:8}),route:[{x:8+i,y:0},{x:8+i,y:8}]}));
    assert.equal(objectiveProgress("through",me,[],s).points,[0,2,4,7][n]);
    me.lines=Array.from({length:n},(_,i)=>{const l=line({x:8+i,y:8});l.route[0]=[{x:0,y:3},{x:8,y:0},{x:26,y:3}][i];return l;});
    assert.equal(objectiveProgress("three-fronts",me,[],s).points,[0,2,4,7][n]);
  }
  me.lines=[{contractId:"short",paid:5,route:[{x:0,y:0}]}];
  assert.equal(objectiveProgress("crosstown-service",me,[],s).points,0,"a starter alone does not earn geographic progress");
  assert.equal(objectiveProgress("four-corners",me,[],s).points,0);
  me.lines[0].route.push({x:4,y:2});
  assert.equal(objectiveProgress("crosstown-service",me,[],s).points,2);
  assert.equal(objectiveProgress("four-corners",me,[],s).points,2);
  me.lines[0].route.push({x:26,y:8});
  assert.equal(objectiveProgress("crosstown-service",me,[],s).points,4);
  assert.equal(objectiveProgress("four-corners",me,[],s).points,4);
  // Legal recipe candidate crosses an earlier same-color segment (not a node).
  me.lines=[{contractId:"short",paid:5,route:[{x:4,y:2},{x:6,y:4},{x:7,y:2}]}];
  s.stations=[];
  assert.match(validateNode(s,me.id,0,{x:3,y:4})??"",/own color/);
  // Same geometry on a different company line is permitted when recipe/turn fit.
  me.lines=[{contractId:"short",paid:5,route:[{x:7,y:2}]}];
  const required=contractById("short")!.recipe[0];
  me.lines.push({contractId:"long",paid:5,route:[{x:7-required/2,y:1},{x:7-required/2,y:3}]});
  assert.equal(validateNode(s,me.id,0,{x:7-required,y:2}),null);
}
console.log("Phone phase guidance, cyclic turns, objective tiers and same-color geometry checks passed.");
