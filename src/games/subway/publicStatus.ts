import type { SubwayState, MoneyEvent } from './config';
import { longestNetwork } from './network';
import { largestCluster } from './clusters';

export function publicStandings(game:SubwayState) {
  const players=Object.values(game.players);
  const lengths=Object.fromEntries(players.map(p=>[p.id,longestNetwork(p)]));
  const length=Math.max(0,...Object.values(lengths));
  const networkLeaders=players.filter(p=>length>0&&Math.abs(lengths[p.id]-length)<1e-6).map(p=>p.id);
  const cluster=largestCluster(game.players);
  const {size,leaders:stationLeaders,counts:stationCounts}=cluster;
  return {lengths,length,networkLeaders,size,stationLeaders,stationCounts};
}

export function moneyChanges(event:MoneyEvent) {
  return event.payments.flatMap(p=>{
    const sign=event.reversed?-1:1;
    return [...(p.from==='bank'?[]:[{playerId:p.from,amount:-p.amount*sign,reason:p.reason}]),...(p.to?[{playerId:p.to,amount:p.amount*sign,reason:p.reason}]:[])];
  });
}
