"use client";

import {
  STATIONS,
  SUBWAY_CONFIG,
  nodePoint,
  neighborhoodSize,
  surveyFulfilled,
  type LineContract,
  type PlacementTarget,
  type Point,
  type RouteNode,
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
// Stable station identities, independent of their randomized board positions.
const STATION_COLORS = ["#244b70", "#783d58", "#356044", "#77502c", "#4f477c", "#27656a", "#744535", "#354e83", "#245967", "#66502f"];
export const holePos = (p: Point) => toPx({ x: p.x, y: p.y });
export const nodePx = (n: RouteNode) => toPx(nodePoint(n));

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
  /** Solid but uncommitted next placement; never occupies a real station dock. */
  pending?: boolean;
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
  planningTargets = false,
  highlightedStations = [],
  canAct,
  drawn,
  onTapHole,
}: {
  game: SubwayState;
  targets: PlacementTarget[];
  /** Where the line could go *after* the selected target. Informational only. */
  following: PlacementTarget[];
  selected?: PlacementTarget;
  /** These clickable targets extend a sketch, not the next real placement. */
  planningTargets?: boolean;
  highlightedStations?: string[];
  canAct: boolean;
  drawn: DrawnLine[];
  onTapHole: (p: Point, slot?: number) => void;
}) {
  const targetSet = new Set(targets.map(targetKey));
  const followingSet = new Set(following.map(targetKey));
  const hasSelection = !!selected;

  const cells: Point[] = [];
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) cells.push({ x, y });
  }

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
    const center = holePos(cell);
    const radius = 0.45 * STEP;
    if (Math.hypot(bx - center.x, by - center.y) > radius) return;

    onTapHole(cell);
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
      <style>{`
        @keyframes subway-active-route-pulse {
          0%, 100% { opacity: .28; stroke-width: 22px; }
          50% { opacity: .72; stroke-width: 30px; }
        }
        .subway-active-route-glow {
          animation: subway-active-route-pulse 1.45s ease-in-out infinite;
          filter: drop-shadow(0 0 8px currentColor);
        }
        @media (prefers-reduced-motion: reduce) {
          .subway-active-route-glow { animation: none; opacity: .55; stroke-width: 25px; }
        }
      `}</style>
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="26" fill="#eaece2" />
      <rect
        x="16"
        y="16"
        width={VB_W - 32}
        height={VB_H - 32}
        rx="20"
        fill="none"
        stroke="#8da59b"
        strokeWidth="3"
        opacity="0.6"
      />

      {/* Footprints sit behind every peg, route and legal-target marker. */}
      {game.stations.map((area) => {
        const footprint = area.cells ?? [area];
        const occupied = new Set(footprint.map(p => `${p.x},${p.y}`));
        const color = STATION_COLORS[Math.max(0, STATIONS.findIndex(s => s.id === area.id)) % STATION_COLORS.length];
        const highlighted = highlightedStations.includes(area.id);
        const left=Math.min(...footprint.map(p=>p.x)), right=Math.max(...footprint.map(p=>p.x));
        const top=Math.min(...footprint.map(p=>p.y));
        const edges=footprint.flatMap(p=>{
          const {x,y}=holePos(p), h=STEP/2;
          return [
            !occupied.has(`${p.x},${p.y-1}`) ? `M${x-h},${y-h}h${STEP}` : "",
            !occupied.has(`${p.x+1},${p.y}`) ? `M${x+h},${y-h}v${STEP}` : "",
            !occupied.has(`${p.x},${p.y+1}`) ? `M${x+h},${y+h}h${-STEP}` : "",
            !occupied.has(`${p.x-1},${p.y}`) ? `M${x-h},${y+h}v${-STEP}` : "",
          ];
        }).join(" ");
        return <g key={area.id} aria-label={`${area.name}: ${neighborhoodSize(area)} neighborhood${highlighted ? ", destination target" : ""}`} pointerEvents="none">
          <title>{area.name} · {neighborhoodSize(area)} · Place a peg anywhere inside · No dock limit</title>
          {footprint.map(p=>{const pos=holePos(p);return <rect key={`${p.x},${p.y}`} x={pos.x-STEP/2} y={pos.y-STEP/2} width={STEP} height={STEP} fill={highlighted ? "#facc15" : color} fillOpacity={highlighted ? 0.38 : 0.18}/>;})}
          <path d={edges} fill="none" stroke={highlighted ? "#eab308" : color} strokeWidth={highlighted ? 8 : 3} strokeLinejoin="round"/>
          <text x={PAD+(left+right)/2*STEP} y={PAD+top*STEP-23} textAnchor="middle" fontSize="17" fontWeight="800" fill={color} stroke="#eaece2" strokeWidth="5" paintOrder="stroke">
            {area.name}
          </text>
          <text x={PAD+(left+right)/2*STEP} y={PAD+top*STEP-10} textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>{neighborhoodSize(area).toUpperCase()}</text>
        </g>;
      })}

      {cells.map((c) => {
        const p = holePos(c);
        return (
          <g key={`h-${c.x}-${c.y}`}>
            <circle cx={p.x} cy={p.y} r="8" fill="#c6d0c7" />
            <circle cx={p.x} cy={p.y} r="5.5" fill="#7c918b" />
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
              <g key={`t-${c.x}-${c.y}`} opacity={hasSelection && !planningTargets ? 0.35 : 1}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="13"
                  fill={planningTargets ? "#facc15" : "#4ade80"}
                  opacity={planningTargets ? 0.65 : hasSelection ? 0.15 : 0.28}
                  data-target={`${c.x},${c.y}`}
                  data-step={planningTargets ? "plan" : "1"}
                />
                <circle cx={p.x} cy={p.y} r="13" fill="none" stroke={planningTargets ? "#eab308" : "#4ade80"} strokeWidth="2.5" strokeDasharray={planningTargets ? "4 4" : undefined}>
                  {!hasSelection && (
                    <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1.6s" repeatCount="indefinite" />
                  )}
                </circle>
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={planningTargets ? "#713f12" : "#14532d"}>
                  {planningTargets ? "P" : "1"}
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
      {drawn.filter((d) => d.active && !d.ghost && !d.pending).flatMap((d) =>
        d.route.slice(1).map((n, i) => {
          const a = nodePx(d.route[i]);
          const b = nodePx(n);
          return (
            <line
              key={`active-${d.key}-${i}`}
              className="subway-active-route-glow"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={d.contract.color}
              strokeLinecap="round"
              pointerEvents="none"
              style={{ color: d.contract.color }}
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
              key={`o-${d.key}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={d.contract.code === "WH" ? "#475569" : "#fdf6e3"}
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
              opacity={d.ghost ? (d.stale ? 0.25 : 0.45) : 1}
              data-route-kind={d.ghost ? "plan" : d.pending ? "pending" : "built"}
            />
          );
        })
      )}

      {/* Pegs: the line's color inside, the owning company's color around. */}
      {drawn.filter(d => d.active && d.growing && !d.ghost && !d.pending && d.route.length > 0).map(d => {
        const p = nodePx(d.route[d.route.length - 1]);
        return <g key={`from-${d.key}`} pointerEvents="none" aria-label={`Build from here: ${d.contract.name}`}>
          <circle cx={p.x} cy={p.y} r="24" fill="none" stroke="#92400e" strokeWidth="4" />
          <rect x={p.x - 39} y={p.y - 53} width="78" height="25" rx="6" fill="#78350f" />
          <text x={p.x} y={p.y - 35} textAnchor="middle" fill="white" fontSize="17" fontWeight="900">FROM</text>
        </g>;
      })}
      {drawn.flatMap((d) =>
        d.route.map((n, i) => {
          if (d.anchored && i === 0) return null; // a real peg already sits there
          const p = nodePx(n);
          const isEndpoint = i === d.route.length - 1;
          const r = 11;
          return (
            <g key={`n-${d.key}-${i}`} data-peg-kind={d.ghost ? "plan" : d.pending ? "pending" : "built"} opacity={d.ghost ? (d.stale ? 0.35 : 0.55) : 1}>
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
              {(
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fontSize={d.ghost ? 11 : 8}
                  fontWeight="800"
                  fill={d.ghost ? d.contract.color : d.contract.code === "WH" ? "#17232d" : "#ffffff"}
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
