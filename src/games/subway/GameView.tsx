"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import { EngineeringCardFace } from "./CardArt";
import {
  LINE_CONTRACTS,
  STATIONS,
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  actionsRemaining,
  buildableLines,
  constructionById,
  contractOf,
  engineeringById,
  lineActionsRemaining,
  lineComplete,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  picksRemaining,
  procurementPlayerId,
  schedulingById,
  stationAt,
  stationConnections,
  validateNode,
  type ConstructionCardId,
  type LineContract,
  type PlayerLine,
  type Point,
  type RouteNode,
  type SchedulingCardId,
  type Station,
  type SubwayPlayer,
  type SubwayState,
} from "./config";

// ============================================================================
// Small helpers
// ============================================================================

const money = (n: number) => `$${n}M`;

const PHASE_LABELS: Record<string, string> = {
  SETUP: "Setup",
  PROCUREMENT: "Procurement",
  ENGINEERING: "Engineering",
  STARTER_PLACEMENT: "Starter placement",
  CONSTRUCTION: "Construction",
  SCORING: "Scoring",
  RESULTS: "Results",
};

const lineLabel = (line: PlayerLine): string => contractOf(line)?.name ?? "Line";

type Status = { headline: string; tone: "act" | "wait" | "info"; detail?: string };

/** Per-client status derived from authoritative state, never from the shared
 *  broadcast message — so it can never claim the wrong player is acting. */
function statusFor(game: SubwayState, me: SubwayPlayer | undefined, isHost: boolean): Status {
  const opponent = me
    ? game.playerOrder.map((id) => game.players[id]).find((p) => p && p.id !== me.id)
    : undefined;
  const oppName = opponent?.name ?? "the opposition";

  if (!me) return { headline: "You are spectating this two-company contest.", tone: "info" };

  switch (game.phase) {
    case "SETUP":
      return isHost
        ? { headline: "Start the game when both companies are ready.", tone: "act" }
        : { headline: "Waiting for the host to start.", tone: "wait" };
    case "PROCUREMENT": {
      const active = procurementPlayerId(game);
      if (active !== me.id) {
        return { headline: `${game.players[active ?? ""]?.name ?? "Opponent"} is drafting.`, tone: "wait" };
      }
      const left = picksRemaining(game, me.id);
      const mustBuy = me.lines.length === 0 && left <= 1;
      return {
        headline: `Your pick — ${left} left.`,
        tone: "act",
        detail: mustBuy
          ? "Last pick and no contract yet: you must sign a Line Contract."
          : `Sign a Line Contract (up to ${SUBWAY_CONFIG.maxLinesPerPlayer}), take a face-up card, or pass.`,
      };
    }
    case "ENGINEERING":
      return me.engineeringLocked
        ? { headline: `Committed face down — waiting for ${oppName}.`, tone: "wait" }
        : { headline: "Commit exactly 3 Engineering cards face down.", tone: "act" };
    case "STARTER_PLACEMENT": {
      const pending = me.lines.filter((l) => !l.route.length);
      return pending.length
        ? {
            headline: `Place the free starter peg for your ${lineLabel(pending[0])}.`,
            tone: "act",
            detail: me.lines.length > 1 ? `${pending.length} of ${me.lines.length} still to place.` : undefined,
          }
        : { headline: `Starters placed — waiting for ${oppName}.`, tone: "wait" };
    }
    case "CONSTRUCTION": {
      if (game.periodStep === "COMMIT") {
        if (!me.commitment) {
          return {
            headline: `Period ${game.currentPeriod} — commit in secret.`,
            tone: "act",
            detail: "Pick the line you will build, or pass. Both companies reveal together.",
          };
        }
        return {
          headline: `Locked in for period ${game.currentPeriod}.`,
          tone: "wait",
          detail: `Waiting for ${oppName} to commit.`,
        };
      }
      const actorId = game.resolveQueue[0];
      if (actorId === me.id) {
        const restriction = me.pendingActions[0];
        return {
          headline: `Period ${game.currentPeriod} — your build.`,
          tone: "act",
          detail:
            restriction === null
              ? "Extra crew: tap a highlighted hole on either of your lines."
              : "Tap a highlighted hole to extend the committed line.",
        };
      }
      return {
        headline: `Period ${game.currentPeriod} — ${game.players[actorId]?.name ?? "opponent"} builds.`,
        tone: "wait",
        detail: game.resolveQueue.includes(me.id) ? "You build next this period." : undefined,
      };
    }
    case "SCORING":
      return isHost
        ? { headline: "Construction is over. Reveal Engineering and score.", tone: "act" }
        : { headline: "Waiting for the host to reveal the scoring.", tone: "wait" };
    case "RESULTS":
      return { headline: game.message, tone: "info" };
    default:
      return { headline: game.message, tone: "info" };
  }
}

// ============================================================================
// Card primitives
// ============================================================================

function CardShell({
  title,
  tag,
  children,
  selected,
  disabled,
  disabledReason,
  onClick,
}: {
  title: string;
  tag?: string;
  children?: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`w-44 shrink-0 rounded-xl border-2 p-3 text-left shadow-sm transition ${
        selected ? "border-amber-500 bg-amber-100 ring-2 ring-amber-300" : "border-stone-300 bg-[#fffaf0]"
      } ${disabled ? "opacity-45" : interactive ? "hover:-translate-y-0.5 hover:border-stone-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <strong className="text-sm leading-tight text-stone-900">{title}</strong>
        {tag && (
          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-100">
            {tag}
          </span>
        )}
      </div>
      {children && <p className="mt-1 text-xs leading-snug text-stone-600">{children}</p>}
      {disabled && disabledReason && (
        <p className="mt-1 text-[11px] font-semibold text-red-800">{disabledReason}</p>
      )}
    </button>
  );
}

function ContractCard({
  contract,
  accent,
  progress,
  status,
  onClick,
  disabled,
  disabledReason,
}: {
  contract: LineContract;
  accent?: string;
  progress?: { built: number; total: number };
  /** Replaces the price when the contract is no longer buyable. */
  status?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const interactive = !!onClick && !disabled;
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-sm">{contract.name}</strong>
        {status ? (
          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-100">
            {status}
          </span>
        ) : (
          <span className="text-sm font-black">
            {progress ? `${progress.built}/${progress.total}` : money(contract.cost)}
          </span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
        <span>{contract.nodes} nodes</span>
        <span>{contract.nodes - 1} build actions</span>
        <span>Complete +{contract.completionVp} VP</span>
        <span>Major +{contract.stationBonus} VP</span>
        <span className="col-span-2">Incomplete {contract.incompletePenalty} VP</span>
      </div>
      {contract.special && <p className="mt-1 text-[11px] font-semibold text-amber-800">{contract.special}</p>}
      {progress && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full"
            style={{ width: `${(progress.built / progress.total) * 100}%`, background: accent ?? "#78716c" }}
          />
        </div>
      )}
      {disabled && disabledReason && (
        <p className="mt-1 text-[11px] font-semibold text-red-800">{disabledReason}</p>
      )}
    </>
  );

  const shell = "w-full rounded-xl border-2 bg-[#fffaf0] p-3 text-left text-stone-900 shadow-sm";
  const style = { borderColor: accent ?? "#d6d3d1" };

  if (!onClick) return <div className={`${shell} ${disabled ? "opacity-50" : ""}`} style={style}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`${shell} transition ${disabled ? "opacity-45" : "hover:-translate-y-0.5 hover:shadow-md"}`}
      style={style}
    >
      {body}
    </button>
  );
}

// ============================================================================
// Pegboard
// ============================================================================

const VB = 780; // SVG viewBox size
const PAD = 62;
const STEP = (VB - PAD * 2) / (SUBWAY_CONFIG.board.columns - 1);
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;

const holePos = (p: Point) => ({ x: PAD + p.x * STEP, y: PAD + p.y * STEP });

/** Where a docked connection sits inside its station tile. */
const slotOffset = (station: Station, slot: number) => ({
  dx: (slot - (station.capacity - 1) / 2) * 26,
  dy: 15,
});

function nodeRenderPos(node: RouteNode) {
  const base = holePos(node);
  if (!node.stationId) return base;
  const station = stationAt(node);
  if (!station) return base;
  const { dx, dy } = slotOffset(station, node.stationSlot ?? 0);
  return { x: base.x + dx, y: base.y + dy };
}

type ViewTransform = { scale: number; x: number; y: number };

const clampView = (v: ViewTransform): ViewTransform => {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  const lo = Math.min(0.25 * VB - VB * scale, 0.75 * VB - VB * scale);
  const hi = 0.75 * VB;
  return { scale, x: Math.min(hi, Math.max(lo, v.x)), y: Math.min(hi, Math.max(lo, v.y)) };
};

function Board({
  game,
  legalCells,
  canAct,
  activeLine,
  onTapHole,
}: {
  game: SubwayState;
  legalCells: Point[];
  canAct: boolean;
  activeLine?: { playerId: string; lineIndex: number };
  onTapHole: (p: Point) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    moved: boolean;
    last: { x: number; y: number } | null;
    pinch: { dist: number; view: ViewTransform } | null;
  }>({ moved: false, last: null, pinch: null });

  const pxToVb = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? VB / rect.width : 1;
  };

  const clientToBoard = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const f = pxToVb();
    const vx = (clientX - rect.left) * f;
    const vy = (clientY - rect.top) * f;
    return { x: (vx - view.x) / view.scale, y: (vy - view.y) / view.scale };
  };

  const zoomAtCenter = (factor: number) => {
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
      const anchorX = (VB / 2 - v.x) / v.scale;
      const anchorY = (VB / 2 - v.y) / v.scale;
      return clampView({ scale, x: VB / 2 - anchorX * scale, y: VB / 2 - anchorY * scale });
    });
  };

  // Wheel zoom (non-passive so the page does not scroll with it).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const f = VB / rect.width;
      const vx = (e.clientX - rect.left) * f;
      const vy = (e.clientY - rect.top) * f;
      setView((v) => {
        const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const ax = (vx - v.x) / v.scale;
        const ay = (vy - v.y) / v.scale;
        return clampView({ scale, x: vx - ax * scale, y: vy - ay * scale });
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, last: { x: e.clientX, y: e.clientY }, pinch: null };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), view };
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && gesture.current.pinch) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && gesture.current.pinch.dist > 0) {
        const start = gesture.current.pinch.view;
        const rect = svgRef.current!.getBoundingClientRect();
        const f = VB / rect.width;
        const midX = ((a.x + b.x) / 2 - rect.left) * f;
        const midY = ((a.y + b.y) / 2 - rect.top) * f;
        const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.scale * (dist / gesture.current.pinch.dist)));
        const ax = (midX - start.x) / start.scale;
        const ay = (midY - start.y) / start.scale;
        setView(clampView({ scale, x: midX - ax * scale, y: midY - ay * scale }));
      }
      return;
    }

    const last = gesture.current.last;
    if (pointers.current.size === 1 && last) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (!gesture.current.moved && Math.hypot(dx, dy) > 6) gesture.current.moved = true;
      if (gesture.current.moved) {
        const f = pxToVb();
        setView((v) => clampView({ ...v, x: v.x + dx * f, y: v.y + dy * f }));
        gesture.current.last = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // A pinch finger lifted: keep panning with the remaining finger.
      const [rest] = Array.from(pointers.current.values());
      gesture.current.last = rest;
      gesture.current.pinch = null;
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current.pinch = null;
    if (!wasTap || !canAct) return;

    // Snap the tap to the nearest peg hole. Station tiles get a wider radius so
    // tapping anywhere on the tile docks the line.
    const board = clientToBoard(e.clientX, e.clientY);
    const cell = { x: Math.round((board.x - PAD) / STEP), y: Math.round((board.y - PAD) / STEP) };
    if (
      cell.x < 0 || cell.y < 0 ||
      cell.x >= SUBWAY_CONFIG.board.columns || cell.y >= SUBWAY_CONFIG.board.rows
    ) {
      return;
    }
    const center = holePos(cell);
    const radius = (stationAt(cell) ? 0.55 : 0.45) * STEP;
    if (Math.hypot(board.x - center.x, board.y - center.y) <= radius) onTapHole(cell);
  };

  const players = game.playerOrder.map((id) => game.players[id]).filter(Boolean);
  const legalSet = new Set(legalCells.map((c) => `${c.x},${c.y}`));
  const activeBuilderId = game.phase === "CONSTRUCTION" && game.periodStep === "RESOLVE" ? game.resolveQueue[0] : undefined;

  const cells: Point[] = [];
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) cells.push({ x, y });
  }

  return (
    <section className="overflow-hidden rounded-3xl border-4 border-[#5d4127] bg-[#8a6844] shadow-2xl">
      <div className="flex items-center justify-between gap-2 bg-[#43301f] px-3 py-2 text-amber-50">
        <strong className="text-xs tracking-widest sm:text-sm">METROPOLITAN PEGBOARD</strong>
        <div className="flex items-center gap-1.5 text-sm">
          <button onClick={() => zoomAtCenter(1 / 1.25)} aria-label="Zoom out" className="rounded-md bg-white/15 px-2.5 py-0.5 font-bold hover:bg-white/25">
            −
          </button>
          <span className="w-11 text-center text-xs tabular-nums">{Math.round(view.scale * 100)}%</span>
          <button onClick={() => zoomAtCenter(1.25)} aria-label="Zoom in" className="rounded-md bg-white/15 px-2.5 py-0.5 font-bold hover:bg-white/25">
            +
          </button>
          <button onClick={() => setView({ scale: 1, x: 0, y: 0 })} className="rounded-md bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25">
            Reset
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${VB}`}
        className={`aspect-square w-full touch-none select-none ${canAct ? "cursor-crosshair" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* All pointer handling lives on the svg itself, so decorations can
            never swallow a tap. */}
        <rect x="0" y="0" width={VB} height={VB} fill="#8a6844" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`} pointerEvents="none">
          <rect x="16" y="16" width={VB - 32} height={VB - 32} rx="26" fill="#b98a58" />
          <rect x="16" y="16" width={VB - 32} height={VB - 32} rx="26" fill="none" stroke="#71533a" strokeWidth="3" opacity="0.6" />

          {cells.map((c) => {
            const p = holePos(c);
            return (
              <g key={`h-${c.x}-${c.y}`}>
                <circle cx={p.x} cy={p.y} r="8" fill="#8f6c49" />
                <circle cx={p.x} cy={p.y} r="5.5" fill="#5f4630" />
              </g>
            );
          })}

          {/* Station tiles with one docking slot per unit of capacity */}
          {STATIONS.map((s) => {
            const p = holePos(s);
            const major = s.kind === "major";
            const w = major ? 76 : 64;
            const h = 56;
            const connections = stationConnections(game, s.id);
            const highlight = legalSet.has(`${s.x},${s.y}`);
            const full = connections.length >= s.capacity;
            // Two-word names wrap so they never spill outside the tile.
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
                  const { dx, dy } = slotOffset(s, slot);
                  const owner = connections.find(
                    ({ line }) => line.route.find((n) => n.stationId === s.id)?.stationSlot === slot
                  );
                  return (
                    <circle
                      key={slot}
                      cx={dx}
                      cy={dy}
                      r="9"
                      fill="#00000055"
                      stroke={owner ? game.players[owner.playerId].color : "#f5d98a"}
                      strokeWidth="2"
                      strokeDasharray={owner ? "0" : "3 3"}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Legal placement targets */}
          {canAct &&
            legalCells.map((c) => {
              if (stationAt(c)) return null; // station tiles glow via their stroke
              const p = holePos(c);
              return (
                <g key={`t-${c.x}-${c.y}`}>
                  <circle cx={p.x} cy={p.y} r="13" fill="#4ade80" opacity="0.28" />
                  <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="#4ade80" strokeWidth="2.5">
                    <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}

          {/* Strings: pale casing pass, then the colored pass. A company's
              second contract is drawn dashed so the two lines stay legible. */}
          {players.flatMap((pl) =>
            pl.lines.flatMap((line, li) =>
              line.route.slice(1).map((n, i) => {
                const a = nodeRenderPos(line.route[i]);
                const b = nodeRenderPos(n);
                return (
                  <line key={`o-${pl.id}-${li}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fdf6e3" strokeWidth="13" strokeLinecap="round" />
                );
              })
            )
          )}
          {players.flatMap((pl) =>
            pl.lines.flatMap((line, li) =>
              line.route.slice(1).map((n, i) => {
                const a = nodeRenderPos(line.route[i]);
                const b = nodeRenderPos(n);
                return (
                  <line
                    key={`c-${pl.id}-${li}-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={pl.color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={li === 0 ? undefined : "18 11"}
                  />
                );
              })
            )
          )}

          {/* Pegs */}
          {players.flatMap((pl) =>
            pl.lines.flatMap((line, li) =>
              line.route.map((n, i) => {
                const p = nodeRenderPos(n);
                const isEndpoint = i === line.route.length - 1;
                const growing = !lineComplete(line);
                const isActiveLine = activeLine?.playerId === pl.id && activeLine.lineIndex === li;
                const isBuilding = pl.id === activeBuilderId && growing;
                const r = n.stationId ? 7.5 : 11;
                return (
                  <g key={`n-${pl.id}-${li}-${i}`}>
                    {isEndpoint && growing && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r + 5}
                        fill="none"
                        stroke={pl.color}
                        strokeWidth="2.5"
                        opacity={isActiveLine || isBuilding ? 1 : 0.45}
                      >
                        {isActiveLine && (
                          <animate attributeName="r" values={`${r + 4};${r + 10};${r + 4}`} dur="1.4s" repeatCount="indefinite" />
                        )}
                      </circle>
                    )}
                    <circle cx={p.x} cy={p.y} r={r} fill={pl.color} stroke="#ffffff" strokeWidth="3" />
                    {li === 0 ? (
                      <circle cx={p.x - r / 4} cy={p.y - r / 3} r={r / 3.6} fill="#ffffff" opacity="0.5" />
                    ) : (
                      <circle cx={p.x} cy={p.y} r={r / 2.4} fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.85" />
                    )}
                  </g>
                );
              })
            )
          )}
        </g>
      </svg>
    </section>
  );
}

// ============================================================================
// Period tracker — replaces the old Gantt now that schedules are per period
// ============================================================================

function PeriodTracker({ game, myId }: { game: SubwayState; myId: string }) {
  const periods = SUBWAY_CONFIG.timelinePeriods;
  const inConstruction = game.phase === "CONSTRUCTION";
  const periodsLeft = Math.max(0, periods - game.currentPeriod + 1);

  return (
    <section className="rounded-2xl border border-stone-300 bg-[#f6edda] p-3 text-stone-900">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wider">Construction timeline</h3>
        <span className="text-xs text-stone-600">
          {inConstruction ? `${periodsLeft} of ${periods} periods left` : `${periods} periods`}
        </span>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: periods }, (_, i) => {
          const period = i + 1;
          const past = inConstruction && period < game.currentPeriod;
          const current = inConstruction && period === game.currentPeriod;
          return (
            <div
              key={i}
              className={`flex h-7 flex-1 items-center justify-center rounded text-[11px] font-bold ${
                current
                  ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                  : past
                    ? "bg-stone-300 text-stone-500"
                    : "bg-white/70 text-stone-500"
              }`}
            >
              {period}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const owed = actionsRemaining(p);
          const behind = inConstruction && owed > periodsLeft;
          const isPriority = id === game.priorityPlayerId;
          const committed = p.commitment;
          const showCommit =
            inConstruction && (game.periodStep === "RESOLVE" || id === myId) && !!committed;

          return (
            <div key={id} className="rounded-lg bg-white/60 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate text-xs font-bold">{p.name}</span>
                <span
                  className={`rounded px-1 text-[10px] font-black ${
                    isPriority ? "bg-amber-400 text-stone-900" : "bg-stone-300 text-stone-600"
                  }`}
                >
                  {isPriority ? "P1" : "P2"}
                </span>
                {inConstruction && (
                  <span className={`ml-auto text-[11px] font-bold ${behind ? "text-red-700" : "text-stone-500"}`}>
                    {owed} action{owed === 1 ? "" : "s"} owed
                  </span>
                )}
              </div>

              {inConstruction && (
                <p className="mt-0.5 text-[11px] text-stone-600">
                  {showCommit
                    ? committed!.kind === "pass"
                      ? "Committed: pass"
                      : `Committed: ${lineLabel(p.lines[committed!.lineIndex])}`
                    : game.periodStep === "COMMIT"
                      ? committed
                        ? "Locked in"
                        : "Choosing…"
                      : ""}
                </p>
              )}

              <div className="mt-1 space-y-1">
                {p.lines.length === 0 && <p className="text-[11px] italic text-stone-400">No contract</p>}
                {p.lines.map((line, li) => {
                  const contract = contractOf(line);
                  if (!contract) return null;
                  const built = Math.max(0, line.route.length);
                  return (
                    <div key={li} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate text-[11px] font-semibold">{contract.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(built / contract.nodes) * 100}%`,
                            background: p.color,
                            opacity: li === 0 ? 1 : 0.6,
                          }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-stone-600">
                        {built}/{contract.nodes}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// Phase panels
// ============================================================================

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/70 p-4 text-stone-900">
      <h3 className="font-bold">{title}</h3>
      {children}
    </section>
  );
}

function MarketPanel({
  game,
  me,
  busy,
  act,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const myTurn = procurementPlayerId(game) === me.id;
  const left = picksRemaining(game, me.id);
  const mustBuy = me.lines.length === 0 && left <= 1;
  const atLineCap = me.lines.length >= SUBWAY_CONFIG.maxLinesPerPlayer;
  const eng = marketEngineering(game.market);
  const sch = marketScheduling(game.market);
  const con = marketConstruction(game.market);

  const contractReason = (contract: LineContract): string | undefined => {
    if (!myTurn) return undefined;
    if (atLineCap) return `Limit ${SUBWAY_CONFIG.maxLinesPerPlayer} contracts`;
    if (me.money < contract.cost) return "Not enough money";
    return undefined;
  };

  return (
    <Panel title={`Line Contracts on offer — pick ${game.procurementPick + 1} of ${game.procurementOrder.length}`}>
      <p className="mt-1 text-sm text-stone-600">
        {myTurn
          ? mustBuy
            ? "This is your last pick and you have no contract — you must sign one."
            : `Sign up to ${SUBWAY_CONFIG.maxLinesPerPlayer} contracts. You have ${left} pick${left === 1 ? "" : "s"} left and ${money(me.money)}.`
          : `${game.players[procurementPlayerId(game) ?? ""]?.name ?? "The opposition"} is picking.`}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {LINE_CONTRACTS.map((contract) => {
          const available = game.contractMarket.includes(contract.id);
          const ownedBy = game.playerOrder.find((id) =>
            game.players[id]?.lines.some((l) => l.contractId === contract.id)
          );
          if (!available) {
            return (
              <ContractCard
                key={contract.id}
                contract={contract}
                accent={ownedBy ? game.players[ownedBy].color : undefined}
                status={ownedBy === me.id ? "Yours" : "Taken"}
                disabled
              />
            );
          }
          const reason = contractReason(contract);
          return (
            <ContractCard
              key={contract.id}
              contract={contract}
              onClick={myTurn ? () => act("PROCURE", { choice: "contract", contractId: contract.id }) : undefined}
              disabled={busy || !!reason}
              disabledReason={reason}
            />
          );
        })}
      </div>

      <h4 className="mt-4 text-sm font-bold">Face-up cards</h4>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
        <div className="w-44 shrink-0">
          <EngineeringCardFace card={eng} color={me.color} compact />
        </div>
        <CardShell title={sch.name} tag="Scheduling">{sch.description}</CardShell>
        <CardShell title={con.name} tag="Construction">{con.description}</CardShell>
      </div>

      {myTurn && (
        <div className="mt-2 flex flex-wrap gap-2">
          {(["engineering", "scheduling", "construction"] as const).map((kind) => (
            <button
              key={kind}
              disabled={busy || mustBuy}
              onClick={() => act("PROCURE", { choice: kind })}
              className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-bold capitalize text-white disabled:opacity-35"
            >
              Take {kind}
            </button>
          ))}
          <button
            disabled={busy || mustBuy}
            onClick={() => act("PROCURE", { choice: "pass" })}
            className="rounded-lg border border-stone-400 px-3 py-2 text-xs font-bold text-stone-700 disabled:opacity-35"
          >
            Pass
          </button>
        </div>
      )}
    </Panel>
  );
}

function EngineeringPanel({
  me,
  chosen,
  setChosen,
  busy,
  act,
}: {
  me: SubwayPlayer;
  chosen: string[];
  setChosen: (v: string[]) => void;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  if (me.engineeringLocked) {
    return (
      <Panel title="Engineering committed">
        <p className="mt-1 text-sm text-stone-600">
          Your three cards are locked face down. The opposition cannot see them until scoring — your own
          copies stay visible below all game.
        </p>
      </Panel>
    );
  }

  const toggle = (id: string) =>
    setChosen(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < 3 ? [...chosen, id] : chosen
    );

  return (
    <Panel title={`Commit exactly 3 Engineering cards (${chosen.length}/3)`}>
      <p className="mt-1 text-sm text-stone-600">
        Each diagram shows the shape the scorer looks for. Uncommitted cards stay in your hand.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {me.engineeringHand.map((id, i) => (
          <EngineeringCardFace
            key={`${id}-${i}`}
            card={id}
            color={me.color}
            state={chosen.includes(id) ? "selected" : "idle"}
            onClick={() => toggle(id)}
          />
        ))}
      </div>
      <button
        disabled={busy || chosen.length !== 3}
        onClick={() => act("COMMIT_ENGINEERING", { cardIds: chosen })}
        className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"
      >
        Lock 3 face down
      </button>
    </Panel>
  );
}

function StarterPanel({ me }: { me: SubwayPlayer }) {
  const pending = me.lines.filter((l) => !l.route.length);
  return (
    <Panel title="Starter pegs">
      <p className="mt-1 text-sm text-stone-600">
        Each contract gets one free starter peg. It counts as node 1 and costs no construction action.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {me.lines.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: me.color, opacity: i === 0 ? 1 : 0.55 }}
            />
            <span className="font-semibold">{lineLabel(line)}</span>
            <span className="text-stone-500">
              {line.route.length ? "placed" : pending[0] === line ? "← place now" : "waiting"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CommitPanel({
  game,
  me,
  busy,
  act,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const options = buildableLines(game, me.id);
  const owed = actionsRemaining(me);
  const periodsLeft = SUBWAY_CONFIG.timelinePeriods - game.currentPeriod + 1;

  if (me.commitment) {
    return (
      <Panel title={`Period ${game.currentPeriod} — locked in`}>
        <p className="mt-1 text-sm text-stone-600">
          You committed to{" "}
          <strong>
            {me.commitment.kind === "pass" ? "pass" : lineLabel(me.lines[me.commitment.lineIndex])}
          </strong>
          . Both commitments reveal together.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={`Period ${game.currentPeriod} — secret commitment`}>
      <p className="mt-1 text-sm text-stone-600">
        Choose which line you will extend this period, or pass. {owed} action{owed === 1 ? "" : "s"} owed
        with {periodsLeft} period{periodsLeft === 1 ? "" : "s"} left.
      </p>
      <div className="mt-3 space-y-2">
        {me.lines.map((line, i) => {
          const contract = contractOf(line);
          if (!contract) return null;
          const done = lineComplete(line);
          const blocked = !done && !options.includes(i);
          return (
            <button
              key={i}
              disabled={busy || done || blocked}
              onClick={() => act("COMMIT_PERIOD", { lineIndex: i })}
              className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-stone-300 bg-[#fffaf0] px-3 py-2 text-left transition hover:border-stone-500 disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: me.color, opacity: i === 0 ? 1 : 0.55 }}
                />
                <span className="text-sm font-bold">{contract.name}</span>
              </span>
              <span className="text-xs text-stone-600">
                {done ? "complete" : blocked ? "no legal move" : `${lineActionsRemaining(line)} to go`}
              </span>
            </button>
          );
        })}
        <button
          disabled={busy}
          onClick={() => act("COMMIT_PERIOD", { pass: true })}
          className="w-full rounded-xl border border-stone-400 px-3 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"
        >
          Pass this period
        </button>
      </div>
    </Panel>
  );
}

function ResolvePanel({
  game,
  me,
  busy,
  act,
  selectedLine,
  setSelectedLine,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
  selectedLine: number;
  setSelectedLine: (n: number) => void;
}) {
  const [picked, setPicked] = useState<{ deck: "scheduling" | "construction"; id: string } | null>(null);
  const [earlyChoice, setEarlyChoice] = useState<number | "pass">("pass");
  const myTurn = game.resolveQueue[0] === me.id;
  const queued = game.resolveQueue.includes(me.id);
  const options = buildableLines(game, me.id);
  const restriction = me.pendingActions[0];

  useEffect(() => {
    setPicked(null);
  }, [game.currentPeriod]);

  const schedulingReason = (id: SchedulingCardId): string | undefined => {
    if (me.schedulingCardThisPeriod) return "One Scheduling card per period";
    if (id === "priority") return game.priorityPlayerId === me.id ? "You already hold Priority 1" : undefined;
    if (me.actedThisPeriod) return "You already built this period";
    if (id === "float") {
      if (!queued) return "You are not building this period";
      if (game.resolveQueue.length < 2) return "Nobody else is building";
      if (game.resolveQueue[game.resolveQueue.length - 1] === me.id) return "You already build last";
    }
    if (id === "early" && !options.length && me.commitment?.kind === "pass") return "No line can be built";
    return undefined;
  };

  const constructionReason = (id: ConstructionCardId): string | undefined => {
    if (me.constructionCardThisPeriod) return "One Construction card per period";
    if (!queued || me.actedThisPeriod) return "Only on a period you build";
    if (id === "overtime") {
      const line = restriction === null ? undefined : me.lines[restriction];
      if (!line || lineActionsRemaining(line) < me.pendingActions.length + 1) return "No second node on that line";
    }
    if (id === "crew" && actionsRemaining(me) < me.pendingActions.length + 1) return "No second node to place";
    if (id === "expedite") {
      if (game.resolveQueue[0] === me.id) return "You already build first";
    }
    if (id === "field") return "Retired in v0.2";
    return undefined;
  };

  const playPicked = () => {
    if (!picked) return;
    if (picked.deck === "scheduling") {
      const payload: Record<string, unknown> = { cardId: picked.id };
      if (picked.id === "early") {
        if (earlyChoice === "pass") payload.pass = true;
        else payload.lineIndex = earlyChoice;
      }
      act("PLAY_SCHEDULING_CARD", payload);
    } else {
      act("PLAY_CONSTRUCTION_CARD", { cardId: picked.id });
    }
    setPicked(null);
  };

  return (
    <Panel title={`Period ${game.currentPeriod} — reveal`}>
      <div className="mt-2 space-y-1">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const c = p.commitment;
          const acting = game.resolveQueue[0] === id;
          return (
            <div key={id} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="font-bold">{p.name}</span>
              <span className="text-stone-600">
                {c?.kind === "build" ? lineLabel(p.lines[c.lineIndex]) : "passed"}
              </span>
              {acting && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white">BUILDING</span>}
              {p.actedThisPeriod && <span className="text-[11px] text-stone-400">done</span>}
            </div>
          );
        })}
      </div>

      {myTurn && restriction === null && options.length > 1 && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase text-stone-500">Extra crew — pick the line</p>
          <div className="mt-1 flex gap-2">
            {options.map((i) => (
              <button
                key={i}
                onClick={() => setSelectedLine(i)}
                className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold ${
                  selectedLine === i ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"
                }`}
              >
                {lineLabel(me.lines[i])}
              </button>
            ))}
          </div>
        </div>
      )}

      {(queued || !me.actedThisPeriod) && (
        <>
          <p className="mt-3 text-xs font-bold uppercase text-stone-500">Cards</p>
          <div className="mt-1 flex gap-3 overflow-x-auto pb-2">
            {me.schedulingHand.map((id, i) => {
              const card = schedulingById(id)!;
              const reason = schedulingReason(id);
              return (
                <CardShell
                  key={`s-${id}-${i}`}
                  title={card.name}
                  tag="Scheduling"
                  selected={picked?.deck === "scheduling" && picked.id === id}
                  disabled={!!reason}
                  disabledReason={reason}
                  onClick={() => setPicked(picked?.id === id ? null : { deck: "scheduling", id })}
                >
                  {card.description}
                </CardShell>
              );
            })}
            {me.constructionHand.map((id, i) => {
              const card = constructionById(id)!;
              const reason = constructionReason(id);
              return (
                <CardShell
                  key={`c-${id}-${i}`}
                  title={card.name}
                  tag="Construction"
                  selected={picked?.deck === "construction" && picked.id === id}
                  disabled={!!reason}
                  disabledReason={reason}
                  onClick={() => setPicked(picked?.id === id ? null : { deck: "construction", id })}
                >
                  {card.description}
                </CardShell>
              );
            })}
          </div>
        </>
      )}

      {picked?.id === "early" && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase text-stone-500">Change to</span>
          {options.map((i) => (
            <button
              key={i}
              onClick={() => setEarlyChoice(i)}
              className={`rounded-lg border-2 px-2.5 py-1 text-xs font-bold ${
                earlyChoice === i ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"
              }`}
            >
              {lineLabel(me.lines[i])}
            </button>
          ))}
          <button
            onClick={() => setEarlyChoice("pass")}
            className={`rounded-lg border-2 px-2.5 py-1 text-xs font-bold ${
              earlyChoice === "pass" ? "border-amber-500 bg-amber-100" : "border-stone-300 bg-white"
            }`}
          >
            Pass
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {picked && (
          <button
            disabled={busy}
            onClick={playPicked}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Play card
          </button>
        )}
        {myTurn && (
          <button
            disabled={busy}
            onClick={() => act("SKIP_ACTION")}
            className="rounded-lg border border-stone-400 px-4 py-2 text-sm font-bold text-stone-600 disabled:opacity-40"
          >
            {options.length ? "Stop building" : "No legal move — stop"}
          </button>
        )}
      </div>
    </Panel>
  );
}

function ResultsPanel({ game }: { game: SubwayState }) {
  return (
    <section className="rounded-2xl bg-white/80 p-5 text-stone-900">
      <h3 className="text-center font-serif text-3xl font-black">{game.message}</h3>
      <div className="mt-4 space-y-4">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const winner = game.winnerIds.includes(id);
          return (
            <div key={id} className={`rounded-xl border-2 p-4 ${winner ? "shadow-lg" : "opacity-95"}`} style={{ borderColor: p.color }}>
              <div className="flex items-baseline justify-between text-xl font-black">
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  {winner && <span className="text-sm">🏆</span>}
                </span>
                <span>{p.score} VP</span>
              </div>
              <div className="mt-2">
                {p.scoreBreakdown?.map((item, i) => (
                  <div
                    key={i}
                    className={`flex justify-between border-b border-stone-200 py-1 text-sm ${item.met === false ? "text-stone-400" : ""}`}
                  >
                    <span>
                      {item.label}
                      {item.met === false && " (not met)"}
                    </span>
                    <b>
                      {item.points > 0 ? "+" : ""}
                      {item.points}
                    </b>
                  </div>
                ))}
                <div className="flex justify-between py-1 text-xs text-stone-500">
                  <span>Remaining money (tiebreak)</span>
                  <span>{money(p.money)}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {p.committedEngineering.map((cardId, i) => {
                  const card = engineeringById(cardId);
                  const scored = p.scoreBreakdown?.find((x) => x.label === card?.name);
                  return (
                    <EngineeringCardFace
                      key={`${cardId}-${i}`}
                      card={cardId}
                      color={p.color}
                      compact
                      state={scored?.met ? "met" : "missed"}
                      footer={
                        <p
                          className={`mt-1 text-[11px] font-black ${scored?.met ? "text-emerald-700" : "text-stone-400"}`}
                        >
                          {scored?.met ? `Scored +${scored.points}` : "Not met"}
                        </p>
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// Private company panel
// ============================================================================

function PrivatePanel({ game, me }: { game: SubwayState; me: SubwayPlayer }) {
  const showFull = game.phase !== "ENGINEERING";
  return (
    <aside className="rounded-2xl bg-[#fffaf0] p-4 text-stone-900 shadow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black">Your company</h3>
        <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: me.color }}>
          {me.name} · {money(me.money)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {me.lines.length === 0 ? (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">No Line Contract yet.</p>
        ) : (
          me.lines.map((line, i) => {
            const contract = contractOf(line);
            if (!contract) return null;
            return (
              <ContractCard
                key={i}
                contract={contract}
                accent={me.color}
                progress={{ built: line.route.length, total: contract.nodes }}
              />
            );
          })
        )}
      </div>

      {showFull && me.committedEngineering.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <b className="text-xs uppercase text-stone-500">Committed Engineering</b>
            <span className="text-[10px] font-bold uppercase text-stone-400">Hidden from the opposition</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.committedEngineering.map((id, i) => (
              <EngineeringCardFace key={`${id}-${i}`} card={id} color={me.color} state="committed" compact />
            ))}
          </div>
        </div>
      )}

      {showFull && me.engineeringHand.length > 0 && (
        <div className="mt-3">
          <b className="text-xs uppercase text-stone-500">Engineering in hand (not scoring)</b>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.engineeringHand.map((id, i) => (
              <EngineeringCardFace key={`${id}-${i}`} card={id} color={me.color} compact />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <b className="text-xs uppercase text-stone-500">Scheduling</b>
          <p className="mt-1 text-xs text-stone-600">
            {me.schedulingHand.length
              ? me.schedulingHand.map((id) => schedulingById(id)?.name ?? id).join(", ")
              : "None"}
          </p>
        </div>
        <div>
          <b className="text-xs uppercase text-stone-500">Construction</b>
          <p className="mt-1 text-xs text-stone-600">
            {me.constructionHand.length
              ? me.constructionHand.map((id) => constructionById(id)?.name ?? id).join(", ")
              : "None"}
          </p>
        </div>
      </div>
    </aside>
  );
}

// ============================================================================
// Main view
// ============================================================================

export function SubwayGameView({ state, room, playerId, isHost, dispatchAction }: GameViewProps<SubwayState>) {
  const raw = state as SubwayState | undefined;
  const stale = !!raw && raw.version !== SUBWAY_STATE_VERSION;
  const game = raw && !stale ? raw : undefined;
  const me = game?.players[playerId];

  const [chosen, setChosen] = useState<string[]>([]);
  const [selectedLine, setSelectedLine] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const act = async (type: string, payload?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await dispatchAction(type, payload);
    } finally {
      setBusy(false);
    }
  };

  // Which line the next tap on the board extends.
  const starterLine = game && me ? me.lines.findIndex((l) => !l.route.length) : -1;
  const placingStarter = !!game && game.phase === "STARTER_PLACEMENT" && starterLine >= 0;
  const myBuild =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.periodStep === "RESOLVE" &&
    game.resolveQueue[0] === me.id && me.pendingActions.length > 0;
  const restriction = myBuild ? me!.pendingActions[0] : undefined;
  const openLines = game && me ? buildableLines(game, me.id) : [];

  const activeLineIndex = placingStarter
    ? starterLine
    : myBuild
      ? restriction !== null && restriction !== undefined
        ? restriction
        : openLines.includes(selectedLine)
          ? selectedLine
          : openLines[0] ?? -1
      : -1;

  const canAct = (placingStarter || myBuild) && activeLineIndex >= 0 && !busy;

  const legalCells = useMemo(() => {
    if (!game || !me || activeLineIndex < 0 || !(placingStarter || myBuild)) return [];
    const cells: Point[] = [];
    for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
      for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
        if (!validateNode(game, me.id, activeLineIndex, { x, y }, placingStarter)) cells.push({ x, y });
      }
    }
    return cells;
  }, [game, me, activeLineIndex, placingStarter, myBuild]);

  const onTapHole = (p: Point) => {
    if (!game || !me || !canAct) return;
    const reason = validateNode(game, me.id, activeLineIndex, p, placingStarter);
    if (reason) {
      setNotice(reason);
      return;
    }
    setNotice(null);
    act(placingStarter ? "PLACE_STARTER" : "BUILD", { lineIndex: activeLineIndex, x: p.x, y: p.y });
  };

  // ---- Pre-game lobby -------------------------------------------------------
  if (!game || game.phase === "SETUP") {
    const enough = room.players.length >= 2;
    return (
      <section className="rounded-2xl bg-[#ede1c7] p-6 text-center text-stone-900 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Subway</h2>
        <p className="mx-auto my-4 max-w-xl text-sm text-stone-600">
          Draft up to {SUBWAY_CONFIG.maxLinesPerPlayer} Line Contracts, commit secret engineering
          objectives, then commit period by period as you race for station capacity on a shared pegboard.
        </p>
        {stale && (
          <p className="mx-auto mb-4 max-w-md rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
            This room is running an older version of Subway. Starting a new game will reset it to the
            current rules.
          </p>
        )}
        <p className="mb-4 text-sm font-semibold text-stone-700">
          Companies: {room.players.slice(0, 2).map((p) => p.name).join(" vs ") || "waiting…"}
          {room.players.length > 2 && ` · ${room.players.length - 2} spectating`}
        </p>
        {isHost ? (
          <button
            disabled={busy || !enough}
            onClick={() => act("START_GAME")}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Starting…" : enough ? "Start Subway" : "Waiting for a second player"}
          </button>
        ) : (
          <p className="text-sm text-stone-600">Waiting for the host to start Subway…</p>
        )}
      </section>
    );
  }

  const status = statusFor(game, me, isHost);

  return (
    <div className="space-y-4 rounded-3xl bg-[#ede1c7] p-3 text-stone-900 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
          <h2 className="font-serif text-2xl font-black sm:text-3xl">Subway</h2>
        </div>
        <span className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-amber-50 sm:text-sm">
          {PHASE_LABELS[game.phase] ?? game.phase}
          {game.phase === "CONSTRUCTION" &&
            ` · Period ${Math.min(game.currentPeriod, SUBWAY_CONFIG.timelinePeriods)}/${SUBWAY_CONFIG.timelinePeriods}`}
        </span>
      </header>

      <div
        className={`rounded-xl border-l-4 px-4 py-2.5 ${
          status.tone === "act"
            ? "border-emerald-600 bg-emerald-50"
            : status.tone === "wait"
              ? "border-stone-400 bg-white/60"
              : "border-amber-500 bg-amber-50"
        }`}
      >
        <p className="flex items-center gap-2 text-sm font-bold">
          {status.tone === "act" && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />}
          {status.headline}
        </p>
        {status.detail && <p className="text-xs text-stone-600">{status.detail}</p>}
        <p className="mt-0.5 text-[11px] italic text-stone-500">{game.message}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="space-y-2">
          <div className="mx-auto w-full max-w-2xl lg:max-w-none">
            <Board
              game={game}
              legalCells={legalCells}
              canAct={canAct}
              activeLine={me && activeLineIndex >= 0 ? { playerId: me.id, lineIndex: activeLineIndex } : undefined}
              onTapHole={onTapHole}
            />
          </div>
          {notice && (
            <p className="rounded-xl bg-red-100 px-3 py-2 text-center text-sm font-bold text-red-900">{notice}</p>
          )}
          {canAct && !notice && me && (
            <p className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
              {placingStarter
                ? `Tap a glowing hole to start your ${lineLabel(me.lines[activeLineIndex])} (stations not allowed).`
                : `Tap a glowing hole or open station slot to extend your ${lineLabel(me.lines[activeLineIndex])}.`}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {game.phase === "PROCUREMENT" && me && <MarketPanel game={game} me={me} busy={busy} act={act} />}
          {game.phase === "ENGINEERING" && me && (
            <EngineeringPanel me={me} chosen={chosen} setChosen={setChosen} busy={busy} act={act} />
          )}
          {game.phase === "STARTER_PLACEMENT" && me && <StarterPanel me={me} />}
          {game.phase === "CONSTRUCTION" && me && game.periodStep === "COMMIT" && (
            <CommitPanel game={game} me={me} busy={busy} act={act} />
          )}
          {game.phase === "CONSTRUCTION" && me && game.periodStep === "RESOLVE" && (
            <ResolvePanel
              game={game}
              me={me}
              busy={busy}
              act={act}
              selectedLine={activeLineIndex >= 0 ? activeLineIndex : 0}
              setSelectedLine={setSelectedLine}
            />
          )}
          {game.phase === "SCORING" && isHost && (
            <button
              disabled={busy}
              onClick={() => act("ADVANCE_SCORING")}
              className="w-full rounded-xl bg-stone-900 py-3 font-bold text-white disabled:opacity-40"
            >
              Reveal Engineering &amp; score
            </button>
          )}
          {game.phase === "RESULTS" && <ResultsPanel game={game} />}

          {game.phase !== "RESULTS" && <PeriodTracker game={game} myId={playerId} />}
          {me && <PrivatePanel game={game} me={me} />}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-stone-300 pt-2 text-xs text-stone-500">
        <span>
          Room <code className="rounded bg-white/60 px-1.5 py-0.5 font-bold">{room.roomCode}</code>
        </span>
        <Link href="/" className="hover:text-stone-800">
          Leave room
        </Link>
      </footer>
    </div>
  );
}
