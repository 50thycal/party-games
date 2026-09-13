import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractCard } from '../src/games/subway/cards';
import { contractById, subwayGame, validateNode, legalTargets, objectiveProgress, type PlayerLine, type SubwayState } from '../src/games/subway/config';
import { planBotCrews } from '../src/games/subway/botPlanning';
import { chooseBotAction, DEFAULT_BOT } from '../src/games/subway/bots';
import { missionPotential, engineeringPotential, objectiveExplanation } from '../src/games/subway/objectiveGuidance';
import { generateAiPlaytestReport, recordedReportContext } from '../src/games/subway/report';
import { newRecord } from '../src/games/subway/recording';
import { companionView, type CompanionStore } from '../src/games/subway/companion';
import { testRoom } from '../src/games/subway/playtest';

const room=testRoom(2), id=room.players[0].id;
const fixture=():SubwayState=>{const s=subwayGame.initialState(room.players);s.phase='CONSTRUCTION';s.currentPeriod=4;s.resolveQueue=[id];s.stations=[];return s;};
const line=(contractId:string,points:number[][]):PlayerLine=>({contractId,paid:0,start:1,route:points.map(([x,y])=>({x,y}))});

// GZZF's remaining-work state before Company 2 hires in round 4.
// Synthetic scenario using the recorded routes; not an exact replay of v20.
const s=fixture(), me=s.players[id]; me.money=9;
me.lines=[line('local',[[3,0],[2,2],[4,4],[6,3]]),line('crosstown',[[3,0]]),line('tram',[[3,0],[3,2],[6,2],[10,3]])];
assert.ok(planBotCrews(s,id).includes(1),'six-segment Purple must start with six rounds remaining');
assert.ok(planBotCrews(s,id,true).includes(1),'cautious policy also accounts for completion loss');
assert.ok((chooseBotAction(s,()=>.5,DEFAULT_BOT)?.payload?.lineIndexes as number[]).includes(1));

// One last profitable completion should be hired even with no current cash;
// the legal $1 crew and $3 completion reward leave positive final money.
const last=fixture();last.currentPeriod=9;last.players[id].money=0;
last.players[id].lines=[line('tram',[[3,0],[3,2],[6,2],[10,3]])];
assert.deepEqual(planBotCrews(last,id),[0]);
last.players[id].lines=[line('crosstown',[[3,0]])];
assert.deepEqual(planBotCrews(last,id),[],'do not pay for a completion that cannot fit');

const starters=fixture();starters.phase='STARTER_PLACEMENT';
starters.players[id].lines=[line('short',[[3,0]]),line('tram',[])];
const other=room.players[1].id;starters.players[other].lines=[line('local',[[5,0]])];
for(const target of [{x:3,y:0},{x:5,y:0}]) {
  assert.match(validateNode(starters,id,1,target,true)!,/empty hole/);
  assert.ok(!legalTargets(starters,id,1,true).some(p=>p.x===target.x&&p.y===target.y));
  assert.equal(subwayGame.reducer(starters,{playerId:id,type:'PLACE_STARTER',payload:{lineIndex:1,...target}},{room,playerId:id,now:()=>1,random:()=>.5}),starters);
}
starters.surveyPins=[{playerId:id,x:7,y:0}];
assert.match(validateNode(starters,id,1,{x:7,y:0},true)!,/empty hole/);
assert.equal(validateNode(starters,id,1,{x:4,y:0},true),null,'adjacent empty starter allowed');
assert.equal(validateNode(starters,id,0,{x:5,y:0},false),null,'ordinary construction may still share a peg');

const red=contractById('short')!;
for(const built of [0,3,4]) {
  const html=renderToStaticMarkup(<ContractCard contract={red} progress={{built,total:4}}/>);
  assert.equal((html.match(/— built/g)??[]).length,built);
  assert.equal((html.match(/ring-2 ring-offset-1/g)??[]).length,built===4?0:1);
  if(built===3) assert.match(html,/title="Segment 4: 3 pegs"/);
}

const goals=fixture(), p=goals.players[id];
goals.stations=[{id:'market',name:'Market',kind:'minor',x:1,y:1},{id:'university',name:'University',kind:'major',x:8,y:1}];
p.destinationHand=['dest-market-university'];
p.lines=[line('short',[[0,0],[1,1]]),line('tram',[[8,0],[8,1]])];
p.lines[0].route[1].stationId='market';p.lines[1].route[1].stationId='university';
assert.match(objectiveExplanation(p.destinationHand[0],goals,p),/no single physically connected/);
p.lines.pop();
assert.match(objectiveExplanation(p.destinationHand[0],goals,p),/Missing neighborhoods: University/);
const far=missionPotential(goals,p);
p.lines[0].route.push({x:4,y:1});
assert.ok(missionPotential(goals,p)>far,'move toward reachable missing destination');
p.engineeringHand=['bend'];
p.lines=[line('short',[[4,0]])];const wrongSide=engineeringPotential(goals,p);
p.lines=[line('short',[[0,4]])];assert.ok(engineeringPotential(goals,p)>wrongSide,'Turning the Corner favors a qualifying starter side');
assert.match(objectiveExplanation('bend',goals,p),/Qualifying count\/tier: 0/);
assert.match(objectiveExplanation('local-service',goals,p),/missing Market/);
assert.match(objectiveExplanation('solvent',goals,p),/at least \$5M/);
assert.match(objectiveExplanation('minimal',goals,p),/0\/0 placed Survey Pins/);
assert.match(objectiveExplanation('interchange',goals,p),/local transfer group/);
assert.match(objectiveExplanation('approach',goals,p),/large neighborhoods; incomplete/);
p.lines=[line('short',[[0,4],[2,4],[5,4],[7,4],[7,0]])];
assert.match(objectiveExplanation('bend',goals,p),/Partial tier awarded/);

// Doomed completion can still earn a destination: hire and actually choose it.
const mission=fixture();mission.currentPeriod=9;mission.players[id].money=10;
mission.stations=[{id:'market',name:'Market',kind:'minor',x:1,y:1},{id:'university',name:'University',kind:'major',x:4,y:1}];
mission.players[id].destinationHand=['dest-market-university'];
mission.players[id].lines=[line('crosstown',[[0,0],[1,1]])];
mission.players[id].lines[0].route[1].stationId='market';
assert.deepEqual(planBotCrews(mission,id),[0],'unfinished-line destination is worth hiring');
mission.players[id].crewsHired=true;mission.players[id].pendingActions=[0];
assert.deepEqual(chooseBotAction(mission,()=>.5)?.payload,{lineIndex:0,x:4,y:1});
const builtMission=subwayGame.reducer(mission,chooseBotAction(mission,()=>.5)!,{room,playerId:id,now:()=>1,random:()=>.5});
assert.notEqual(builtMission,mission,'objective BUILD accepted by reducer');
assert.equal(objectiveProgress('dest-market-university',builtMission.players[id],[],builtMission).points,4);
const shared=structuredClone(mission);shared.players[id].crewsHired=false;shared.players[id].pendingActions=[];
shared.players[id].money=3;
shared.players[id].lines.push({...structuredClone(shared.players[id].lines[0]),contractId:'medium'});
assert.equal(planBotCrews(shared,id).length,1,'two lines must not buy the same destination twice');

const record=newRecord(room,goals);record.botVersion='2';
record.actions=[{action:{type:'PROCURE',playerId:id},controller:'human',after:'',times:[],random:[]},{action:{type:'BUILD',playerId:id},controller:'bot',after:'',times:[],random:[]}];
const context=recordedReportContext(record,[{id,name:'Me',control:'human',bot:DEFAULT_BOT}]);
assert.match(generateAiPlaytestReport(goals,context),/Mixed human \+ bot/);
assert.match(generateAiPlaytestReport(goals),/Unknown/);
assert.match(generateAiPlaytestReport(goals,context),/Objective explanations/);
assert.match(generateAiPlaytestReport(goals,context),/balanced \/ experienced/);
const incomplete=structuredClone(record);
delete (incomplete.actions[1] as Partial<typeof incomplete.actions[number]>).controller;
const uncertain=recordedReportContext(incomplete);
assert.equal(uncertain.controllers?.[0].unknownActions,1);
assert.match(generateAiPlaytestReport(goals,uncertain),/Unknown \/ incomplete provenance/);
const store:CompanionStore={version:1,revision:0,devices:[],plans:{},recording:record};
const state={room,gameState:goals,subwayCompanion:store};
const device={role:'tablet' as const,tokenHash:'private',playerId:id,requests:[]};
assert.equal(companionView(state,device).reportContext,undefined,'no controller report pre-results');
goals.phase='RESULTS';
assert.deepEqual(companionView(state,device).reportContext?.controllers?.[0].humanActions,1);
assert.ok(!JSON.stringify(companionView(state,device).reportContext).includes('private'));
console.log('GZZF deadlines, completion economics, starter occupancy, segment rendering, objective guidance and report provenance passed.');
