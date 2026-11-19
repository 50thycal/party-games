import type { Room } from "../../engine/types";
import { TABLE_SOCCER_ID, tableSoccerGame, type TableSoccerAction, type TableSoccerState } from "./config";
import {
  BALL_RADIUS, BUMPER_RADIUS, canPlaceBumper, clamp, GOALIE_LIMIT, GOAL_Y, LAUNCH_POINT, MAX_PULL,
  simulateShot, toPhone, toWorld, type Point,
} from "./physics";

export const SOLO_PLAYER_ID = "you";

export function soloRoom(opponents: number): Room {
  return {
    roomCode: "SOLO",
    gameId: TABLE_SOCCER_ID,
    hostId: SOLO_PLAYER_ID,
    createdAt: 0,
    mode: "simulation",
    players: [
      { id: SOLO_PLAYER_ID, name: "You", role: "host" },
      ...Array.from({ length: opponents }, (_, i) => ({ id: `cpu-${i + 1}`, name: `CPU ${i + 1}`, role: "player" as const })),
    ],
  };
}

export function applySoloAction(state: TableSoccerState, room: Room, action: TableSoccerAction, now: number) {
  return tableSoccerGame.reducer(state, action, { room, playerId: action.playerId, now: () => now, random: () => 0.5 });
}

const bumperSpots = [[0.23, 0.58], [0.79, 0.37], [0.30, 0.23], [0.70, 0.72], [0.20, 0.76], [0.81, 0.19]];

function findBumperSpot(state: TableSoccerState): Point | undefined {
  const { table, phones, bumpers } = state;
  for (const [x, y] of bumperSpots) {
    const point = { x: x * table.width, y: y * table.length };
    if (canPlaceBumper(point, table, phones, bumpers)) return point;
  }
  const inset = BUMPER_RADIUS + 2 * BALL_RADIUS;
  for (const step of [3, 0.25]) {
    for (let x = inset; x <= table.width - inset; x += step) {
      for (let y = inset; y <= table.length - inset; y += step) {
        const point = { x, y };
        if (canPlaceBumper(point, table, phones, bumpers)) return point;
      }
    }
  }
}

function choosePull(state: TableSoccerState): Point {
  const { table, phones, bumpers } = state;
  const shooter = phones[state.shooterIndex];
  const side = (state.turn + state.shooterIndex + state.match) % 4 < 2 ? 1 : -1;
  const targets = phones.filter((phone) => phone.playerId !== shooter.playerId);
  let alternative: Point | undefined;
  for (const target of targets) {
    for (const x of [side * 4.3, -side * 4.3, 0, side * 5.3, -side * 5.3]) {
      const aim = toPhone(toWorld({ x, y: GOAL_Y - BALL_RADIUS }, target), shooter);
      const vector = { x: LAUNCH_POINT.x - aim.x, y: LAUNCH_POINT.y - aim.y };
      const length = Math.hypot(vector.x, vector.y);
      if (length === 0) continue;
      const pull = { x: vector.x / length * MAX_PULL, y: vector.y / length * MAX_PULL };
      alternative ??= pull;
      const crossing = simulateShot(table, phones, bumpers, shooter, pull).crossing;
      if (crossing?.playerId === target.playerId) return pull;
    }
  }
  return alternative ?? { x: side, y: 5.5 };
}

type BotAction = { action: TableSoccerAction; waitMs: number };
type BotPlan = BotAction | { needsBumperSpace: true };

export function nextBotAction(state: TableSoccerState, now: number): BotPlan | null {
  const { match, turn, phase, shot } = state;
  const asBot = (type: string, playerId: string, payload: TableSoccerAction["payload"], waitMs: number): BotAction => ({
    action: { type, playerId, payload: { match, turn, ...payload } }, waitMs,
  });
  if (phase === "initial-bumpers" || phase === "bonus-bumper") {
    const playerId = phase === "initial-bumpers"
      ? state.players.find((player) => player.id !== SOLO_PLAYER_ID && !state.bumpers.some((bumper) => bumper.playerId === player.id))?.id
      : state.lastResult?.shooterId;
    if (playerId && playerId !== SOLO_PLAYER_ID) {
      const point = findBumperSpot(state);
      if (!point) return { needsBumperSpace: true };
      return asBot("SOCCER_PLACE_BUMPER", playerId, { point, placement: phase === "initial-bumpers" ? "initial" : "bonus" }, 300);
    }
  }
  if (phase === "aim") {
    const shooter = state.players[state.shooterIndex];
    if (shooter.id !== SOLO_PLAYER_ID) return asBot("SOCCER_KICK", shooter.id, { pull: choosePull(state) }, 650);
  }
  if (phase === "flight" && shot?.crossing && shot.crossing.playerId !== SOLO_PLAYER_ID && !shot.goalieSequence) {
    const defender = state.players.findIndex((player) => player.id === shot.crossing?.playerId);
    const triesSave = (Math.floor(turn / state.players.length) + defender + match) % 3 === 0;
    const x = triesSave ? clamp(shot.crossing.x, -GOALIE_LIMIT, GOALIE_LIMIT) : shot.crossing.x < 0 ? GOALIE_LIMIT : -GOALIE_LIMIT;
    const reactsAt = shot.startsAt + shot.duration * 0.62;
    return asBot("SOCCER_GOALIE", shot.crossing.playerId, { x, sequence: 1 }, Math.max(0, reactsAt - now));
  }
  return null;
}
