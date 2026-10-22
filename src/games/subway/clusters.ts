import type { SubwayPlayer } from './config';

/**
 * Largest Transfer Station award (DEC-069): the §6 transfer stations, i.e. stations
 * chained by orthogonal adjacency between different lines or companies, across every
 * company. Lone stations and same-line neighbours are not transfer stations. Keys are
 * occupied holes; each company counts once per hole.
 */
export function largestCluster(players: Record<string, SubwayPlayer>) {
  const holes = new Map<string, Set<string>>(), lines = new Map<string, Set<string>>();
  for (const p of Object.values(players)) p.lines.forEach((line, lineIndex) => { for (const n of line.route) {
    const key = `${n.x},${n.y}`;
    if (!holes.has(key)) { holes.set(key, new Set()); lines.set(key, new Set()); }
    holes.get(key)!.add(p.id);
    lines.get(key)!.add(`${p.id}/${lineIndex}`);
  } });
  const parent = new Map(Array.from(holes.keys(), key => [key, key]));
  const root = (key: string): string => {
    const up = parent.get(key)!;
    if (up === key) return key;
    const top = root(up);
    parent.set(key, top);
    return top;
  };
  // Neighbours join unless both holes hold only the same single line.
  for (const key of Array.from(holes.keys())) {
    const [x, y] = key.split(',').map(Number), here = lines.get(key)!;
    for (const next of [`${x+1},${y}`, `${x},${y+1}`]) {
      const there = lines.get(next);
      if (there && !(here.size === 1 && there.size === 1 && Array.from(here)[0] === Array.from(there)[0])) parent.set(root(key), root(next));
    }
  }
  const groups = new Map<string, string[]>();
  for (const key of Array.from(holes.keys())) groups.set(root(key), [...(groups.get(root(key)) ?? []), key]);
  const clusters = Array.from(groups.values()).filter(group => group.length >= 2);
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
