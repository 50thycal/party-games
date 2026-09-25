import assert from "node:assert/strict";
import { companionAction, companionView, companionActor, type CompanionDevice } from "../src/games/subway/companion";
import { playtestAction, seededRandom, testRoom } from "../src/games/subway/playtest";
import { type SubwayState, SUBWAY_CONFIG, cardPurchaseBlocker, LINE_CONTRACTS, destinationById } from "../src/games/subway/config";
import { turnSummary } from "../src/games/subway/turnSummary";
import type { RoomState } from "../src/engine/types";

let request=0;
let actions=0;
let projectedRecaps=0, paidRecaps=0;
for(const count of [2,3,4]) {
  const room={...testRoom(count),hostId:"tablet",mode:"multiplayer" as const};
  const tablet:CompanionDevice={role:"tablet",playerId:"tablet",tokenHash:"tablet-secret",requests:[]};
  const phones=room.players.map(p=>({role:"phone" as const,playerId:p.id,tokenHash:`private-${p.id}`,requests:[]}));
  let state:RoomState={room,gameState:null,subwayCompanion:{version:1,revision:0,devices:[tablet,...phones],plans:{}}};
  const random=seededRandom(42+count);
  const send = (device:CompanionDevice,type:string,payload?:Record<string,unknown>) => {
    const auth=state.subwayCompanion!.devices.find(d=>d.tokenHash===device.tokenHash)!;
    const input={type,payload,revision:state.subwayCompanion!.revision,requestId:`request-${++request}`};
    state=companionAction(state,auth,input,{now:()=>request,random});
    assert.equal(companionAction(state,state.subwayCompanion!.devices.find(d=>d.tokenHash===device.tokenHash)!,input,{now:()=>request,random}),state,"duplicate is a no-op even after revision advances");
    actions++;
  };
  assert.throws(()=>send(phones[0],"START_GAME"));
  send(tablet,"START_GAME");
  assert.equal(state.room.players.length,count,"tablet never consumes a company seat");
  const first=state.gameState as SubwayState;
  assert.equal(first.bendMode,'delayed','default mode');
  const secret=first.players[phones[1].playerId].destinationHand[0];
  const phoneView=companionView(state,phones[0]);
  assert.ok(!JSON.stringify(phoneView).includes(JSON.stringify(secret)),"opposing Destination never transmitted");
  assert.equal(phoneView.game!.destinationDeck.length,0);
  assert.ok(!JSON.stringify(phoneView).includes("tablet-secret"));
  // The shared iPad carries only the current company's cards (DEC-063), never the decks.
  const current=first.procurement.offer!.activeId,waiting=first.playerOrder.find(id=>id!==current)!;
  assert.deepEqual(companionView(state,tablet).game!.players[current].destinationHand,first.players[current].destinationHand);
  assert.deepEqual(companionView(state,tablet).game!.players[waiting].destinationHand,[]);
  assert.ok(!JSON.stringify(companionView(state,tablet)).includes(JSON.stringify(first.players[waiting].destinationHand[0])),"waiting company's Destination never reaches the tablet");
  assert.equal(companionView(state,tablet).game!.destinationDeck.length,0);
  assert.equal(companionView(state,tablet).game!.market.decks.engineering.length,0);
  const rawBefore=JSON.stringify(state);
  assert.throws(()=>companionAction(state,phones[0],{type:"BUILD",requestId:"bad-board",revision:state.subwayCompanion!.revision},{now:()=>1,random}));
  assert.equal(JSON.stringify(state),rawBefore);
  let planSaved=false, supplyChecked=false, tabletDraftChecked=false;
  const buyers=new Set<string>();
  for(let step=0;step<300;step++) {
    const game=state.gameState as SubwayState;
    if(game.phase==="RESULTS") break;
    if(game.phase==="CONSTRUCTION") {
      assert.equal(new Set(game.resolveQueue).size,game.resolveQueue.length,"each company occurs once in the construction queue");
      const scheduled=game.playerOrder.filter(id=>!game.players[id].actedThisPeriod);
      assert.deepEqual(new Set(game.resolveQueue),new Set(scheduled),"no company is skipped at a round boundary");
    }
    if(!tabletDraftChecked&&game.phase==='ENGINEERING'&&game.engineeringStep==='CARD_DRAFT'){
      const cardId=game.market.rows.engineering[0];
      assert.throws(()=>send(tablet,'DRAFT_CARD',{deck:'engineering',cardId,expectedPick:game.market.picks}),'face-up draft belongs on phone');
      const actor=companionActor(game)!;
      send(tablet,'DRAFT_CARD',{deck:'engineering',expectedPick:game.market.picks});
      assert.equal((state.gameState as SubwayState).players[actor].engineeringHand.length,game.players[actor].engineeringHand.length+1);
      tabletDraftChecked=true;continue;
    }
    if(game.phase==='CONSTRUCTION'&&!buyers.has(companionActor(game)!)){
      // Four-player deck audit plus both projected clients' actual availability.
      if(!supplyChecked){
        assert.equal(game.market.decks.engineering.length,21-count*3-2);
        assert.equal(game.destinationDeck.length,30-count*2);
        supplyChecked=true;
      }
      const actor=companionActor(game)!,phone=phones.find(p=>p.playerId===actor)!;
      assert.ok(game.players[actor].money>=6,"draft leaves enough cash for both optional cards");
      send(tablet,'ACK_COMPANY',{playerId:actor});
      const projected=companionView(state,phone);
      assert.equal(projected.game!.market.decks.engineering.length,0);
      for(const deck of ['engineering','destination'] as const)assert.equal(cardPurchaseBlocker(projected.game!,actor,deck,undefined,projected.drawPileCounts),undefined,'hidden decks must not disable purchases');
      const row=game.market.rows.engineering[0],cash=(state.gameState as SubwayState).players[actor].money;
      assert.throws(()=>send(tablet,'BUY_ENGINEERING',{cardId:row,period:game.currentPeriod}));
      const buyerIndex=game.playerOrder.indexOf(actor);
      if(count===4&&buyerIndex%2===0){
        send(phone,'BUY_ENGINEERING',{cardId:row,period:game.currentPeriod});
        const bought=state.gameState as SubwayState;
        assert.ok(bought.players[actor].engineeringHand.includes(row));
        assert.equal(bought.market.rows.engineering.length,2,'face-up choice replenishes');
        assert.ok(!bought.market.rows.engineering.includes(row));
      }else send(buyerIndex%2?phone:tablet,'BUY_ENGINEERING',{period:game.currentPeriod});
      send(buyerIndex%2?phone:tablet,'BUY_DESTINATION',{period:game.currentPeriod});
      assert.equal((state.gameState as SubwayState).players[actor].money,cash-6,'each card costs $3M');
      assert.throws(()=>send(phone,'BUY_ENGINEERING',{period:game.currentPeriod}),'one extra each remains enforced');
      const after=state.gameState as SubwayState;
      assert.equal(after.players[actor].engineeringHand.length,4);
      assert.equal(after.players[actor].destinationHand.length,3);
      assert.equal(after.market.decks.engineering.length,21-count*3-2-buyers.size-1);
      assert.equal(after.destinationDeck.length,30-count*2-buyers.size-1);
      assert.throws(()=>send(phone,'BUY_DESTINATION',{period:game.currentPeriod}),'Destination cap is also enforced');
      buyers.add(actor);continue;
    }
    const action=playtestAction(game,random)!;
    const isPhone=["PROCURE","DRAFT_CARD","BUY_SURVEYS","BUY_DESTINATION"].includes(action.type);
    const device=isPhone?phones.find(p=>p.playerId===action.playerId)!:tablet;
    if(!isPhone && companionActor(game)) {
      const before=companionView(state,tablet);
      if(before.seatedId!==before.actorId) {
        assert.deepEqual(before.plans,{},"handoff carries no outgoing ghosts");
        assert.ok(before.destinationHighlights.every(h=>h.playerId===before.actorId),"handoff never carries outgoing highlights");
        assert.throws(()=>send(tablet,action.type,action.payload),"board waits for acknowledgement");
        if(game.phase==='CONSTRUCTION'){
          const recap=turnSummary(before.game!,before.actorId!);
          assert.deepEqual(recap,turnSummary(game,before.actorId!),"iPad projection preserves payer names, totals and bank separation");
          projectedRecaps++;
          if(recap&&recap.opponentIncome>0)paidRecaps++;
        }
        send(tablet,"ACK_COMPANY",{playerId:before.actorId});
      }
      if(!planSaved&&game.phase==="STARTER_PLACEMENT") {
        const owner=phones.find(p=>p.playerId===action.playerId)!;
        const other=phones.find(p=>p.playerId!==action.playerId)!;
        const cardId=game.players[owner.playerId].destinationHand[0];
        assert.throws(()=>send(other,"SHOW_DESTINATION",{cardId}));
        assert.throws(()=>send(tablet,"SHOW_DESTINATION",{cardId}));
        assert.throws(()=>send(owner,"SHOW_DESTINATION",{cardId:"not-owned"}));
        send(owner,"SHOW_DESTINATION",{cardId});
        assert.deepEqual(companionView(state,tablet).highlightedStations,destinationById(cardId)!.stationIds);
        assert.deepEqual(companionView(state,other).highlightedStations,[]);
        send(owner,"SHOW_DESTINATION",{cardId:null});
        assert.deepEqual(companionView(state,tablet).highlightedStations,[]);
        send(owner,"SHOW_DESTINATION",{cardId});
        const second=game.players[owner.playerId].destinationHand[1];
        send(owner,"SHOW_DESTINATION",{cardId:second});
        const markers=companionView(state,tablet).destinationHighlights;
        assert.equal(markers.length,2);assert.notEqual(markers[0].color,markers[1].color);assert.notEqual(markers[0].label,markers[1].label);
        assert.equal(companionView(state,owner).destinationHighlights.length,2);
        send(owner,"SHOW_DESTINATION",{cardId:second,enabled:false});
        assert.equal(companionView(state,tablet).destinationHighlights.length,1);
        const otherCard=game.players[other.playerId].destinationHand[0];
        send(other,"SHOW_DESTINATION",{cardId:otherCard});
        assert.equal(companionView(state,tablet).destinationHighlights.length,1,'off-turn selections do not enter shared projection');
        assert.equal(companionView(state,other).destinationHighlights[0].cardId,otherCard,'phone retains own off-turn selection');
        send(owner,"SHOW_DESTINATION",{cardId:null});
        assert.deepEqual(companionView(state,tablet).destinationHighlights,[],'active player with cleared selection shows no highlights');
        assert.equal(companionView(state,other).destinationHighlights[0].cardId,otherCard,'clear only affects own highlights');
        send(owner,"SHOW_DESTINATION",{cardId});
        const contractId=game.players[action.playerId].lines[0].contractId;
        const nodes=[{x:0,y:0},{x:2,y:0}];
        send(tablet,"SAVE_GHOST",{contractId,nodes});
        assert.deepEqual(companionView(state,phones.find(p=>p.playerId===action.playerId)!).plans[contractId].nodes,nodes);
        assert.deepEqual(companionView(state,phones.find(p=>p.playerId!==action.playerId)!).plans,{});
        // Room serialization/reconnect preserves plans; they do not select or build a peg.
        state=JSON.parse(JSON.stringify(state));
        assert.equal((state.gameState as SubwayState).players[action.playerId].lines[0].route.length,0);
        planSaved=true;
      }
    }
    send(device,action.type,action.payload);
    const projected=companionView(state,tablet);
    const current=companionActor(state.gameState as SubwayState);
    const expected=current?(state.subwayCompanion!.destinationHighlights?.[current]??[]):[];
    assert.deepEqual(projected.destinationHighlights.map(h=>h.cardId),expected,"shared projection switches to incoming player and restores choices on return turns");
    assert.ok(projected.destinationHighlights.every(h=>h.playerId===current));
    assert.deepEqual(projected.highlightedStations,Array.from(new Set(expected.flatMap(id=>destinationById(id)!.stationIds))));
    assert.deepEqual(companionView(JSON.parse(JSON.stringify(state)),tablet).destinationHighlights,projected.destinationHighlights,"reconnect preserves current-player projection");
    for(const phone of phones) {
      assert.deepEqual(companionView(state,phone).destinationHighlights.map(h=>h.cardId),state.subwayCompanion!.destinationHighlights?.[phone.playerId]??[],"phones retain only own choices throughout turns");
    }
    if(action.type === "BUILD" && projected.game?.phase === "SCORING") {
      assert.equal(projected.canUndo,true,"last build remains undoable after the scoring transition");
      const balances=Object.fromEntries(Object.entries(projected.game.players).map(([id,p])=>[id,p.money]));
      send(tablet,"UNDO_PLACEMENT");
      send(tablet,"BUILD",action.payload);
      assert.deepEqual(Object.fromEntries(Object.entries((state.gameState as SubwayState).players).map(([id,p])=>[id,p.money])),balances,"undo and rebuild preserve reward/toll balances");
    }
    if(projected.game?.undo) assert.equal(projected.game.undo.state,undefined,"undo cannot leak the complete prior state");
    const revision=state.subwayCompanion!.revision;
    assert.throws(()=>companionAction(state,device,{type:action.type,payload:action.payload,requestId:`stale-${request}`,revision:revision-1},{now:()=>1,random}),"stale requests rejected");
  }
  assert.equal((state.gameState as SubwayState).phase,"RESULTS");
  assert.ok(planSaved);
  assert.equal(buyers.size,count,"every company bought both extras and the game still finished");
  assert.deepEqual(companionView(state,tablet).destinationHighlights,[],"results have no actor or shared highlight");
  const legacy=structuredClone(state);
  const legacyGame=legacy.gameState as SubwayState;
  legacyGame.phase="CONSTRUCTION"; legacyGame.resolveQueue=[phones[0].playerId];
  legacy.subwayCompanion!.destinationHighlights=undefined;
  legacy.subwayCompanion!.destinationHighlight={turn:"legacy-turn",playerId:phones[0].playerId,cardId:legacyGame.players[phones[0].playerId].destinationHand[0]};
  assert.equal(companionView(legacy,tablet).destinationHighlights.length,1,"legacy single selection remains supported");
  legacyGame.resolveQueue=[phones[1].playerId];
  assert.deepEqual(companionView(legacy,tablet).destinationHighlights,[],"legacy selection does not leak into another turn");
}

assert.ok(projectedRecaps>=20,"recaps exercised across complete games");
assert.ok(paidRecaps>0,"real reducer transfers reached the projected payment recap");
console.log(`Companion purchases: every company in 2/3/4-player games bought both extras; ${projectedRecaps} projected recaps checked (${paidRecaps} with income).`);

// Compare spending cadence over all 220 portfolios, excluding optional pins/tolls.
const summaries=[];
for(const crews of [1,2,3]) {
  let totalCompleted=0,minCash=Infinity,totalCash=0;
  for(let a=0;a<10;a++) for(let b=a+1;b<11;b++) for(let c=b+1;c<12;c++) {
    const lines=[LINE_CONTRACTS[a],LINE_CONTRACTS[b],LINE_CONTRACTS[c]];
    let cash=SUBWAY_CONFIG.startingMoney-lines.reduce((n,l)=>n+l.cost,0);
    const left=lines.map(l=>l.recipe.length);
    for(let round=0;round<SUBWAY_CONFIG.timelinePeriods;round++) {
      const active=left.map((remaining,i)=>({remaining,i})).filter(l=>l.remaining>0).sort((a,b)=>a.remaining-b.remaining).slice(0,crews);
      cash-=active.length*(active.length+1)/2;
      for(const {i} of active) if(--left[i]===0) {cash+=SUBWAY_CONFIG.completionReward;totalCompleted++;}
      minCash=Math.min(minCash,cash);
    }
    totalCash+=cash;
  }
  summaries.push({crews,meanCompletions:totalCompleted/220,meanFinalCash:totalCash/220,lowestCash:minCash});
}
console.log("Companion privacy, role checks, saved plans, handoffs, replay/stale rejection and complete 2/3/4-player games passed:",actions,"actions");
console.log("Economy cadence comparison (220 portfolios, no tolls or optional purchases):",summaries);
