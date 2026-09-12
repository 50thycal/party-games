import type { Point, PlayerLine, SubwayPlayer } from "./config";

/** Neighborhood identity never substitutes for physical node proximity. */
export const networkNodeKey = (node: Point) => `${node.x},${node.y}`;

export const nodesTransfer = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;

/** Collapse only transfers between different lines, never nearby nodes on one line. */
export function transferGroups(lines: PlayerLine[], stationId?: string): Map<string, string> {
  const nodes = lines.flatMap((line, lineIndex) => line.route
    .filter(node => stationId === undefined || node.stationId === stationId)
    .map(node => ({node, lineIndex})));
  const parent = new Map(nodes.map(({node}) => { const key = networkNodeKey(node); return [key, key]; }));
  const root = (key: string): string => {
    const next = parent.get(key)!;
    if (next === key) return key;
    const result = root(next);
    parent.set(key, result);
    return result;
  };
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (nodes[i].lineIndex !== nodes[j].lineIndex && nodesTransfer(nodes[i].node, nodes[j].node)) {
      parent.set(root(networkNodeKey(nodes[i].node)), root(networkNodeKey(nodes[j].node)));
    }
  }
  return new Map(Array.from(parent.keys(), key => [key, root(key)]));
}

export function companyNetwork(player: SubwayPlayer): Map<string, number> {
  const transfers = transferGroups(player.lines);
  const adjacent = new Map<string, Set<string>>();
  for (const group of Array.from(transfers.values())) adjacent.set(group, new Set());
  for (const line of player.lines) for (let i = 1; i < line.route.length; i++) {
    const a = transfers.get(networkNodeKey(line.route[i - 1]))!;
    const b = transfers.get(networkNodeKey(line.route[i]))!;
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
  return new Map(Array.from(transfers, ([key, group]) => [key, component.get(group)!]));
}

export function companyComponents(player: SubwayPlayer): Point[][] {
  const graph = companyNetwork(player), groups = new Map<number, Point[]>();
  for (const line of player.lines) for (const node of line.route) {
    const id = graph.get(networkNodeKey(node))!;
    groups.set(id, [...(groups.get(id) ?? []), node]);
  }
  return Array.from(groups.values());
}

export function linesConnected(lines: PlayerLine[], component: Map<string, number>): boolean {
  const ids = lines.map(line => line.route.length > 1 ? component.get(networkNodeKey(line.route[0])) : undefined);
  return ids.length === 3 && ids[0] !== undefined && ids.every(id => id === ids[0]);
}

/** All three lines belong to one local transfer group inside the named area. */
export function interchangeAt(lines: PlayerLine[], stationId: string): boolean {
  if (lines.length !== 3) return false;
  const groups = transferGroups(lines, stationId);
  const memberships = lines.map(line => new Set(line.route.filter(n => n.stationId === stationId)
    .map(n => groups.get(networkNodeKey(n))!)));
  return Array.from(memberships[0]).some(group => memberships.every(set => set.has(group)));
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
  const transfers = transferGroups(player.lines);
  let edge = 0;
  for (const line of player.lines) for (let i = 1; i < line.route.length; i++) {
    const a = line.route[i - 1], b = line.route[i];
    const from = transfers.get(networkNodeKey(a))!, to = transfers.get(networkNodeKey(b))!;
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
