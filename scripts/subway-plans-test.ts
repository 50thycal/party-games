import assert from "node:assert/strict";
import { loadPlan, savePlan, clearPlan, planStorageKey, preparePlan, reconcilePlan } from "../src/games/subway/plans";
import { legalTargets, nextCompanyId, pendingStarters, stationAt, SUBWAY_STATE_VERSION, type RouteNode } from "../src/games/subway/config";
import { runPlaytest } from "../src/games/subway/playtest";

const storage = new Map<string,string>();
let fail = false;
Object.defineProperty(globalThis, "window", {configurable:true, value:{localStorage:{
  getItem:(key:string) => {if(fail) throw new Error("Unavailable");return storage.get(key) ?? null;},
  setItem:(key:string,value:string) => {if(fail) throw new Error("Unavailable");storage.set(key,value);},
  removeItem:(key:string) => {if(fail) throw new Error("Unavailable");storage.delete(key);},
}}});

for (const count of [2,3,4]) {
  const {state:game} = runPlaytest(count,7,"STARTER_PLACEMENT");
  const id=nextCompanyId(game)!;
  const li=pendingStarters(game.players[id])[0];
  const contract=game.players[id].lines[li].contractId;
  const before=JSON.stringify(game);
  const projected=structuredClone(game);
  const route=projected.players[id].lines[li].route;
  for(let i=0;i<3;i++) {
    const t=legalTargets(projected,id,li,route.length===0)[0];
    assert.ok(t,"fixture must have a legal plan target");
    const station=stationAt(t,game.stations);
    route.push({x:t.x,y:t.y,...(station ? {stationId:station.id,stationSlot:t.slot ?? 0} : {})});
  }
  assert.equal(savePlan("test",id,contract,route),true);
  const saved=loadPlan("test",id,contract)!;
  assert.deepEqual(saved.nodes,route,"save/reload retains full route including starter");
  assert.equal(loadPlan("other-game",id,contract),null);
  assert.equal(loadPlan("test","other-player",contract),null);
  assert.equal(loadPlan("test",id,"other-line"),null);
  const prepared=preparePlan(game,id,li,saved);
  assert.equal(prepared.base.length,0);
  assert.equal(prepared.nodes.length,3);
  assert.equal("preview" in prepared,false,"restoring a ghost never selects a live build target");
  prepared.nodes[0].x=99;
  assert.notEqual(saved.nodes[0].x,99,"editable sketches do not mutate saved intent");
  const built=structuredClone(game);
  built.players[id].lines[li].route=[{...route[0]}];
  assert.equal(reconcilePlan(built,id,li,route).matched,1);
  assert.equal(reconcilePlan(built,id,li,route).phantom.length,2);
  assert.equal("preview" in preparePlan(built,id,li,saved),false,"a later turn also starts without a live target");
  const divergent=structuredClone(game);
  divergent.players[id].lines[li].route=[{x:26,y:8}];
  assert.equal(reconcilePlan(divergent,id,li,route).stale,true);
  assert.deepEqual(preparePlan(divergent,id,li,saved).nodes,divergent.players[id].lines[li].route,"stale plans cannot supply a build sketch");
  assert.equal(JSON.stringify(game),before,"planning never changes authoritative state");
  assert.equal(clearPlan("test",id,contract),true);
  assert.equal(loadPlan("test",id,contract),null);
}

const key=planStorageKey("test","player","contract");
for(const value of ["{broken",JSON.stringify({v:SUBWAY_STATE_VERSION-1,nodes:[{x:0,y:0}]}),JSON.stringify({v:SUBWAY_STATE_VERSION,nodes:[{x:-1,y:0}]}),JSON.stringify({v:SUBWAY_STATE_VERSION,nodes:Array(25).fill({x:0,y:0})})]) {
  storage.set(key,value);
  assert.equal(loadPlan("test","player","contract"),null,"bad storage fails closed");
}
fail=true;
assert.equal(loadPlan("test","player","contract"),null);
assert.equal(savePlan("test","player","contract",[{x:0,y:0}] as RouteNode[]),false);
assert.equal(clearPlan("test","player","contract"),false);
delete (globalThis as {window?:unknown}).window;
console.log("Saved planning: 2/3/4-seat starter, reload, isolation, prefix, stale, corruption and storage failure checks passed.");
