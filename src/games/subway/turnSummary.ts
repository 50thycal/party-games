import { contractById, type SubwayState } from "./config";

// ============================================================================
// Hand-off summary (DGLE playtest follow-up): what happened to a company while
// the iPad was with the opposition. Derived from public telemetry and events,
// so it works on the tablet projection that carries no private hands.
// ============================================================================

export type TurnSummary = {
  /** Net cash change since this company's last own action, in $M. */
  cashDelta: number;
  /** Lines the opposition completed meanwhile, by contract name. */
  completions: string[];
  /** Opposition narration since this company last acted, oldest first. */
  lines: string[];
};

const MAX_LINES = 6;
/** "Period 3: Bluebird Rail builds." is turn plumbing, not news. */
const isTurnAnnouncement = (text: string) => /^Period \d+: .* builds\.$/.test(text);

/** Nothing to show when the company has not acted yet or nothing happened. */
export function turnSummary(game: SubwayState, playerId: string): TurnSummary | null {
  const own = game.telemetry.filter(e => e.actorId === playerId);
  const last = own.at(-1);
  if (!last) return null;
  const since = game.telemetry.filter(e => e.actionNumber > last.actionNumber && e.actorId !== playerId);
  const me = game.players[playerId];
  const cashDelta = me ? me.money - (last.playersAfter[playerId]?.money ?? me.money) : 0;
  const completions = since.flatMap(e => {
    const before = e.playersBefore[e.actorId]?.completedLines ?? [];
    return (e.playersAfter[e.actorId]?.completedLines ?? []).filter(id => !before.includes(id)).map(id => contractById(id)?.name ?? id);
  });
  const lastOwnEvent = game.events.filter(e => e.actorId === playerId).at(-1);
  const lines = game.events
    .filter(e => (!lastOwnEvent || e.seq > lastOwnEvent.seq) && e.actorId !== playerId && e.kind !== "PLAN" && !isTurnAnnouncement(e.text))
    .map(e => e.text)
    .slice(-MAX_LINES);
  // Only an actual opposition action (or a cash change) is worth a flash.
  if (!since.length && cashDelta === 0) return null;
  return { cashDelta, completions, lines };
}
