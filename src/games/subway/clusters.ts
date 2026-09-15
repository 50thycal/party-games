import type { SubwayPlayer } from './config';

/** Physical occupied holes, not string networks. Each company counts once per hole. */
export function largestCluster(players: Record<string, SubwayPlayer>) {
  const holes = new Map<string, Set<string>>();
  for (const p of Object.values(players)) for (const line of p.lines) for (const n of line.route) {
    const key = `${n.x},${n.y}`;
    if (!holes.has(key)) holes.set(key, new Set());
    holes.get(key)!.add(p.id);
  }
  const unseen = new Set(holes.keys()), clusters: string[][] = [];
  while (unseen.size) {
    const pending = [unseen.values().next().value as string], group: string[] = [];
    unseen.delete(pending[0]);
    while (pending.length) {
      const key = pending.pop()!; group.push(key);
      const [x,y] = key.split(',').map(Number);
      for (const next of [`${x-1},${y}`, `${x+1},${y}`, `${x},${y-1}`, `${x},${y+1}`]) {
        if (unseen.delete(next)) pending.push(next);
      }
    }
    clusters.push(group);
  }
  const size = Math.max(0, ...clusters.map(c => c.length));
  const largest = clusters.filter(c => c.length === size);
  const counts: Record<string, number> = Object.fromEntries(Object.keys(players).map(id => [id,0]));
  for (const group of largest) for (const key of group) for (const id of Array.from(holes.get(key)!)) counts[id]++;
  const majority = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(id => majority > 0 && counts[id] === majority);
  const share = leaders.length > 0 && leaders.length < 4 ? 6 / leaders.length : 0;
  const points = Object.fromEntries(Object.keys(counts).map(id => [id,leaders.includes(id) ? share : 0]));
  return {size, clusters: largest, counts, leaders, points};
}
