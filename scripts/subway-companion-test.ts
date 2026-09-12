import assert from "node:assert/strict";
import { companionAction, companionView, companionActor, type CompanionDevice } from "../src/games/subway/companion";
import { playtestAction, seededRandom, testRoom } from "../src/games/subway/playtest";
import { type SubwayState, SUBWAY_CONFIG, LINE_CONTRACTS } from "../src/games/subway/config";
import type { RoomState } from "../src/engine/types";

let request=0;
let actions=0;
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
  const secret=first.players[phones[1].playerId].destinationHand[0];
  const phoneView=companionView(state,phones[0]);
  assert.ok(!JSON.stringify(phoneView).includes(secret),"opposing Destination never transmitted");
  assert.equal(phoneView.game!.destinationDeck.length,0);
  assert.ok(!JSON.stringify(phoneView).includes("tablet-secret"));
  assert.equal(companionView(state,tablet).game!.players[phones[0].playerId].destinationHand.length,0);
  const rawBefore=JSON.stringify(state);
  assert.throws(()=>companionAction(state,phones[0],{type:"BUILD",requestId:"bad-board",revision:state.subwayCompanion!.revision},{now:()=>1,random}));
  assert.equal(JSON.stringify(state),rawBefore);
  let planSaved=false;
  for(let step=0;step<300;step++) {
    const game=state.gameState as SubwayState;
    if(game.phase==="RESULTS") break;
    const action=playtestAction(game,random)!;
    const isPhone=["PROCURE","DRAFT_CARD","BUY_SURVEYS","BUY_DESTINATION"].includes(action.type);
    const device=isPhone?phones.find(p=>p.playerId===action.playerId)!:tablet;
    if(!isPhone && companionActor(game)) {
      const before=companionView(state,tablet);
      if(before.seatedId!==before.actorId) {
        assert.deepEqual(before.plans,{},"handoff carries no outgoing ghosts");
        assert.throws(()=>send(tablet,action.type,action.payload),"board waits for acknowledgement");
        send(tablet,"ACK_COMPANY",{playerId:before.actorId});
      }
      if(!planSaved&&game.phase==="STARTER_PLACEMENT") {
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
}

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
