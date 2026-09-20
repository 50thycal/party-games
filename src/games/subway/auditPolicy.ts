/** Audit-only preferences. No rules, hidden information or live bot settings change. */
import { destinationById, lineComplete, objectiveProgress, type SubwayPlayer, type SubwayState } from './config';
import { engineeringPotential, missionPotential } from './objectiveGuidance';
import { ENGINEERING_CARDS } from './engineering';

export const AUDIT_POLICY_VERSION = '6';
export const completionGoals = new Set(ENGINEERING_CARDS.filter(c=>c.tags.includes('Complete Line')).map(c=>c.id));
export function auditPotential(s:SubwayState, me:SubwayPlayer, cardId:string):number {
  const owned=me.engineeringHand.includes(cardId)||me.destinationHand.includes(cardId);
  if(!owned) return 0;
  const focused={...me,engineeringHand:destinationById(cardId)?[]:[cardId],destinationHand:destinationById(cardId)?[cardId]:[]};
  const others=Object.values(s.players).filter(p=>p.id!==me.id);
  let value=objectiveProgress(cardId,me,others,s).points*12;
  value+=engineeringPotential(s,focused)*4+missionPotential(s,focused)*5;
  if(completionGoals.has(cardId)) value+=me.lines.filter(lineComplete).length*5;
  return value;
}
