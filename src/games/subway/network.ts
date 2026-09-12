import type { Point, PlayerLine, SubwayPlayer } from "./config";

/** Peg holes in one neighborhood transfer; geometric crossings alone never do. */
export const networkNodeKey = (node: Point & { stationId?: string }) =>
  node.stationId ? `station:${node.stationId}` : `${node.x},${node.y}`;

export function companyNetwork(player: SubwayPlayer) {
  const adjacent = new Map<string, Set<string>>();
  for (const line of player.lines) for (let i = 1; i < line.route.length; i++) {
    const a = networkNodeKey(line.route[i - 1]), b = networkNodeKey(line.route[i]);
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  }
  const component = new Map<string, number>();
  for (const start of Array.from(adjacent.keys())) {
    if (component.has(start)) continue;
    const id = component.size, pending = [start];
    while (pending.length) {
      const key = pending.pop()!;
      if (component.has(key)) continue;
      component.set(key, id);
      pending.push(...Array.from(adjacent.get(key)!));
    }
  }
  return component;
}

export function linesConnected(lines: PlayerLine[], component: Map<string, number>): boolean {
  const ids = lines.map(line => line.route.length > 1 ? component.get(networkNodeKey(line.route[0])) : undefined);
  return ids.length === 3 && ids[0] !== undefined && ids.every(id => id === ids[0]);
}

export type BoardSide = "north" | "south" | "east" | "west";
export function borderSides(point: Point, columns = 27, rows = 9): BoardSide[] {
  const sides: BoardSide[] = [];
  if (point.y === 0) sides.push("north");
  if (point.y === rows - 1) sides.push("south");
  if (point.x === 0) sides.push("west");
  if (point.x === columns - 1) sides.push("east");
  return sides;
}

/** A corner may represent either adjoining side, but not two at once. */
export function distinctSides(points: Point[], required: number): boolean {
  const unique = Array.from(new Map(points.map(p => [`${p.x},${p.y}`, p])).values());
  const visit = (i: number, used: Set<BoardSide>): boolean => {
    if (used.size >= required) return true;
    if (i === unique.length || unique.length - i < required - used.size) return false;
    return borderSides(unique[i]).some(side => !used.has(side) && visit(i + 1, new Set([...Array.from(used), side]))) || visit(i + 1, used);
  };
  return visit(0, new Set());
}

/** Longest continuous trail, measured in peg spaces; no built segment reused. */
export function longestNetwork(player: SubwayPlayer): number {
  const adjacent = new Map<string, { to: string; bit: number; length: number }[]>();
  // At most three seven-segment contracts: 21 bits fit the 32-bit mask.
  let edge = 0;
  for (const line of player.lines) for (let i = 1; i < line.route.length; i++) {
    const a = line.route[i - 1], b = line.route[i];
    const from = networkNodeKey(a), to = networkNodeKey(b);
    const bit = 1 << edge++, length = Math.hypot(b.x - a.x, b.y - a.y);
    adjacent.set(from, [...(adjacent.get(from) ?? []), { to, bit, length }]);
    adjacent.set(to, [...(adjacent.get(to) ?? []), { to: from, bit, length }]);
  }
  const memo = new Map<string, number>();
  const walk = (node: string, used: number): number => {
    const key = `${node}/${used}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = 0;
    for (const e of adjacent.get(node) ?? []) if (!(used & e.bit)) best = Math.max(best, e.length + walk(e.to, used | e.bit));
    memo.set(key, best);
    return best;
  };
  return Math.max(0, ...Array.from(adjacent.keys()).map(node => walk(node, 0)));
}
