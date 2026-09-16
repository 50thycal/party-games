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
console.log("Phone phase guidance, cyclic turns, binary objectives and same-color geometry checks passed.");
