/** Audit-only preferences. No rules, hidden information or live bot settings change. */
import { destinationById, lineComplete, objectiveProgress, type SubwayPlayer, type SubwayState } from './config';
import { engineeringPotential, missionPotential } from './objectiveGuidance';
import { companyComponents } from './network';

export const AUDIT_POLICY_VERSION = '1';
export const completionGoals = new Set(['gentle','bend','straight','approach','network','minimal','crossing','solvent','perimeter','three-fronts']);
export function auditPotential(s:SubwayState, me:SubwayPlayer, cardId:string):number {
  const owned=me.engineeringHand.includes(cardId)||me.destinationHand.includes(cardId);
  if(!owned) return 0;
  const focused={...me,engineeringHand:destinationById(cardId)?[]:[cardId],destinationHand:destinationById(cardId)?[cardId]:[]};
  const others=Object.values(s.players).filter(p=>p.id!==me.id);
  let value=objectiveProgress(cardId,me,others,s).points*12;
  value+=engineeringPotential(s,focused)*4+missionPotential(s,focused)*5;
  if(completionGoals.has(cardId)) value+=me.lines.filter(lineComplete).length*5;
  if(cardId==='network'||cardId==='interchange') value-=companyComponents(me).length*5;
  if(cardId==='interchange') value+=Math.max(0,...s.stations.filter(st=>st.kind==='major').map(st=>me.lines.filter(l=>l.route.some(n=>n.stationId===st.id)).length))*5;
  if(cardId==='minimal') value+=s.surveyPins.filter(pin=>pin.playerId===me.id&&me.lines.some(l=>l.route.some(n=>!n.stationId&&n.x===pin.x&&n.y===pin.y))).length*15;
  if(cardId==='solvent') value-=Math.max(0,5-me.money)*3;
  return value;
}
