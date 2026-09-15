import type { SubwayState, MoneyEvent } from './config';
import { longestNetwork } from './network';
import { stationClusters } from './engineering';

export function publicStandings(game:SubwayState) {
  const players=Object.values(game.players);
  const lengths=Object.fromEntries(players.map(p=>[p.id,longestNetwork(p)]));
  const length=Math.max(0,...Object.values(lengths));
  const networkLeaders=players.filter(p=>length>0&&Math.abs(lengths[p.id]-length)<1e-6).map(p=>p.id);
  const groups=stationClusters(players);
  const size=Math.max(0,...groups.map(g=>g.length));
  const largest=groups.filter(g=>g.length===size);
  const stationLeaders=Array.from(new Set(largest.flatMap(g=>{
    const counts=players.map(p=>({id:p.id,n:g.filter(m=>m.owner===p.id).length}));
    const max=Math.max(...counts.map(c=>c.n));return counts.filter(c=>c.n===max).map(c=>c.id);
  })));
  const stationCounts=Object.fromEntries(players.map(p=>[p.id,Math.max(0,...groups.map(g=>g.filter(m=>m.owner===p.id).length))]));
  return {lengths,length,networkLeaders,size,stationLeaders,stationCounts};
}

export function moneyChanges(event:MoneyEvent) {
  return event.payments.flatMap(p=>{
    const sign=event.reversed?-1:1;
    return [...(p.from==='bank'?[]:[{playerId:p.from,amount:-p.amount*sign,reason:p.reason}]),...(p.to?[{playerId:p.to,amount:p.amount*sign,reason:p.reason}]:[])];
  });
}
