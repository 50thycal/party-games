import {CrewBoard} from "../src/games/subway/CrewBoard";
import {BuildCostPreview} from "../src/games/subway/BuildCostPreview";
import {SubwayGameView} from "../src/games/subway/GameView";
import {phoneGuidance} from "../src/games/subway/guidance";
import {Board, holePos} from '../src/games/subway/board';
import {BendModeSelect} from '../src/games/subway/BendModeSelect';
import { PhoneStatus, PlayerPads } from '../src/games/subway/PlayerStatus';
import { DestinationCardFace } from '../src/games/subway/CardArt';
import { GLYPH_COVERAGE, NEIGHBORHOOD_ABBREVIATIONS } from '../src/games/subway/CardGlyphs';
import { CashSpectrum } from '../src/games/subway/CashSpectrum';
import { lookaheadTargets } from '../src/games/subway/lookahead';
import { cashBand, cashScore } from '../src/games/subway/config';
import { validatePath } from '../src/games/subway/bends';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractCard } from '../src/games/subway/cards';
import { SUBWAY_CONFIG, contractById, subwayGame, validateNode, legalTargets, objectiveProgress, type PlayerLine, type SubwayState } from '../src/games/subway/config';
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
if(SUBWAY_CONFIG.crewDebtAllowed) assert.deepEqual(planBotCrews(last,id),[0]);
else {
  assert.deepEqual(planBotCrews(last,id),[],'crews are paid from cash on hand: a $0 company cannot hire');
  last.players[id].money=1;assert.deepEqual(planBotCrews(last,id),[0],'the affordable last crew is still hired');last.players[id].money=0;
}
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
assert.equal(validateNode(starters,id,1,{x:7,y:0},true),null);
assert.equal(validateNode(starters,id,1,{x:4,y:0},true),null,'adjacent empty starter allowed');
assert.match(validateNode(starters,id,0,{x:5,y:0},false)!,/occupied/,'ordinary construction cannot stack either');

const red=contractById('short')!;
for(const built of [0,3,4]) {
  const html=renderToStaticMarkup(<ContractCard contract={red} progress={{built,total:4}}/>);
  assert.equal((html.match(/— built/g)??[]).length,built);
  assert.equal((html.match(/ring-2 ring-offset-1/g)??[]).length,built===4?0:1);
  if(built===3) assert.match(html,/title="Segment 4: 3 peg spaces"/);
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
p.engineeringHand=['turning-corner'];
p.lines=[line('short',[[0,4],[2,4],[5,4],[7,4],[7,0]])];
assert.match(objectiveExplanation('turning-corner',goals,p),/Currently met: 3\/3 VP/);
p.lines[0].route.pop();
assert.match(objectiveExplanation('turning-corner',goals,p),/Not yet met: 0\/3 VP/);

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

// Public pads contain ownership/cash only; private phone adds peg progress.
{
 const s=fixture();s.players[id].lines=[line('short',[[0,0],[2,0],[5,0]])];
 const phone=renderToStaticMarkup(<PhoneStatus game={s} playerId={id}/>);
 assert.match(phone,/2 stations and 2 segments left/);assert.doesNotMatch(phone,/Diamond = starter|Public leaders|segments ·/);
 const details=renderToStaticMarkup(<PhoneStatus game={s} playerId={id} details/>);
 assert.match(details,/2\/4 segments/);assert.match(details,/Diamond = starter/);assert.match(details,/Public leaders/);
 const pads=renderToStaticMarkup(<PlayerPads game={s} roomKey="fixture"/>);
 assert.match(pads,/Player panels/);assert.doesNotMatch(pads,/segments left|Diamond = starter/);
 // Public card glyphs: one per held Engineering card with its category, one chip per Destination.
 assert.ok(GLYPH_COVERAGE,'every Engineering card has a drawn glyph');
 const carded=structuredClone(s);carded.players[id].engineeringHand=['north-south','shared-stations','citywide-coverage'];carded.players[id].destinationHand=['dest-market-grand','dest-stadium-harbor'];
 const withCards=renderToStaticMarkup(<PlayerPads game={carded} roomKey="fixture"/>);
 assert.equal((withCards.match(/data-engineering-glyph=/g)??[]).length,3);
 for(const category of ['Line','Station','Neighborhood']) assert.match(withCards,new RegExp(`data-glyph-category="${category}"`));
 assert.match(withCards,/data-destination-chip="dest-market-grand"[^>]*>Mk\+GC</);assert.match(withCards,/>S\+H</);
 assert.equal(new Set(Object.values(NEIGHBORHOOD_ABBREVIATIONS)).size,10,'abbreviations are unique');
 assert.doesNotMatch(pads,/data-engineering-glyph/,'no glyph row for empty hands');
 // DEC-063: a waiting company's cards stay off the shared pads until results.
 const waiting=structuredClone(carded);waiting.resolveQueue=[room.players[1].id];
 assert.doesNotMatch(renderToStaticMarkup(<PlayerPads game={waiting} roomKey="fixture"/>),/data-engineering-glyph|data-destination-chip/);
 waiting.phase='RESULTS';assert.equal((renderToStaticMarkup(<PlayerPads game={waiting} roomKey="fixture"/>).match(/data-engineering-glyph=/g)??[]).length,3);
 const destination=renderToStaticMarkup(<DestinationCardFace card="dest-market-grand" color="#fff"/>);
 assert.match(destination,/Complete to earn \$2M/);
 assert.match(renderToStaticMarkup(<DestinationCardFace card="dest-market-grand" paid color="#fff"/>),/Earned \$2M/);
 assert.match(destination,/Any order/);assert.match(destination,/Market/);assert.match(destination,/Grand Central/);
 assert.match(destination,/Pays \$2M the first time/);assert.doesNotMatch(destination,/Connect these neighborhoods through your own network\./,'slim face drops the description paragraph');
 assert.equal((destination.match(/data-engineering-art="dest-/g)??[]).length,2,'one picture per neighborhood');
 assert.match(renderToStaticMarkup(<PhoneStatus game={s} playerId={id}/>),/>R4</,'phone header carries the round badge');
}

// Bent strings follow actual legs; vertices are never rendered as scoring pegs.
{
 const b=fixture();b.bendMode='tokens';b.players[id].bendTokens=2;
 const l={contractId:'short',paid:5,route:[{x:0,y:0},{x:1,y:1,via:[{x:1,y:0}]}]};b.players[id].lines=[l];
 const props={game:b,targets:[],following:[],canAct:false,onTapHole:()=>{},drawn:[{key:'test',...l,contract:contractById('short')!,ownerColor:'red',active:true,growing:true}]};
 const html=renderToStaticMarkup(<Board {...props}/>);
 assert.equal((html.match(/data-route-kind="built"/g)??[]).length,2);
 assert.equal((html.match(/data-peg-kind="built"/g)??[]).length,2);
 const a=holePos({x:0,y:0}),z=holePos({x:1,y:1});
 assert.ok(!html.includes(`x1="${a.x}" y1="${a.y}" x2="${z.x}" y2="${z.y}"`),'no chord between endpoints');
 const work=renderToStaticMarkup(<Board {...props} drawn={[{...props.drawn[0],route:[{x:0,y:0}],work:[{x:1,y:0}]}]}/>);
 assert.equal((work.match(/data-peg-kind="built"/g)??[]).length,1);assert.match(work,/data-worksite="true"/);
 assert.match(renderToStaticMarkup(<PhoneStatus game={b} playerId={id} details/>),/2 bend tokens/);
 const options=renderToStaticMarkup(<BendModeSelect value="tokens" onChange={()=>{}}/>);
 assert.equal((options.match(/<option/g)??[]).length,2);assert.match(options,/value="tokens" selected/);assert.doesNotMatch(options,/value="straight"/);
 console.log('Bend UI: setup options, phone resources, physical legs, worksite and real-peg rendering passed.');
}

// QNHT: outstanding hired lines pulse; spent activations and other companies do not.
{
 const q=fixture();q.phase='PROCUREMENT';
 const board=renderToStaticMarkup(<SubwayGameView state={q} room={room} playerId="" isHost boardOnly dispatchAction={async()=>{}}/>);
 assert.doesNotMatch(board,/spectating this transit contest|Phase lesson|Fit board|Zoom in|Zoom out/);
 assert.match(board,/aria-label="Settings"/);assert.match(board,/Focus Pegboard/);assert.match(board,/Focus Construction schedule/);
}
{
 const q=fixture(),p=q.players[id];p.lines=[line('short',[[0,0]]),line('tram',[[4,0]])];
 p.crewsHired=true;p.pendingActions=[0,1];
 const status=()=>renderToStaticMarkup(<PhoneStatus game={q} playerId={id}/>);
 assert.equal((status().match(/data-hired-line=/g)??[]).length,2);
 p.pendingActions=[1];assert.equal((status().match(/data-hired-line=/g)??[]).length,1);
 q.resolveQueue=[other];assert.doesNotMatch(status(),/data-hired-line=/);
 assert.equal(renderToStaticMarkup(<BuildCostPreview game={q} player={p} contacts={[]}/>),'');
 const pads=renderToStaticMarkup(<PlayerPads game={q} roomKey="qnht"/>);
 assert.equal((pads.match(/aria-current="step"/g)??[]).length,1);
 assert.match(pads,/2\.6s ease-in-out/);assert.match(pads,/-72px/);assert.match(pads,/prefers-reduced-motion/);
 q.phase='RESULTS';assert.doesNotMatch(renderToStaticMarkup(<PlayerPads game={q} roomKey="qnht"/>),/aria-current="step"/);
}
// QNHT: overlapping card targets share an evenly split color; no cryptic badges.
{
 const q=subwayGame.initialState(room.players),area=q.stations[0];
 const props={game:q,targets:[{x:0,y:0},{x:1,y:0}],following:[],canAct:true,onTapHole:()=>{},drawn:[]};
 const highlights=['#ff0000','#0000ff'].map((color,i)=>({playerId:id,cardId:`test-${i}`,name:'Test destination',label:`C1·D${i+1}`,color,stationIds:[area.id]}));
 const board=renderToStaticMarkup(<Board {...props} selected={{x:0,y:0}} destinationHighlights={highlights} highlightedStations={[area.id]}/>);
 assert.match(board,/linearGradient/);assert.match(board,/offset="50%"/);assert.doesNotMatch(board,/C1·D/);
 assert.match(board,/opacity="0.28" data-target="1,0"/);
}
// Detailed crew instructions explain modes; phone prompts stay short and accurate.
{
 const s=fixture();s.players[id].crewsHired=true;
 for(const mode of ['straight','tokens','delayed'] as const){
  s.bendMode=mode;
  const html=renderToStaticMarkup(<CrewBoard game={s} viewerId={id} busy={false} veiled={false} act={()=>{}}/>);
  const phone=phoneGuidance(s,id).text;
  for(const text of [html]){
   assert.match(text,/construction activation/);
   if(mode==='delayed'){assert.match(text,/stop at a bend/);assert.match(text,/other hired lines can still build/);assert.doesNotMatch(text,/One segment per chosen route/);}
   if(mode==='tokens')assert.match(text,/available cash/);
   if(mode==='straight')assert.match(text,/straight segment/);
  }
  assert.ok(phone.length<100,'compact phone prompt');
  assert.match(phone,/iPad/);
  if(mode==='delayed')assert.match(phone,/bend uses this line’s activation/);
 }
}

// Next-station lookahead: a plain aid computed from the selected target, shown
// as the yellow dashed marker, and never written back to the game.
{
 const s=fixture();s.bendMode='straight';
 s.players[id].lines=[line('short',[[5,4]])];
 const before=JSON.stringify(s);
 const target={x:7,y:4}; // the Short line's first printed segment spans 2 spaces
 const next=lookaheadTargets(s,id,0,{preview:target});
 assert.equal(JSON.stringify(s),before,'lookahead never mutates the game');
 assert.ok(next.length>0,'a legal target leaves somewhere to continue');
 assert.ok(next.every(t=>!(t.x===target.x&&t.y===target.y)),'the chosen hole is not offered again');
 assert.deepEqual(lookaheadTargets(s,id,0,{preview:null}),[],'nothing selected, nothing to show');
 assert.deepEqual(lookaheadTargets(s,id,9,{preview:target}),[],'unknown line shows nothing');
 // Each highlighted hole is a placement the reducer would accept next.
 const hired=structuredClone(s);hired.players[id].crewsHired=true;hired.players[id].pendingActions=[0];
 const built=subwayGame.reducer(hired,{playerId:id,type:'BUILD',payload:{lineIndex:0,...target}},{room,playerId:id,now:()=>1,random:()=>.5});
 assert.notEqual(built,hired,'the previewed build is itself legal');
 assert.equal(built.players[id].lines[0].route.length,2,'the build landed');
 for(const t of next.slice(0,6)) assert.equal(validateNode(built,id,0,t),null,'every lookahead hole is legal after the build');
 // During a bend the lookahead shows where the segment can still finish.
 const bent=fixture();bent.bendMode='tokens';bent.players[id].bendTokens=2;
 bent.players[id].lines=[line('short',[[5,4]])];
 const bendVertex={x:6,y:4}; // a bend one space along, leaving one space to finish
 const finishes=lookaheadTargets(bent,id,0,{preview:bendVertex,bendPick:true});
 assert.ok(finishes.length>0,'a bend shows where the segment can finish');
 for(const f of finishes.slice(0,6)) assert.equal(validatePath(bent,id,0,[bendVertex,f],false,true),null,'each finish completes the segment through the bend');
 const delayed=structuredClone(bent);delayed.bendMode='delayed';
 const delayedFinishes=lookaheadTargets(delayed,id,0,{preview:bendVertex,bendPick:true});
 assert.ok(delayedFinishes.length>0,'default delayed bend has yellow endpoint hints');
 const pending=structuredClone(delayed);pending.players[id].lines[0].work=[bendVertex];
 for(const f of delayedFinishes)assert.equal(validatePath(pending,id,0,[f]),null);
 assert.deepEqual(delayed.players[id].lines[0].work,undefined,'lookahead is pure');
 assert.deepEqual(lookaheadTargets(bent,id,0,{preview:null,bendPick:true}),[],'no bend vertex chosen yet');
 const boardHtml=renderToStaticMarkup(<Board game={s} targets={[target]} following={next} hintLabel="Next segment station" onDismissHint={()=>{}} selected={target} canAct onTapHole={()=>{}} drawn={[]}/>);
 assert.equal((boardHtml.match(/data-step="2"/g)??[]).length,next.length,'every lookahead hole renders as the yellow next marker');
 assert.match(boardHtml,/#facc15/);
 assert.equal((boardHtml.match(/data-placement-hint=/g)??[]).length,1,'one badge, not one per yellow dot');
 console.log('Next-station lookahead: purity, legality, bend finishes and yellow markers passed.');
}

// Ending-cash spectrum: one cell per band, each company in exactly one cell.
{
 const s=fixture();
 const ids=s.playerOrder;
 s.players[ids[0]].money=7;s.players[ids[1]].money=-2;
 const html=renderToStaticMarkup(<CashSpectrum game={s} viewerId={ids[0]}/>);
 assert.equal((html.match(/data-cash-band=/g)??[]).length,SUBWAY_CONFIG.cashBands.length,'one cell per band');
 assert.equal((html.match(/data-cash-token=/g)??[]).length,ids.length,'one token per company');
 for(const band of SUBWAY_CONFIG.cashBands) assert.ok(html.includes(band.label),`band ${band.label} is labelled`);
 const first=html.indexOf(`data-cash-band="${SUBWAY_CONFIG.cashBands.at(-1)!.label}"`);
 const last=html.indexOf(`data-cash-band="${SUBWAY_CONFIG.cashBands[0].label}"`);
 assert.ok(first>=0&&last>first,'the bar runs from the worst band to the best');
 assert.ok(html.indexOf(`data-cash-token="${ids[1]}"`)<html.indexOf(`data-cash-token="${ids[0]}"`),'the company in debt sits left of the one holding cash');
 assert.equal(cashBand(s.players[ids[0]].money).vp,cashScore(7));
 console.log('Cash spectrum: band cells, company tokens, labels and ordering passed.');
}
