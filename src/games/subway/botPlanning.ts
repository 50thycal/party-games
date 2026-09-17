import { SUBWAY_CONFIG, affordableCrews, buildableLines, contractOf, lineActionsRemaining, lineComplete, legalTargets, objectiveProgress, stationAt, routeContacts, contactToll, type SubwayState, type PlacementTarget } from './config';

const crewCost = (n: number) => n * (n + 1) / 2;

/** An unfinished line can still pay a destination or non-completion objective. */
export function immediateObjectiveBuild(state: SubwayState, id: string, index: number): {target: PlacementTarget; gain: number; toll: number} | undefined {
  const me=state.players[id], line=me.lines[index], others=Object.values(state.players).filter(p=>p.id!==id);
  const cards=[...me.engineeringHand,...me.destinationHand];
  if (!cards.length) return;
  const base=cards.reduce((n,c)=>n+objectiveProgress(c,me,others,state).points,0);
  let best: ReturnType<typeof immediateObjectiveBuild>;
  for (const target of legalTargets(state,id,index,false)) {
    const st=stationAt(target,state.stations), from=line.route.at(-1);
    const toll=from?contactToll(routeContacts(state,id,from,target)):0;
    const trial={...me,money:me.money-toll,lines:me.lines.map((l,i)=>i===index?{...l,route:[...l.route,{...target,...(st?{stationId:st.id}:{})}]}:l)};
    const next={...state,players:{...state.players,[id]:trial}};
    const gain=cards.reduce((n,c)=>n+objectiveProgress(c,trial,others,next).points,0)-base;
    if (gain>0 && (!best || gain-toll*4>best.gain-best.toll*4)) best={target,gain,toll};
  }
  return best;
}

/** Exact small scheduling search, optimistic about future geometry and tolls.
 * Each line can advance only once per round. Evaluate completion VP swings,
 * completion cash, crew costs and final debt, rather than cheapest crews alone.
 * No hidden state or future placement information is inspected.
 */
export function planBotCrews(state: SubwayState, id: string, cautious = false, prioritizeCompletion = false): number[] {
  const me = state.players[id], rounds = SUBWAY_CONFIG.timelinePeriods + 1 - state.currentPeriod;
  const remaining = me.lines.map(lineActionsRemaining);
  const available = new Set(buildableLines(state, id));
  type Plan = { cost: number; now: number[]; urgency: number };
  const memo = new Map<string, Plan>();
  function solve(left: number[], periods: number, first: boolean): Plan {
    if (left.every(n => n === 0)) return {cost: 0, now: [], urgency: 0};
    if (periods <= 0 || left.some(n => n > periods)) return {cost: Infinity, now: [], urgency: 0};
    const key = `${left}:${periods}:${first}`;
    const saved = memo.get(key); if (saved) return saved;
    let best: Plan = {cost: Infinity, now: [], urgency: -Infinity};
    for (let mask = 0; mask < 1 << left.length; mask++) {
      const now = left.flatMap((n,i) => mask & (1 << i) ? [i] : []);
      if (now.some(i => left[i] === 0 || (first && !available.has(i)))) continue;
      const rest = left.map((n,i) => n - Number(now.includes(i)));
      const later = solve(rest, periods - 1, false);
      const cost = crewCost(now.length) + later.cost;
      // Among equally cheap schedules, work early and prefer a completion or
      // a line with little slack. This also brings completion cash forward.
      const urgency = now.reduce((v,i) => v + 1 + left[i] / periods + (left[i] === 1 ? 3 : 0), 0);
      if (cost < best.cost || (cost === best.cost && urgency > best.urgency)) best = {cost, now, urgency};
    }
    memo.set(key, best); return best;
  }
  let bestValue = -Infinity, chosen: Plan = {cost: 0, now: [], urgency: 0};
  for (let mask = 0; mask < 1 << remaining.length; mask++) {
    const goals = remaining.map((n,i) => mask & (1 << i) ? n : 0);
    const plan = solve(goals, rounds, true);
    if (!Number.isFinite(plan.cost)) continue;
    const finishing = me.lines.filter((l,i) => goals[i] > 0 && !lineComplete(l));
    const reward = finishing.length * SUBWAY_CONFIG.completionReward;
    const cash = me.money - plan.cost + reward;
    const vp = finishing.reduce((v,l) => v + contractOf(l)!.completionVp - contractOf(l)!.incompletePenalty, 0);
    const all = remaining.every((n,i) => n === 0 || goals[i] > 0);
    const firstBonus = all && !state.firstCompletedPlayerId && me.engineeringHand.includes('crossing') ? 7 : 0;
    const value = vp + firstBonus + (prioritizeCompletion&&all?30:0) - Math.max(0, -cash) * SUBWAY_CONFIG.contact.debtVpPerMillion - plan.cost * (cautious ? .35 : .15);
    if (value > bestValue || (value === bestValue && plan.urgency > chosen.urgency)) {bestValue = value; chosen = plan;}
  }
  const now=[...chosen.now];
  const forecast=structuredClone(state);
  forecast.players[id].money-=crewCost(now.length);
  // Add immediately scoring work that the completion search cannot represent.
  // Recheck on BUILD as earlier hired lines may already have earned the goal.
  for (const i of Array.from(available)) {
    if (now.includes(i) || remaining[i]<=rounds) continue;
    const opportunity=immediateObjectiveBuild(forecast,id,i); if (!opportunity) continue;
    const extra=crewCost(now.length+1)-crewCost(now.length)+opportunity.toll;
    const cash=forecast.players[id].money;
    const debt=Math.max(0,extra-cash)-Math.max(0,-cash);
    if (opportunity.gain>extra*(cautious ? .35 : .15)+debt*SUBWAY_CONFIG.contact.debtVpPerMillion) {
      now.push(i);
      const st=stationAt(opportunity.target,forecast.stations);
      forecast.players[id].money-=extra;
      forecast.players[id].lines[i].route.push({...opportunity.target,...(st?{stationId:st.id}:{})});
    }
  }
  // Crews must be paid from cash on hand unless bridging debt is allowed.
  return now.slice(0, affordableCrews(state.players[id], now.length));
}
