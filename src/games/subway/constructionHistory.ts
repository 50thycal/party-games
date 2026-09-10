import { basePriorityId, periodPriorityId, type SubwayState } from "./config";

/** Public construction facts only: never expose private card/budget snapshots. */
export function constructionHistory(game: SubwayState, period: number) {
  const builds: {actorId:string; lineIndex:number; actionNumber:number; period:number; undone:boolean}[]=[];
  for (const event of game.telemetry ?? []) {
    const before=event.playersBefore[event.actorId]?.lineNodeCounts ?? [];
    const after=event.playersAfter[event.actorId]?.lineNodeCounts ?? [];
    if (event.action === "BUILD" && typeof event.payload?.lineIndex === "number") {
      const lineIndex=event.payload.lineIndex;
      if ((after[lineIndex]??0) > (before[lineIndex]??0)) builds.push({actorId:event.actorId,lineIndex,actionNumber:event.actionNumber,period:event.periodBefore,undone:false});
    }
    if (event.action === "UNDO_PLACEMENT") before.forEach((count,lineIndex)=>{
      if ((after[lineIndex]??count) < count) {
        const previous=[...builds].reverse().find(b=>!b.undone&&b.actorId===event.actorId&&b.lineIndex===lineIndex);
        if(previous) previous.undone=true;
      }
    });
  }
  const base=game.playerOrder.map((_,i)=>basePriorityId(game,period+i));
  const first=periodPriorityId(game,period);
  return {order:[first,...base.filter(id=>id!==first)], builds:builds.filter(b=>b.period===period)};
}
