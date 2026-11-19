export type Point = { x: number; y: number };
export type Table = { width: number; length: number };
export type Phone = Point & { angle: number; playerId: string };
export type Bumper = Point & { playerId: string };
export type BallFrame = Point & { ms: number };
export type Crossing = { playerId: string; x: number };
export type Flight = { frames: BallFrame[]; duration: number; crossing: Crossing | null };

export const DEFAULT_TABLE: Table = { width: 150, length: 90 };
export const TABLE_LIMITS = { width: [65, 300], length: [50, 220] } as const;
export const PHONE = { halfWidth: 8, halfLength: 11 };
export const BALL_RADIUS = 1.15;
export const BUMPER_RADIUS = 3.5;
export const GOAL_HALF_WIDTH = 6.9;
export const GOAL_Y = 7.5;
export const GOALIE_HALF_WIDTH = 1.75;
export const GOALIE_LIMIT = GOAL_HALF_WIDTH - GOALIE_HALF_WIDTH;
export const LAUNCH_POINT: Point = { x: 0, y: 1.5 };
export const MIN_PULL = 0.65;
export const MAX_PULL = 6.5;

const STEP_MS = 10;
const FRAME_MS = 40;
const MAX_FLIGHT_MS = 4800;
const MAX_SPEED = 151;
const MIN_SPEED = 28;
const FRICTION = 27;
const STOP_SPEED = 6;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Point;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

export function rotate(point: Point, angle: number): Point {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function toWorld(point: Point, phone: Phone): Point {
  const offset = rotate(point, phone.angle);
  return { x: phone.x + offset.x, y: phone.y + offset.y };
}

export function toPhone(point: Point, phone: Phone): Point {
  return rotate({ x: point.x - phone.x, y: point.y - phone.y }, -phone.angle);
}

function phoneExtents(angle: number): Point {
  const corner = rotate({ x: 1, y: 0 }, angle);
  const cos = Math.abs(corner.x);
  const sin = Math.abs(corner.y);
  return {
    x: PHONE.halfWidth * cos + PHONE.halfLength * sin,
    y: PHONE.halfWidth * sin + PHONE.halfLength * cos,
  };
}

export function fitPhone(phone: Phone, table: Table): Phone {
  const extents = phoneExtents(phone.angle);
  return {
    ...phone,
    x: clamp(phone.x, extents.x, table.width - extents.x),
    y: clamp(phone.y, extents.y, table.length - extents.y),
  };
}

export function defaultPhones(playerIds: string[], table: Table): Phone[] {
  const { width, length } = table;
  const spots = [
    { x: width / 2, y: length - 12, angle: 0 },
    { x: width / 2, y: 12, angle: 180 },
    { x: 12, y: length / 2, angle: 90 },
    { x: width - 12, y: length / 2, angle: 270 },
  ];
  return playerIds.map((playerId, index) => ({ playerId, ...spots[index] }));
}

export function isTable(value: unknown): value is Table {
  if (!value || typeof value !== "object") return false;
  const { width, length } = value as Table;
  return isFiniteNumber(width) && isFiniteNumber(length) &&
    width >= TABLE_LIMITS.width[0] && width <= TABLE_LIMITS.width[1] &&
    length >= TABLE_LIMITS.length[0] && length <= TABLE_LIMITS.length[1];
}

function phonesOverlap(first: Phone, second: Phone): boolean {
  // The separating axes of two rectangles are the two local axes of each phone.
  return [first.angle, second.angle].every((angle) => {
    const delta = rotate({ x: first.x - second.x, y: first.y - second.y }, -angle);
    const a = phoneExtents(first.angle - angle);
    const b = phoneExtents(second.angle - angle);
    return Math.abs(delta.x) < a.x + b.x && Math.abs(delta.y) < a.y + b.y;
  });
}

export function validLayout(table: Table, phones: Phone[]): boolean {
  return phones.every((phone, index) => {
    const fitted = fitPhone(phone, table);
    return Math.hypot(fitted.x - phone.x, fitted.y - phone.y) < 0.001 &&
      phones.slice(0, index).every((other) => !phonesOverlap(phone, other));
  });
}

export function canPlaceBumper(point: Point, table: Table, phones: Phone[], bumpers: Bumper[]): boolean {
  const clearance = BUMPER_RADIUS + BALL_RADIUS;
  if (point.x < clearance || point.x > table.width - clearance ||
    point.y < clearance || point.y > table.length - clearance) return false;

  return phones.every((phone) => {
    const local = toPhone(point, phone);
    const x = Math.max(0, Math.abs(local.x) - PHONE.halfWidth);
    const y = Math.max(0, Math.abs(local.y) - PHONE.halfLength);
    return Math.hypot(x, y) >= clearance;
  }) && bumpers.every((bumper) =>
    Math.hypot(point.x - bumper.x, point.y - bumper.y) >= 2 * BUMPER_RADIUS + 2 * BALL_RADIUS,
  );
}

export function kickDirection(pull: Point): Point {
  const length = Math.hypot(pull.x, pull.y);
  if (!length) return { x: 0, y: 0 };
  return { x: -pull.x / length, y: -pull.y / length };
}

export function limitedPull(pull: Point): Point {
  const scale = Math.min(1, MAX_PULL / (Math.hypot(pull.x, pull.y) || 1));
  return { x: pull.x * scale, y: pull.y * scale };
}

function firstCrossing(from: Point, to: Point, opponents: Phone[]) {
  let nearest: (Crossing & { fraction: number }) | null = null;
  for (const phone of opponents) {
    const start = toPhone(from, phone);
    const end = toPhone(to, phone);
    // The leading edge of the ball meets the goalie and goal line together.
    const line = GOAL_Y - BALL_RADIUS;
    if (start.y >= line || end.y < line) continue;
    const fraction = (line - start.y) / (end.y - start.y);
    const x = start.x + (end.x - start.x) * fraction;
    if (Math.abs(x) <= GOAL_HALF_WIDTH - BALL_RADIUS &&
        (!nearest || fraction < nearest.fraction)) {
      nearest = { playerId: phone.playerId, fraction, x };
    }
  }
  return nearest;
}

export function simulateShot(table: Table, phones: Phone[], bumpers: Bumper[], shooter: Phone, pull: Point): Flight {
  const start = toWorld(LAUNCH_POINT, shooter);
  const power = clamp((Math.hypot(pull.x, pull.y) - MIN_PULL) / (MAX_PULL - MIN_PULL), 0, 1);
  const direction = rotate(kickDirection(pull), shooter.angle);
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power;
  const opponents = phones.filter((phone) => phone.playerId !== shooter.playerId);
  const frames: BallFrame[] = [{ ...start, ms: 0 }];
  let position = start;
  let velocity = { x: direction.x * speed, y: direction.y * speed };
  const dt = STEP_MS / 1000;

  for (let ms = STEP_MS; ms <= MAX_FLIGHT_MS; ms += STEP_MS) {
    const next = { x: position.x + velocity.x * dt, y: position.y + velocity.y * dt };
    if (next.x < BALL_RADIUS || next.x > table.width - BALL_RADIUS) {
      next.x = clamp(next.x, BALL_RADIUS, table.width - BALL_RADIUS);
      velocity.x *= -0.8;
    }
    if (next.y < BALL_RADIUS || next.y > table.length - BALL_RADIUS) {
      next.y = clamp(next.y, BALL_RADIUS, table.length - BALL_RADIUS);
      velocity.y *= -0.8;
    }
    for (const bumper of bumpers) {
      const dx = next.x - bumper.x;
      const dy = next.y - bumper.y;
      const distance = Math.hypot(dx, dy);
      const radius = BUMPER_RADIUS + BALL_RADIUS;
      if (distance >= radius || distance === 0) continue;
      const normal = { x: dx / distance, y: dy / distance };
      const approach = velocity.x * normal.x + velocity.y * normal.y;
      next.x = bumper.x + normal.x * radius;
      next.y = bumper.y + normal.y * radius;
      if (approach < 0) {
        velocity.x -= 1.84 * approach * normal.x;
        velocity.y -= 1.84 * approach * normal.y;
      }
    }
    const goal = firstCrossing(position, next, opponents);
    if (goal) {
      const duration = ms - STEP_MS + goal.fraction * STEP_MS;
      frames.push({ ...interpolate(position, next, goal.fraction), ms: duration });
      return { frames, duration, crossing: { playerId: goal.playerId, x: goal.x } };
    }
    const length = Math.hypot(velocity.x, velocity.y);
    const stop = length <= STOP_SPEED || ms === MAX_FLIGHT_MS;
    if (stop || ms % FRAME_MS === 0) frames.push({ ...next, ms });
    if (stop) return { frames, duration: ms, crossing: null };
    const drag = Math.max(0, 1 - FRICTION * dt / length);
    velocity = { x: velocity.x * drag, y: velocity.y * drag };
    position = next;
  }
  return { frames, duration: MAX_FLIGHT_MS, crossing: null };
}

function interpolate(from: Point, to: Point, fraction: number): Point {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

export function ballAt(frames: BallFrame[], elapsed: number): Point {
  const first = frames[0];
  if (elapsed <= 0) return first;
  const last = frames[frames.length - 1];
  if (elapsed >= last.ms) return last;
  // Regular 40 ms frames with an extra exact endpoint belonging to that interval.
  const index = Math.min(Math.floor(elapsed / FRAME_MS), frames.length - 2);
  const from = frames[index];
  const to = frames[index + 1];
  return interpolate(from, to, (elapsed - from.ms) / (to.ms - from.ms));
}

export function goalieSaves(goalieX: number, crossingX: number): boolean {
  return Math.abs(goalieX - crossingX) <= GOALIE_HALF_WIDTH + BALL_RADIUS;
}
