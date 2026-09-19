import { SUBWAY_CONFIG, legalTargets, stationAt, type PlacementTarget, type Point, type SubwayState } from "./config";
import { validatePath } from "./bends";

// ============================================================================
// Next-step lookahead: where this line could reach if the selected target were
// built. Pure guidance — nothing is saved, reserved or committed, and the
// reducer revalidates every real placement independently.
// ============================================================================

const cloneState = (s: SubwayState): SubwayState => JSON.parse(JSON.stringify(s)) as SubwayState;

/** The board as it would stand with `preview` (plus any drafted bends) built. */
export function previewPlacement(
  game: SubwayState,
  playerId: string,
  lineIndex: number,
  preview: Point,
  bendDraft: Point[] = [],
): SubwayState | undefined {
  const clone = cloneState(game);
  const line = clone.players[playerId]?.lines[lineIndex];
  if (!line) return undefined;
  const station = stationAt(preview, game.stations);
  const via = [...(line.work ?? []), ...bendDraft];
  line.route.push({ x: preview.x, y: preview.y, ...(station ? { stationId: station.id } : {}), ...(via.length ? { via } : {}) });
  line.work = undefined;
  return clone;
}

/**
 * Holes to highlight as the step after `preview`.
 *
 * While a bend is being placed this is where the current segment could still
 * finish beyond that bend; otherwise it is where the next station could go.
 * An empty list means the selection leaves the line nowhere legal to continue.
 */
export function lookaheadTargets(
  game: SubwayState,
  playerId: string,
  lineIndex: number,
  { preview, bendDraft = [], bendPick = false }: { preview: Point | null | undefined; bendDraft?: Point[]; bendPick?: boolean },
): PlacementTarget[] {
  if (!game.players[playerId]?.lines[lineIndex] || !preview) return [];
  if (bendPick) {
    const out: PlacementTarget[] = [];
    const delayed=game.bendMode==='delayed';
    const pending=delayed?cloneState(game):game;
    if(delayed){
      if(validatePath(game,playerId,lineIndex,[preview],true,true))return [];
      pending.players[playerId].lines[lineIndex].work=[preview];
    }
    for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
      for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
        if (!validatePath(pending, playerId, lineIndex, delayed?[{x,y}]:[...bendDraft, preview, { x, y }], false, true)) out.push({ x, y });
      }
    }
    return out;
  }
  const next = previewPlacement(game, playerId, lineIndex, preview, bendDraft);
  return next ? legalTargets(next, playerId, lineIndex, false) : [];
}
