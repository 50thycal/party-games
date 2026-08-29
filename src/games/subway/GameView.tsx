"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import { CardShell, ContractCard, LineChip, RecipeStrip, money } from "./cards";
import {
  EventRail,
  HandoffVeil,
  NarrationOverlay,
  OpponentMat,
  PlayerMat,
  useNarration,
  type PlanChip,
} from "./tabletop";
import { clearPlan, loadPlan, reconcilePlan, savePlan, type PlanStatus, type SavedPlan } from "./plans";
import {
  STATIONS,
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  basePriorityId,
  blockFits,
  blockPeriods,
  buyBlocker,
  concurrentBlocks,
  constructionById,
  contestedPeriods,
  contractActions,
  contractById,
  contractNodes,
  contractOf,
  contractsOutstanding,
  crewCost,
  destinationById,
  destinationMet,
  destinationTurnId,
  destinationsHeld,
  destinationProblems,
  engineeringById,
  contactToll,
  legalTargets,
  lineComplete,
  lineMobilization,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  mobilizationCost,
  mustBuyOffer,
  nextSegmentLength,
  nodePoint,
  routeContacts,
  pendingStarters,
  periodPriorityId,
  scheduleCost,
  scheduleProblems,
  schedulingById,
  segmentsBuilt,
  slotPoint,
  starterTurnId,
  stationAt,
  stationById,
  surveyBlocker,
  surveyFulfilled,
  surveyTurnId,
  surveysPending,
  validateNode,
  type CardDeckId,
  type ConstructionCardId,
  type LineContract,
  type PlacementTarget,
  type RouteContact,
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

/** Room state is plain JSON by invariant, so this is a safe deep copy. */
const cloneState = (s: SubwayState): SubwayState => JSON.parse(JSON.stringify(s)) as SubwayState;

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
          detail: `The opposition has hit its ${SUBWAY_CONFIG.maxContractsPerPlayer}-contract cap.`,
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
    case "ENGINEERING": {
      if (game.engineeringStep === "DESTINATION_DRAFT") {
        const turn = destinationTurnId(game);
        const owed = SUBWAY_CONFIG.destinationsPerPlayer - destinationsHeld(me);
        return turn === me.id
          ? {
              headline: `Draft a Destination — ${owed} to go.`,
              tone: "act",
              detail: "Three are face up. Picks are free; you assign them to lines next.",
            }
          : {
              headline: `${game.players[turn ?? ""]?.name ?? oppName} is drafting a Destination.`,
              tone: "wait",
            };
      }
      if (game.engineeringStep === "PLAN") {
        return me.engineeringLocked
          ? { headline: `Plan locked — waiting for ${oppName}.`, tone: "wait" }
          : {
              headline: "Lock your Engineering plan.",
              tone: "act",
              detail: "Three objectives, any Destination assignments, and 0–5 Survey Pins.",
            };
      }
      const turn = surveyTurnId(game);
      if (turn !== me.id) {
        return {
          headline: `${game.players[turn ?? ""]?.name ?? oppName} is placing a Survey Pin.`,
          tone: "wait",
        };
      }
      return {
        headline: `Place a Survey Pin — ${surveysPending(game, me.id)} left.`,
        tone: "act",
        detail: "Tap a normal hole. Pins are public and reserve nothing.",
      };
    }
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
      // Shelved contracts are never built, so they are not owed a peg.
      const pending = pendingStarters(me);
      return {
        headline: `Place the free starter peg for your ${lineLabel(me.lines[pending[0]])}.`,
        tone: "act",
        detail: "Starters enter from the edge: only border holes glow.",
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
              : "Tap a highlighted target to select it, then Confirm.",
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
// Pegboard
// ============================================================================

// The pegboard is a wide corridor, so the viewBox is sized from the board
// rather than fixed: pegs stay a constant STEP apart however long it gets.
const PAD = 62;
const STEP = 82;
const VB_W = PAD * 2 + (SUBWAY_CONFIG.board.columns - 1) * STEP;
const VB_H = PAD * 2 + (SUBWAY_CONFIG.board.rows - 1) * STEP;
const MIN_ZOOM = 0.6;
// A long board is drawn small to fit, so zooming in has to go further.
const MAX_ZOOM = 6;

/** Peg-space → viewBox pixels. Everything on the board goes through this. */
const toPx = (p: Point) => ({ x: PAD + p.x * STEP, y: PAD + p.y * STEP });
const holePos = (p: Point) => toPx({ x: p.x, y: p.y });
const nodePx = (n: RouteNode) => toPx(nodePoint(n));
const slotPx = (station: Station, slot: number) => toPx(slotPoint(station, slot));

const targetKey = (t: PlacementTarget) => `${t.x},${t.y},${t.slot ?? "-"}`;

type ViewTransform = { scale: number; x: number; y: number };

const clampView = (v: ViewTransform): ViewTransform => {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale));
  // Keep at least a quarter of the board on screen on each axis.
  const bound = (size: number, value: number) =>
    Math.min(size * 0.75, Math.max(size * 0.25 - size * scale, value));
  return { scale, x: bound(VB_W, v.x), y: bound(VB_H, v.y) };
};

/** A line drawn on the board — a real route, or a phantom plan/sketch. */
type DrawnLine = {
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

/**
 * How the svg element maps viewBox units to CSS pixels. The board fills the
 * element (`slice`), so on a phone the corridor is taller than aspect-fit
 * would allow and the sides pan into view; on desktop the element keeps the
 * board's own aspect ratio and this degenerates to the plain width fit.
 */
const frameMetrics = (w: number, h: number) => {
  const scaleF = Math.max(w / VB_W, h / VB_H);
  return { scaleF, ox: (w - VB_W * scaleF) / 2, oy: (h - VB_H * scaleF) / 2 };
};

/** Compact overview with the current viewport, so a zoomed-in phone never
 *  loses the rest of the corridor. Indicator only — panning stays on the board. */
function Minimap({
  drawn,
  view,
  svgSize,
}: {
  drawn: DrawnLine[];
  view: ViewTransform;
  svgSize: { w: number; h: number } | null;
}) {
  const m = svgSize ? frameMetrics(svgSize.w, svgSize.h) : undefined;
  const vp = m
    ? {
        x: ((0 - m.ox) / m.scaleF - view.x) / view.scale,
        y: ((0 - m.oy) / m.scaleF - view.y) / view.scale,
        w: (svgSize!.w / m.scaleF) / view.scale,
        h: (svgSize!.h / m.scaleF) / view.scale,
      }
    : { x: (0 - view.x) / view.scale, y: (0 - view.y) / view.scale, w: VB_W / view.scale, h: VB_H / view.scale };
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="block w-36 rounded-md sm:w-44"
      style={{ background: "#43301f" }}
      aria-hidden
    >
      <rect x="16" y="16" width={VB_W - 32} height={VB_H - 32} rx="26" fill="#b98a58" opacity="0.7" />
      {STATIONS.map((s) => {
        const p = holePos(s);
        return (
          <rect
            key={s.id}
            x={p.x - 34}
            y={p.y - 26}
            width="68"
            height="52"
            rx="10"
            fill={s.kind === "major" ? "#24384c" : "#4f6357"}
          />
        );
      })}
      {drawn.map((d) =>
        d.route.length > 1 ? (
          <polyline
            key={`mm-${d.key}`}
            points={d.route.map((n) => `${nodePx(n).x},${nodePx(n).y}`).join(" ")}
            fill="none"
            stroke={d.contract.color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={d.ghost ? "24 24" : undefined}
            opacity={d.ghost ? 0.5 : 1}
          />
        ) : null
      )}
      <rect
        x={vp.x}
        y={vp.y}
        width={vp.w}
        height={vp.h}
        fill="none"
        stroke="#fdf6e3"
        strokeWidth="18"
        rx="20"
      />
    </svg>
  );
}

function Board({
  game,
  targets,
  following,
  selected,
  canAct,
  drawn,
  onTapHole,
  overlay,
}: {
  game: SubwayState;
  targets: PlacementTarget[];
  /** Where the line could go *after* the selected target. Informational only. */
  following: PlacementTarget[];
  selected?: PlacementTarget;
  canAct: boolean;
  drawn: DrawnLine[];
  onTapHole: (p: Point, slot?: number) => void;
  /** Narration and other decorations layered over the board. */
  overlay?: React.ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const [showMini, setShowMini] = useState(true);
  const [svgSize, setSvgSize] = useState<{ w: number; h: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    moved: boolean;
    last: { x: number; y: number } | null;
    pinch: { dist: number; view: ViewTransform } | null;
  }>({ moved: false, last: null, pinch: null });

  // Track the element size so tap mapping and the minimap viewport stay exact
  // under the phone's height-filling crop.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSvgSize({ w: r.width, h: r.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const pxToVb = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? 1 / frameMetrics(rect.width, rect.height).scaleF : 1;
  };

  const clientToBoard = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const m = frameMetrics(rect.width, rect.height);
    const vx = (clientX - rect.left - m.ox) / m.scaleF;
    const vy = (clientY - rect.top - m.oy) / m.scaleF;
    return { x: (vx - view.x) / view.scale, y: (vy - view.y) / view.scale };
  };

  const zoomAtCenter = (factor: number) => {
    setView((v) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
      const anchorX = (VB_W / 2 - v.x) / v.scale;
      const anchorY = (VB_H / 2 - v.y) / v.scale;
      return clampView({ scale, x: VB_W / 2 - anchorX * scale, y: VB_H / 2 - anchorY * scale });
    });
  };

  // Wheel zoom (non-passive so the page does not scroll with it).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const m = frameMetrics(rect.width, rect.height);
      const vx = (e.clientX - rect.left - m.ox) / m.scaleF;
      const vy = (e.clientY - rect.top - m.oy) / m.scaleF;
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
        const m = frameMetrics(rect.width, rect.height);
        const midX = ((a.x + b.x) / 2 - rect.left - m.ox) / m.scaleF;
        const midY = ((a.y + b.y) / 2 - rect.top - m.oy) / m.scaleF;
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
    // tapping anywhere on the tile docks the line — but the *dock* is whichever
    // one the tap actually landed nearest, never an automatic choice. A pan is
    // never a tap, so panning can never select — let alone confirm — a peg.
    const board = clientToBoard(e.clientX, e.clientY);
    const cell = { x: Math.round((board.x - PAD) / STEP), y: Math.round((board.y - PAD) / STEP) };
    if (
      cell.x < 0 || cell.y < 0 ||
      cell.x >= SUBWAY_CONFIG.board.columns || cell.y >= SUBWAY_CONFIG.board.rows
    ) {
      return;
    }
    const station = stationAt(cell);
    const center = holePos(cell);
    const radius = (station ? 0.55 : 0.45) * STEP;
    if (Math.hypot(board.x - center.x, board.y - center.y) > radius) return;

    if (!station) {
      onTapHole(cell);
      return;
    }
    let nearest = 0;
    let nearestDist = Infinity;
    for (let slot = 0; slot < station.capacity; slot++) {
      const c = slotPx(station, slot);
      const d = Math.hypot(board.x - c.x, board.y - c.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = slot;
      }
    }
    onTapHole(cell, nearest);
  };

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

  return (
    <section className="relative overflow-hidden rounded-3xl border-4 border-[#5d4127] bg-[#8a6844] shadow-2xl">
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
          <button
            onClick={() => setShowMini(!showMini)}
            className="rounded-md bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25"
            aria-pressed={showMini}
          >
            Map
          </button>
        </div>
      </div>

      {overlay}

      {showMini && (
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-lg border border-[#43301f]/70 shadow-lg">
          <Minimap drawn={drawn} view={view} svgSize={svgSize} />
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        className={`block h-[46vh] min-h-[240px] w-full touch-none select-none lg:aspect-[2256/780] lg:h-auto lg:min-h-0 ${canAct ? "cursor-crosshair" : "cursor-grab"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* All pointer handling lives on the svg itself, so decorations can
            never swallow a tap. */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="#8a6844" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`} pointerEvents="none">
          <rect x="16" y="16" width={VB_W - 32} height={VB_H - 32} rx="26" fill="#b98a58" />
          <rect x="16" y="16" width={VB_W - 32} height={VB_H - 32} rx="26" fill="none" stroke="#71533a" strokeWidth="3" opacity="0.6" />

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
              Colour is never the only cue (DEC-013): the current step is a
              solid ring marked 1, the following step a dashed ring marked 2.
              data-target/data-step name what each marker means, so a playtest
              driver taps exactly what the rules allow. */}
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
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="12"
                      fill="none"
                      stroke="#ca8a04"
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                    />
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
              <circle
                cx={holePos(selected).x}
                cy={holePos(selected).y}
                r="15"
                fill="none"
                stroke="#15803d"
                strokeWidth="4"
              />
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

/**
 * Period ruler. Priority alternates odd/even by calendar period, so it is shown
 * for every period, not only contested ones, with permits called out.
 */
function PeriodRuler({ game }: { game: SubwayState }) {
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: GRID_COLUMNS }}>
      {Array.from({ length: PERIODS }, (_, i) => {
        const period = i + 1;
        const live = game.phase === "CONSTRUCTION" && period === game.currentPeriod;
        const past = game.phase === "CONSTRUCTION" && period < game.currentPeriod;
        const firstId = periodPriorityId(game, period);
        const overridden = game.priorityOverrides[period] !== undefined;
        const first = game.players[firstId];
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
              className={`flex h-2.5 w-full items-center justify-center rounded-b text-[8px] font-black text-white ${
                overridden ? "ring-1 ring-amber-500" : ""
              }`}
              style={{ background: first?.color ?? "transparent" }}
              title={`${first?.name ?? "?"} builds first in period ${period}${
                overridden ? " (Priority Permit)" : period % 2 === 1 ? " (odd periods)" : " (even periods)"
              }`}
            >
              {overridden ? "P" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One contract's bar across the timeline, in that contract's own color. */
function GanttRow({
  line,
  player,
  game,
}: {
  line: PlayerLine;
  player: SubwayPlayer;
  game: SubwayState;
}) {
  const active = new Set(blockPeriods(line));
  const contract = contractOf(line);
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
                ? { background: contract?.color ?? player.color, opacity: past ? 0.4 : 1 }
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
  const oddPriority = player.id === game.oddPriorityId;
  const mob = mobilizationCost(player);
  const crew = crewCost(player);

  return (
    <div className="rounded-lg bg-white/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: player.color }} />
        <span className="truncate text-xs font-bold">{player.name}</span>
        <span
          className={`rounded px-1 text-[10px] font-black ${
            oddPriority ? "bg-amber-400 text-stone-900" : "bg-sky-200 text-stone-700"
          }`}
          title={oddPriority ? "Builds first in odd periods" : "Builds first in even periods"}
        >
          {oddPriority ? "ODD" : "EVEN"}
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
                  <LineChip contract={contract} subdued={shelved} />
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
                  <GanttRow line={line} player={player} game={game} />
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
          <PeriodRuler game={game} />
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
        Bars carry each contract&apos;s own line color. The band under a period number shows which
        company builds first there — odd and even periods alternate, and a Priority Permit marks
        its period with a <b>P</b>. Amber outline = second crew.
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

  const engineering = marketEngineering(game.market);
  const faceUp: { id: CardDeckId; name: string; description: string; tag: string }[] = [
    {
      id: "engineering",
      name: engineering.name,
      description: engineering.description,
      tag: engineering.destination ? "destination" : "engineering",
    },
    { id: "scheduling", name: marketScheduling(game.market).name, description: marketScheduling(game.market).description, tag: "scheduling" },
    { id: "construction", name: marketConstruction(game.market).name, description: marketConstruction(game.market).description, tag: "construction" },
  ];

  return (
    <Panel title={`${contract.name} on offer${offer.fromYard ? " — Discount Yard" : ""}`}>
      <p className="mt-1 text-sm text-stone-600">
        {contractsOutstanding(game)} contract{contractsOutstanding(game) === 1 ? "" : "s"} still need an owner.
        You hold {me.lines.length} of a maximum {SUBWAY_CONFIG.maxContractsPerPlayer} and {money(me.money)}.
      </p>

      <div className="mt-3">
        <ContractCard contract={contract} price={offer.price} />
      </div>

      {game.procurement.yard.length > 0 && (
        <div className="mt-3">
          <b className="text-xs uppercase text-stone-500">Discount Yard</b>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
            {game.procurement.yard.map((entry, i) => {
              const c = contractById(entry.contractId)!;
              return (
                <li key={i} className="flex justify-between">
                  <span className="flex items-center gap-1.5">
                    <LineChip contract={c} />
                    {c.name}
                  </span>
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
                    tag={card.tag}
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

/**
 * The Destination draft. Three cards face up, companies alternate free picks
 * starting with the odd-period company, and each ends with exactly two. This
 * is why every game now contains Destinations at all (DEC-019).
 */
function DestinationDraftPanel({
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
  const turn = destinationTurnId(game);
  const mine = turn === me.id;
  const owed = SUBWAY_CONFIG.destinationsPerPlayer - destinationsHeld(me);
  const opponent = opponentOf(game, me);

  return (
    <Panel title="Destination draft">
      <p className="mt-1 text-sm text-stone-600">
        Take turns picking from the three face-up cards until each company holds{" "}
        {SUBWAY_CONFIG.destinationsPerPlayer}. Picks are free. You assign each one to a line you own
        in the next step, and it pays +{SUBWAY_CONFIG.destinationVp} VP if that line reaches the
        station — finished or not.
      </p>
      <p className="mt-2 text-sm font-semibold">
        {mine
          ? `Your pick — ${owed} to go.`
          : turn
            ? `${game.players[turn]?.name ?? "The opposition"} is picking.`
            : "Both companies are done drafting."}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {game.destinationRow.map((id) => (
          <DestinationCardFace
            key={id}
            card={id}
            color={me.color}
            compact
            onClick={mine && !busy ? () => act("PICK_DESTINATION", { destinationCardId: id }) : undefined}
            disabled={!mine || busy}
          />
        ))}
        {!game.destinationRow.length && (
          <p className="col-span-full text-[11px] italic text-stone-400">The row is empty.</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <b className="uppercase text-stone-500">Yours ({destinationsHeld(me)})</b>
          <ul className="mt-1 space-y-0.5 text-stone-600">
            {me.destinationHand.map((id, i) => (
              <li key={i}>{destinationById(id)?.name ?? id}</li>
            ))}
            {!me.destinationHand.length && <li className="italic text-stone-400">None yet.</li>}
          </ul>
        </div>
        <div>
          <b className="uppercase text-stone-500">
            {opponent?.name ?? "Opposition"} ({opponent ? destinationsHeld(opponent) : 0})
          </b>
          <p className="mt-1 italic text-stone-400">
            Picked from the same public row — the count is open, the cards are theirs to reveal.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The Engineering plan: three objectives, any Destination assignments, and a
 * Survey Pin purchase. It all locks in one action, and the money leaves once.
 */
function EngineeringPlanPanel({
  me,
  chosen,
  setChosen,
  assignments,
  setAssignments,
  surveys,
  setSurveys,
  busy,
  act,
}: {
  me: SubwayPlayer;
  chosen: string[];
  setChosen: (v: string[]) => void;
  assignments: Record<string, number>;
  setAssignments: (v: Record<string, number>) => void;
  surveys: number;
  setSurveys: (n: number) => void;
  busy: boolean;
  act: (type: string, payload?: Record<string, unknown>) => void;
}) {
  if (me.engineeringLocked) {
    return (
      <Panel title="Engineering plan locked">
        <p className="mt-1 text-sm text-stone-600">
          Three objectives and {me.destinationCommitments.length} Destination
          {me.destinationCommitments.length === 1 ? "" : "s"} are committed face down, and{" "}
          {me.surveysPurchased} Survey Pin{me.surveysPurchased === 1 ? "" : "s"} are paid for. The
          opposition cannot see any of it until scoring; your own copies stay visible on your mat
          with live status.
        </p>
      </Panel>
    );
  }

  const toggle = (id: string) =>
    setChosen(
      chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < 3 ? [...chosen, id] : chosen
    );

  const list = Object.entries(assignments)
    .filter(([, lineIndex]) => lineIndex >= 0)
    .map(([cardId, lineIndex]) => ({ cardId, lineIndex }));
  const problems = destinationProblems(me, list);
  const allAssigned = list.length === me.destinationHand.length;
  const surveyCost = surveys * SUBWAY_CONFIG.survey.cost;
  const affordable = surveyCost <= me.money;
  const ready = chosen.length === 3 && allAssigned && !problems.length && affordable;

  return (
    <Panel title={`Engineering plan — ${chosen.length}/3 objectives`}>
      <p className="mt-1 text-sm text-stone-600">
        Commit exactly three objectives. Destinations are separate: assign as many as you like, at
        most two per line. Uncommitted cards stay in hand and score nothing.
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

      <div className="mt-4">
        <b className="text-xs uppercase text-stone-500">Destination cards ({me.destinationHand.length})</b>
        {me.destinationHand.length === 0 ? (
          <p className="mt-1 text-[11px] italic text-stone-500">
            None in hand.
          </p>
        ) : (
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.destinationHand.map((id, i) => {
              const assigned = assignments[id] ?? -1;
              return (
                <DestinationCardFace
                  key={`${id}-${i}`}
                  card={id}
                  color={me.color}
                  compact
                  state={assigned >= 0 ? "selected" : "idle"}
                  footer={
                    <select
                      value={assigned}
                      onChange={(e) => setAssignments({ ...assignments, [id]: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded border border-stone-400 bg-white px-1 py-1 text-[11px]"
                    >
                      <option value={-1}>Not assigned</option>
                      {me.lines.map((line, li) => (
                        <option key={li} value={li}>
                          {lineLabel(line)}
                        </option>
                      ))}
                    </select>
                  }
                />
              );
            })}
          </div>
        )}
        {(problems.length > 0 || !allAssigned) && (
          <ul className="mt-1.5 space-y-0.5 text-xs font-semibold text-red-800">
            {!allAssigned && <li>• Every Destination you drafted must be assigned to a line.</li>}
            {problems.map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-stone-300 bg-white/70 p-3">
        <b className="text-xs uppercase text-stone-500">Survey Pins</b>
        <p className="mt-1 text-[11px] text-stone-600">
          {money(SUBWAY_CONFIG.survey.cost)} each, up to {SUBWAY_CONFIG.survey.max}. Each pin scores
          +{SUBWAY_CONFIG.survey.vp} VP if any line you own later builds through its hole. Pins are
          public and reserve nothing.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            disabled={busy || surveys === 0}
            onClick={() => setSurveys(Math.max(0, surveys - 1))}
            className="rounded border border-stone-400 px-3 py-1 font-bold disabled:opacity-30"
            aria-label="Buy one fewer Survey Pin"
          >
            −
          </button>
          <b className="w-6 text-center text-lg tabular-nums">{surveys}</b>
          <button
            disabled={busy || surveys >= SUBWAY_CONFIG.survey.max}
            onClick={() => setSurveys(Math.min(SUBWAY_CONFIG.survey.max, surveys + 1))}
            className="rounded border border-stone-400 px-3 py-1 font-bold disabled:opacity-30"
            aria-label="Buy one more Survey Pin"
          >
            +
          </button>
          <span className="text-xs text-stone-600">
            cost <b className={affordable ? "" : "text-red-700"}>{money(surveyCost)}</b> · cash after{" "}
            <b className={affordable ? "" : "text-red-700"}>{money(me.money - surveyCost)}</b>
          </span>
        </div>
        {!affordable && (
          <p className="mt-1 text-xs font-semibold text-red-800">
            You hold {money(me.money)} — buy fewer pins.
          </p>
        )}
      </div>

      <button
        disabled={busy || !ready}
        onClick={() => act("LOCK_ENGINEERING_PLAN", { cardIds: chosen, destinations: list, surveys })}
        className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-40"
      >
        Lock the plan{surveyCost > 0 ? ` & pay ${money(surveyCost)}` : ""}
      </button>
    </Panel>
  );
}

/** Placing the pins already bought. Public, alternating, non-reserving. */
function SurveyPanel({ game, me }: { game: SubwayState; me: SubwayPlayer }) {
  const turn = surveyTurnId(game);
  const mine = turn === me.id;
  const left = surveysPending(game, me.id);

  return (
    <Panel title="Survey Pins">
      <p className="mt-1 text-sm text-stone-600">
        Companies alternate, starting with the odd-period company. A pin marks intent only: it
        never reserves the hole, and either company may still build there. Pins are company-wide —
        <b> any</b> line you own fulfils one by placing a normal node on its exact hole.
      </p>
      <p className="mt-2 text-sm">
        You have <b>{left}</b> pin{left === 1 ? "" : "s"} left to place.{" "}
        {mine ? "Tap a glowing normal hole to pin it." : `Waiting for ${game.players[turn ?? ""]?.name ?? "the opposition"}…`}
      </p>

      <ul className="mt-3 space-y-1 text-xs">
        {game.surveyPins.map((pin, i) => {
          const owner = game.players[pin.playerId];
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner?.color }} />
              <span className="font-semibold">{owner?.name}</span>
              <span className="text-stone-500">
                pinned {pin.x + 1},{pin.y + 1}
              </span>
            </li>
          );
        })}
        {!game.surveyPins.length && <li className="italic text-stone-400">No pins on the board yet.</li>}
      </ul>
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
  const waived = me.lines.reduce((sum, l) => sum + (l.mobilizationWaived ?? 0), 0);
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
      {waived > 0 && (
        <p className="mt-1 text-xs text-emerald-800">
          Early Mobilization waived <b>{money(waived)}</b> of mobilization surcharge — the increase
          the earlier start caused, and nothing else. Base mobilization{" "}
          <b>{money(mobilizationCost(me) + waived)}</b> → <b>{money(mobilizationCost(me))}</b>. Any
          second-crew change from the move stays payable, and is included in the{" "}
          <b>{money(crewCost(me))}</b> above.
        </p>
      )}

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
                    Period {q} — {game.players[basePriorityId(game, q)]?.name} builds first now
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
  const pending = pendingStarters(me);
  const turn = starterTurnId(game);
  return (
    <Panel title="Starter pegs">
      <p className="mt-1 text-sm text-stone-600">
        Every <strong>scheduled</strong> contract gets one free starter peg — it counts as node 1 and
        costs no scheduled action. Starters enter from the edge of the map: only normal holes on the
        board&apos;s <strong>outer border</strong> are legal, and stations never are. Shelved
        contracts get none, since they are never built. The odd-period company places first, then
        companies alternate. Tap a border hole to select it, reposition freely, then Confirm.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {me.lines.map((line, i) => {
          const contract = contractOf(line);
          if (!contract) return null;
          return (
            <li key={i} className="flex items-center gap-2">
              <LineChip contract={contract} subdued={line.start === undefined} />
              <span className={`font-semibold ${line.start === undefined ? "text-stone-400" : ""}`}>
                {contract.name}
              </span>
              <span className="text-stone-500">
                {line.start === undefined
                  ? "shelved — no peg"
                  : line.route.length
                    ? "placed"
                    : turn === me.id && pending[0] === i
                      ? "← place now"
                      : "waiting"}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The banner above the board while you are actually placing. Everything the
 * rule needs to be obvious lives here: which line, its color and code, how far
 * along the recipe it is, and exactly what the next segment must be.
 */
function ActiveLineBanner({
  line,
  starter,
  targetCount,
}: {
  line: PlayerLine;
  starter: boolean;
  targetCount: number;
}) {
  const contract = contractOf(line);
  if (!contract) return null;
  const built = segmentsBuilt(line);
  const next = nextSegmentLength(line);
  const endpoint = line.route[line.route.length - 1];

  return (
    <div
      className="rounded-2xl border-l-8 bg-white/85 px-4 py-3 text-stone-900 shadow"
      style={{ borderColor: contract.color }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <LineChip contract={contract} />
        <b className="text-base">{contract.name}</b>
        <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[11px] font-black uppercase text-amber-50">
          {starter ? "Starter peg" : `Segment ${built + 1} of ${contract.recipe.length}`}
        </span>
        <span className="ml-auto text-sm font-black tabular-nums">
          {line.route.length}/{contractNodes(contract)} nodes
        </span>
      </div>

      <div className="mt-2">
        <RecipeStrip contract={contract} built={built} />
      </div>

      <p className="mt-2 text-sm font-semibold">
        {starter ? (
          <>Select a starter hole on the outer border — stations are not allowed. Confirm commits it.</>
        ) : next === undefined ? (
          <>This line is finished.</>
        ) : (
          <>
            Next segment must span <b style={{ color: contract.color }}>{next} pegs</b> (±
            {SUBWAY_CONFIG.geometry.lengthTolerance}) and turn no more than{" "}
            {SUBWAY_CONFIG.geometry.maxTurnDegrees}°.
          </>
        )}
      </p>
      <p className="mt-0.5 text-xs text-stone-600">
        {endpoint
          ? `Building from ${endpoint.stationId ? `${stationById(endpoint.stationId)?.name} dock ${(endpoint.stationSlot ?? 0) + 1}` : `hole ${endpoint.x + 1},${endpoint.y + 1}`}. `
          : ""}
        {targetCount > 0
          ? `${targetCount} legal target${targetCount === 1 ? "" : "s"} glowing.`
          : "No legal target — you may give up this action below."}
      </p>
    </div>
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
          const contract = contractOf(me.lines[i]);
          if (!contract) return null;
          return (
            <li key={i} className="flex items-center gap-2">
              <LineChip contract={contract} />
              <button
                onClick={() => setSelectedLine(i)}
                className={`rounded px-1.5 font-semibold ${selectedLine === i ? "bg-amber-100 ring-1 ring-amber-400" : ""}`}
              >
                {contract.name}
              </button>
              <span className="text-xs text-stone-500">
                {count > 1 ? `${count} actions` : "1 action"} · next {nextSegmentLength(me.lines[i]) ?? "—"} pegs
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

// ============================================================================
// Main view
// ============================================================================

/** What the next tap on the board does. */
type BoardMode = "none" | "place" | "survey" | "planner";

type MobileTab = "mat" | "schedule" | "log";

const PLAN_PHASES = new Set(["ENGINEERING", "SCHEDULING", "STARTER_PLACEMENT", "CONSTRUCTION"]);

export function SubwayGameView({ state, room, playerId, isHost, dispatchAction }: GameViewProps<SubwayState>) {
  const raw = state as SubwayState | undefined;
  const stale = !!raw && raw.version !== SUBWAY_STATE_VERSION;
  const game = raw && !stale ? raw : undefined;
  const me = game?.players[playerId];
  const isHotseat = room.mode === "hotseat";

  const [chosen, setChosen] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [surveys, setSurveys] = useState(0);
  const [selectedLine, setSelectedLine] = useState(0);
  const [preview, setPreview] = useState<PlacementTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab | null>(null);

  // Saved Plan Mode (DEC-022): all client-local, keyed per room/player/line.
  const [planMode, setPlanMode] = useState(false);
  const [plannerLine, setPlannerLine] = useState<number | null>(null);
  const [sketch, setSketch] = useState<RouteNode[]>([]);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>({});
  const [planStorageOk, setPlanStorageOk] = useState(true);

  // Hotseat handoff veil: in hotseat mode a changed controlling player keeps
  // every private surface unrendered until the newcomer confirms who they are.
  // The gate is derived during render, so nothing private can flash in between.
  const [seatedId, setSeatedId] = useState(playerId);
  const veiled = isHotseat && !!game && game.phase !== "SETUP" && playerId !== seatedId;
  useEffect(() => {
    if (!isHotseat) setSeatedId(playerId);
  }, [isHotseat, playerId]);

  const narration = useNarration(game, room.roomCode, playerId);

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

  // ---- Saved plans: load for this room/player/contract set -----------------
  const contractIds = me ? me.lines.map((l) => l.contractId).join(",") : "";
  useEffect(() => {
    if (!contractIds) {
      setPlans({});
      return;
    }
    const next: Record<string, SavedPlan> = {};
    for (const id of contractIds.split(",")) {
      const plan = loadPlan(room.roomCode, playerId, id);
      if (plan) next[id] = plan;
    }
    setPlans(next);
    // A different player (hotseat) or portfolio starts from a closed planner.
    setPlanMode(false);
    setPlannerLine(null);
    setSketch([]);
  }, [room.roomCode, playerId, contractIds]);

  const planAvailable =
    !!game && !!me && me.lines.length > 0 && PLAN_PHASES.has(game.phase) && !veiled;
  useEffect(() => {
    if (!planAvailable && planMode) {
      setPlanMode(false);
      setPlannerLine(null);
      setSketch([]);
    }
  }, [planAvailable, planMode]);

  // Where each saved plan stands against reality, refreshed with every poll.
  const planStatuses = useMemo(() => {
    const out: Record<string, PlanStatus & { nodes: RouteNode[] }> = {};
    if (!game || !me || veiled) return out;
    me.lines.forEach((line, i) => {
      const saved = plans[line.contractId];
      if (!saved) return;
      out[line.contractId] = { ...reconcilePlan(game, playerId, i, saved.nodes), nodes: saved.nodes };
    });
    return out;
  }, [game, me, plans, playerId, veiled]);

  const planChips = useMemo(() => {
    const out: Record<string, PlanChip> = {};
    for (const [contractId, status] of Object.entries(planStatuses)) {
      out[contractId] = { saved: true, stale: status.stale };
    }
    return out;
  }, [planStatuses]);

  const openPlanner = (lineIndex: number) => {
    if (!game || !me) return;
    const line = me.lines[lineIndex];
    if (!line) return;
    const saved = plans[line.contractId];
    // A viable saved plan reopens for editing; a stale or missing one starts
    // from the line's real route (its endpoint, or a fresh border starter).
    let start = [...line.route];
    if (saved) {
      const status = reconcilePlan(game, playerId, lineIndex, saved.nodes);
      if (!status.stale) start = [...saved.nodes];
    }
    setPlannerLine(lineIndex);
    setSketch(start);
    setPlanMode(true);
    setNotice(null);
  };

  const exitPlanner = () => {
    setPlanMode(false);
    setPlannerLine(null);
    setSketch([]);
  };

  const savePlanNow = () => {
    if (!me || plannerLine === null) return;
    const line = me.lines[plannerLine];
    if (!line || !sketch.length) return;
    const persisted = savePlan(room.roomCode, playerId, line.contractId, sketch);
    setPlans({ ...plans, [line.contractId]: { nodes: sketch.map((n) => ({ ...n })), savedAt: Date.now() } });
    setPlanStorageOk(persisted);
  };

  const clearPlanNow = () => {
    if (!me || plannerLine === null) return;
    const line = me.lines[plannerLine];
    if (!line) return;
    clearPlan(room.roomCode, playerId, line.contractId);
    const next = { ...plans };
    delete next[line.contractId];
    setPlans(next);
    setSketch([...line.route]);
  };

  // ---- What the board is for right now --------------------------------------
  const myStarterTurn = !!game && game.phase === "STARTER_PLACEMENT" && starterTurnId(game) === playerId;
  const starterLine = game && me ? pendingStarters(me)[0] ?? -1 : -1;
  const placingStarter = myStarterTurn && starterLine >= 0;
  const myBuild =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.resolveQueue[0] === me.id && me.pendingActions.length > 0;
  const mySurvey =
    !!game && !!me && game.phase === "ENGINEERING" && game.engineeringStep === "SURVEY" && surveyTurnId(game) === me.id;

  const activeLineIndex = placingStarter
    ? starterLine
    : myBuild && me
      ? me.pendingActions.includes(selectedLine)
        ? selectedLine
        : me.pendingActions[0]
      : -1;

  const plannerActive =
    planMode && plannerLine !== null && !!game && !!me && planAvailable && !!me.lines[plannerLine];

  // Plan Mode pauses live placement without surrendering it (R 5.2): leaving
  // it restores the same legal choices, and any provisional selection that is
  // still legal survives in `preview`.
  const mode: BoardMode = plannerActive
    ? "planner"
    : placingStarter || myBuild
      ? "place"
      : mySurvey
        ? "survey"
        : "none";
  const canAct = mode !== "none" && !busy && !veiled && (mode !== "place" || activeLineIndex >= 0);

  // The planner works against a copy of the board with the sketch dropped into
  // the chosen line, so legality comes from the reducer's own helpers.
  const plannerState = useMemo(() => {
    if (!game || !me || !plannerActive || plannerLine === null) return undefined;
    const clone = cloneState(game);
    const line = clone.players[me.id]?.lines[plannerLine];
    if (!line) return undefined;
    line.route = sketch;
    return clone;
  }, [game, me, plannerActive, plannerLine, sketch]);

  const targets = useMemo<PlacementTarget[]>(() => {
    if (!game || !me) return [];
    if (mode === "place" && activeLineIndex >= 0) {
      return legalTargets(game, me.id, activeLineIndex, placingStarter);
    }
    if (mode === "survey") {
      const out: PlacementTarget[] = [];
      for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
        for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
          if (!surveyBlocker(game, me.id, { x, y })) out.push({ x, y });
        }
      }
      return out;
    }
    if (mode === "planner" && plannerState && plannerLine !== null) {
      return legalTargets(plannerState, me.id, plannerLine, sketch.length === 0);
    }
    return [];
  }, [game, me, mode, activeLineIndex, placingStarter, plannerState, plannerLine, sketch]);

  // The board as it would be if the selected target were confirmed. Yellow is
  // derived from this by the reducer's own rules, so a following target is
  // legal by exactly the rules the next placement will use (OD-5).
  const previewState = useMemo(() => {
    if (!game || !me || !preview || activeLineIndex < 0 || mode !== "place") return undefined;
    const clone = cloneState(game);
    const line = clone.players[me.id]?.lines[activeLineIndex];
    if (!line) return undefined;
    const station = stationAt(preview);
    line.route.push({
      x: preview.x,
      y: preview.y,
      ...(station ? { stationId: station.id, stationSlot: preview.slot ?? 0 } : {}),
    });
    return clone;
  }, [game, me, preview, activeLineIndex, mode]);

  const following = useMemo<PlacementTarget[]>(() => {
    if (!previewState || !me || activeLineIndex < 0) return [];
    return legalTargets(previewState, me.id, activeLineIndex, false);
  }, [previewState, me, activeLineIndex]);

  // What the selected step would cost in contacts with the opposing network.
  const previewContacts = useMemo<RouteContact[]>(() => {
    if (!game || !me || !preview || activeLineIndex < 0 || placingStarter) return [];
    const route = me.lines[activeLineIndex]?.route ?? [];
    const from = route[route.length - 1];
    if (!from) return [];
    return routeContacts(game, me.id, from, { x: preview.x, y: preview.y });
  }, [game, me, preview, activeLineIndex, placingStarter]);

  // A routine poll must never cancel a selection in progress: the room refetches
  // every second, so only a change that actually affects this selection clears
  // it. A target that went stale (taken dock, changed geometry) drops out here,
  // which is exactly the "refresh and reselect" the spec asks for (R 5.3).
  const previewKey = preview ? targetKey(preview) : "";
  const targetKeys = targets.map(targetKey).join("|");
  useEffect(() => {
    if (!preview) return;
    if (mode === "planner") return; // paused, not surrendered
    if (mode !== "place" || !targets.some((t) => targetKey(t) === previewKey)) setPreview(null);
  }, [mode, activeLineIndex, previewKey, targetKeys, preview, targets]);

  const privateVisible = !!me && !veiled;

  const drawn = useMemo<DrawnLine[]>(() => {
    if (!game) return [];
    const out: DrawnLine[] = [];
    for (const id of game.playerOrder) {
      const p = game.players[id];
      if (!p) continue;
      p.lines.forEach((line, li) => {
        const contract = contractOf(line);
        if (!contract || !line.route.length) return;
        out.push({
          key: `${id}-${li}`,
          route: line.route,
          contract,
          ownerColor: p.color,
          active: id === playerId && li === activeLineIndex,
          growing: !lineComplete(line),
        });
      });
    }
    // Phantom plans and the live sketch draw only on their owner's UI, and
    // never while the hotseat veil is up.
    if (privateVisible && me) {
      me.lines.forEach((line, li) => {
        const contract = contractOf(line);
        if (!contract) return;
        const editing = plannerActive && plannerLine === li;
        if (editing) {
          if (line.route.length === 0) {
            if (sketch.length) {
              out.push({
                key: `sketch-${li}`,
                route: sketch,
                contract,
                ownerColor: me.color,
                active: true,
                growing: true,
                ghost: true,
                numberOffset: 0,
              });
            }
          } else if (sketch.length > line.route.length) {
            const anchor = line.route.length - 1;
            out.push({
              key: `sketch-${li}`,
              route: sketch.slice(anchor),
              contract,
              ownerColor: me.color,
              active: true,
              growing: true,
              ghost: true,
              anchored: true,
              numberOffset: anchor,
            });
          }
          return;
        }
        const status = planStatuses[line.contractId];
        if (!status) return;
        if (status.stale) {
          // A diverged plan stays visible as sketched — faint, never rewritten.
          out.push({
            key: `plan-${li}`,
            route: status.nodes,
            contract,
            ownerColor: me.color,
            active: false,
            growing: false,
            ghost: true,
            stale: true,
            numberOffset: 0,
          });
        } else if (status.phantom.length) {
          const anchored = line.route.length > 0;
          out.push({
            key: `plan-${li}`,
            route: anchored
              ? [line.route[line.route.length - 1], ...status.phantom]
              : status.phantom,
            contract,
            ownerColor: me.color,
            active: false,
            growing: false,
            ghost: true,
            anchored,
            numberOffset: anchored ? line.route.length - 1 : 0,
          });
        }
      });
    }
    return out;
  }, [game, playerId, activeLineIndex, privateVisible, me, plannerActive, plannerLine, sketch, planStatuses]);

  const onTapHole = (p: Point, slot?: number) => {
    if (!game || !me || !canAct) return;

    if (mode === "planner" && plannerState && plannerLine !== null) {
      const reason = validateNode(plannerState, me.id, plannerLine, p, sketch.length === 0, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      const station = stationAt(p);
      setNotice(null);
      setSketch([...sketch, { ...p, ...(station ? { stationId: station.id, stationSlot: slot ?? 0 } : {}) }]);
      return;
    }

    if (mode === "survey") {
      const reason = surveyBlocker(game, me.id, p);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      act("PLACE_SURVEY", { x: p.x, y: p.y });
      return;
    }

    if (mode === "place" && activeLineIndex >= 0) {
      const reason = validateNode(game, me.id, activeLineIndex, p, placingStarter, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      // Selection only — tapping never commits. Another legal tap simply moves
      // the provisional marker; the Confirm button is the one way to commit
      // (OD-3 / OD-4).
      setPreview({ x: p.x, y: p.y, ...(stationAt(p) ? { slot } : {}) });
    }
  };

  const confirmPlacement = () => {
    if (!game || !me || !preview || activeLineIndex < 0 || mode !== "place") return;
    // Revalidate the exact target against current state before dispatching; the
    // reducer revalidates again and a rejection costs nothing (R 5.3).
    const reason = validateNode(game, me.id, activeLineIndex, preview, placingStarter, preview.slot);
    if (reason) {
      setNotice(reason);
      setPreview(null);
      return;
    }
    const target = preview;
    setPreview(null);
    act(placingStarter ? "PLACE_STARTER" : "BUILD", {
      lineIndex: activeLineIndex,
      x: target.x,
      y: target.y,
      ...(target.slot !== undefined ? { slot: target.slot } : {}),
    });
  };

  // Mobile tab handoffs on phase transitions only — a routine poll or an
  // unrelated re-render never moves the player's chosen tab.
  const phaseKey = game ? `${game.phase}:${game.engineeringStep}:${game.schedulingStep}` : "";
  const prevPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!phaseKey) return;
    if (prevPhaseKey.current !== null && prevPhaseKey.current !== phaseKey) {
      const phase = phaseKey.split(":")[0];
      if (phase === "SCHEDULING") setTab("schedule");
      else if (phase === "ENGINEERING" || phase === "PROCUREMENT") setTab("mat");
      else setTab(null);
    }
    prevPhaseKey.current = phaseKey;
  }, [phaseKey]);

  // ---- Pre-game lobby -------------------------------------------------------
  if (!game || game.phase === "SETUP") {
    const enough = room.players.length >= 2;
    return (
      <section className="rounded-2xl bg-[#ede1c7] p-6 text-center text-stone-900 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Subway</h2>
        <p className="mx-auto my-4 max-w-xl text-sm text-stone-600">
          Six Line Contracts come up one at a time and all of them find an owner. Each carries an
          ordered recipe of segment lengths and its own line color. Commit secret objectives and
          Destinations, buy Survey Pins, plan the whole programme on a shared Gantt board, then
          engineer the routes hole by hole.
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
  // Kept on the results screen too: the final programme shows what was planned
  // against what actually got built.
  const showGantt = ["SCHEDULING", "STARTER_PLACEMENT", "CONSTRUCTION", "SCORING", "RESULTS"].includes(game.phase);
  // The board is up during Engineering and Scheduling too, so Survey Pins and
  // saved plans have somewhere to happen.
  const showBoard = game.phase !== "PROCUREMENT";
  const canUndo = game.undo?.playerId === playerId && !veiled;
  const activeLine = activeLineIndex >= 0 && me ? me.lines[activeLineIndex] : undefined;
  const opponent = me ? opponentOf(game, me) : undefined;
  const plannerLineObj = plannerActive && me && plannerLine !== null ? me.lines[plannerLine] : undefined;
  const plannerContract = plannerLineObj ? contractOf(plannerLineObj) : undefined;
  const sketchedSegments = Math.max(0, sketch.length - 1);
  const plannerSavedStatus =
    plannerLineObj && plannerActive ? planStatuses[plannerLineObj.contractId] : undefined;
  const minSketch = plannerLineObj ? plannerLineObj.route.length : 0;

  // The sticky action strip attached to the board: what is selected, what it
  // costs, and the only Confirm that commits anything. Rendered under the
  // board on desktop and as the fixed bottom strip on the phone.
  const actionStrip = (
    <div className="rounded-2xl border border-stone-300 bg-[#fffaf0]/95 p-2.5 text-stone-900 shadow-lg">
      {notice && (
        <p className="mb-1.5 rounded-lg bg-red-100 px-2 py-1 text-center text-xs font-bold text-red-900">
          {notice}
        </p>
      )}

      {mode === "planner" && plannerContract && plannerLineObj && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">
              Plan Mode
            </span>
            <LineChip contract={plannerContract} />
            <b>{plannerContract.name}</b>
            <select
              value={plannerLine ?? -1}
              onChange={(e) => openPlanner(Number(e.target.value))}
              className="rounded border border-stone-400 bg-white px-1.5 py-0.5 text-xs"
              aria-label="Plan a different line"
            >
              {me?.lines.map((l, i) => (
                <option key={i} value={i}>
                  {lineLabel(l)}
                </option>
              ))}
            </select>
            <span className="text-xs text-stone-500">
              {sketchedSegments}/{plannerContract.recipe.length} segments sketched
            </span>
            {plannerSavedStatus && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                  plannerSavedStatus.stale ? "bg-red-100 text-red-800" : "bg-purple-100 text-purple-800"
                }`}
              >
                {plannerSavedStatus.stale ? "Saved plan stale" : "Saved"}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600">
            Private, non-binding sketch — nothing is dispatched or reserved, and only you see it.{" "}
            {sketch.length === 0
              ? "Tap a border hole to start the phantom route."
              : sketchedSegments >= plannerContract.recipe.length
                ? "The whole recipe fits against the board as it stands."
                : `Next: a ${plannerContract.recipe[sketchedSegments]}-peg segment, turning ≤ ${SUBWAY_CONFIG.geometry.maxTurnDegrees}°.`}
            {!planStorageOk && (
              <b className="text-red-800"> Storage unavailable — this plan lasts only this session.</b>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              disabled={sketch.length <= minSketch}
              onClick={() => setSketch(sketch.slice(0, -1))}
              className="rounded-lg border border-stone-400 px-2.5 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-35"
            >
              Undo step
            </button>
            <button
              disabled={sketch.length <= minSketch}
              onClick={() => setSketch(plannerLineObj ? [...plannerLineObj.route] : [])}
              className="rounded-lg border border-stone-400 px-2.5 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-35"
            >
              Restart sketch
            </button>
            <button
              disabled={sketch.length <= Math.max(1, minSketch)}
              onClick={savePlanNow}
              className="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-35"
            >
              Save plan
            </button>
            {plannerSavedStatus && (
              <button
                onClick={clearPlanNow}
                className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-bold text-red-800"
              >
                Clear saved
              </button>
            )}
            <button
              onClick={exitPlanner}
              className="ml-auto rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white"
            >
              {mode === "planner" && (placingStarter || myBuild) ? "Back to placement" : "Close Plan Mode"}
            </button>
          </div>
        </div>
      )}

      {mode === "place" && activeLine && me && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {contractOf(activeLine) && <LineChip contract={contractOf(activeLine)!} />}
            <b>{lineLabel(activeLine)}</b>
            <span className="text-xs text-stone-500">
              {placingStarter
                ? "starter peg · border holes only"
                : `segment ${segmentsBuilt(activeLine) + 1}/${contractOf(activeLine)?.recipe.length} · ${nextSegmentLength(activeLine) ?? "—"} pegs`}
            </span>
            <span className="ml-auto text-xs font-bold">
              {preview
                ? preview.slot !== undefined
                  ? `Selected: ${stationAt(preview)?.name ?? "station"} dock ${preview.slot + 1}`
                  : `Selected: hole ${preview.x + 1},${preview.y + 1}`
                : targets.length
                  ? "Tap a glowing target to select"
                  : "No legal target"}
            </span>
          </div>
          {preview && !placingStarter && (
            <p className="text-xs text-stone-600">
              {previewContacts.length === 0 ? (
                <>
                  No contact with {opponent?.name ?? "the opposition"}&apos;s network — <b>free</b>.
                </>
              ) : (
                <>
                  <b>
                    {previewContacts.length} contact{previewContacts.length === 1 ? "" : "s"}
                  </b>{" "}
                  ({previewContacts.map((c) => c.kind).join(", ")}) ·{" "}
                  <b>{money(contactToll(previewContacts))}</b> to {opponent?.name ?? "them"} · cash after{" "}
                  <b className={me.money - contactToll(previewContacts) < 0 ? "text-red-700" : ""}>
                    {money(me.money - contactToll(previewContacts))}
                  </b>
                  {me.money - contactToll(previewContacts) < 0 && (
                    <>
                      {" "}
                      · projected debt penalty{" "}
                      <b className="text-red-700">
                        {(me.money - contactToll(previewContacts)) * SUBWAY_CONFIG.contact.debtVpPerMillion} VP
                      </b>
                    </>
                  )}
                </>
              )}
            </p>
          )}
          {preview && (
            <p className="text-[11px] text-stone-500">
              Dashed <b>2 / NEXT</b> markers preview where this line could go afterwards — a preview,
              not a reservation. Tap another glowing target to move the selection.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              disabled={busy || !preview}
              onClick={() => setPreview(null)}
              className="rounded-lg border border-stone-400 px-3 py-1.5 text-sm font-bold text-stone-700 disabled:opacity-35"
            >
              Cancel
            </button>
            <button
              disabled={busy || !preview}
              onClick={confirmPlacement}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-35"
              data-confirm-placement
            >
              Confirm placement
            </button>
            {planAvailable && (
              <button
                onClick={() => openPlanner(activeLineIndex >= 0 ? activeLineIndex : 0)}
                className="rounded-lg border border-purple-400 px-3 py-1.5 text-sm font-bold text-purple-800"
              >
                Plan
              </button>
            )}
            {canUndo && (
              <button
                disabled={busy}
                onClick={() => act("UNDO_PLACEMENT")}
                className="ml-auto rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
              >
                Undo {game.undo?.label}
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "survey" && me && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">
            Survey
          </span>
          <span className="text-xs text-stone-600">
            Tap a glowing hole to place a pin — {surveysPending(game, me.id)} left. Pins are public
            and reserve nothing.
          </span>
          {planAvailable && (
            <button
              onClick={() => openPlanner(0)}
              className="ml-auto rounded-lg border border-purple-400 px-3 py-1.5 text-sm font-bold text-purple-800"
            >
              Plan
            </button>
          )}
        </div>
      )}

      {mode === "none" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${status.tone === "act" ? "animate-pulse bg-emerald-600" : "bg-stone-400"}`}
          />
          <span className="text-xs font-bold text-stone-700">{status.headline}</span>
          {planAvailable && (
            <button
              onClick={() => openPlanner(0)}
              className="ml-auto rounded-lg border border-purple-400 px-3 py-1.5 text-sm font-bold text-purple-800"
            >
              Plan
            </button>
          )}
          {canUndo && (
            <button
              disabled={busy}
              onClick={() => act("UNDO_PLACEMENT")}
              className={`${planAvailable ? "" : "ml-auto "}rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40`}
            >
              Undo {game.undo?.label}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Phase-valid actions, shown near the board on desktop and inside the My Mat
  // sheet on the phone.
  const phasePanel = me ? (
    <>
      {game.phase === "PROCUREMENT" && <ProcurementPanel game={game} me={me} busy={busy} act={act} />}
      {game.phase === "ENGINEERING" && game.engineeringStep === "DESTINATION_DRAFT" && (
        <DestinationDraftPanel game={game} me={me} busy={busy} act={act} />
      )}
      {game.phase === "ENGINEERING" && game.engineeringStep === "PLAN" && (
        <EngineeringPlanPanel
          me={me}
          chosen={chosen}
          setChosen={setChosen}
          assignments={assignments}
          setAssignments={setAssignments}
          surveys={surveys}
          setSurveys={setSurveys}
          busy={busy}
          act={act}
        />
      )}
      {game.phase === "ENGINEERING" && game.engineeringStep === "SURVEY" && <SurveyPanel game={game} me={me} />}
      {game.phase === "SCHEDULING" && <SchedulingPanel game={game} me={me} busy={busy} act={act} />}
      {game.phase === "STARTER_PLACEMENT" && <StarterPanel game={game} me={me} />}
      {game.phase === "CONSTRUCTION" && (
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
    </>
  ) : null;

  const playerMat = privateVisible ? (
    <PlayerMat
      game={game}
      me={me!}
      activeLineIndex={activeLineIndex}
      planChips={planChips}
      planAvailable={planAvailable}
      onOpenPlanner={openPlanner}
    />
  ) : null;

  return (
    <div className="space-y-4 rounded-3xl bg-[#ede1c7] p-3 text-stone-900 sm:p-5">
      {veiled && me && (
        <HandoffVeil name={me.name} color={me.color} onConfirm={() => setSeatedId(playerId)} />
      )}
      {/* Screen readers hear every accepted public event, animation or not. */}
      <div aria-live="polite" className="sr-only">
        {narration.liveText}
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
          <h2 className="font-serif text-2xl font-black sm:text-3xl">Subway</h2>
        </div>
        <span className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-amber-50 sm:text-sm">
          {PHASE_LABELS[game.phase] ?? game.phase}
          {game.phase === "ENGINEERING" && (game.engineeringStep === "PLAN" ? " · plan" : game.engineeringStep === "SURVEY" ? " · surveys" : " · draft")}
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
      </div>

      {/* Opponent public state sits across the table, above the board. */}
      {opponent && <OpponentMat game={game} opponent={opponent} scheduleRevealed={schedulingRevealed} />}

      {/* The pegboard is a 3:1 corridor, so it gets the full page width rather
          than sharing a column with the panels. */}
      {showBoard && (
        <div className="space-y-2">
          {mode === "place" && activeLine && (
            <div className="hidden lg:block">
              <ActiveLineBanner line={activeLine} starter={placingStarter} targetCount={targets.length} />
            </div>
          )}
          <Board
            game={game}
            targets={canAct ? targets : []}
            following={mode === "place" ? following : []}
            selected={mode === "place" ? preview ?? undefined : undefined}
            canAct={canAct}
            drawn={drawn}
            onTapHole={onTapHole}
            overlay={<NarrationOverlay event={narration.overlay} onDismiss={narration.dismiss} />}
          />
          <div className="sticky bottom-2 z-20 hidden lg:block">{actionStrip}</div>
        </div>
      )}

      {/* Desktop dashboard: actions and programme beside the public record. */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-3">
          {!veiled && phasePanel}
          {showGantt && (
            <GanttBoard
              game={game}
              viewerId={playerId}
              revealed={schedulingRevealed}
              editable={game.phase === "SCHEDULING" && game.schedulingStep === "PLANNING" && !me?.scheduleSubmitted && !veiled}
              busy={busy}
              act={act}
            />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <EventRail game={game} />
        </div>
      </div>

      {/* The viewer's private mat runs along their edge of the table. */}
      {playerMat && <div className="hidden lg:block">{playerMat}</div>}

      {game.phase === "RESULTS" && <ResultsScreen game={game} />}

      {/* Phone: no board during Procurement, so the action panel takes over. */}
      {!showBoard && !veiled && <div className="lg:hidden">{phasePanel}</div>}

      {/* Phone: sticky action strip plus bottom-sheet tabs instead of the old
          long panel stack. Board panning stays above; nothing here scrolls the
          page sideways. */}
      <div className="sticky bottom-0 z-30 -mx-3 border-t border-stone-300 bg-[#ede1c7]/95 px-3 pb-1.5 pt-1.5 backdrop-blur sm:-mx-5 sm:px-5 lg:hidden">
        {tab && (
          <div className="mb-1.5 max-h-[48vh] space-y-3 overflow-y-auto rounded-2xl border border-stone-300 bg-[#ede1c7] p-2 shadow-inner">
            {tab === "mat" && (
              <>
                {!veiled && showBoard && phasePanel}
                {playerMat}
                {!privateVisible && <p className="p-3 text-sm text-stone-500">Private mat is covered.</p>}
              </>
            )}
            {tab === "schedule" &&
              (showGantt ? (
                <GanttBoard
                  game={game}
                  viewerId={playerId}
                  revealed={schedulingRevealed}
                  editable={game.phase === "SCHEDULING" && game.schedulingStep === "PLANNING" && !me?.scheduleSubmitted && !veiled}
                  busy={busy}
                  act={act}
                />
              ) : (
                <p className="p-3 text-sm text-stone-500">The programme appears once Scheduling opens.</p>
              ))}
            {tab === "log" && <EventRail game={game} />}
          </div>
        )}
        {showBoard && actionStrip}
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {(["mat", "schedule", "log"] as MobileTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(tab === t ? null : t)}
              className={`rounded-lg py-1.5 text-xs font-black uppercase tracking-wide ${
                tab === t ? "bg-stone-900 text-amber-50" : "bg-white/70 text-stone-600"
              }`}
              aria-pressed={tab === t}
            >
              {t === "mat" ? "My Mat" : t === "schedule" ? "Schedule" : "Log"}
            </button>
          ))}
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

/** Results, with every company's revealed commitments laid out. */
function ResultsScreen({ game }: { game: SubwayState }) {
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
                {p.destinationCommitments.map((commitment, i) => {
                  const met = destinationMet(p, commitment);
                  const assigned = p.lines[commitment.lineIndex];
                  return (
                    <DestinationCardFace
                      key={`${commitment.cardId}-${i}`}
                      card={commitment.cardId}
                      color={p.color}
                      compact
                      state={met ? "met" : "missed"}
                      footer={
                        <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                          {assigned ? lineLabel(assigned) : "unassigned"} ·{" "}
                          {met ? `Scored +${SUBWAY_CONFIG.destinationVp}` : "Not connected"}
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
