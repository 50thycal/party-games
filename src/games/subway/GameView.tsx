"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import {
  CONSTRUCTION_CARDS,
  ENGINEERING_CARDS,
  SCHEDULING_CARDS,
  STATIONS,
  SUBWAY_CONFIG,
  contractFor,
  hasLegalMove,
  legalScheduleStart,
  marketConstruction,
  marketContract,
  marketEngineering,
  marketScheduling,
  periodsFor,
  procurementPlayerId,
  stationAt,
  validateNode,
  type ConstructionCardId,
  type LineContract,
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
  SCHEDULING_PROPOSAL: "Scheduling · secret proposals",
  SCHEDULING_REVEAL: "Scheduling · reveal",
  SCHEDULING_RESOLUTION: "Scheduling · resolution",
  SCHEDULE_LOCKED: "Starter placement",
  STARTER_PLACEMENT: "Starter placement",
  CONSTRUCTION: "Construction",
  SCORING: "Scoring",
  RESULTS: "Results",
};

type Status = { headline: string; tone: "act" | "wait" | "info"; detail?: string };

/** Per-client status derived from authoritative state (never trusts a stale
 *  broadcast message for whose turn it is). */
function statusFor(game: SubwayState, me: SubwayPlayer | undefined, isHost: boolean): Status {
  const opp = me ? game.playerOrder.map((id) => game.players[id]).find((p) => p.id !== me.id) : undefined;
  const oppName = opp?.name ?? "the opposition";

  if (!me) return { headline: "You are spectating this two-company contest.", tone: "info" };

  switch (game.phase) {
    case "SETUP":
      return isHost
        ? { headline: "Start the game when both companies are ready.", tone: "act" }
        : { headline: "Waiting for the host to start.", tone: "wait" };
    case "PROCUREMENT": {
      const active = procurementPlayerId(game);
      return active === me.id
        ? {
            headline: "Your market pick.",
            tone: "act",
            detail: me.contractId ? "You own a contract — take a card or pass." : "Buy your Line Contract, take a card, or pass.",
          }
        : { headline: `${game.players[active ?? ""]?.name ?? "Opponent"} is at the market.`, tone: "wait" };
    }
    case "ENGINEERING":
      return me.engineeringLocked
        ? { headline: `Committed face down — waiting for ${oppName}.`, tone: "wait" }
        : { headline: "Commit exactly 3 Engineering cards face down.", tone: "act" };
    case "SCHEDULING_PROPOSAL":
      return me.proposedStart === undefined
        ? { headline: "Secretly choose the start period of your construction block.", tone: "act" }
        : { headline: `Proposal locked — waiting for ${oppName}.`, tone: "wait" };
    case "SCHEDULING_REVEAL":
      return isHost
        ? { headline: "Reveal both schedule proposals.", tone: "act" }
        : { headline: "Waiting for the host to reveal both proposals.", tone: "wait" };
    case "SCHEDULING_RESOLUTION":
      return me.scheduleConfirmed
        ? { headline: `Schedule confirmed — waiting for ${oppName}.`, tone: "wait" }
        : { headline: "Optionally play one Scheduling card, then confirm.", tone: "act" };
    case "SCHEDULE_LOCKED":
    case "STARTER_PLACEMENT":
      return me.route.length
        ? { headline: `Starter placed — waiting for ${oppName}.`, tone: "wait" }
        : { headline: "Place your free starter peg on any legal normal hole.", tone: "act" };
    case "CONSTRUCTION": {
      const actorId = game.constructionQueue[0];
      const actor = game.players[actorId];
      if (actorId === me.id) {
        return {
          headline: `Period ${game.currentPeriod} — your build.`,
          tone: "act",
          detail: "Tap a highlighted hole to extend your line.",
        };
      }
      const contract = contractFor(me);
      const done = !!contract && me.route.length >= contract.nodes;
      const nextPeriod = periodsFor(me).find((q) => q >= game.currentPeriod);
      const mine = game.constructionQueue.includes(me.id)
        ? "You build next this period."
        : done
          ? "Your line is complete."
          : nextPeriod !== undefined
            ? `Your next action: period ${nextPeriod}.`
            : "You have no scheduled actions left.";
      return {
        headline: `Period ${game.currentPeriod} — ${actor?.name ?? "opponent"} builds.`,
        tone: "wait",
        detail: mine,
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
        selected
          ? "border-amber-500 bg-amber-100 ring-2 ring-amber-300"
          : "border-stone-300 bg-[#fffaf0]"
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

function ContractCard({ contract, owned, accent }: { contract: LineContract; owned?: boolean; accent?: string }) {
  return (
    <div
      className="w-full rounded-xl border-2 bg-[#fffaf0] p-3 text-stone-900 shadow-sm"
      style={{ borderColor: accent ?? "#a8a29e" }}
    >
      <div className="flex items-baseline justify-between">
        <strong className="text-sm">{contract.name}</strong>
        <span className="text-sm font-black">{owned ? "Owned" : money(contract.cost)}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-stone-600">
        <span>{contract.nodes} nodes total</span>
        <span>{contract.nodes - 1} build actions</span>
        <span>Complete: +{contract.completionVp} VP</span>
        <span>Major bonus: +{contract.stationBonus} VP</span>
        <span className="col-span-2">Incomplete: {contract.incompletePenalty} VP</span>
      </div>
      {contract.special && <p className="mt-1 text-xs font-semibold text-amber-800">{contract.special}</p>}
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

/** Stable docking slot per seat so pegs visibly occupy a station connection. */
const slotOffset = (station: Station, seat: number) => ({
  dx: (seat - (station.capacity - 1) / 2) * 26,
  dy: 15,
});

function nodeRenderPos(node: RouteNode, seat: number) {
  const base = holePos(node);
  if (!node.stationId) return base;
  const station = stationAt(node);
  if (!station) return base;
  const { dx, dy } = slotOffset(station, seat);
  return { x: base.x + dx, y: base.y + dy };
}

type ViewTransform = { scale: number; x: number; y: number };

const clampView = (v: ViewTransform): ViewTransform => {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  const lo = Math.min(0.25 * VB - VB * scale, 0.75 * VB - VB * scale);
  const hi = 0.75 * VB;
  return {
    scale,
    x: Math.min(hi, Math.max(lo, v.x)),
    y: Math.min(hi, Math.max(lo, v.y)),
  };
};

function Board({
  game,
  legalCells,
  canAct,
  onTapHole,
}: {
  game: SubwayState;
  legalCells: Point[];
  canAct: boolean;
  onTapHole: (p: Point) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; last: { x: number; y: number } | null; pinch: { dist: number; view: ViewTransform } | null }>({
    moved: false,
    last: null,
    pinch: null,
  });

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

  // Wheel zoom (non-passive so we can prevent the page from scrolling).
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
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) > 0) {
        if (!gesture.current.moved && Math.hypot(dx, dy) > 6) gesture.current.moved = true;
        if (gesture.current.moved) {
          const f = pxToVb();
          setView((v) => clampView({ ...v, x: v.x + dx * f, y: v.y + dy * f }));
          gesture.current.last = { x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // A pinch finger lifted: continue panning with the remaining finger.
      const [rest] = Array.from(pointers.current.values());
      gesture.current.last = rest;
      gesture.current.pinch = null;
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current.pinch = null;
    if (!wasTap || !canAct) return;

    // Mathematical hit-testing: snap the tap to the nearest peg hole. Station
    // tiles get a generous radius so tapping anywhere on the tile works.
    const board = clientToBoard(e.clientX, e.clientY);
    const cell = {
      x: Math.round((board.x - PAD) / STEP),
      y: Math.round((board.y - PAD) / STEP),
    };
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

  const seatOf = (id: string) => game.playerOrder.indexOf(id);
  const players = game.playerOrder.map((id) => game.players[id]).filter(Boolean);
  const activeBuilderId = game.phase === "CONSTRUCTION" ? game.constructionQueue[0] : undefined;
  const legalSet = new Set(legalCells.map((c) => `${c.x},${c.y}`));

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
        {/* Input surface: all pointer handling happens on the svg itself, so
            decorations can never swallow taps (the old station-tile bug). */}
        <rect x="0" y="0" width={VB} height={VB} fill="#8a6844" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`} pointerEvents="none">
          <rect x="16" y="16" width={VB - 32} height={VB - 32} rx="26" fill="#b98a58" />
          <rect x="16" y="16" width={VB - 32} height={VB - 32} rx="26" fill="none" stroke="#71533a" strokeWidth="3" opacity="0.6" />

          {/* Peg holes */}
          {cells.map((c) => {
            const p = holePos(c);
            return (
              <g key={`h-${c.x}-${c.y}`}>
                <circle cx={p.x} cy={p.y} r="8" fill="#8f6c49" />
                <circle cx={p.x} cy={p.y} r="5.5" fill="#5f4630" />
              </g>
            );
          })}

          {/* Station tiles */}
          {STATIONS.map((s) => {
            const p = holePos(s);
            const major = s.kind === "major";
            const w = major ? 86 : 72;
            const h = 56;
            // Clamp long labels into the tile instead of overflowing it.
            const fit = (label: string, fontSize: number) =>
              label.length * fontSize * 0.62 > w - 10
                ? { textLength: w - 10, lengthAdjust: "spacingAndGlyphs" as const }
                : {};
            const claimants = game.playerOrder.filter((id) =>
              game.players[id]?.route.some((n) => n.stationId === s.id)
            );
            const highlight = legalSet.has(`${s.x},${s.y}`);
            return (
              <g key={s.id} transform={`translate(${p.x},${p.y})`}>
                <rect x={-w / 2} y={-h / 2 + 2} width={w} height={h} rx="11" fill="#000" opacity="0.25" />
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="11" fill={major ? "#24384c" : "#4f6357"} stroke={highlight ? "#4ade80" : "#f5d98a"} strokeWidth={highlight ? 5 : 3.5} />
                <text y={-15} textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="700" {...fit(s.name, 10.5)}>
                  {s.name}
                </text>
                <text y={-3} textAnchor="middle" fill="#f5d98a" fontSize="8.5" fontWeight="700" {...fit("MAJOR · +5 VP", 8.5)}>
                  {major ? "MAJOR" : "MINOR"} · +{SUBWAY_CONFIG.stationScores[s.kind]} VP
                </text>
                {/* Docking slots: a peg locks into one of these when a company
                    connects, visibly consuming station capacity. */}
                {Array.from({ length: s.capacity }, (_, i) => {
                  const { dx, dy } = slotOffset(s, i);
                  const owner = claimants.find((id) => seatOf(id) === i);
                  return (
                    <g key={i} transform={`translate(${dx},${dy})`}>
                      <circle r="9" fill="#00000055" stroke={owner ? game.players[owner].color : "#f5d98a"} strokeWidth="2" strokeDasharray={owner ? "0" : "3 3"} />
                    </g>
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

          {/* Strings: pale outline pass, then colored pass */}
          {players.map((pl) =>
            pl.route.slice(1).map((n, i) => {
              const a = nodeRenderPos(pl.route[i], seatOf(pl.id));
              const b = nodeRenderPos(n, seatOf(pl.id));
              return <line key={`o-${pl.id}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fdf6e3" strokeWidth="13" strokeLinecap="round" />;
            })
          )}
          {players.map((pl) =>
            pl.route.slice(1).map((n, i) => {
              const a = nodeRenderPos(pl.route[i], seatOf(pl.id));
              const b = nodeRenderPos(n, seatOf(pl.id));
              return <line key={`c-${pl.id}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={pl.color} strokeWidth="8" strokeLinecap="round" />;
            })
          )}

          {/* Pegs */}
          {players.map((pl) =>
            pl.route.map((n, i) => {
              const p = nodeRenderPos(n, seatOf(pl.id));
              const isEndpoint = i === pl.route.length - 1;
              const contract = contractFor(pl);
              const building =
                game.phase === "CONSTRUCTION" && !!contract && pl.route.length < contract.nodes;
              const r = n.stationId ? 7.5 : 11;
              return (
                <g key={`n-${pl.id}-${i}`}>
                  {isEndpoint && building && (
                    <circle cx={p.x} cy={p.y} r={r + 5} fill="none" stroke={pl.color} strokeWidth="2.5" opacity={pl.id === activeBuilderId ? 1 : 0.5}>
                      {pl.id === activeBuilderId && (
                        <animate attributeName="r" values={`${r + 4};${r + 9};${r + 4}`} dur="1.4s" repeatCount="indefinite" />
                      )}
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={r} fill={pl.color} stroke="#ffffff" strokeWidth="3" />
                  <circle cx={p.x - r / 4} cy={p.y - r / 3} r={r / 3.6} fill="#ffffff" opacity="0.5" />
                </g>
              );
            })
          )}
        </g>
      </svg>
    </section>
  );
}

// ============================================================================
// Schedule (Gantt) panel
// ============================================================================

function SchedulePanel({
  game,
  myId,
  previewStart,
}: {
  game: SubwayState;
  myId: string;
  previewStart?: number;
}) {
  const periods = SUBWAY_CONFIG.timelinePeriods;
  const secretPhase = game.phase === "SCHEDULING_PROPOSAL" || game.phase === "SCHEDULING_REVEAL";
  const revealed = [
    "SCHEDULING_RESOLUTION",
    "SCHEDULE_LOCKED",
    "STARTER_PLACEMENT",
    "CONSTRUCTION",
    "SCORING",
    "RESULTS",
  ].includes(game.phase);
  const inConstruction = game.phase === "CONSTRUCTION";

  return (
    <section className="rounded-2xl border border-stone-300 bg-[#f6edda] p-3 text-stone-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wider">Construction schedule</h3>
        <span className="text-xs text-stone-600">Priority 1 acts first in shared periods</span>
      </div>
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: `minmax(7rem,auto) repeat(${periods}, minmax(1.4rem, 1fr))` }}>
        <div />
        {Array.from({ length: periods }, (_, i) => (
          <div
            key={i}
            className={`text-center text-xs font-bold ${inConstruction && i + 1 === game.currentPeriod ? "text-emerald-700" : "text-stone-500"}`}
          >
            {i + 1}
          </div>
        ))}

        {game.playerOrder.map((id) => {
          const p = game.players[id];
          const contract = contractFor(p);
          const isMe = id === myId;
          const isPriority = id === game.defaultPriorityPlayerId;
          const scheduled = new Set<number>();
          let secretNote: string | null = null;

          if (revealed) {
            periodsFor(p).forEach((q) => scheduled.add(q));
          } else if (secretPhase) {
            if (isMe) {
              const start = p.proposedStart ?? previewStart;
              const duration = (contract?.nodes ?? 1) - 1;
              if (start !== undefined) {
                for (let q = start; q < start + duration; q++) scheduled.add(q);
                secretNote = p.proposedStart !== undefined ? "locked" : "preview";
              }
            } else {
              secretNote = p.proposedStart !== undefined ? "locked" : "choosing";
            }
          }

          return (
            <div className="contents" key={id}>
              <div className="flex min-w-0 items-center gap-1.5 pr-1">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate text-xs font-bold">{p.name}</span>
                <span className={`shrink-0 rounded px-1 text-[10px] font-black ${isPriority ? "bg-amber-400 text-stone-900" : "bg-stone-300 text-stone-600"}`}>
                  {isPriority ? "P1" : "P2"}
                </span>
                {secretNote && !isMe && (
                  <span className="shrink-0 text-[10px] italic text-stone-500">{secretNote}…</span>
                )}
              </div>
              {Array.from({ length: periods }, (_, i) => {
                const period = i + 1;
                const filled = scheduled.has(period);
                const isCurrent = inConstruction && period === game.currentPeriod;
                const past = inConstruction && period < game.currentPeriod;
                const hidden = secretPhase && !isMe;
                return (
                  <div
                    key={i}
                    className={`flex h-7 items-center justify-center rounded border text-[10px] font-bold ${
                      isCurrent ? "border-emerald-600 ring-1 ring-emerald-500" : "border-stone-300"
                    } ${filled ? "" : "bg-white/50"}`}
                    style={filled ? { background: p.color, opacity: past ? 0.45 : secretNote === "preview" ? 0.6 : 1 } : { opacity: past ? 0.5 : 1 }}
                  >
                    {hidden && <span className="text-stone-400">?</span>}
                  </div>
                );
              })}
              <div className="col-span-full -mt-0.5 mb-1 pl-5 text-[11px] text-stone-500">
                {contract
                  ? `${contract.name} · ${p.route.length}/${contract.nodes} nodes${
                      p.route.length >= contract.nodes ? " · complete" : ""
                    }`
                  : "No contract yet"}
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
  const contract = marketContract(game.market);
  const eng = marketEngineering(game.market);
  const sch = marketScheduling(game.market);
  const con = marketConstruction(game.market);
  const cannotBuy = me.contractId ? "You already own a contract" : me.money < contract.cost ? "Not enough money" : undefined;

  return (
    <Panel title="Face-up market">
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        <div className="w-56 shrink-0">
          <ContractCard contract={contract} />
        </div>
        <CardShell title={eng.name} tag="Engineering">{eng.description}</CardShell>
        <CardShell title={sch.name} tag="Scheduling">{sch.description}</CardShell>
        <CardShell title={con.name} tag="Construction">{con.description}</CardShell>
      </div>
      {myTurn ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            disabled={busy || !!cannotBuy}
            onClick={() => act("PROCURE", { choice: "contract" })}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-35"
            title={cannotBuy}
          >
            Buy contract ({money(contract.cost)})
          </button>
          {(["engineering", "scheduling", "construction"] as const).map((kind) => (
            <button
              key={kind}
              disabled={busy}
              onClick={() => act("PROCURE", { choice: kind })}
              className="rounded-lg bg-stone-800 px-3 py-2 text-xs font-bold capitalize text-white disabled:opacity-35"
            >
              Take {kind}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={() => act("PROCURE", { choice: "pass" })}
            className="rounded-lg border border-stone-400 px-3 py-2 text-xs font-bold text-stone-700 disabled:opacity-35"
          >
            Pass
          </button>
          {cannotBuy && <p className="w-full text-xs text-stone-500">{cannotBuy}.</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm text-stone-500">Waiting for the other company to choose…</p>
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
  const hand = me.engineeringHand
    .map((id) => ENGINEERING_CARDS.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);

  if (me.engineeringLocked) {
    return (
      <Panel title="Engineering committed">
        <p className="mt-1 text-sm text-stone-600">
          Your 3 cards are locked face down. The opposition cannot see them until scoring.
        </p>
      </Panel>
    );
  }

  const toggle = (id: string) =>
    setChosen(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < 3 ? [...chosen, id] : chosen
    );

  return (
    <Panel title={`Commit exactly 3 Engineering cards (${chosen.length}/3 selected)`}>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-3">
        {hand.map((c, i) => (
          <CardShell
            key={`${c.id}-${i}`}
            title={`${c.name} · +${c.vp} VP`}
            tag={c.kind === "permission" ? "Permit" : "Objective"}
            selected={chosen.includes(c.id)}
            onClick={() => toggle(c.id)}
          >
            {c.description}
          </CardShell>
        ))}
      </div>
      <button
        disabled={busy || chosen.length !== 3}
        onClick={() => act("COMMIT_ENGINEERING", { cardIds: chosen })}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"
      >
        Lock 3 face down
      </button>
    </Panel>
  );
}

function ProposalPanel({
  me,
  start,
  setStart,
  busy,
  act,
}: {
  me: SubwayPlayer;
  start: number;
  setStart: (n: number) => void;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  const contract = contractFor(me);
  const duration = (contract?.nodes ?? 1) - 1;
  const maxStart = Math.max(1, SUBWAY_CONFIG.timelinePeriods - duration + 1);
  const value = Math.min(start, maxStart);
  const locked = me.proposedStart !== undefined;

  return (
    <Panel title="Secret schedule proposal">
      <p className="mt-1 text-sm text-stone-600">
        Your {contract?.name ?? "line"} needs a contiguous block of {duration} periods. The opposition
        will not see your choice until both lock.
      </p>
      {locked ? (
        <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold">
          Locked: periods {me.proposedStart}–{me.proposedStart! + duration - 1}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            aria-label="Schedule start period"
            type="range"
            min={1}
            max={maxStart}
            value={value}
            onChange={(e) => setStart(+e.target.value)}
            className="w-48 accent-emerald-700"
          />
          <strong className="text-sm">
            Periods {value}–{value + duration - 1}
          </strong>
          <button
            disabled={busy}
            onClick={() => act("PROPOSE_SCHEDULE", { start: value })}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Lock proposal
          </button>
        </div>
      )}
    </Panel>
  );
}

function ResolutionPanel({
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
  const [floatDir, setFloatDir] = useState<-1 | 1>(-1);
  const priorityHolder = game.players[game.defaultPriorityPlayerId];

  const cardPlayable = (id: SchedulingCardId): string | undefined => {
    if (me.scheduleCardPlayed) return "One Scheduling card max";
    if (me.scheduleConfirmed) return "Schedule already confirmed";
    if (id === "early" && !legalScheduleStart(me, (me.scheduleStart ?? 1) - 1)) return "Cannot shift earlier";
    if (id === "float") {
      const earlierOk = legalScheduleStart(me, (me.scheduleStart ?? 1) - 1);
      const laterOk = legalScheduleStart(me, (me.scheduleStart ?? 1) + 1);
      if (!earlierOk && !laterOk) return "No legal shift";
    }
    if (id === "priority" && game.defaultPriorityPlayerId === me.id) return "You already hold Priority 1";
    return undefined;
  };

  return (
    <Panel title="Scheduling card window">
      <p className="mt-1 text-sm text-stone-600">
        {priorityHolder?.name} holds Priority 1 and acts first in shared periods. Each company may play
        at most one Scheduling card, then must confirm.
      </p>
      {me.schedulingHand.length > 0 && !me.scheduleConfirmed && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {me.schedulingHand.map((id, i) => {
            const card = SCHEDULING_CARDS.find((c) => c.id === id)!;
            const reason = cardPlayable(id);
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
      )}
      {me.scheduleCardPlayed && (
        <p className="mt-2 text-xs font-semibold text-stone-600">
          Played: {SCHEDULING_CARDS.find((c) => c.id === me.scheduleCardPlayed)?.name}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {picked === "float" && (
          <div className="flex overflow-hidden rounded-lg border border-stone-400 text-xs font-bold">
            <button
              className={`px-3 py-2 ${floatDir === -1 ? "bg-stone-800 text-white" : "text-stone-700"}`}
              onClick={() => setFloatDir(-1)}
              disabled={!legalScheduleStart(me, (me.scheduleStart ?? 1) - 1)}
            >
              Earlier
            </button>
            <button
              className={`px-3 py-2 ${floatDir === 1 ? "bg-stone-800 text-white" : "text-stone-700"}`}
              onClick={() => setFloatDir(1)}
              disabled={!legalScheduleStart(me, (me.scheduleStart ?? 1) + 1)}
            >
              Later
            </button>
          </div>
        )}
        {picked && (
          <button
            disabled={busy}
            onClick={() => {
              act("PLAY_SCHEDULING_CARD", {
                cardId: picked,
                ...(picked === "float" ? { direction: floatDir } : {}),
              });
              setPicked(null);
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Play {SCHEDULING_CARDS.find((c) => c.id === picked)?.name}
          </button>
        )}
        <button
          disabled={busy || me.scheduleConfirmed}
          onClick={() => act("CONFIRM_SCHEDULE")}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {me.scheduleConfirmed ? "Confirmed — waiting" : "Confirm final schedule"}
        </button>
      </div>
    </Panel>
  );
}

function ConstructionPanel({
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
  const [picked, setPicked] = useState<ConstructionCardId | null>(null);
  const myTurn = game.constructionQueue[0] === me.id;
  const contract = contractFor(me);
  const remaining = contract ? contract.nodes - me.route.length : 0;
  const blocked = myTurn && !hasLegalMove(game, me.id);

  useEffect(() => {
    if (!myTurn) setPicked(null);
  }, [myTurn]);

  if (!myTurn) return null;

  const cardReason = (id: ConstructionCardId): string | undefined => {
    if (id === "overtime" || id === "crew") {
      if (remaining < 2) return "Only 1 node left to build";
      return undefined;
    }
    if (id === "expedite") {
      const periods = periodsFor(me);
      const movable = periods.some((q) => q - 1 > game.currentPeriod && !periods.includes(q - 1));
      if (!movable) return "No future action can move earlier";
    }
    return undefined;
  };

  return (
    <Panel title={`Your build — period ${game.currentPeriod}`}>
      <p className="mt-1 text-sm text-stone-600">
        Tap a highlighted hole on the board to place your next node.
        {me.overtimeActions > 0 && ` Extra builds queued: ${me.overtimeActions}.`}
      </p>
      {me.constructionHand.length > 0 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {me.constructionHand.map((id, i) => {
            const card = CONSTRUCTION_CARDS.find((c) => c.id === id)!;
            const reason = cardReason(id);
            return (
              <CardShell
                key={`${id}-${i}`}
                title={card.name}
                tag="Construction"
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
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {picked && (
          <button
            disabled={busy}
            onClick={() => {
              act("PLAY_CONSTRUCTION_CARD", { cardId: picked });
              setPicked(null);
            }}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            Play {CONSTRUCTION_CARDS.find((c) => c.id === picked)?.name}
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => act("SKIP_ACTION")}
          className={`rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40 ${
            blocked ? "bg-red-700 text-white" : "border border-stone-400 text-stone-600"
          }`}
        >
          {blocked ? "No legal moves — pass" : "Pass this action"}
        </button>
      </div>
    </Panel>
  );
}

function ResultsPanel({ game }: { game: SubwayState }) {
  return (
    <section className="rounded-2xl bg-white/80 p-5 text-stone-900">
      <h3 className="text-center font-serif text-3xl font-black">{game.message}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          const winner = game.winnerIds.includes(id);
          return (
            <div key={id} className={`rounded-xl border-2 p-4 ${winner ? "shadow-lg" : "opacity-90"}`} style={{ borderColor: p.color }}>
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
  const contract = contractFor(me);
  const committed = me.committedEngineering
    .map((id) => ENGINEERING_CARDS.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  // Older saved games left committed cards inside the hand; hide them there.
  const handIds =
    me.engineeringLocked && me.committedEngineering.every((id) => me.engineeringHand.includes(id))
      ? me.committedEngineering.reduce((hand, id) => {
          const i = hand.indexOf(id);
          return i === -1 ? hand : [...hand.slice(0, i), ...hand.slice(i + 1)];
        }, me.engineeringHand)
      : me.engineeringHand;

  return (
    <aside className="rounded-2xl bg-[#fffaf0] p-4 text-stone-900 shadow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black">Your company</h3>
        <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: me.color }}>
          {me.name} · {money(me.money)}
        </span>
      </div>

      <div className="mt-3">
        {contract ? (
          <ContractCard contract={contract} owned accent={me.color} />
        ) : (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">No Line Contract yet.</p>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <b className="text-xs uppercase text-stone-500">Engineering</b>
          {committed.length > 0 && (
            <ul className="mt-1 space-y-1">
              {committed.map((c, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="shrink-0 rounded bg-stone-800 px-1 py-0.5 text-[9px] font-black uppercase text-amber-100">Face down</span>
                  <span>{c.name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-stone-600">
            {handIds.length ? `In hand: ${handIds.map((id) => ENGINEERING_CARDS.find((c) => c.id === id)?.name ?? id).join(", ")}` : committed.length ? "No uncommitted cards." : "No cards."}
          </p>
        </div>
        <div>
          <b className="text-xs uppercase text-stone-500">Scheduling</b>
          <p className="mt-1 text-xs text-stone-600">
            {me.schedulingHand.length
              ? me.schedulingHand.map((id) => SCHEDULING_CARDS.find((c) => c.id === id)?.name ?? id).join(", ")
              : "None"}
          </p>
        </div>
        <div>
          <b className="text-xs uppercase text-stone-500">Construction</b>
          <p className="mt-1 text-xs text-stone-600">
            {me.constructionHand.length
              ? me.constructionHand.map((id) => CONSTRUCTION_CARDS.find((c) => c.id === id)?.name ?? id).join(", ")
              : "None"}
          </p>
          {game.phase !== "CONSTRUCTION" && me.constructionHand.length > 0 && (
            <p className="text-[11px] italic text-stone-400">Playable during your builds.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

// ============================================================================
// Main view
// ============================================================================

export function SubwayGameView({ state, room, playerId, isHost, dispatchAction }: GameViewProps<SubwayState>) {
  const game = state as SubwayState | undefined;
  const me = game?.players[playerId];

  const [chosen, setChosen] = useState<string[]>([]);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-dismiss placement notices.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Per-player UI selections must not leak across hotseat player switches.
  useEffect(() => {
    setChosen([]);
    setStart(1);
    setNotice(null);
  }, [playerId]);

  const act = async (type: string, payload?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await dispatchAction(type, payload);
    } finally {
      setBusy(false);
    }
  };

  const placingStarter =
    !!game && !!me && (game.phase === "STARTER_PLACEMENT" || game.phase === "SCHEDULE_LOCKED") && !me.route.length;
  const building =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.constructionQueue[0] === me.id;
  const canAct = (placingStarter || building) && !busy;

  const legalCells = useMemo(() => {
    if (!game || !me || !(placingStarter || building)) return [];
    const cells: Point[] = [];
    for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
      for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
        if (!validateNode(game, me.id, { x, y }, placingStarter)) cells.push({ x, y });
      }
    }
    return cells;
  }, [game, me, placingStarter, building]);

  const onTapHole = (p: Point) => {
    if (!game || !me || !canAct) return;
    const reason = validateNode(game, me.id, p, placingStarter);
    if (reason) {
      setNotice(reason);
      return;
    }
    setNotice(null);
    act(placingStarter ? "PLACE_STARTER" : "BUILD", { x: p.x, y: p.y });
  };

  // ---- Pre-game lobby -------------------------------------------------------
  if (!game || game.phase === "SETUP") {
    const enough = room.players.length >= 2;
    return (
      <section className="rounded-2xl bg-[#ede1c7] p-6 text-center text-stone-900 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Subway</h2>
        <p className="mx-auto my-4 max-w-xl text-sm text-stone-600">
          Procure a contract, commit secret engineering objectives, schedule your construction block,
          then race for station capacity on a shared tactile pegboard.
        </p>
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
  const inConstruction = ["CONSTRUCTION", "SCORING", "RESULTS"].includes(game.phase);

  return (
    <div className="space-y-4 rounded-3xl bg-[#ede1c7] p-3 text-stone-900 sm:p-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
          <h2 className="font-serif text-2xl font-black sm:text-3xl">Subway</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-amber-50 sm:text-sm">
            {PHASE_LABELS[game.phase] ?? game.phase}
            {inConstruction && game.phase === "CONSTRUCTION" && ` · Period ${Math.min(game.currentPeriod, SUBWAY_CONFIG.timelinePeriods)}/${SUBWAY_CONFIG.timelinePeriods}`}
          </span>
        </div>
      </header>

      {/* Per-client status banner */}
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
        {game.message !== status.headline && (
          <p className="mt-0.5 text-[11px] italic text-stone-500">{game.message}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        {/* Board column */}
        <div className="space-y-2">
          <div className="mx-auto w-full max-w-2xl lg:max-w-none">
            <Board game={game} legalCells={legalCells} canAct={canAct} onTapHole={onTapHole} />
          </div>
          {notice && (
            <p className="rounded-xl bg-red-100 px-3 py-2 text-center text-sm font-bold text-red-900">{notice}</p>
          )}
          {canAct && !notice && (
            <p className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
              {placingStarter
                ? "Tap a glowing hole to place your starter peg (stations not allowed)."
                : "Tap a glowing hole or open station slot to extend your line."}
            </p>
          )}
        </div>

        {/* Panels column */}
        <div className="space-y-4">
          {game.phase === "PROCUREMENT" && me && <MarketPanel game={game} me={me} busy={busy} act={act} />}
          {game.phase === "ENGINEERING" && me && (
            <EngineeringPanel key={playerId} me={me} chosen={chosen} setChosen={setChosen} busy={busy} act={act} />
          )}
          {game.phase === "SCHEDULING_PROPOSAL" && me && (
            <ProposalPanel me={me} start={start} setStart={setStart} busy={busy} act={act} />
          )}
          {game.phase === "SCHEDULING_REVEAL" && isHost && (
            <button
              disabled={busy}
              onClick={() => act("REVEAL_SCHEDULES")}
              className="w-full rounded-xl bg-amber-600 py-3 font-bold text-white disabled:opacity-40"
            >
              Reveal both schedules
            </button>
          )}
          {game.phase === "SCHEDULING_RESOLUTION" && me && (
            <ResolutionPanel key={playerId} game={game} me={me} busy={busy} act={act} />
          )}
          {game.phase === "CONSTRUCTION" && me && (
            <ConstructionPanel key={playerId} game={game} me={me} busy={busy} act={act} />
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

          {game.phase !== "RESULTS" && (
            <SchedulePanel
              game={game}
              myId={playerId}
              previewStart={game.phase === "SCHEDULING_PROPOSAL" ? start : undefined}
            />
          )}
          {me && <PrivatePanel game={game} me={me} />}
        </div>
      </div>

      {/* Slim footer so players can still find the room code mid-game */}
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
