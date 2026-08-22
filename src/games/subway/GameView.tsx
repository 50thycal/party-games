"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import { EngineeringCardFace } from "./CardArt";
import {
  STATIONS,
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  actionsRemaining,
  blockFits,
  blockPeriods,
  buyBlocker,
  concurrentBlocks,
  constructionById,
  contestedPeriods,
  contractActions,
  contractById,
  contractOf,
  contractsOutstanding,
  crewCost,
  engineeringById,
  hasLegalMove,
  lineComplete,
  lineMobilization,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  mobilizationCost,
  mobilizationFor,
  mustBuyOffer,
  periodPriorityId,
  scheduleCost,
  scheduleProblems,
  scheduledLines,
  schedulingById,
  starterTurnId,
  stationAt,
  stationConnections,
  validateNode,
  type CardDeckId,
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
  SCHEDULING: "Scheduling",
  STARTER_PLACEMENT: "Starter placement",
  CONSTRUCTION: "Construction",
  SCORING: "Scoring",
  RESULTS: "Results",
};

const lineLabel = (line: PlayerLine): string => contractOf(line)?.name ?? "Line";

const opponentOf = (game: SubwayState, me: SubwayPlayer): SubwayPlayer | undefined =>
  game.playerOrder.map((id) => game.players[id]).find((p) => p && p.id !== me.id);

type Status = { headline: string; tone: "act" | "wait" | "info"; detail?: string };

/** Per-client status derived from authoritative state, never from the shared
 *  broadcast message — so it can never claim the wrong player is acting. */
function statusFor(game: SubwayState, me: SubwayPlayer | undefined, isHost: boolean): Status {
  if (!me) return { headline: "You are spectating this two-company contest.", tone: "info" };
  const oppName = opponentOf(game, me)?.name ?? "the opposition";

  switch (game.phase) {
    case "SETUP":
      return isHost
        ? { headline: "Start the game when both companies are ready.", tone: "act" }
        : { headline: "Waiting for the host to start.", tone: "wait" };
    case "PROCUREMENT": {
      const offer = game.procurement.offer;
      if (!offer) return { headline: "Shuffling the contract deck…", tone: "wait" };
      const contract = contractById(offer.contractId)!;
      if (offer.activeId !== me.id) {
        return {
          headline: `${game.players[offer.activeId]?.name ?? "Opponent"} is deciding on the ${contract.name}.`,
          tone: "wait",
        };
      }
      if (mustBuyOffer(game, me.id)) {
        return {
          headline: `You must take the ${contract.name} — nobody else can.`,
          tone: "act",
          detail: "The opposition has hit its four-contract cap.",
        };
      }
      return offer.stage === "first"
        ? {
            headline: `First refusal on the ${contract.name} at ${money(offer.price)}.`,
            tone: "act",
            detail: "Buy it, or pass and draft one face-up card.",
          }
        : {
            headline: `${oppName} passed. The ${contract.name} is yours at ${money(offer.price)}.`,
            tone: "act",
            detail: "Pass too and it goes to the Discount Yard — no card for a second pass.",
          };
    }
    case "ENGINEERING":
      return me.engineeringLocked
        ? { headline: `Committed face down — waiting for ${oppName}.`, tone: "wait" }
        : { headline: "Commit exactly 3 Engineering cards face down.", tone: "act" };
    case "SCHEDULING":
      if (game.schedulingStep === "PLANNING") {
        return me.scheduleSubmitted
          ? { headline: `Schedule submitted — waiting for ${oppName}.`, tone: "wait" }
          : {
              headline: "Plan your entire construction programme.",
              tone: "act",
              detail: "Every contract gets one contiguous block. Submit when the costs work.",
            };
      }
      return me.scheduleConfirmed
        ? { headline: `Schedule locked — waiting for ${oppName}.`, tone: "wait" }
        : {
            headline: "Both schedules are revealed.",
            tone: "act",
            detail: "Optionally play one Scheduling card, then confirm to pay and lock.",
          };
    case "STARTER_PLACEMENT": {
      const turn = starterTurnId(game);
      if (turn !== me.id) {
        return { headline: `${game.players[turn ?? ""]?.name ?? oppName} is placing a starter peg.`, tone: "wait" };
      }
      const pending = me.lines.filter((l) => !l.route.length);
      return {
        headline: `Place the free starter peg for your ${lineLabel(pending[0])}.`,
        tone: "act",
        detail: pending.length > 1 ? `${pending.length} of your contracts still need one.` : undefined,
      };
    }
    case "CONSTRUCTION": {
      const actorId = game.resolveQueue[0];
      if (actorId === me.id) {
        return {
          headline: `Period ${game.currentPeriod} — your build.`,
          tone: "act",
          detail:
            me.pendingActions.length > 1
              ? `${me.pendingActions.length} actions scheduled this period.`
              : "Tap a highlighted hole to extend the scheduled line.",
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
  /** Price actually being asked, when it differs from the list price. */
  price,
  progress,
  status,
  children,
}: {
  contract: LineContract;
  accent?: string;
  price?: number;
  progress?: { built: number; total: number };
  status?: string;
  children?: React.ReactNode;
}) {
  const discounted = price !== undefined && price < contract.cost;
  return (
    <div
      className="w-full rounded-xl border-2 bg-[#fffaf0] p-3 text-left text-stone-900 shadow-sm"
      style={{ borderColor: accent ?? "#d6d3d1" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-sm">{contract.name}</strong>
        {status ? (
          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-100">
            {status}
          </span>
        ) : progress ? (
          <span className="text-sm font-black">
            {progress.built}/{progress.total}
          </span>
        ) : (
          <span className="text-sm font-black">
            {discounted && <span className="mr-1 font-normal text-stone-400 line-through">{money(contract.cost)}</span>}
            {money(price ?? contract.cost)}
          </span>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
        <span>{contract.nodes} nodes</span>
        <span>{contractActions(contract)} build periods</span>
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
      {children}
    </div>
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
  const activeBuilderId = game.phase === "CONSTRUCTION" ? game.resolveQueue[0] : undefined;

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
// Gantt scheduling board — the shared picture of the whole build programme
// ============================================================================

const PERIODS = SUBWAY_CONFIG.timelinePeriods;
const GRID_COLUMNS = `repeat(${PERIODS}, minmax(18px, 1fr))`;

/** Period ruler, marking the live period and who has priority when contested. */
function PeriodRuler({ game, revealed }: { game: SubwayState; revealed: boolean }) {
  const contested = revealed ? contestedPeriods(game) : [];
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: GRID_COLUMNS }}>
      {Array.from({ length: PERIODS }, (_, i) => {
        const period = i + 1;
        const live = game.phase === "CONSTRUCTION" && period === game.currentPeriod;
        const past = game.phase === "CONSTRUCTION" && period < game.currentPeriod;
        const firstId = contested.includes(period) ? periodPriorityId(game, period) : undefined;
        return (
          <div key={period} className="flex flex-col items-center">
            <span
              className={`w-full rounded-t text-center text-[10px] font-bold ${
                live ? "bg-emerald-600 text-white" : past ? "text-stone-400" : "text-stone-500"
              }`}
            >
              {period}
            </span>
            <span
              className="h-1 w-full rounded-b"
              style={{ background: firstId ? game.players[firstId]?.color : "transparent" }}
              title={firstId ? `${game.players[firstId]?.name} builds first` : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/** One contract's bar across the timeline. */
function GanttRow({
  line,
  player,
  game,
  dashed,
}: {
  line: PlayerLine;
  player: SubwayPlayer;
  game: SubwayState;
  dashed: boolean;
}) {
  const active = new Set(blockPeriods(line));
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: GRID_COLUMNS }}>
      {Array.from({ length: PERIODS }, (_, i) => {
        const period = i + 1;
        const on = active.has(period);
        const doubled = on && concurrentBlocks(player, period) > 1;
        const past = game.phase === "CONSTRUCTION" && period < game.currentPeriod;
        return (
          <div
            key={period}
            className={`h-4 rounded-sm ${on ? "" : "bg-stone-200/70"} ${doubled ? "ring-1 ring-amber-500" : ""}`}
            style={
              on
                ? {
                    background: player.color,
                    opacity: past ? 0.4 : dashed ? 0.65 : 1,
                    backgroundImage: dashed
                      ? "repeating-linear-gradient(45deg,rgba(255,255,255,.55) 0 3px,transparent 3px 6px)"
                      : undefined,
                  }
                : undefined
            }
            title={doubled ? `Period ${period}: second crew` : undefined}
          />
        );
      })}
    </div>
  );
}

/** All of one company's rows, with editing controls when it is your own. */
function CompanySchedule({
  game,
  player,
  hidden,
  editable,
  busy,
  act,
}: {
  game: SubwayState;
  player: SubwayPlayer;
  hidden: boolean;
  editable: boolean;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const isPriority = player.id === game.priorityPlayerId;
  const mob = mobilizationCost(player);
  const crew = crewCost(player);

  return (
    <div className="rounded-lg bg-white/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="truncate text-xs font-bold">{player.name}</span>
        <span
          className={`rounded px-1 text-[10px] font-black ${
            isPriority ? "bg-amber-400 text-stone-900" : "bg-stone-300 text-stone-600"
          }`}
        >
          {isPriority ? "P1" : "P2"}
        </span>
        {!hidden && (
          <span className="ml-auto text-[11px] font-bold text-stone-500">
            mob {money(mob)} · crew {money(crew)}
          </span>
        )}
      </div>

      {hidden ? (
        <p className="mt-1 text-[11px] italic text-stone-500">
          Planning in private — {player.scheduleSubmitted ? "submitted" : "still drafting"}.
        </p>
      ) : (
        <div className="mt-1.5 space-y-2">
          {player.lines.map((line, li) => {
            const contract = contractOf(line);
            if (!contract) return null;
            const shelved = line.start === undefined;
            const end = shelved ? undefined : line.start! + contractActions(contract) - 1;
            return (
              <div key={li}>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-semibold">{contract.name}</span>
                  <span className="text-stone-500">
                    {shelved
                      ? "shelved — will score its penalty"
                      : `periods ${line.start}–${end} · mobilization ${money(lineMobilization(line))}`}
                  </span>
                  {editable && (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        disabled={busy || shelved || !blockFits(line, (line.start ?? 1) - 1)}
                        onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: (line.start ?? 1) - 1 })}
                        className="rounded border border-stone-400 px-1.5 font-bold disabled:opacity-30"
                        aria-label={`Start ${contract.name} earlier`}
                      >
                        ◀
                      </button>
                      <button
                        disabled={busy || shelved || !blockFits(line, (line.start ?? 1) + 1)}
                        onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: (line.start ?? 1) + 1 })}
                        className="rounded border border-stone-400 px-1.5 font-bold disabled:opacity-30"
                        aria-label={`Start ${contract.name} later`}
                      >
                        ▶
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act("SET_SCHEDULE", { lineIndex: li, start: shelved ? 1 : null })}
                        className="rounded border border-stone-400 px-1.5 font-bold disabled:opacity-30"
                      >
                        {shelved ? "Schedule" : "Shelve"}
                      </button>
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  <GanttRow line={line} player={player} game={game} dashed={li % 2 === 1} />
                </div>
              </div>
            );
          })}
          {!player.lines.length && <p className="text-[11px] italic text-stone-400">No contracts.</p>}
        </div>
      )}
    </div>
  );
}

function GanttBoard({
  game,
  viewerId,
  revealed,
  editable,
  busy,
  act,
}: {
  game: SubwayState;
  viewerId: string;
  revealed: boolean;
  editable: boolean;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <section className="rounded-2xl border border-stone-300 bg-[#f6edda] p-3 text-stone-900">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wider">Construction programme</h3>
        <span className="text-xs text-stone-600">{PERIODS} periods · one crew each</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[288px] space-y-2">
          <PeriodRuler game={game} revealed={revealed} />
          {game.playerOrder.map((id) => {
            const p = game.players[id];
            if (!p) return null;
            return (
              <CompanySchedule
                key={id}
                game={game}
                player={p}
                hidden={!revealed && id !== viewerId}
                editable={editable && id === viewerId}
                busy={busy}
                act={act}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Amber outline = second crew (two of your own blocks in one period). The bar under a period
        number shows which company builds first when both are working.
      </p>
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

function ProcurementPanel({
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
  const [deck, setDeck] = useState<CardDeckId>("engineering");
  const offer = game.procurement.offer;
  if (!offer) return null;
  const contract = contractById(offer.contractId)!;
  const mine = offer.activeId === me.id;
  const forced = mine && mustBuyOffer(game, me.id);
  const blocker = buyBlocker(game, me.id);
  const canBuy = mine && (!blocker || (forced && blocker === "Not enough money."));

  const faceUp: { id: CardDeckId; name: string; description: string }[] = [
    { id: "engineering", card: marketEngineering(game.market) },
    { id: "scheduling", card: marketScheduling(game.market) },
    { id: "construction", card: marketConstruction(game.market) },
  ].map(({ id, card }) => ({ id: id as CardDeckId, name: card.name, description: card.description }));

  return (
    <Panel
      title={`${contract.name} on offer${offer.fromYard ? " — Discount Yard" : ""}`}
    >
      <p className="mt-1 text-sm text-stone-600">
        {contractsOutstanding(game)} contract{contractsOutstanding(game) === 1 ? "" : "s"} still need an owner.
        You hold {me.lines.length} of a maximum {SUBWAY_CONFIG.maxContractsPerPlayer} and {money(me.money)}.
      </p>

      <div className="mt-3">
        <ContractCard contract={contract} price={offer.price} accent={mine ? me.color : undefined} />
      </div>

      {game.procurement.yard.length > 0 && (
        <div className="mt-3">
          <b className="text-xs uppercase text-stone-500">Discount Yard</b>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
            {game.procurement.yard.map((entry, i) => {
              const c = contractById(entry.contractId)!;
              return (
                <li key={i} className="flex justify-between">
                  <span>{c.name}</span>
                  <span>
                    <span className="mr-1 text-stone-400 line-through">{money(c.cost)}</span>
                    <b>{money(entry.price)}</b>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[11px] italic text-stone-500">
            Every yard contract must still be bought before Procurement ends.
          </p>
        </div>
      )}

      {!mine ? (
        <p className="mt-3 text-sm text-stone-500">
          Waiting for {game.players[offer.activeId]?.name ?? "the opposition"}…
        </p>
      ) : (
        <>
          {offer.stage === "first" && !forced && (
            <div className="mt-3">
              <b className="text-xs uppercase text-stone-500">Pass and draft one of these</b>
              <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {faceUp.map((card) => (
                  <CardShell
                    key={card.id}
                    title={card.name}
                    tag={card.id}
                    selected={deck === card.id}
                    onClick={() => setDeck(card.id)}
                  >
                    {card.description}
                  </CardShell>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy || !canBuy}
              onClick={() => act("PROCURE", { choice: "buy" })}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-35"
            >
              Buy for {money(forced ? Math.min(offer.price, me.money) : offer.price)}
            </button>
            {!forced && (
              <button
                disabled={busy}
                onClick={() =>
                  act("PROCURE", offer.stage === "first" ? { choice: "pass", deck } : { choice: "pass" })
                }
                className="rounded-lg border border-stone-400 px-4 py-2 text-sm font-bold text-stone-700 disabled:opacity-35"
              >
                {offer.stage === "first" ? `Pass — take ${deck}` : "Pass to the Discount Yard"}
              </button>
            )}
            {!canBuy && blocker && !forced && <p className="w-full text-xs text-red-800">{blocker}</p>}
          </div>
        </>
      )}
    </Panel>
  );
}

function SchedulingPanel({
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
  const [picked, setPicked] = useState<SchedulingCardId | null>(null);
  const [target, setTarget] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(-1);
  const [period, setPeriod] = useState(1);

  const planning = game.schedulingStep === "PLANNING";
  const problems = scheduleProblems(me);
  const cost = scheduleCost(me);
  const contested = contestedPeriods(game);

  const cardReason = (id: SchedulingCardId): string | undefined => {
    if (me.schedulingCardPlayed) return "One Scheduling card per game";
    if (me.scheduleConfirmed) return "Schedule already locked";
    if (id === "priority" && !contested.length) return "No contested periods";
    if (id !== "priority" && !me.lines.some((l) => l.start !== undefined)) return "Nothing scheduled to move";
    return undefined;
  };

  return (
    <Panel title={planning ? "Plan your programme" : "Schedules revealed"}>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <span className="text-stone-500">Mobilization</span>
        <b>{money(mobilizationCost(me))}</b>
        <span className="text-stone-500">Second crew</span>
        <b>{money(crewCost(me))}</b>
        <span className="text-stone-500">Schedule total</span>
        <b className={cost > me.money ? "text-red-700" : ""}>{money(cost)}</b>
        <span className="text-stone-500">Cash after</span>
        <b className={cost > me.money ? "text-red-700" : ""}>{money(me.money - cost)}</b>
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs font-semibold text-red-800">
          {problems.map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      )}

      {planning ? (
        <button
          disabled={busy || me.scheduleSubmitted || problems.length > 0}
          onClick={() => act("SUBMIT_SCHEDULE")}
          className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"
        >
          {me.scheduleSubmitted ? "Submitted — waiting" : "Submit schedule"}
        </button>
      ) : (
        <>
          {!me.scheduleConfirmed && me.schedulingHand.length > 0 && (
            <>
              <p className="mt-3 text-xs font-bold uppercase text-stone-500">Scheduling cards</p>
              <div className="mt-1 flex gap-3 overflow-x-auto pb-2">
                {me.schedulingHand.map((id, i) => {
                  const card = schedulingById(id)!;
                  const reason = cardReason(id);
                  return (
                    <CardShell
                      key={`${id}-${i}`}
                      title={card.name}
                      tag="Scheduling"
                      selected={picked === id}
                      disabled={!!reason}
                      disabledReason={reason}
                      onClick={() => setPicked(picked === id ? null : id)}
                    >
                      {card.description}
                    </CardShell>
                  );
                })}
              </div>
            </>
          )}

          {picked && picked !== "priority" && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase text-stone-500">Line</span>
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="rounded border border-stone-400 bg-white px-2 py-1"
              >
                {me.lines.map((l, i) =>
                  l.start === undefined ? null : (
                    <option key={i} value={i}>
                      {lineLabel(l)}
                    </option>
                  )
                )}
              </select>
              {picked === "float" && (
                <span className="flex overflow-hidden rounded border border-stone-400 font-bold">
                  <button
                    className={`px-2 py-1 ${direction === -1 ? "bg-stone-800 text-white" : ""}`}
                    onClick={() => setDirection(-1)}
                  >
                    Earlier
                  </button>
                  <button
                    className={`px-2 py-1 ${direction === 1 ? "bg-stone-800 text-white" : ""}`}
                    onClick={() => setDirection(1)}
                  >
                    Later
                  </button>
                </span>
              )}
            </div>
          )}

          {picked === "priority" && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold uppercase text-stone-500">Contested period</span>
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="rounded border border-stone-400 bg-white px-2 py-1"
              >
                {contested.map((q) => (
                  <option key={q} value={q}>
                    Period {q}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {picked && (
              <button
                disabled={busy}
                onClick={() => {
                  act("PLAY_SCHEDULING_CARD", {
                    cardId: picked,
                    ...(picked === "priority"
                      ? { period: contested.includes(period) ? period : contested[0] }
                      : { lineIndex: target, ...(picked === "float" ? { direction } : {}) }),
                  });
                  setPicked(null);
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Play {schedulingById(picked)?.name}
              </button>
            )}
            <button
              disabled={busy || me.scheduleConfirmed || problems.length > 0}
              onClick={() => act("CONFIRM_SCHEDULE")}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {me.scheduleConfirmed ? "Locked — waiting" : `Confirm & pay ${money(cost)}`}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function StarterPanel({ game, me }: { game: SubwayState; me: SubwayPlayer }) {
  const pending = me.lines.filter((l) => !l.route.length);
  const turn = starterTurnId(game);
  return (
    <Panel title="Starter pegs">
      <p className="mt-1 text-sm text-stone-600">
        Each contract gets one free starter peg. It counts as node 1 and costs no scheduled action.
        Companies alternate placements.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {me.lines.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: me.color, opacity: i % 2 === 1 ? 0.55 : 1 }}
            />
            <span className="font-semibold">{lineLabel(line)}</span>
            <span className="text-stone-500">
              {line.route.length ? "placed" : turn === me.id && pending[0] === line ? "← place now" : "waiting"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ConstructionPanel({
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
  const [picked, setPicked] = useState<ConstructionCardId | null>(null);
  const myTurn = game.resolveQueue[0] === me.id;
  const queued = game.resolveQueue.includes(me.id);

  useEffect(() => {
    setPicked(null);
  }, [game.currentPeriod]);

  const reason = (id: ConstructionCardId): string | undefined => {
    if (me.constructionCardThisPeriod) return "One Construction card per period";
    if (!queued || me.actedThisPeriod) return "Only on a period you build";
    if (id === "expedite") return game.resolveQueue[0] === me.id ? "You already build first" : undefined;
    if (id === "overtime" && !me.pendingActions.length) return "No scheduled action to double";
    if (id === "surge") {
      const others = me.lines
        .map((_, i) => i)
        .filter((i) => !me.pendingActions.includes(i) && !lineComplete(me.lines[i]));
      if (!others.length) return "No other project to open";
    }
    return undefined;
  };

  const cardTargets = (id: ConstructionCardId): number[] =>
    id === "overtime"
      ? Array.from(new Set(me.pendingActions))
      : me.lines.map((_, i) => i).filter((i) => !me.pendingActions.includes(i) && !lineComplete(me.lines[i]));

  if (!queued && !myTurn) return null;

  return (
    <Panel title={`Period ${game.currentPeriod} — your scheduled work`}>
      <ul className="mt-1 space-y-0.5 text-sm">
        {me.pendingActions.length === 0 && <li className="text-stone-500">No actions left this period.</li>}
        {Array.from(new Set(me.pendingActions)).map((i) => {
          const count = me.pendingActions.filter((x) => x === i).length;
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: me.color }} />
              <button
                onClick={() => setSelectedLine(i)}
                className={`rounded px-1.5 font-semibold ${selectedLine === i ? "bg-amber-100 ring-1 ring-amber-400" : ""}`}
              >
                {lineLabel(me.lines[i])}
              </button>
              <span className="text-xs text-stone-500">
                {count > 1 ? `${count} actions` : "1 action"}
              </span>
            </li>
          );
        })}
      </ul>

      {me.constructionHand.length > 0 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {me.constructionHand.map((id, i) => {
            const card = constructionById(id)!;
            const why = reason(id);
            return (
              <CardShell
                key={`${id}-${i}`}
                title={card.name}
                tag="Construction"
                selected={picked === id}
                disabled={!!why}
                disabledReason={why}
                onClick={() => setPicked(picked === id ? null : id)}
              >
                {card.description}
              </CardShell>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {picked && picked !== "expedite" && (
          <select
            value={selectedLine}
            onChange={(e) => setSelectedLine(Number(e.target.value))}
            className="rounded border border-stone-400 bg-white px-2 py-1 text-xs"
          >
            {cardTargets(picked).map((i) => (
              <option key={i} value={i}>
                {lineLabel(me.lines[i])}
              </option>
            ))}
          </select>
        )}
        {picked && (
          <button
            disabled={busy}
            onClick={() => {
              const targets = cardTargets(picked);
              act("PLAY_CONSTRUCTION_CARD", {
                cardId: picked,
                ...(picked === "expedite"
                  ? {}
                  : { lineIndex: targets.includes(selectedLine) ? selectedLine : targets[0] }),
              });
              setPicked(null);
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Play {constructionById(picked)?.name}
          </button>
        )}
        {myTurn && (
          <button
            disabled={busy}
            onClick={() => act("SKIP_ACTION")}
            className="rounded-lg border border-stone-400 px-4 py-2 text-sm font-bold text-stone-600 disabled:opacity-40"
          >
            Give up this period
          </button>
        )}
      </div>
      {myTurn && (
        <p className="mt-1 text-[11px] italic text-stone-500">
          A skipped action is lost — it never rolls into a later period.
        </p>
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
  const showEngineering = game.phase !== "ENGINEERING";
  const owed = actionsRemaining(me);
  return (
    <aside className="rounded-2xl bg-[#fffaf0] p-4 text-stone-900 shadow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black">Your company</h3>
        <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: me.color }}>
          {me.name} · {money(me.money)}
        </span>
      </div>

      {game.phase === "CONSTRUCTION" && (
        <p className="mt-1 text-xs text-stone-600">
          {owed} action{owed === 1 ? "" : "s"} of work left across {me.lines.length} contract
          {me.lines.length === 1 ? "" : "s"}.
        </p>
      )}

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
              >
                <p className="mt-1 text-[11px] text-stone-500">
                  Paid {money(line.paid)}
                  {line.paid < contract.cost && " (Discount Yard)"}
                  {line.start !== undefined
                    ? ` · periods ${line.start}–${line.start + contractActions(contract) - 1}`
                    : " · shelved"}
                </p>
              </ContractCard>
            );
          })
        )}
      </div>

      {showEngineering && me.committedEngineering.length > 0 && (
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

      {showEngineering && me.engineeringHand.length > 0 && (
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
  const myStarterTurn = !!game && game.phase === "STARTER_PLACEMENT" && starterTurnId(game) === playerId;
  const starterLine = game && me ? me.lines.findIndex((l) => !l.route.length) : -1;
  const placingStarter = myStarterTurn && starterLine >= 0;
  const myBuild =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.resolveQueue[0] === me.id && me.pendingActions.length > 0;

  const activeLineIndex = placingStarter
    ? starterLine
    : myBuild && me
      ? me.pendingActions.includes(selectedLine)
        ? selectedLine
        : me.pendingActions[0]
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
          Six Line Contracts come up one at a time and all of them find an owner. Commit secret
          engineering objectives, plan your whole construction programme on a shared Gantt board, then
          race for station capacity on the pegboard.
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
  const schedulingRevealed = game.phase !== "SCHEDULING" || game.schedulingStep === "RESOLUTION";
  const showGantt = ["SCHEDULING", "STARTER_PLACEMENT", "CONSTRUCTION", "SCORING"].includes(game.phase);
  const showBoard = game.phase !== "PROCUREMENT" && game.phase !== "ENGINEERING" && game.phase !== "SCHEDULING";

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
        <div className="min-w-0 space-y-3">
          {showBoard && (
            <>
              <div className="mx-auto w-full max-w-2xl lg:max-w-none">
                <Board game={game} legalCells={legalCells} canAct={canAct} onTapHole={onTapHole} />
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
            </>
          )}
          {showGantt && (
            <GanttBoard
              game={game}
              viewerId={playerId}
              revealed={schedulingRevealed}
              editable={game.phase === "SCHEDULING" && game.schedulingStep === "PLANNING" && !me?.scheduleSubmitted}
              busy={busy}
              act={act}
            />
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {game.phase === "PROCUREMENT" && me && <ProcurementPanel game={game} me={me} busy={busy} act={act} />}
          {game.phase === "ENGINEERING" && me && (
            <EngineeringPanel me={me} chosen={chosen} setChosen={setChosen} busy={busy} act={act} />
          )}
          {game.phase === "SCHEDULING" && me && <SchedulingPanel game={game} me={me} busy={busy} act={act} />}
          {game.phase === "STARTER_PLACEMENT" && me && <StarterPanel game={game} me={me} />}
          {game.phase === "CONSTRUCTION" && me && (
            <ConstructionPanel
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
