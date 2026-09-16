import { SUBWAY_CONFIG, contractOf, destinationById, engineeringById, lineComplete, objectiveProgress, segmentsBuilt, stationAt, type SubwayPlayer, type SubwayState, type Point } from './config';
import { borderSides, companyComponents, companyNetwork, linesConnected, transferGroups, type BoardSide } from './network';

const sideDistance = (p: Point, side: BoardSide) => ({north:p.y,south:SUBWAY_CONFIG.board.rows-1-p.y,west:p.x,east:SUBWAY_CONFIG.board.columns-1-p.x})[side];

/** Optimistic travel bound only: straight-line reach does not prove a legal recipe. */
export function remainingReach(player: SubwayPlayer, index: number): number {
  const line = player.lines[index];
  return (contractOf(line)?.recipe.slice(segmentsBuilt(line)) ?? []).reduce((n,len) => n + len + SUBWAY_CONFIG.geometry.lengthTolerance, 0);
}

/** Partial mission utility. Completed points remain authoritative in objectiveProgress.
 * Use actual connected components, so visiting the same area never joins lines.
 */
export function missionPotential(s: SubwayState, me: SubwayPlayer): number {
  const components = companyComponents(me);
  return me.destinationHand.reduce((sum,id) => {
    const card = destinationById(id); if (!card) return sum;
    const values = me.lines.map((line,i) => {
      const end = line.route.at(-1); if (!end) return 0;
      const component = components.find(nodes => nodes.some(n => n.x === end.x && n.y === end.y)) ?? line.route;
      const visited = new Set(component.map(n => stationAt(n,s.stations)?.id));
      const missing = card.stationIds.filter(id => !visited.has(id));
      const reach = remainingReach(me,i);
      const distances = missing.map(id => Math.min(...s.stations.filter(st => st.id === id).flatMap(st => (st.cells ?? [st]).map(p => Math.hypot(p.x-end.x,p.y-end.y)))));
      // Reject impossible reach; a connected sibling may still finish the goal.
      const feasible = distances.every(d => d <= reach);
      return (card.stationIds.length-missing.length)*2 + (feasible && missing.length ? 2/(1+Math.min(...distances)) : 0);
    });
    return sum + Math.max(0,...values);
  },0);
}

/** Directional shaping for unfinished Engineering goals, not bonus game points. */
export function engineeringPotential(s: SubwayState, me: SubwayPlayer): number {
  const others=Object.values(s.players).filter(p=>p.id!==me.id);
  return me.engineeringHand.reduce((sum,id)=>sum+objectiveProgress(id,me,others,s).points,0);
}

/** Explain the exact scored condition and observable failure without guessing intent. */
export function objectiveExplanation(id: string, s: SubwayState, me: SubwayPlayer): string {
  const others = Object.values(s.players).filter(p=>p.id!==me.id);
  const p = objectiveProgress(id,me,others,s), dest = destinationById(id), card = engineeringById(id);
  if (dest) {
    const visited = new Set(me.lines.flatMap(l=>l.route).map(n=>n.stationId));
    const missing = dest.stationIds.filter(id=>!visited.has(id)).map(id=>s.stations.find(st=>st.id===id)?.name ?? id);
    return p.met ? 'All required neighborhoods are served by one physically connected company network.' : missing.length ? `Missing neighborhoods: ${missing.join(', ')}. All required neighborhoods must share one company network.` : 'All required neighborhoods were visited, but no single physically connected company network serves them all.';
  }
  return `${card?.requirement ?? 'Unknown objective.'} ${p.met ? 'Currently met' : 'Not yet met'}: ${p.points}/${p.max} VP. Scored once at game end; live progress can change.`;
}
