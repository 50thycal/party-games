"use client";

import {
  STATIONS,
  SUBWAY_CONFIG,
  nodePoint,
  slotPoint,
  stationAt,
  surveyFulfilled,
  type LineContract,
  type PlacementTarget,
  type Point,
  type RouteNode,
  type Station,
  type SubwayState,
} from "./config";

// ============================================================================
// The metropolitan pegboard, as a physical piece on the table.
//
// It has no camera of its own (DEC-023): it is laid out at its natural world
// size and the table camera moves over it like it moves over everything else.
// Taps map through the element's own bounding box, so whatever the camera is
// doing, a tap lands on the hole under the finger.
// ============================================================================

export const PAD = 62;
export const STEP = 82;
export const VB_W = PAD * 2 + (SUBWAY_CONFIG.board.columns - 1) * STEP;
export const VB_H = PAD * 2 + (SUBWAY_CONFIG.board.rows - 1) * STEP;

/** Peg-space → board pixels. Everything drawn on the board goes through this. */
const toPx = (p: Point) => ({ x: PAD + p.x * STEP, y: PAD + p.y * STEP });
export const holePos = (p: Point) => toPx({ x: p.x, y: p.y });
export const nodePx = (n: RouteNode) => toPx(nodePoint(n));
export const slotPx = (station: Station, slot: number) => toPx(slotPoint(station, slot));

export const targetKey = (t: PlacementTarget) => `${t.x},${t.y},${t.slot ?? "-"}`;

/** A line drawn on the board — a real route, or a phantom plan/sketch. */
export type DrawnLine = {
  key: string;
  route: RouteNode[];
  contract: LineContract;
  ownerColor: string;
  active: boolean;
  growing: boolean;
  ghost?: boolean;
  /** A saved plan that no longer matches reality; drawn extra-faint. */
  stale?: boolean;
  /** route[0] is a real node used only to anchor the first phantom segment. */
  anchored?: boolean;
  /** Index of route[0] within the full intended route, for peg numbering. */
  numberOffset?: number;
};

export function Board({
  game,
  targets,
  following,
  selected,
  canAct,
  drawn,
  onTapHole,
}: {
  game: SubwayState;
  targets: PlacementTarget[];
  /** Where the line could go *after* the selected target. Informational only. */
  following: PlacementTarget[];
  selected?: PlacementTarget;
  canAct: boolean;
  drawn: DrawnLine[];
  onTapHole: (p: Point, slot?: number) => void;
}) {
  const targetSet = new Set(targets.map(targetKey));
  const followingSet = new Set(following.map(targetKey));
  const targetCells = new Set(targets.map((t) => `${t.x},${t.y}`));
  const hasSelection = !!selected;

  const cells: Point[] = [];
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) cells.push({ x, y });
  }

  /** Which contract, if any, is docked in a given station slot. */
  const dockedIn = (stationId: string, slot: number) =>
    drawn.find(
      (d) => !d.ghost && d.route.some((n) => n.stationId === stationId && (n.stationSlot ?? 0) === slot)
    );

  // A click that survives the camera's drag filter is a real tap. The element's
  // own box already carries the camera transform, so no camera state is needed.
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canAct) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const s = rect.width / VB_W;
    const bx = (e.clientX - rect.left) / s;
    const by = (e.clientY - rect.top) / s;
    const cell = { x: Math.round((bx - PAD) / STEP), y: Math.round((by - PAD) / STEP) };
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= SUBWAY_CONFIG.board.columns ||
      cell.y >= SUBWAY_CONFIG.board.rows
    ) {
      return;
    }
    const station = stationAt(cell);
    const center = holePos(cell);
    const radius = (station ? 0.55 : 0.45) * STEP;
    if (Math.hypot(bx - center.x, by - center.y) > radius) return;

    if (!station) {
      onTapHole(cell);
      return;
    }
    // Tapping a station tile docks at whichever slot the tap landed nearest —
    // never an automatic choice.
    let nearest = 0;
    let nearestDist = Infinity;
    for (let slot = 0; slot < station.capacity; slot++) {
      const c = slotPx(station, slot);
      const d = Math.hypot(bx - c.x, by - c.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = slot;
      }
    }
    onTapHole(cell, nearest);
  };

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={VB_W}
      height={VB_H}
      onClick={onClick}
      className={`block ${canAct ? "cursor-crosshair" : ""}`}
      style={{ touchAction: "none" }}
    >
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="26" fill="#b98a58" />
      <rect
        x="16"
        y="16"
        width={VB_W - 32}
        height={VB_H - 32}
        rx="20"
        fill="none"
        stroke="#71533a"
        strokeWidth="3"
        opacity="0.6"
      />

      {cells.map((c) => {
        const p = holePos(c);
        return (
          <g key={`h-${c.x}-${c.y}`}>
            <circle cx={p.x} cy={p.y} r="8" fill="#8f6c49" />
            <circle cx={p.x} cy={p.y} r="5.5" fill="#5f4630" />
          </g>
        );
      })}

      {/* Public Survey Pins. They never occupy a hole, so they sit above and
          left of it and stay small enough not to hide a peg or string. */}
      {game.surveyPins.map((pin, i) => {
        const owner = game.players[pin.playerId];
        const p = holePos(pin);
        const cx = p.x - 21;
        const cy = p.y - 21;
        const done = !!owner && surveyFulfilled(owner, pin);
        return (
          <g key={`pin-${i}`}>
            <path
              d={`M ${cx} ${cy - 11} L ${cx + 9} ${cy} L ${cx} ${cy + 11} L ${cx - 9} ${cy} Z`}
              fill={done ? owner?.color ?? "#78716c" : "#fdf6e3"}
              stroke={owner?.color ?? "#78716c"}
              strokeWidth="3"
            />
            <text
              x={cx}
              y={cy + 3.5}
              textAnchor="middle"
              fontSize="10"
              fontWeight="800"
              fill={done ? "#ffffff" : owner?.color ?? "#78716c"}
            >
              {done ? "✓" : "S"}
            </text>
            <circle cx={cx} cy={cy} r="14.5" fill="none" stroke={owner?.color ?? "#000"} strokeWidth="2" opacity="0.85" />
          </g>
        );
      })}

      {/* Station tiles with one docking slot per unit of capacity.
          Marker precedence inside a tile (OD-7 / R 5.4): unselected current
          targets dim once anything is selected, a NEXT marker wins over an
          unselected current target on the same dock, and the selected NOW
          ring renders on top of everything. */}
      {STATIONS.map((s) => {
        const p = holePos(s);
        const major = s.kind === "major";
        const w = major ? 76 : 64;
        const h = 56;
        const highlight = targetCells.has(`${s.x},${s.y}`) && !hasSelection;
        const openDocks = Array.from({ length: s.capacity }, (_, i) => i).filter((i) => !dockedIn(s.id, i));
        const full = openDocks.length === 0;
        const words = s.name.split(" ");
        return (
          <g key={s.id} transform={`translate(${p.x},${p.y})`}>
            <rect x={-w / 2} y={-h / 2 + 2} width={w} height={h} rx="11" fill="#000" opacity="0.25" />
            <rect
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              rx="11"
              fill={major ? "#24384c" : "#4f6357"}
              stroke={highlight ? "#4ade80" : full ? "#b45309" : "#f5d98a"}
              strokeWidth={highlight ? 5 : 3.5}
            />
            {words.map((word, i) => (
              <text
                key={i}
                y={(words.length > 1 ? -19 : -14) + i * 11}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10.5"
                fontWeight="700"
              >
                {word}
              </text>
            ))}
            <text y={words.length > 1 ? 2 : -1} textAnchor="middle" fill="#f5d98a" fontSize="9" fontWeight="700">
              {major ? "MAJOR" : "MINOR"} · +{SUBWAY_CONFIG.stationScores[s.kind]} VP
            </text>
            {Array.from({ length: s.capacity }, (_, slot) => {
              const c = slotPx(s, slot);
              const dx = c.x - p.x;
              const dy = c.y - p.y;
              const docked = dockedIn(s.id, slot);
              const key = `${s.x},${s.y},${slot}`;
              const open = targetSet.has(key);
              const nextOpen = followingSet.has(key);
              const isSelected =
                !!selected && selected.x === s.x && selected.y === s.y && selected.slot === slot;
              return (
                <g key={slot}>
                  {open && !isSelected && (
                    <circle
                      cx={dx}
                      cy={dy}
                      r="13"
                      fill="#4ade80"
                      opacity={hasSelection ? 0.12 : 0.35}
                      data-target={key}
                      data-step="1"
                    >
                      {!hasSelection && (
                        <animate attributeName="opacity" values="0.65;0.2;0.65" dur="1.6s" repeatCount="indefinite" />
                      )}
                    </circle>
                  )}
                  {nextOpen && (!open || hasSelection) && (
                    <circle
                      cx={dx}
                      cy={dy}
                      r="12"
                      fill="#facc15"
                      opacity="0.25"
                      stroke="#ca8a04"
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                      data-target={key}
                      data-step="2"
                    />
                  )}
                  <circle
                    cx={dx}
                    cy={dy}
                    r="9"
                    fill={docked ? docked.contract.color : "#00000055"}
                    stroke={open && !hasSelection ? "#4ade80" : docked ? "#ffffff" : "#f5d98a"}
                    strokeWidth={open && !hasSelection ? 3 : 2}
                    strokeDasharray={docked || open ? "0" : "3 3"}
                  />
                  <text y={dy - 13} x={dx} textAnchor="middle" fontSize="8" fontWeight="800" fill="#f5d98a">
                    {slot + 1}
                  </text>
                  {isSelected && (
                    <>
                      <circle
                        cx={dx}
                        cy={dy}
                        r="15"
                        fill="#4ade80"
                        opacity="0.5"
                        data-target={key}
                        data-step="1"
                        data-selected="true"
                      />
                      <circle cx={dx} cy={dy} r="15" fill="none" stroke="#15803d" strokeWidth="4" />
                      <text x={dx} y={dy + 3.5} textAnchor="middle" fontSize="11" fontWeight="800" fill="#14532d">
                        1
                      </text>
                      <text x={dx} y={dy + 27} textAnchor="middle" fontSize="9" fontWeight="800" fill="#14532d">
                        NOW
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Normal-hole markers, in explicit precedence order (R 5.4):
          1. unselected current targets — dimmed once anything is selected,
             and fully ceded where a following marker shares the hole;
          2. following `2 / NEXT` markers, dashed;
          3. the selected `1 / NOW` marker, drawn last further below.
          Colour is never the only cue (DEC-013): the current step is a solid
          ring marked 1, the following step a dashed ring marked 2. */}
      {canAct &&
        targets
          .filter((t) => t.slot === undefined)
          .filter((t) => !(hasSelection && followingSet.has(targetKey(t))))
          .map((c) => {
            const isSelected =
              !!selected && selected.slot === undefined && selected.x === c.x && selected.y === c.y;
            if (isSelected) return null;
            const p = holePos(c);
            return (
              <g key={`t-${c.x}-${c.y}`} opacity={hasSelection ? 0.35 : 1}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="13"
                  fill="#4ade80"
                  opacity={hasSelection ? 0.15 : 0.28}
                  data-target={`${c.x},${c.y}`}
                  data-step="1"
                />
                <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="#4ade80" strokeWidth="2.5">
                  {!hasSelection && (
                    <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1.6s" repeatCount="indefinite" />
                  )}
                </circle>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#14532d">
                  1
                </text>
              </g>
            );
          })}
      {canAct &&
        following
          .filter((t) => t.slot === undefined)
          .map((c) => {
            const p = holePos(c);
            return (
              <g key={`f-${c.x}-${c.y}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="12"
                  fill="#facc15"
                  opacity="0.18"
                  data-target={`${c.x},${c.y}`}
                  data-step="2"
                />
                <circle cx={p.x} cy={p.y} r="12" fill="none" stroke="#ca8a04" strokeWidth="2.5" strokeDasharray="5 4" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#854d0e">
                  2
                </text>
              </g>
            );
          })}
      {canAct && selected && selected.slot === undefined && (
        <g key="selected-now">
          <circle
            cx={holePos(selected).x}
            cy={holePos(selected).y}
            r="15"
            fill="#4ade80"
            opacity="0.55"
            data-target={`${selected.x},${selected.y}`}
            data-step="1"
            data-selected="true"
          />
          <circle cx={holePos(selected).x} cy={holePos(selected).y} r="15" fill="none" stroke="#15803d" strokeWidth="4" />
          <text
            x={holePos(selected).x}
            y={holePos(selected).y + 4}
            textAnchor="middle"
            fontSize="12"
            fontWeight="800"
            fill="#14532d"
          >
            1
          </text>
          <text
            x={holePos(selected).x}
            y={holePos(selected).y - 22}
            textAnchor="middle"
            fontSize="10"
            fontWeight="800"
            fill="#14532d"
          >
            NOW
          </text>
        </g>
      )}

      {/* Strings: pale casing pass, then the line's own color. Each contract
          carries a distinct dash pattern so color is never the only cue.
          Phantom plans draw dashed and translucent; stale ones fainter still. */}
      {drawn.flatMap((d) =>
        d.route.slice(1).map((n, i) => {
          const a = nodePx(d.route[i]);
          const b = nodePx(n);
          return (
            <line
              key={`o-${d.key}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#fdf6e3"
              strokeWidth="13"
              strokeLinecap="round"
              opacity={d.ghost ? (d.stale ? 0.15 : 0.35) : 1}
            />
          );
        })
      )}
      {drawn.flatMap((d) =>
        d.route.slice(1).map((n, i) => {
          const a = nodePx(d.route[i]);
          const b = nodePx(n);
          return (
            <line
              key={`c-${d.key}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={d.contract.color}
              strokeWidth={d.ghost ? 6 : 8}
              strokeLinecap="round"
              strokeDasharray={d.ghost ? "10 12" : d.contract.dash}
              opacity={d.ghost ? (d.stale ? 0.35 : 0.7) : 1}
            />
          );
        })
      )}

      {/* Pegs: the line's color inside, the owning company's color around. */}
      {drawn.flatMap((d) =>
        d.route.map((n, i) => {
          if (d.anchored && i === 0) return null; // a real peg already sits there
          const p = nodePx(n);
          const isEndpoint = i === d.route.length - 1;
          const r = n.stationId ? 7.5 : 11;
          return (
            <g key={`n-${d.key}-${i}`} opacity={d.ghost ? (d.stale ? 0.45 : 0.75) : 1}>
              {isEndpoint && d.growing && !d.ghost && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 5}
                  fill="none"
                  stroke={d.contract.color}
                  strokeWidth="2.5"
                  opacity={d.active ? 1 : 0.45}
                >
                  {d.active && (
                    <animate attributeName="r" values={`${r + 4};${r + 10};${r + 4}`} dur="1.4s" repeatCount="indefinite" />
                  )}
                </circle>
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={d.ghost ? "#fdf6e3" : d.contract.color}
                stroke={d.ghost ? d.contract.color : d.ownerColor}
                strokeWidth={d.ghost ? 3 : 3.5}
                strokeDasharray={d.ghost ? "4 3" : undefined}
              />
              {!n.stationId && (
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill={d.ghost ? d.contract.color : "#ffffff"}
                >
                  {d.ghost ? (d.numberOffset ?? 0) + i : d.contract.code}
                </text>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}
