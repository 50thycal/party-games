import type { Point, RouteContact, SubwayState } from './config';
/** Retained to read historical receipts; new games never charge station access. */
export type StationAccess = { contractId:string; ownerId:string; anchors:string[] };
/** Joining any transfer station, including with a starter, is free. Geometric crossings remain separate. */
export function stationAccessContacts(_state:SubwayState,_playerId:string,_lineIndex:number,_to:Point):RouteContact[] {
  return [];
}
