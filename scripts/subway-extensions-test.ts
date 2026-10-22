import assert from 'node:assert/strict';
import { subwayGame, SUBWAY_CONFIG, LINE_CONTRACTS, buildableLines, legalTargets, nextCompanyId, pendingStarters, constructionExhausted, extensionCount, extensionEligible, lineComplete, type SubwayState, type SubwayAction } from '../src/games/subway/config';
import { validatePath, findBendMove } from '../src/games/subway/bends';
import { testRoom, seededRandom } from '../src/games/subway/playtest';
import { chooseBotAction } from '../src/games/subway/bots';
import { newRecord, recordedReducer, replayRecord, fingerprint } from '../src/games/subway/recording';
const room=testRoom(2),id=room.players[0].id,other=room.players[1].id;
const ctx={room,playerId:id,now:()=>1,random:seededRandom(73)};
const send=(s:SubwayState,type:SubwayAction['type'],payload?:SubwayAction['payload'],playerId=id)=>subwayGame.reducer(s,{type,playerId,payload},{...ctx,playerId});
function fixture():SubwayState {
 const s=subwayGame.initialState(room.players);s.phase='CONSTRUCTION';s.currentPeriod=6;s.resolveQueue=[id,other];s.stations=[];
 s.players[id].lines=LINE_CONTRACTS.slice(0,3).map((c,i)=>{let x=0;return {contractId:c.id,paid:c.cost,route:[{x,y:i*3},...c.recipe.map(n=>({x:x+=n,y:i*3}))]};});
 s.players[id].money=0;s.players[id].crewsHired=false;s.players[id].pendingActions=[];
 return s;
}
// Paid extensions are retired (DEC-068): a company with every line finished has nothing to build,
// but keeps a short turn each round to buy its optional cards, then ends it.
let s=fixture();
assert.equal(SUBWAY_CONFIG.extensionsEnabled,false);
assert.ok(!extensionEligible(s.players[id]));
assert.deepEqual(buildableLines(s,id),[],'finished lines cannot be hired');
const original=structuredClone(s.players[id].lines[0]);const end=original.route.at(-1)!;
assert.ok(validatePath(s,id,0,[{x:end.x,y:1}]),'no placement beyond a finished contract');
assert.equal(send(s,'HIRE_CREWS',{lineIndexes:[0],period:6}),s,'cannot hire a crew for a finished line');
assert.equal(send(s,'BUILD',{lineIndex:0,x:end.x,y:1,period:6,expectedNodes:original.route.length}),s,'cannot build past the contract');
s.players[id].money=5;s.market.decks.engineering=['north-south'];
const bought=send(s,'BUY_ENGINEERING',{period:6});assert.notEqual(bought,s,'a finished company can still buy its extra card');
assert.equal(bought.players[id].money,5-SUBWAY_CONFIG.engineeringPurchaseCost);
const waited=send(bought,'HIRE_CREWS',{lineIndexes:[],period:6});assert.equal(waited.resolveQueue[0],other,'hiring no crews ends the turn');
assert.equal(waited.players[id].money,bought.players[id].money,'waiting is free');
assert.ok(constructionExhausted(s),'when nobody can build, construction ends early');
const rivalLine=()=>[{contractId:LINE_CONTRACTS[3].id,paid:0,route:[{x:26,y:8}]}];
const busy=fixture();busy.players[other].lines=rivalLine();assert.ok(!constructionExhausted(busy),'a finished company does not end play while another can build');
// Completing the last line leaves only the short turn from then on.
let completing=fixture();completing.players[other].lines=rivalLine();const last=completing.players[id].lines[2].route.pop()!;completing.players[id].crewsHired=true;completing.players[id].pendingActions=[2];
completing=send(completing,'BUILD',{lineIndex:2,...last});assert.equal(completing.resolveQueue[0],other);
assert.equal(completing.players[id].money,SUBWAY_CONFIG.completionReward,'completion cash still pays');
completing=send(completing,'HIRE_CREWS',{lineIndexes:[],period:6},other);assert.equal(completing.currentPeriod,7);
assert.equal(send(completing,'HIRE_CREWS',{lineIndexes:[0],period:7}),completing);
assert.equal(send(completing,'HIRE_CREWS',{lineIndexes:[],period:7}).resolveQueue[0],other);
// Full real-action drafts and games: no company ever builds past its contract.
let extensions=0;
for(const count of [2,3,4]) {
 const r=testRoom(count),random=seededRandom(700+count);let game=subwayGame.initialState(r.players);const record=newRecord(r,game,'bots');let ticks=0;
 const act=(a:SubwayAction)=>{const next=recordedReducer(game,a,{room:r,playerId:a.playerId,now:()=>++ticks,random},record,'bot');assert.notEqual(next,game,`accepted ${a.type}`);game=next;};
 act({type:'START_GAME',playerId:r.hostId,payload:{}});
 for(let n=0;n<400&&game.phase!=='RESULTS';n++) {
  const actor=nextCompanyId(game)!,p=game.players[actor];let a:SubwayAction;
  if(game.phase==='STARTER_PLACEMENT') {
   const lineIndex=pendingStarters(p)[0],x=game.playerOrder.indexOf(actor)*6+lineIndex*2;
   assert.ok(legalTargets(game,actor,lineIndex,true).some(t=>t.x===x&&t.y===0));a={type:'PLACE_STARTER',playerId:actor,payload:{lineIndex,x,y:0}};
  } else if(game.phase==='CONSTRUCTION') {
   if(!p.crewsHired)a={type:'HIRE_CREWS',playerId:actor,payload:{lineIndexes:buildableLines(game,actor),period:game.currentPeriod}};
   else {
    // Exact lengths (DEC-063), delayed bends (DEC-065): take the reducer's own first legal move,
    // which may be a stop at a bend.
    const lineIndex=p.pendingActions[0],move=findBendMove(game,actor,lineIndex),to=move?.points.at(-1);
    a=to?{type:'BUILD',playerId:actor,payload:{lineIndex,x:to.x,y:to.y,pause:move!.pause}}:{type:'SKIP_ACTION',playerId:actor,payload:{lineIndex}};
   }
  } else a=chooseBotAction(game,random,undefined,undefined,false)!;
  if(a.type==='BUILD'&&p.lines[a.payload!.lineIndex!]&&lineComplete(p.lines[a.payload!.lineIndex!]))extensions++;act(a);
 }
 assert.equal(game.phase,'RESULTS');assert.ok(Object.values(game.players).every(p=>p.lines.length===3&&p.lines.every(l=>extensionCount(l)===0)));record.final=game;assert.equal(fingerprint(replayRecord(record)),fingerprint(game));
}
assert.equal(extensions,0,'no company builds past its contract');
assert.equal(findBendMove(fixture(),id,0),undefined);
console.log('Paid extensions retired: finished companies cannot build, keep a short turn to buy cards, and 2/3/4-player games complete and replay.');
