import { contractById, type SubwayState } from "./config";

// ============================================================================
// Hand-off summary (DGLE playtest follow-up): what happened to a company while
// the iPad was with the opposition. Derived from public telemetry and events,
// so it works on the tablet projection that carries no private hands.
// ============================================================================

export type TurnSummary = {
  /** Net cash change since this company's last own action, in $M. */
  cashDelta: number;
  receipts: {playerId:string;name:string;amount:number}[];
  opponentIncome: number;
  bankIncome: number;
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

  const since = game.telemetry.filter(e => e.actionNumber > (last?.actionNumber??0) && e.actorId !== playerId && e.phaseBefore === "CONSTRUCTION");
  const me = game.players[playerId];
  const baseline=last?.playersAfter[playerId]?.money??since[0]?.playersBefore[playerId]?.money;
  const cashDelta = me && baseline!==undefined ? me.money - baseline : 0;
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
  // Other companies can change your balance only through transfers (or their Undo).
  // Use accepted-action balance deltas rather than the capped animation event queue.
  const byPayer=new Map<string,number>();
  for(const e of since){
    const before=e.playersBefore[playerId]?.money,after=e.playersAfter[playerId]?.money;
    if(before===undefined||after===undefined)continue;
    byPayer.set(e.actorId,(byPayer.get(e.actorId)??0)+after-before);
  }
  const receipts=Array.from(byPayer).filter(([,amount])=>amount!==0).map(([id,amount])=>({playerId:id,name:game.players[id]?.name??id,amount}));
  const opponentIncome=receipts.reduce((sum,p)=>sum+p.amount,0);
  return { cashDelta, completions, lines, receipts, opponentIncome, bankIncome:cashDelta-opponentIncome };
}
