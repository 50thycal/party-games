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
  let value = 0;
  const sides: BoardSide[] = ['north','south','east','west'];
  for (const id of me.engineeringHand) {
    if (id === 'terminal') value += new Set(me.lines.flatMap(l=>l.route).map(n=>n.stationId).filter(Boolean)).size;
    if (id === 'local-service') value += Math.max(0,...me.lines.map(l=>new Set(l.route.filter(n=>s.stations.some(st=>st.id===n.stationId&&st.kind==='minor')).map(n=>n.stationId)).size))*2;
    if (id === 'approach') value += Math.max(0,...me.lines.map(l=>new Set(l.route.filter(n=>s.stations.some(st=>st.id===n.stationId&&st.kind==='major')).map(n=>n.stationId)).size));
    for (const [i,line] of Array.from(me.lines.entries())) {
      const start = line.route[0], end = line.route.at(-1); if (!start || !end) continue;
      const reach = remainingReach(me,i), visited = new Set(line.route.flatMap(n=>borderSides(n)));
      let desired: BoardSide[] = [];
      if (id === 'bend') {
        if (!borderSides(start).some(side=>side==='east'||side==='west')) {value -= 4; continue;}
        desired = ['north','south'];
      }
      if (id === 'straight') desired = borderSides(start);
      if (id === 'through') desired = (['north','south'] as BoardSide[]).filter(side=>!visited.has(side));
      if (id === 'perimeter' || id === 'crosstown-service') {
        value += visited.size;
        desired = sides.filter(side=>!visited.has(side));
      }
      if (id === 'gentle' || id === 'three-fronts') {
        const other = me.lines.filter((_,j)=>j!==i);
        if (id === 'three-fronts') {
          value += new Set(me.lines.flatMap(l=>l.route.slice(0,1)).flatMap(n=>borderSides(n))).size;
          desired = other.filter(lineComplete).flatMap(l=>borderSides(l.route.at(-1)!));
          if (!desired.length) desired = sides;
        } else {
          const used = new Set(other.filter(lineComplete).flatMap(l=>borderSides(l.route.at(-1)!)));
          desired = sides.filter(side=>!used.has(side));
        }
      }
      if (id === 'four-corners') {
        const d = Math.min(...[{x:0,y:0},{x:26,y:0},{x:0,y:8},{x:26,y:8}].filter(p=>!line.route.some(n=>n.x===p.x&&n.y===p.y)).map(p=>Math.hypot(p.x-end.x,p.y-end.y)));
        if (d<=reach) value += 2/(1+d);
      }
      if (desired.length) {
        const d = Math.min(...desired.map(side=>sideDistance(end,side)));
        value += d <= reach ? 2/(1+d) : -2;
      }
    }
  }
  return value;
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
  const complete = me.lines.filter(lineComplete).length;
  const details = p.count !== undefined ? `Qualifying count/tier: ${p.count}; thresholds pay ${p.tiers?.join(' / ')} VP.` : `Completed lines: ${complete}/${me.lines.length}.`;
  if (id === 'crossing') return `${complete}/3 lines complete. First company to complete all three: ${s.firstCompletedPlayerId ? s.players[s.firstCompletedPlayerId]?.name ?? s.firstCompletedPlayerId : 'none'}.`;
  if (id === 'terminal') return `${new Set(me.lines.flatMap(l=>l.route).map(n=>n.stationId).filter(Boolean)).size}/${s.stations.length} neighborhoods visited; all are required.`;
  const namedLine = (index: number) => contractOf(me.lines[index])?.name ?? `Line ${index+1}`;
  if (id === 'local-service') return me.lines.map((l,i)=>{
    const missing=s.stations.filter(st=>st.kind==='minor'&&!l.route.some(n=>n.stationId===st.id));
    return `${namedLine(i)}: ${missing.length ? `missing ${missing.map(st=>st.name).join(', ')}` : 'all three small neighborhoods served'}`;
  }).join('; ') + '. All three small neighborhoods must be on one line; completion is not required.';
  if (id === 'approach') return me.lines.map((l,i)=>`${namedLine(i)}: ${new Set(l.route.filter(n=>s.stations.some(st=>st.id===n.stationId&&st.kind==='major')).map(n=>n.stationId)).size}/3 large neighborhoods; ${lineComplete(l)?'complete':'incomplete'}`).join('; ')+'. One completed line must serve three large neighborhoods.';
  if (id === 'network') return `${complete}/3 lines complete; ${linesConnected(me.lines,companyNetwork(me))?'all three lines physically connected':'all three lines are not physically connected'}. Both conditions are required.`;
  if (id === 'solvent') return `${complete}/3 lines complete; cash $${me.money}M (at least $5M required). Both conditions are required.`;
  if (id === 'minimal') {
    const pins=s.surveyPins.filter(pin=>pin.playerId===me.id);
    const used=pins.filter(pin=>me.lines.some(l=>l.route.some(n=>!n.stationId&&n.x===pin.x&&n.y===pin.y)));
    return `${complete}/3 lines complete; ${used.length}/${pins.length} placed Survey Pins served. Complete all three lines and serve at least one owned Survey Pin.`;
  }
  if (id === 'interchange') {
    const areas=s.stations.filter(st=>st.kind==='major').map(st=>{
      const groups=transferGroups(me.lines,st.id);
      const memberships=me.lines.map(l=>new Set(l.route.filter(n=>n.stationId===st.id).map(n=>groups.get(`${n.x},${n.y}`))));
      const count=Math.max(0,...Array.from(new Set(groups.values()),g=>memberships.filter(set=>set.has(g)).length));
      return `${st.name}: ${count}/3 lines in one local transfer group`;
    });
    return areas.join('; ')+'. Three lines must meet in the same local group inside one large neighborhood.';
  }
  return `${card?.requirement ?? card?.description ?? 'Unknown objective.'} ${details} ${p.met ? 'Full objective met.' : p.points ? 'Partial tier awarded; full objective not met.' : 'No scoring threshold met.'}`;
}
