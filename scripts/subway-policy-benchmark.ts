/** Small fresh-seed comparison; not a calibrated balance estimate. */
import assert from 'node:assert/strict';
import { subwayGame, nextCompanyId, lineComplete, objectiveProgress } from '../src/games/subway/config';
import { chooseBotAction, DEFAULT_BOT, BOT_VERSION } from '../src/games/subway/bots';
import { clearBotRouteCache } from '../src/games/subway/botRoutes';
import { testRoom, seededRandom } from '../src/games/subway/playtest';
import { newRecord, recordedReducer, replayRecord, fingerprint } from '../src/games/subway/recording';

const results=[];
for(const count of [2,3,4]) for(const seed of [91021,91022,91023]) for(const planning of [false,true]) {
  const room=testRoom(count),random=seededRandom(seed),decisions=seededRandom(seed+1);
  let state=subwayGame.initialState(room.players);const record=newRecord(room,state,'simulation');
  record.seed=seed;record.botVersion=planning?BOT_VERSION:`${BOT_VERSION}-no-lookahead`;clearBotRouteCache();
  const start=performance.now();
  const step=(action:Parameters<typeof recordedReducer>[1])=>{
    const next=recordedReducer(state,action,{room,playerId:action.playerId,random,now:()=>record.actions.length+1},record,'bot');
    assert.notEqual(next,state,`Rejected ${action.type}`);state=next;
  };
  step({type:'START_GAME',playerId:room.hostId});
  while(state.phase!=='RESULTS'&&record.actions.length<500) {
    const action=chooseBotAction(state,decisions,DEFAULT_BOT,undefined,planning);
    assert.ok(action,`No action for ${nextCompanyId(state)}`);
    if(action.type==='ADVANCE_SCORING') action.playerId=room.hostId;
    step(action);
  }
  const ms=Math.round(performance.now()-start);assert.equal(state.phase,'RESULTS');record.final=state;
  assert.equal(fingerprint(replayRecord(record)),fingerprint(state));
  results.push({count,seed,policy:planning?BOT_VERSION:`${BOT_VERSION}-no-lookahead`,ms,actions:record.actions.length,players:Object.values(state.players).map(p=>({
    score:p.score,cash:p.money,debt:Math.max(0,-p.money),unfinished:p.lines.filter(l=>!lineComplete(l)).length,
    cards:[...p.engineeringHand,...p.destinationHand].filter(c=>objectiveProgress(c,p,Object.values(state.players).filter(o=>o.id!==p.id),state).met).length
  }))});
}
console.log(JSON.stringify({description:'All seats use the named policy; paired initial seeds, 3 seeds per player count. Fresh-seed smoke comparison, not human calibration.',results},null,2));
