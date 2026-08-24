"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import {
  DESTINATION_CARDS,
  STATIONS,
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  actionsRemaining,
  basePriorityId,
  blockFits,
  blockPeriods,
  buyBlocker,
  committedStatus,
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
  destinationProblems,
  engineeringById,
  legalTargets,
  lineComplete,
  lineMobilization,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  mobilizationCost,
  mobilizationFor,
  mustBuyOffer,
  nextSegmentLength,
  nodePoint,
  pendingStarters,
  periodPriorityId,
  scheduleCost,
  scheduleProblems,
  scheduledLines,
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
const lineColor = (line: PlayerLine): string => contractOf(line)?.color ?? "#78716c";
const lineCode = (line: PlayerLine): string => contractOf(line)?.code ?? "?";

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
        detail: "Pick the line it serves, then tap a normal hole. Pins are public and reserve nothing.",
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
        detail: pending.length > 1 ? `${pending.length} of your scheduled contracts still need one.` : undefined,
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
              : "Tap a highlighted hole or station dock to extend the active line.",
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

/** The line's badge: color plus its letter code, so color is never the only cue. */
function LineChip({ contract, subdued }: { contract: LineContract; subdued?: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-black text-white ${
        subdued ? "opacity-50" : ""
      }`}
      style={{ background: contract.color }}
      title={contract.name}
    >
      {contract.code}
    </span>
  );
}

/**
 * The ordered recipe as chips: what is built, what is being built now, and
 * what is still to come. This is the player's copy of the contract's shape.
 */
function RecipeStrip({
  contract,
  built,
  highlightCurrent = true,
}: {
  contract: LineContract;
  built: number;
  highlightCurrent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {contract.recipe.map((length, i) => {
        const done = i < built;
        const current = highlightCurrent && i === built;
        return (
          <span
            key={i}
            className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[11px] font-black tabular-nums ${
              done
                ? "text-white"
                : current
                  ? "ring-2 ring-offset-1"
                  : "bg-stone-200 text-stone-500"
            }`}
            style={
              done
                ? { background: contract.color }
                : current
                  ? { color: contract.color, background: "#fff" }
                  : undefined
            }
            title={
              done ? `Segment ${i + 1}: ${length} pegs — built` : `Segment ${i + 1}: ${length} pegs`
            }
          >
            {done ? "✓" : length}
          </span>
        );
      })}
    </div>
  );
}

function ContractCard({
  contract,
  /** Price actually being asked, when it differs from the list price. */
  price,
  progress,
  status,
  owner,
  children,
}: {
  contract: LineContract;
  price?: number;
  progress?: { built: number; total: number };
  status?: string;
  owner?: SubwayPlayer;
  children?: React.ReactNode;
}) {
  const discounted = price !== undefined && price < contract.cost;
  return (
    <div
      className="w-full rounded-xl border-2 bg-[#fffaf0] p-3 text-left text-stone-900 shadow-sm"
      style={{ borderColor: contract.color }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong className="flex items-center gap-1.5 text-sm">
          <LineChip contract={contract} />
          {contract.name}
        </strong>
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
      {owner && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-stone-500">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner.color }} />
          {owner.name}
        </p>
      )}
      <div className="mt-1.5">
        <RecipeStrip
          contract={contract}
          built={progress ? Math.max(0, progress.built - 1) : 0}
          highlightCurrent={!!progress && progress.built > 0}
        />
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-stone-400">
          ordered segment lengths (pegs)
        </p>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-stone-600">
        <span>{contractNodes(contract)} nodes</span>
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
            style={{ width: `${(progress.built / progress.total) * 100}%`, background: contract.color }}
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

/** A line drawn on the board — a real route, or the planner's ghost. */
type DrawnLine = {
  key: string;
  route: RouteNode[];
  contract: LineContract;
  ownerColor: string;
  active: boolean;
  growing: boolean;
  ghost?: boolean;
};

function Board({
  game,
  targets,
  canAct,
  drawn,
  onTapHole,
}: {
  game: SubwayState;
  targets: PlacementTarget[];
  canAct: boolean;
  drawn: DrawnLine[];
  onTapHole: (p: Point, slot?: number) => void;
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
    return rect && rect.width > 0 ? VB_W / rect.width : 1;
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
      const f = VB_W / rect.width;
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
        const f = VB_W / rect.width;
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
    // tapping anywhere on the tile docks the line — but the *dock* is whichever
    // one the tap actually landed nearest, never an automatic choice.
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
  const targetCells = new Set(targets.map((t) => `${t.x},${t.y}`));

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
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
        className={`w-full touch-none select-none ${canAct ? "cursor-crosshair" : "cursor-grab"}`}
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
            const line = owner?.lines[pin.lineIndex];
            const contract = line ? contractOf(line) : undefined;
            const p = holePos(pin);
            const cx = p.x - 21;
            const cy = p.y - 21;
            const done = !!owner && !!line && surveyFulfilled(owner, pin);
            return (
              <g key={`pin-${i}`}>
                <path
                  d={`M ${cx} ${cy - 11} L ${cx + 9} ${cy} L ${cx} ${cy + 11} L ${cx - 9} ${cy} Z`}
                  fill={done ? contract?.color ?? "#78716c" : "#fdf6e3"}
                  stroke={contract?.color ?? "#78716c"}
                  strokeWidth="3"
                />
                <text
                  x={cx}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill={done ? "#ffffff" : contract?.color ?? "#78716c"}
                >
                  {contract?.code ?? "?"}
                </text>
                <circle cx={cx} cy={cy} r="14.5" fill="none" stroke={owner?.color ?? "#000"} strokeWidth="2" opacity="0.85" />
              </g>
            );
          })}

          {/* Station tiles with one docking slot per unit of capacity */}
          {STATIONS.map((s) => {
            const p = holePos(s);
            const major = s.kind === "major";
            const w = major ? 76 : 64;
            const h = 56;
            const highlight = targetCells.has(`${s.x},${s.y}`);
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
                  const open = targetSet.has(`${s.x},${s.y},${slot}`);
                  return (
                    <g key={slot}>
                      {open && (
                        <circle cx={dx} cy={dy} r="13" fill="#4ade80" opacity="0.35" data-target={`${s.x},${s.y},${slot}`}>
                          <animate attributeName="opacity" values="0.65;0.2;0.65" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle
                        cx={dx}
                        cy={dy}
                        r="9"
                        fill={docked ? docked.contract.color : "#00000055"}
                        stroke={open ? "#4ade80" : docked ? "#ffffff" : "#f5d98a"}
                        strokeWidth={open ? 3 : 2}
                        strokeDasharray={docked || open ? "0" : "3 3"}
                      />
                      <text y={dy - 13} x={dx} textAnchor="middle" fontSize="8" fontWeight="800" fill="#f5d98a">
                        {slot + 1}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Legal placement targets on normal holes (docks glow on the tile).
              data-target is the board coordinate the glow stands for, so a
              playtest driver can tap exactly what the rules say is legal. */}
          {canAct &&
            targets
              .filter((t) => t.slot === undefined)
              .map((c) => {
                const p = holePos(c);
                return (
                  <g key={`t-${c.x}-${c.y}`}>
                    <circle cx={p.x} cy={p.y} r="13" fill="#4ade80" opacity="0.28" data-target={`${c.x},${c.y}`} />
                    <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="#4ade80" strokeWidth="2.5">
                      <animate attributeName="opacity" values="0.9;0.35;0.9" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}

          {/* Strings: pale casing pass, then the line's own color. Each contract
              carries a distinct dash pattern so color is never the only cue. */}
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
                  opacity={d.ghost ? 0.35 : 1}
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
                  opacity={d.ghost ? 0.7 : 1}
                />
              );
            })
          )}

          {/* Pegs: the line's color inside, the owning company's color around. */}
          {drawn.flatMap((d) =>
            d.route.map((n, i) => {
              const p = nodePx(n);
              const isEndpoint = i === d.route.length - 1;
              const r = n.stationId ? 7.5 : 11;
              return (
                <g key={`n-${d.key}-${i}`} opacity={d.ghost ? 0.75 : 1}>
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
                      {d.ghost ? i : d.contract.code}
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
          opposition cannot see any of it until scoring; your own copies stay visible below with
          live status.
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
  const surveyCost = surveys * SUBWAY_CONFIG.survey.cost;
  const affordable = surveyCost <= me.money;
  const ready = chosen.length === 3 && !problems.length && affordable;

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
            None in hand. They share the face-up Engineering market during Procurement.
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
        {problems.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs font-semibold text-red-800">
            {problems.map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-stone-300 bg-white/70 p-3">
        <b className="text-xs uppercase text-stone-500">Survey Pins</b>
        <p className="mt-1 text-[11px] text-stone-600">
          {money(SUBWAY_CONFIG.survey.cost)} each, up to {SUBWAY_CONFIG.survey.max}. Each pin is
          assigned to one line and scores +{SUBWAY_CONFIG.survey.vp} VP if that exact line later
          builds through its hole. Pins are public and reserve nothing.
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
function SurveyPanel({
  game,
  me,
  surveyLine,
  setSurveyLine,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  surveyLine: number;
  setSurveyLine: (n: number) => void;
}) {
  const turn = surveyTurnId(game);
  const mine = turn === me.id;
  const left = surveysPending(game, me.id);

  return (
    <Panel title="Survey Pins">
      <p className="mt-1 text-sm text-stone-600">
        Companies alternate, starting with the odd-period company. A pin marks intent only: it
        never reserves the hole, and either company may still build there.
      </p>
      <p className="mt-2 text-sm">
        You have <b>{left}</b> pin{left === 1 ? "" : "s"} left to place.{" "}
        {mine ? "Pick the line it serves, then tap a normal hole." : `Waiting for ${game.players[turn ?? ""]?.name ?? "the opposition"}…`}
      </p>
      {mine && left > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold uppercase text-stone-500">Line</span>
          <select
            value={surveyLine}
            onChange={(e) => setSurveyLine(Number(e.target.value))}
            className="rounded border border-stone-400 bg-white px-2 py-1"
          >
            {me.lines.map((line, i) => (
              <option key={i} value={i}>
                {lineLabel(line)}
              </option>
            ))}
          </select>
          {me.lines[surveyLine] && (
            <span
              className="rounded px-2 py-1 text-[11px] font-black text-white"
              style={{ background: lineColor(me.lines[surveyLine]) }}
            >
              {lineCode(me.lines[surveyLine])} · {lineLabel(me.lines[surveyLine])}
            </span>
          )}
        </div>
      )}
      <ul className="mt-3 space-y-1 text-xs">
        {game.surveyPins.map((pin, i) => {
          const owner = game.players[pin.playerId];
          const line = owner?.lines[pin.lineIndex];
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: owner?.color }} />
              <span className="font-semibold">{owner?.name}</span>
              <span className="text-stone-500">
                {line ? lineLabel(line) : "line"} at {pin.x + 1},{pin.y + 1}
              </span>
            </li>
          );
        })}
        {!game.surveyPins.length && <li className="italic text-stone-400">No pins on the board yet.</li>}
      </ul>
    </Panel>
  );
}

/**
 * The private Route Planner. Entirely client-local: it dispatches nothing,
 * reserves nothing, and is gone on reload. It reuses the reducer's own legality
 * helpers, so a ghost step is legal by exactly the rules construction will use —
 * against the board as it stands right now.
 */
function RoutePlannerPanel({
  me,
  plannerLine,
  setPlannerLine,
  ghost,
  setGhost,
}: {
  me: SubwayPlayer;
  plannerLine: number | null;
  setPlannerLine: (n: number | null) => void;
  ghost: RouteNode[];
  setGhost: (r: RouteNode[]) => void;
}) {
  const line = plannerLine === null ? undefined : me.lines[plannerLine];
  const contract = line ? contractOf(line) : undefined;
  const built = Math.max(0, ghost.length - 1);

  return (
    <Panel title="Route Planner — private sketch">
      <p className="mt-1 text-sm text-stone-600">
        Try a whole alignment before you commit to anything. This is a{" "}
        <b>non-binding preview</b>: nothing is dispatched, no hole is reserved, no money is spent,
        and the opposition can build wherever it likes. It disappears if you reload.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-bold uppercase text-stone-500">Line</span>
        <select
          value={plannerLine ?? -1}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPlannerLine(v < 0 ? null : v);
            setGhost([]);
          }}
          className="rounded border border-stone-400 bg-white px-2 py-1"
        >
          <option value={-1}>Planner off</option>
          {me.lines.map((l, i) => (
            <option key={i} value={i}>
              {lineLabel(l)}
            </option>
          ))}
        </select>
      </div>

      {contract && (
        <>
          <div className="mt-3 rounded-xl border-2 p-2" style={{ borderColor: contract.color }}>
            <div className="flex flex-wrap items-center gap-2">
              <LineChip contract={contract} />
              <b className="text-sm">{contract.name}</b>
              <span className="text-xs text-stone-500">
                {built}/{contract.recipe.length} segments sketched
              </span>
            </div>
            <div className="mt-1.5">
              <RecipeStrip contract={contract} built={built} />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-stone-700">
              {ghost.length === 0
                ? "Tap any glowing hole to try a starter peg."
                : built >= contract.recipe.length
                  ? "The whole recipe fits — this alignment works against the board as it stands."
                  : `Next: a ${contract.recipe[built]}-peg segment, turning no more than ${SUBWAY_CONFIG.geometry.maxTurnDegrees}°.`}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={!ghost.length}
              onClick={() => setGhost(ghost.slice(0, -1))}
              className="rounded-lg border border-stone-400 px-3 py-1.5 text-sm font-bold text-stone-700 disabled:opacity-35"
            >
              Undo step
            </button>
            <button
              disabled={!ghost.length}
              onClick={() => setGhost([])}
              className="rounded-lg border border-stone-400 px-3 py-1.5 text-sm font-bold text-stone-700 disabled:opacity-35"
            >
              Clear sketch
            </button>
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
        costs no scheduled action. Shelved contracts get none, since they are never built. The
        odd-period company places first, then companies alternate.
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
          <>Place the free starter peg on any normal hole — stations are not allowed.</>
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

// ============================================================================
// Private company panel
// ============================================================================

function PrivatePanel({
  game,
  me,
  activeLineIndex,
}: {
  game: SubwayState;
  me: SubwayPlayer;
  activeLineIndex: number;
}) {
  const planning = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN";
  const owed = actionsRemaining(me);
  const status = committedStatus(game, me.id);
  const myPins = game.surveyPins.filter((pin) => pin.playerId === me.id);

  return (
    <aside className="rounded-2xl bg-[#fffaf0] p-4 text-stone-900 shadow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black">Your company</h3>
        <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: me.color }}>
          {me.name} · {money(me.money)}
        </span>
      </div>

      <p className="mt-1 text-xs text-stone-600">
        You build first in <b>{me.id === game.oddPriorityId ? "odd" : "even"}</b> periods.
        {game.phase === "CONSTRUCTION" &&
          ` ${owed} action${owed === 1 ? "" : "s"} of work left across ${me.lines.length} contract${me.lines.length === 1 ? "" : "s"}.`}
      </p>

      <div className="mt-3 space-y-2">
        {me.lines.length === 0 ? (
          <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">No Line Contract yet.</p>
        ) : (
          me.lines.map((line, i) => {
            const contract = contractOf(line);
            if (!contract) return null;
            const active = i === activeLineIndex;
            return (
              <div key={i} className={active ? "rounded-xl ring-2 ring-offset-2 ring-amber-400" : ""}>
                <ContractCard
                  contract={contract}
                  progress={{ built: line.route.length, total: contractNodes(contract) }}
                >
                  <p className="mt-1 text-[11px] text-stone-500">
                    Paid {money(line.paid)}
                    {line.paid < contract.cost && " (Discount Yard)"}
                    {line.start !== undefined
                      ? ` · periods ${line.start}–${line.start + contractActions(contract) - 1}`
                      : " · shelved"}
                    {active && " · ACTIVE"}
                  </p>
                </ContractCard>
              </div>
            );
          })
        )}
      </div>

      {!planning && me.committedEngineering.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <b className="text-xs uppercase text-stone-500">Committed Engineering</b>
            <span className="text-[10px] font-bold uppercase text-stone-400">Hidden from the opposition</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {status.map(({ cardId, met }, i) => (
              <EngineeringCardFace
                key={`${cardId}-${i}`}
                card={cardId}
                color={me.color}
                state={met ? "met" : "committed"}
                compact
                footer={
                  <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                    {met ? "✓ COMPLETE" : "In progress"}
                  </p>
                }
              />
            ))}
          </div>
        </div>
      )}

      {!planning && me.destinationCommitments.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <b className="text-xs uppercase text-stone-500">Committed Destinations</b>
            <span className="text-[10px] font-bold uppercase text-stone-400">Hidden from the opposition</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.destinationCommitments.map((commitment, i) => {
              const met = destinationMet(me, commitment);
              const assigned = me.lines[commitment.lineIndex];
              return (
                <DestinationCardFace
                  key={`${commitment.cardId}-${i}`}
                  card={commitment.cardId}
                  color={me.color}
                  compact
                  state={met ? "met" : "committed"}
                  footer={
                    <p className={`mt-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                      {assigned ? lineLabel(assigned) : "unassigned"} · {met ? "✓ COMPLETE" : "In progress"}
                    </p>
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {myPins.length > 0 && (
        <div className="mt-4">
          <b className="text-xs uppercase text-stone-500">Survey Pins (public)</b>
          <ul className="mt-1 space-y-0.5 text-xs">
            {myPins.map((pin, i) => {
              const line = me.lines[pin.lineIndex];
              const done = surveyFulfilled(me, pin);
              return (
                <li key={i} className="flex items-center gap-2">
                  {line && contractOf(line) && <LineChip contract={contractOf(line)!} />}
                  <span className="text-stone-600">
                    {pin.x + 1},{pin.y + 1} · {line ? lineLabel(line) : "line"}
                  </span>
                  <span className={`ml-auto font-black ${done ? "text-emerald-700" : "text-stone-400"}`}>
                    {done ? `✓ +${SUBWAY_CONFIG.survey.vp}` : "pending"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!planning && me.engineeringHand.length > 0 && (
        <div className="mt-3">
          <b className="text-xs uppercase text-stone-500">Engineering in hand (not scoring)</b>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.engineeringHand.map((id, i) => (
              <EngineeringCardFace key={`${id}-${i}`} card={id} color={me.color} compact />
            ))}
          </div>
        </div>
      )}

      {!planning && me.destinationHand.length > 0 && (
        <div className="mt-3">
          <b className="text-xs uppercase text-stone-500">Destinations in hand (unassigned, not scoring)</b>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {me.destinationHand.map((id, i) => (
              <DestinationCardFace key={`${id}-${i}`} card={id} color={me.color} compact />
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

/** What the next tap on the board does. */
type BoardMode = "none" | "place" | "survey" | "planner";

export function SubwayGameView({ state, room, playerId, isHost, dispatchAction }: GameViewProps<SubwayState>) {
  const raw = state as SubwayState | undefined;
  const stale = !!raw && raw.version !== SUBWAY_STATE_VERSION;
  const game = raw && !stale ? raw : undefined;
  const me = game?.players[playerId];

  const [chosen, setChosen] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [surveys, setSurveys] = useState(0);
  const [surveyLine, setSurveyLine] = useState(0);
  const [selectedLine, setSelectedLine] = useState(0);
  const [plannerLine, setPlannerLine] = useState<number | null>(null);
  const [ghost, setGhost] = useState<RouteNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // The ghost route is a sketch of a moment; once real placement begins it is
  // no longer meaningful, so it is dropped rather than left to mislead.
  const phase = game?.phase;
  useEffect(() => {
    if (phase !== "ENGINEERING" && phase !== "SCHEDULING") {
      setPlannerLine(null);
      setGhost([]);
    }
  }, [phase]);

  const act = async (type: string, payload?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await dispatchAction(type, payload);
    } finally {
      setBusy(false);
    }
  };

  // ---- What the board is for right now --------------------------------------
  const myStarterTurn = !!game && game.phase === "STARTER_PLACEMENT" && starterTurnId(game) === playerId;
  const starterLine = game && me ? pendingStarters(me)[0] ?? -1 : -1;
  const placingStarter = myStarterTurn && starterLine >= 0;
  const myBuild =
    !!game && !!me && game.phase === "CONSTRUCTION" && game.resolveQueue[0] === me.id && me.pendingActions.length > 0;
  const mySurvey =
    !!game && !!me && game.phase === "ENGINEERING" && game.engineeringStep === "SURVEY" && surveyTurnId(game) === me.id;
  const plannerOpen =
    !!game && !!me && plannerLine !== null && (game.phase === "ENGINEERING" || game.phase === "SCHEDULING");

  const activeLineIndex = placingStarter
    ? starterLine
    : myBuild && me
      ? me.pendingActions.includes(selectedLine)
        ? selectedLine
        : me.pendingActions[0]
      : -1;

  const mode: BoardMode = placingStarter || myBuild ? "place" : mySurvey ? "survey" : plannerOpen ? "planner" : "none";
  const canAct = mode !== "none" && !busy && (mode !== "place" || activeLineIndex >= 0);

  // The planner works against a copy of the board with the ghost route dropped
  // into the chosen line, so legality comes from the reducer's own helpers.
  const plannerState = useMemo(() => {
    if (!game || !me || plannerLine === null) return undefined;
    const clone = cloneState(game);
    const line = clone.players[me.id]?.lines[plannerLine];
    if (!line) return undefined;
    line.route = ghost;
    return clone;
  }, [game, me, plannerLine, ghost]);

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
      return legalTargets(plannerState, me.id, plannerLine, ghost.length === 0);
    }
    return [];
  }, [game, me, mode, activeLineIndex, placingStarter, plannerState, plannerLine, ghost]);

  const drawn = useMemo(() => {
    if (!game) return [];
    const out: {
      key: string;
      route: RouteNode[];
      contract: LineContract;
      ownerColor: string;
      active: boolean;
      growing: boolean;
      ghost?: boolean;
    }[] = [];
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
    if (plannerOpen && me && plannerLine !== null && ghost.length) {
      const contract = contractOf(me.lines[plannerLine]);
      if (contract) {
        out.push({
          key: "ghost",
          route: ghost,
          contract,
          ownerColor: me.color,
          active: true,
          growing: true,
          ghost: true,
        });
      }
    }
    return out;
  }, [game, playerId, activeLineIndex, plannerOpen, me, plannerLine, ghost]);

  const onTapHole = (p: Point, slot?: number) => {
    if (!game || !me || !canAct) return;

    if (mode === "planner" && plannerState && plannerLine !== null) {
      const reason = validateNode(plannerState, me.id, plannerLine, p, ghost.length === 0, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      const station = stationAt(p);
      setNotice(null);
      setGhost([...ghost, { ...p, ...(station ? { stationId: station.id, stationSlot: slot ?? 0 } : {}) }]);
      return;
    }

    if (mode === "survey") {
      const reason = surveyBlocker(game, me.id, p);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      act("PLACE_SURVEY", { lineIndex: surveyLine, x: p.x, y: p.y });
      return;
    }

    if (mode === "place" && activeLineIndex >= 0) {
      const reason = validateNode(game, me.id, activeLineIndex, p, placingStarter, slot);
      if (reason) {
        setNotice(reason);
        return;
      }
      setNotice(null);
      act(placingStarter ? "PLACE_STARTER" : "BUILD", {
        lineIndex: activeLineIndex,
        x: p.x,
        y: p.y,
        ...(slot !== undefined && stationAt(p) ? { slot } : {}),
      });
    }
  };

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
  // the Route Planner have somewhere to happen.
  const showBoard = game.phase !== "PROCUREMENT";
  const canUndo = game.undo?.playerId === playerId;
  const activeLine = activeLineIndex >= 0 && me ? me.lines[activeLineIndex] : undefined;

  return (
    <div className="space-y-4 rounded-3xl bg-[#ede1c7] p-3 text-stone-900 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
          <h2 className="font-serif text-2xl font-black sm:text-3xl">Subway</h2>
        </div>
        <span className="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-bold text-amber-50 sm:text-sm">
          {PHASE_LABELS[game.phase] ?? game.phase}
          {game.phase === "ENGINEERING" && (game.engineeringStep === "PLAN" ? " · plan" : " · surveys")}
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

      {/* The pegboard is a 3:1 corridor, so it gets the full page width rather
          than sharing a column with the panels. */}
      {showBoard && (
        <div className="space-y-2">
          {mode === "place" && activeLine && (
            <ActiveLineBanner line={activeLine} starter={placingStarter} targetCount={targets.length} />
          )}
          <Board game={game} targets={targets} canAct={canAct} drawn={drawn} onTapHole={onTapHole} />
          {notice && (
            <p className="rounded-xl bg-red-100 px-3 py-2 text-center text-sm font-bold text-red-900">{notice}</p>
          )}
          {!notice && canAct && me && mode === "survey" && (
            <p className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
              Tap a glowing hole to pin a survey for your{" "}
              {me.lines[surveyLine] ? lineLabel(me.lines[surveyLine]) : "line"}.
            </p>
          )}
          {!notice && canAct && me && mode === "planner" && (
            <p className="rounded-xl bg-purple-100 px-3 py-2 text-center text-sm font-semibold text-purple-900">
              Sketching a private, non-binding route. Nothing here is dispatched or reserved.
            </p>
          )}
          {!notice && canAct && me && mode === "place" && (
            <p className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-semibold text-emerald-900">
              {placingStarter
                ? `Tap a glowing hole to start your ${lineLabel(me.lines[activeLineIndex])} (stations not allowed).`
                : `Tap a glowing hole, or a glowing station dock, to extend your ${lineLabel(me.lines[activeLineIndex])}.`}
            </p>
          )}
          {canUndo && (
            <div className="flex items-center justify-center gap-3 rounded-xl bg-amber-100 px-3 py-2 text-sm">
              <span className="font-semibold text-amber-900">
                Your {game.undo?.label} can still be taken back — until anything else happens.
              </span>
              <button
                disabled={busy}
                onClick={() => act("UNDO_PLACEMENT")}
                className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white disabled:opacity-40"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="min-w-0 space-y-3">
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
          {me && (game.phase === "ENGINEERING" || game.phase === "SCHEDULING") && me.lines.length > 0 && (
            <RoutePlannerPanel
              me={me}
              plannerLine={plannerLine}
              setPlannerLine={setPlannerLine}
              ghost={ghost}
              setGhost={setGhost}
            />
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {game.phase === "PROCUREMENT" && me && <ProcurementPanel game={game} me={me} busy={busy} act={act} />}
          {game.phase === "ENGINEERING" && game.engineeringStep === "PLAN" && me && (
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
          {game.phase === "ENGINEERING" && game.engineeringStep === "SURVEY" && me && (
            <SurveyPanel game={game} me={me} surveyLine={surveyLine} setSurveyLine={setSurveyLine} />
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
          {me && <PrivatePanel game={game} me={me} activeLineIndex={activeLineIndex} />}
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
