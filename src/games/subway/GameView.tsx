"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GameViewProps } from "@/games/views";
import { DestinationCardFace, EngineeringCardFace } from "./CardArt";
import { ContractCard, MiniCardFace, money } from "./cards";
import { Board, VB_W, holePos, targetKey, type DrawnLine } from "./board";
import { TabletopCanvas, type CameraApi, type TableZone } from "./canvas";
import {
  CardFlight,
  CardFocus,
  CardPiece,
  ContractOffice,
  LineTile,
  Logbook,
  OpponentEdge,
  Pill,
  PlayerTabletop,
  Printed,
  ScheduleBoard,
  TABLE,
  TableButton,
  type FocusAction,
  type FocusRef,
  type PlanChip,
} from "./table";
import { HandoffVeil, NarrationOverlay, currentActorId, useNarration } from "./tabletop";
import { clearPlan, loadPlan, reconcilePlan, savePlan, type PlanStatus, type SavedPlan } from "./plans";
import {
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  basePriorityId,
  buyBlocker,
  constructionById,
  contactToll,
  contestedPeriods,
  contractById,
  contractNodes,
  committedStatus,
  contractOf,
  contractsOutstanding,
  destinationById,
  destinationMet,
  destinationProblems,
  destinationTurnId,
  destinationsHeld,
  engineeringById,
  legalTargets,
  lineComplete,
  marketConstruction,
  marketEngineering,
  marketScheduling,
  mustBuyOffer,
  nextSegmentLength,
  pendingStarters,
  routeContacts,
  schedulingById,
  segmentsBuilt,
  starterTurnId,
  stationAt,
  stationById,
  surveyBlocker,
  surveyTurnId,
  surveysPending,
  validateNode,
  type CardDeckId,
  type ConstructionCardId,
  type PlacementTarget,
  type PlayerLine,
  type Point,
  type RouteContact,
  type RouteNode,
  type SchedulingCardId,
  type SubwayPlayer,
  type SubwayState,
} from "./config";

// ============================================================================
// Subway is played on one continuous, zoomable tabletop (DEC-023).
//
// This file composes that table — opponent edge, schedule board, contract
// office, pegboard, site logbook, the viewer's own edge — inside a single
// camera, and keeps only the thin screen-level HUD outside it: status, camera
// controls, narration, and the Confirm/Cancel strip.
//
// The reducer stays authoritative for every rule; nothing here decides
// legality. Privacy remains a rendering convention under invariant 11.
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

/** The table is as wide as its three columns; the camera does the rest. */
const BOARD_FRAME_W = VB_W + 52;
const WORLD_W = TABLE.margin * 2 + TABLE.side * 2 + TABLE.gap * 2 + BOARD_FRAME_W;

const lineLabel = (line: PlayerLine): string => contractOf(line)?.name ?? "Line";

const opponentOf = (game: SubwayState, me: SubwayPlayer): SubwayPlayer | undefined =>
  game.playerOrder.map((id) => game.players[id]).find((p) => p && p.id !== me.id);

/** Room state is plain JSON by invariant, so this is a safe deep copy. */
const cloneState = (s: SubwayState): SubwayState => JSON.parse(JSON.stringify(s)) as SubwayState;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
            detail: "Buy it, or pass and draft one face-up card from the office.",
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
              detail: "Three are face up in the contract office. Picks are free.",
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

/** What the next tap on the board does. */
type BoardMode = "none" | "place" | "survey" | "planner";

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

  // Card focus and its card-play targets.
  const [focus, setFocus] = useState<FocusRef | null>(null);
  const [cardLine, setCardLine] = useState(0);
  const [cardDirection, setCardDirection] = useState<-1 | 1>(-1);
  const [cardPeriod, setCardPeriod] = useState(1);
  const [flight, setFlight] = useState<{ from: DOMRect; to: { x: number; y: number }; label: string; color: string } | null>(
    null
  );

  // The camera. Client-local by construction: no poll can move it (SA-9).
  const cam = useRef<CameraApi | null>(null);
  const [zoomPct, setZoomPct] = useState(100);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // The HUD's real bands, measured: the camera frames zones clear of them, so
  // nothing important ever ends up under the status plate or the action strip.
  const hudTopRef = useRef<HTMLDivElement | null>(null);
  const hudBottomRef = useRef<HTMLDivElement | null>(null);
  const [bands, setBands] = useState({ top: 96, bottom: 140 });
  useEffect(() => {
    const measure = () => {
      const top = (hudTopRef.current?.offsetHeight ?? 80) + 16;
      const bottom = (hudBottomRef.current?.offsetHeight ?? 120) + 16;
      setBands((prev) =>
        Math.abs(prev.top - top) < 3 && Math.abs(prev.bottom - bottom) < 3 ? prev : { top, bottom }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hudTopRef.current) ro.observe(hudTopRef.current);
    if (hudBottomRef.current) ro.observe(hudBottomRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Saved Plan Mode (DEC-022): all client-local, keyed per room/player/line.
  const [planMode, setPlanMode] = useState(false);
  const [plannerLine, setPlannerLine] = useState<number | null>(null);
  const [sketch, setSketch] = useState<RouteNode[]>([]);
  const [plans, setPlans] = useState<Record<string, SavedPlan>>({});
  const [planStorageOk, setPlanStorageOk] = useState(true);

  // Hotseat handoff veil: a changed controlling player keeps every private
  // surface unrendered until the newcomer confirms. Derived during render, so
  // nothing private can flash in between.
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

  // ---- Saved plans: load for this room/player/contract set -------------------
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

  const planAvailable = !!game && !!me && me.lines.length > 0 && PLAN_PHASES.has(game.phase) && !veiled;
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
    cam.current?.focus("board");
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

  // ---- What the board is for right now ---------------------------------------
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

  // Plan Mode pauses live placement without surrendering it (R 5.2).
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
  // derived from this by the reducer's own rules (OD-5).
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

  // A routine poll must never cancel a selection in progress: only a change
  // that actually affects this selection clears it (R 5.3).
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
            route: anchored ? [line.route[line.route.length - 1], ...status.phantom] : status.phantom,
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
      // Selection only — tapping never commits (OD-3 / OD-4).
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

  /** Keyboard/touch alternative to tapping the board: step the selection. */
  const cycleTarget = (delta: number) => {
    if (!targets.length) return;
    const i = preview ? targets.findIndex((t) => targetKey(t) === targetKey(preview)) : -1;
    const next = targets[(i + delta + targets.length * 2) % targets.length];
    if (mode === "planner") {
      onTapHole({ x: next.x, y: next.y }, next.slot);
      return;
    }
    setPreview(next);
    // Bring the chosen hole on screen without disturbing the zoom level.
    const svg = boardRef.current?.querySelector("svg");
    const rect = svg?.getBoundingClientRect();
    if (rect && rect.width) {
      const s = rect.width / VB_W;
      const p = holePos(next);
      const cx = rect.left + p.x * s;
      const cy = rect.top + p.y * s;
      const r = 46 * s;
      cam.current?.ensureRect({ left: cx - r, top: cy - r, right: cx + r, bottom: cy + r });
    }
  };

  // Which part of the table this phase is played on: it decides the opening
  // shot and what `Reset view` returns to.
  const phaseKey = game ? `${game.phase}:${game.engineeringStep}:${game.schedulingStep}` : "";
  const phaseZone: TableZone = (() => {
    const [phase, step] = phaseKey.split(":");
    if (phase === "PROCUREMENT") return "office";
    if (phase === "SCHEDULING") return "schedule";
    if (phase === "ENGINEERING") {
      return step === "DESTINATION_DRAFT" ? "office" : step === "PLAN" ? "hand" : "board";
    }
    if (phase === "RESULTS") return "results";
    if (phase === "SCORING") return "table";
    return "board";
  })();

  // Camera re-framing on phase transitions only — never on a routine poll.
  const prevPhaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!phaseKey) return;
    if (prevPhaseKey.current !== null && prevPhaseKey.current !== phaseKey) cam.current?.focus(phaseZone);
    prevPhaseKey.current = phaseKey;
  }, [phaseKey, phaseZone]);

  // ---- Pre-game lobby ---------------------------------------------------------
  if (!game || game.phase === "SETUP") {
    const enough = room.players.length >= 2;
    return (
      <section className="rounded-2xl bg-[#ede1c7] p-6 text-center text-stone-900 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">Two-company network contest</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Subway</h2>
        <p className="mx-auto my-4 max-w-xl text-sm text-stone-600">
          Six Line Contracts come up one at a time and all of them find an owner. Each carries an
          ordered recipe of segment lengths and its own line color. Commit secret objectives and
          Destinations, buy Survey Pins, plan the whole programme on the public schedule board, then
          engineer the routes hole by hole — all on one table you pan and zoom around.
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
  const canUndo = game.undo?.playerId === playerId && !veiled;
  const activeLine = activeLineIndex >= 0 && me ? me.lines[activeLineIndex] : undefined;
  const opponent = me ? opponentOf(game, me) : undefined;
  const plannerLineObj = plannerActive && me && plannerLine !== null ? me.lines[plannerLine] : undefined;
  const plannerContract = plannerLineObj ? contractOf(plannerLineObj) : undefined;
  const sketchedSegments = Math.max(0, sketch.length - 1);
  const plannerSavedStatus = plannerLineObj && plannerActive ? planStatuses[plannerLineObj.contractId] : undefined;
  const minSketch = plannerLineObj ? plannerLineObj.route.length : 0;
  const contested = contestedPeriods(game);

  // ---- Card focus: read a card, and do the legal thing with it ---------------

  /** Send a card on its way, then dispatch. Decoration only. */
  const playWithFlight = (label: string, color: string, zone: TableZone, run: () => void) => {
    const card = document.querySelector<HTMLElement>("[data-focus-card]");
    const dest = document.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
    if (card && dest && !reducedMotion()) {
      const from = card.getBoundingClientRect();
      const dr = dest.getBoundingClientRect();
      setFlight({
        from,
        to: { x: dr.left + dr.width / 2 - from.width / 2, y: dr.top + dr.height / 2 - from.height / 2 },
        label,
        color,
      });
      setTimeout(() => setFlight(null), 460);
    }
    setFocus(null);
    run();
  };

  const schedulingReason = (id: SchedulingCardId): string | undefined => {
    if (!me) return "Spectating";
    if (game.phase !== "SCHEDULING" || game.schedulingStep !== "RESOLUTION")
      return "Only after both schedules are revealed";
    if (me.schedulingCardPlayed) return "One Scheduling card per company per game";
    if (me.scheduleConfirmed) return "Your schedule is already locked";
    if (id === "priority" && !contested.length) return "No contested periods to reorder";
    if (id !== "priority" && !me.lines.some((l) => l.start !== undefined)) return "Nothing scheduled to move";
    return undefined;
  };

  const constructionReason = (id: ConstructionCardId): string | undefined => {
    if (!me) return "Spectating";
    if (game.phase !== "CONSTRUCTION") return "Only during Construction";
    if (me.constructionCardThisPeriod) return "One Construction card per period";
    const queued = game.resolveQueue.includes(me.id);
    if (!queued || me.actedThisPeriod) return "Only on a period you build";
    if (id === "expedite" && game.resolveQueue[0] === me.id) return "You already build first";
    if (id === "overtime" && !me.pendingActions.length) return "No scheduled action to double";
    if (id === "surge") {
      const others = me.lines
        .map((_, i) => i)
        .filter((i) => !me.pendingActions.includes(i) && !lineComplete(me.lines[i]));
      if (!others.length) return "No other project to open";
    }
    return undefined;
  };

  const constructionTargets = (id: ConstructionCardId): number[] =>
    !me
      ? []
      : id === "overtime"
        ? Array.from(new Set(me.pendingActions))
        : me.lines.map((_, i) => i).filter((i) => !me.pendingActions.includes(i) && !lineComplete(me.lines[i]));

  const lineSelect = (value: number, onChange: (n: number) => void, options: number[]) =>
    me && options.length > 0 ? (
      <label className="block text-sm font-bold text-stone-700">
        Line
        <select
          value={options.includes(value) ? value : options[0]}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border-2 border-stone-400 bg-white px-2 py-2 text-sm"
        >
          {options.map((i) => (
            <option key={i} value={i}>
              {lineLabel(me.lines[i])}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  const focusPanel = (() => {
    if (!focus || !me) return null;
    const close = () => setFocus(null);

    if (focus.family === "contract") {
      const contract = contractById(focus.id);
      if (!contract) return null;
      const offer = game.procurement.offer;
      const onOffer = !!offer && offer.contractId === focus.id;
      const mine = onOffer && offer!.activeId === me.id;
      const forced = mine && mustBuyOffer(game, me.id);
      const blocker = buyBlocker(game, me.id);
      const canBuy = mine && (!blocker || (forced && blocker === "Not enough money."));
      const actions: FocusAction[] = [];
      if (mine) {
        actions.push({
          label: `Buy for ${money(forced ? Math.min(offer!.price, me.money) : offer!.price)}`,
          disabled: busy || !canBuy,
          reason: canBuy ? undefined : blocker,
          run: () => playWithFlight(contract.name, contract.color, "lines", () => act("PROCURE", { choice: "buy" })),
        });
        if (!forced) {
          actions.push({
            label: offer!.stage === "first" ? "Pass (draft a card below)" : "Pass to the Discount Yard",
            tone: "plain",
            disabled: busy || offer!.stage === "first",
            reason:
              offer!.stage === "first"
                ? "Passing first takes a face-up card: open one from the office instead."
                : undefined,
            run: () => playWithFlight(contract.name, contract.color, "office", () => act("PROCURE", { choice: "pass" })),
          });
        }
      }
      return (
        <CardFocus
          title={contract.name}
          onClose={close}
          face={<ContractCard contract={contract} price={focus.price} />}
          note={
            <>
              {contractNodes(contract)} nodes over {contract.recipe.length} segments.{" "}
              {contractsOutstanding(game)} contract{contractsOutstanding(game) === 1 ? "" : "s"} still need an
              owner; you hold {me.lines.length} of {SUBWAY_CONFIG.maxContractsPerPlayer}.
            </>
          }
          reason={!mine && onOffer ? `${game.players[offer!.activeId]?.name ?? "The opposition"} is deciding.` : undefined}
          actions={actions}
        />
      );
    }

    if (focus.family === "market") {
      const offer = game.procurement.offer;
      const mine = !!offer && offer.activeId === me.id && offer.stage === "first" && !mustBuyOffer(game, me.id);
      const card =
        focus.id === "engineering"
          ? marketEngineering(game.market)
          : focus.id === "scheduling"
            ? marketScheduling(game.market)
            : marketConstruction(game.market);
      return (
        <CardFocus
          title={card.name}
          onClose={close}
          face={
            <MiniCardFace
              family={focus.id === "construction" ? "construction" : "scheduling"}
              name={card.name}
              description={card.description}
              note={`Face-up ${focus.id} card`}
            />
          }
          note="Passing on the contract at first refusal draws this card."
          reason={mine ? undefined : "You can only draft a face-up card by passing at first refusal."}
          actions={[
            {
              label: "Pass and take this card",
              disabled: busy || !mine,
              run: () =>
                playWithFlight(card.name, "#a16207", "hand", () =>
                  act("PROCURE", { choice: "pass", deck: focus.id })
                ),
            },
          ]}
        />
      );
    }

    if (focus.family === "engineering") {
      const card = engineeringById(focus.id);
      if (!card) return null;
      const committed = focus.slot === "committed";
      const met = committed && !veiled ? committedStatusFor(game, me, focus.id) : false;
      const planning = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN" && !me.engineeringLocked;
      const picked = chosen.includes(focus.id);
      const actions: FocusAction[] = [];
      if (planning && !committed) {
        actions.push({
          label: picked ? "Take out of the plan" : "Commit to the plan",
          tone: picked ? "plain" : "go",
          disabled: !picked && chosen.length >= 3,
          reason: !picked && chosen.length >= 3 ? "Three objectives are already chosen." : undefined,
          run: () => {
            setChosen(picked ? chosen.filter((x) => x !== focus.id) : [...chosen, focus.id]);
            setFocus(null);
          },
        });
      }
      return (
        <CardFocus
          title={card.name}
          onClose={close}
          face={
            <EngineeringCardFace
              card={card}
              color={me.color}
              state={committed ? (met ? "met" : "committed") : picked ? "selected" : "idle"}
            />
          }
          note={
            committed
              ? met
                ? `✓ COMPLETE — scores +${card.vp} VP as the board stands.`
                : "Committed and hidden from the opposition until scoring."
              : planning
                ? `Objectives chosen: ${chosen.length}/3. Uncommitted cards score nothing.`
                : "In hand — it commits at Engineering plan lock and scores nothing otherwise."
          }
          actions={actions}
        />
      );
    }

    if (focus.family === "destination") {
      const card = destinationById(focus.id);
      if (!card) return null;
      const drafting = game.phase === "ENGINEERING" && game.engineeringStep === "DESTINATION_DRAFT";
      const myPick = drafting && destinationTurnId(game) === me.id;
      const planning = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN" && !me.engineeringLocked;
      const committed = focus.slot === "committed";
      const commitment = committed
        ? me.destinationCommitments.find((c) => c.cardId === focus.id && c.lineIndex === focus.lineIndex)
        : undefined;
      const met = commitment ? destinationMet(me, commitment) : false;
      const assignedTo = assignments[focus.id] ?? -1;
      const actions: FocusAction[] = [];
      if (focus.slot === "row") {
        actions.push({
          label: "Draft this Destination",
          disabled: busy || !myPick,
          reason: myPick ? undefined : "It is not your pick.",
          run: () =>
            playWithFlight(card.name, "#7e22ce", "hand", () =>
              act("PICK_DESTINATION", { destinationCardId: focus.id })
            ),
        });
      }
      return (
        <CardFocus
          title={stationById(card.stationId)?.name ?? card.name}
          onClose={close}
          face={
            <DestinationCardFace
              card={card}
              color={me.color}
              state={committed ? (met ? "met" : "committed") : assignedTo >= 0 ? "selected" : "idle"}
            />
          }
          note={
            committed
              ? `Assigned to ${
                  commitment && me.lines[commitment.lineIndex] ? lineLabel(me.lines[commitment.lineIndex]) : "a line"
                } · ${met ? `✓ COMPLETE — scores +${card.vp} VP` : "not connected yet"}`
              : planning
                ? "Assign it to a line below. Destinations never count toward your three objectives, and one line may hold at most two."
                : "Drafted — you assign it to a line at Engineering plan lock."
          }
          extra={
            planning && !committed ? (
              <label className="block text-sm font-bold text-stone-700">
                Assign to
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignments({ ...assignments, [focus.id]: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border-2 border-stone-400 bg-white px-2 py-2 text-sm"
                >
                  <option value={-1}>Not assigned</option>
                  {me.lines.map((line, li) => (
                    <option key={li} value={li}>
                      {lineLabel(line)}
                    </option>
                  ))}
                </select>
              </label>
            ) : undefined
          }
          actions={actions}
        />
      );
    }

    if (focus.family === "scheduling") {
      const card = schedulingById(focus.id);
      if (!card) return null;
      const why = schedulingReason(focus.id);
      const options = me.lines.map((_, i) => i).filter((i) => me.lines[i].start !== undefined);
      return (
        <CardFocus
          title={card.name}
          onClose={close}
          face={<MiniCardFace family="scheduling" name={card.name} description={card.description} note="Scheduling card" />}
          note="One Scheduling card per company per game, played after both schedules are revealed."
          reason={why}
          extra={
            !why ? (
              focus.id === "priority" ? (
                <label className="block text-sm font-bold text-stone-700">
                  Contested period
                  <select
                    value={contested.includes(cardPeriod) ? cardPeriod : contested[0]}
                    onChange={(e) => setCardPeriod(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border-2 border-stone-400 bg-white px-2 py-2 text-sm"
                  >
                    {contested.map((q) => (
                      <option key={q} value={q}>
                        Period {q} — {game.players[basePriorityId(game, q)]?.name} builds first now
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="space-y-2">
                  {lineSelect(cardLine, setCardLine, options)}
                  {focus.id === "float" && (
                    <div className="flex overflow-hidden rounded-lg border-2 border-stone-400 text-sm font-bold">
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 ${cardDirection === -1 ? "bg-stone-800 text-white" : "bg-white"}`}
                        onClick={() => setCardDirection(-1)}
                      >
                        Earlier
                      </button>
                      <button
                        type="button"
                        className={`flex-1 px-3 py-2 ${cardDirection === 1 ? "bg-stone-800 text-white" : "bg-white"}`}
                        onClick={() => setCardDirection(1)}
                      >
                        Later
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : undefined
          }
          actions={[
            {
              label: `Play ${card.name}`,
              tone: "warn",
              disabled: busy || !!why,
              reason: why,
              run: () =>
                playWithFlight(card.name, "#075985", "schedule", () =>
                  act("PLAY_SCHEDULING_CARD", {
                    cardId: focus.id,
                    ...(focus.id === "priority"
                      ? { period: contested.includes(cardPeriod) ? cardPeriod : contested[0] }
                      : {
                          lineIndex: options.includes(cardLine) ? cardLine : options[0],
                          ...(focus.id === "float" ? { direction: cardDirection } : {}),
                        }),
                  })
                ),
            },
          ]}
        />
      );
    }

    // Construction card
    const card = constructionById(focus.id);
    if (!card) return null;
    const why = constructionReason(focus.id);
    const options = constructionTargets(focus.id);
    return (
      <CardFocus
        title={card.name}
        onClose={close}
        face={<MiniCardFace family="construction" name={card.name} description={card.description} note="Construction card" />}
        note="One Construction card per company per period, on a period you build."
        reason={why}
        extra={!why && focus.id !== "expedite" ? lineSelect(cardLine, setCardLine, options) : undefined}
        actions={[
          {
            label: `Play ${card.name}`,
            tone: "warn",
            disabled: busy || !!why,
            reason: why,
            run: () =>
              playWithFlight(card.name, "#b45309", "board", () =>
                act("PLAY_CONSTRUCTION_CARD", {
                  cardId: focus.id,
                  ...(focus.id === "expedite"
                    ? {}
                    : { lineIndex: options.includes(cardLine) ? cardLine : options[0] }),
                })
              ),
          },
        ]}
      />
    );
  })();

  // ---- The screen-level strip: the only commitment control -------------------

  const actionStrip = (
    <div className="pointer-events-auto rounded-2xl border-2 border-[#6b4b2c] bg-[#fffaf0]/97 p-2.5 text-stone-900 shadow-2xl">
      {notice && (
        <p className="mb-1.5 rounded-lg bg-red-100 px-2 py-1 text-center text-xs font-bold text-red-900">{notice}</p>
      )}

      {mode === "planner" && plannerContract && plannerLineObj && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-purple-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">
              Plan Mode
            </span>
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
            <StripButton onClick={() => cycleTarget(1)} disabled={!targets.length}>
              Next legal hole
            </StripButton>
            <StripButton disabled={sketch.length <= minSketch} onClick={() => setSketch(sketch.slice(0, -1))}>
              Undo step
            </StripButton>
            <StripButton
              disabled={sketch.length <= minSketch}
              onClick={() => setSketch(plannerLineObj ? [...plannerLineObj.route] : [])}
            >
              Restart sketch
            </StripButton>
            <StripButton tone="plan" disabled={sketch.length <= Math.max(1, minSketch)} onClick={savePlanNow}>
              Save plan
            </StripButton>
            {plannerSavedStatus && (
              <StripButton tone="danger" onClick={clearPlanNow}>
                Clear saved
              </StripButton>
            )}
            <StripButton tone="dark" className="ml-auto" onClick={exitPlanner}>
              {placingStarter || myBuild ? "Back to placement" : "Close Plan Mode"}
            </StripButton>
          </div>
        </div>
      )}

      {mode === "place" && activeLine && me && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>{lineLabel(activeLine)}</b>
            <span className="text-xs text-stone-500">
              {placingStarter
                ? "starter peg · border holes only"
                : `segment ${segmentsBuilt(activeLine) + 1}/${contractOf(activeLine)?.recipe.length} · ${
                    nextSegmentLength(activeLine) ?? "—"
                  } pegs`}
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
                  ({previewContacts.map((c) => c.kind).join(", ")}) · <b>{money(contactToll(previewContacts))}</b> to{" "}
                  {opponent?.name ?? "them"} · cash after{" "}
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
          <div className="flex flex-wrap items-center gap-1.5">
            <StripButton onClick={() => cycleTarget(-1)} disabled={!targets.length} aria-label="Previous legal target">
              ◀
            </StripButton>
            <StripButton onClick={() => cycleTarget(1)} disabled={!targets.length} aria-label="Next legal target">
              Target ▶
            </StripButton>
            <StripButton disabled={busy || !preview} onClick={() => setPreview(null)}>
              Cancel
            </StripButton>
            <StripButton tone="go" disabled={busy || !preview} onClick={confirmPlacement} data-confirm-placement>
              Confirm placement
            </StripButton>
            {planAvailable && (
              <StripButton tone="plan" onClick={() => openPlanner(activeLineIndex >= 0 ? activeLineIndex : 0)}>
                Plan
              </StripButton>
            )}
            {myBuild && (
              <StripButton tone="dark" disabled={busy} onClick={() => act("SKIP_ACTION")}>
                Give up
              </StripButton>
            )}
            {canUndo && (
              <StripButton tone="dark" className="ml-auto" disabled={busy} onClick={() => act("UNDO_PLACEMENT")}>
                Undo {game.undo?.label}
              </StripButton>
            )}
          </div>
        </div>
      )}

      {mode === "survey" && me && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-black uppercase text-white">Survey</span>
          <span className="text-xs text-stone-600">
            Tap a glowing hole to place a pin — {surveysPending(game, me.id)} left. Pins are public and reserve nothing.
          </span>
          {planAvailable && (
            <StripButton tone="plan" className="ml-auto" onClick={() => openPlanner(0)}>
              Plan
            </StripButton>
          )}
        </div>
      )}

      {mode === "none" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${status.tone === "act" ? "animate-pulse bg-emerald-600" : "bg-stone-400"}`}
          />
          <span className="text-xs font-bold text-stone-700">{status.headline}</span>
          {game.phase === "SCORING" && isHost && (
            <StripButton tone="go" disabled={busy} onClick={() => act("ADVANCE_SCORING")}>
              Reveal Engineering &amp; score
            </StripButton>
          )}
          {planAvailable && (
            <StripButton tone="plan" className="ml-auto" onClick={() => openPlanner(0)}>
              Plan
            </StripButton>
          )}
          {canUndo && (
            <StripButton tone="dark" className={planAvailable ? "" : "ml-auto"} disabled={busy} onClick={() => act("UNDO_PLACEMENT")}>
              Undo {game.undo?.label}
            </StripButton>
          )}
        </div>
      )}
    </div>
  );

  // ---- Engineering plan slip (lives on the player's own edge) -----------------

  const planningStep = game.phase === "ENGINEERING" && game.engineeringStep === "PLAN";
  const assignmentList = Object.entries(assignments)
    .filter(([, lineIndex]) => lineIndex >= 0)
    .map(([cardId, lineIndex]) => ({ cardId, lineIndex }));
  const destProblems = me ? destinationProblems(me, assignmentList) : [];
  const allAssigned = me ? assignmentList.length === me.destinationHand.length : false;
  const surveyCost = surveys * SUBWAY_CONFIG.survey.cost;
  const planReady =
    !!me && chosen.length === 3 && allAssigned && !destProblems.length && surveyCost <= me.money;

  const engineeringSlip =
    me && planningStep && !veiled ? (
      me.engineeringLocked ? (
        <Printed title="Engineering plan" tone="slip" subtitle="Locked">
          <p className="max-w-[900px] text-[20px] text-stone-700">
            Three objectives and {me.destinationCommitments.length} Destination
            {me.destinationCommitments.length === 1 ? "" : "s"} are committed face down, and{" "}
            {me.surveysPurchased} Survey Pin{me.surveysPurchased === 1 ? "" : "s"} are paid for. The opposition
            cannot see any of it until scoring; your own copies stay on this edge of the table with live status.
          </p>
        </Printed>
      ) : (
        <Printed
          title="Engineering plan"
          tone="slip"
          subtitle={`${chosen.length}/3 objectives committed`}
          style={{ maxWidth: 1900 }}
        >
          <p className="text-[20px] text-stone-700">
            Open a card to read it and commit it. Exactly three objectives; Destinations are separate — assign as
            many as you like, at most two per line. Uncommitted cards stay in hand and score nothing.
          </p>
          <div className="mt-[18px] flex flex-wrap gap-[18px]">
            {me.engineeringHand.map((id, i) => (
              <CardPiece
                key={`${id}-${i}`}
                label={`Engineering objective ${id}`}
                ring={chosen.includes(id) ? "#f59e0b" : undefined}
                onOpen={() => setFocus({ family: "engineering", id, slot: "hand" })}
              >
                <EngineeringCardFace
                  card={id}
                  color={me.color}
                  compact
                  state={chosen.includes(id) ? "selected" : "idle"}
                  footer={
                    <p className="mt-1 text-[11px] font-black text-stone-500">
                      {chosen.includes(id) ? "Committing" : "Tap to read"}
                    </p>
                  }
                />
              </CardPiece>
            ))}
          </div>
          {me.destinationHand.length > 0 && (
            <div className="mt-[22px]">
              <p className="text-[19px] font-black uppercase tracking-[.14em] text-stone-500">
                Destinations to assign
              </p>
              <div className="mt-[12px] flex flex-wrap gap-[18px]">
                {me.destinationHand.map((id, i) => {
                  const assigned = assignments[id] ?? -1;
                  return (
                    <CardPiece
                      key={`${id}-${i}`}
                      label={`Destination ${id}`}
                      ring={assigned >= 0 ? "#f59e0b" : undefined}
                      onOpen={() => setFocus({ family: "destination", id, slot: "hand" })}
                    >
                      <DestinationCardFace
                        card={id}
                        color={me.color}
                        compact
                        state={assigned >= 0 ? "selected" : "idle"}
                        footer={
                          <p className="mt-1 text-[11px] font-black text-stone-500">
                            {assigned >= 0 ? lineLabel(me.lines[assigned]) : "Tap to assign"}
                          </p>
                        }
                      />
                    </CardPiece>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-[22px] flex flex-wrap items-center gap-[20px] rounded-[16px] border-[3px] border-stone-300 bg-white/70 p-[18px]">
            <div>
              <p className="text-[19px] font-black uppercase tracking-wide text-stone-500">Survey pins</p>
              <p className="text-[18px] text-stone-600">
                {money(SUBWAY_CONFIG.survey.cost)} each, up to {SUBWAY_CONFIG.survey.max}. +{SUBWAY_CONFIG.survey.vp} VP
                if any line you own later builds through the pinned hole.
              </p>
            </div>
            <TableButton size="sm" disabled={busy || surveys === 0} onClick={() => setSurveys(Math.max(0, surveys - 1))}>
              −
            </TableButton>
            <b className="w-[46px] text-center text-[34px] tabular-nums">{surveys}</b>
            <TableButton
              size="sm"
              disabled={busy || surveys >= SUBWAY_CONFIG.survey.max}
              onClick={() => setSurveys(Math.min(SUBWAY_CONFIG.survey.max, surveys + 1))}
            >
              +
            </TableButton>
            <span className="text-[19px] text-stone-600">
              cost <b className={surveyCost <= me.money ? "" : "text-red-700"}>{money(surveyCost)}</b> · cash after{" "}
              <b className={surveyCost <= me.money ? "" : "text-red-700"}>{money(me.money - surveyCost)}</b>
            </span>
          </div>
          {(destProblems.length > 0 || !allAssigned) && (
            <ul className="mt-[12px] space-y-[4px] text-[19px] font-bold text-red-800">
              {!allAssigned && <li>• Every Destination you drafted must be assigned to a line.</li>}
              {destProblems.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          )}
          <div className="mt-[18px]">
            <TableButton
              tone="go"
              disabled={busy || !planReady}
              onClick={() => act("LOCK_ENGINEERING_PLAN", { cardIds: chosen, destinations: assignmentList, surveys })}
            >
              Lock the plan{surveyCost > 0 ? ` & pay ${money(surveyCost)}` : ""}
            </TableButton>
          </div>
        </Printed>
      )
    ) : null;

  // ---- The table --------------------------------------------------------------

  // Quick-focus controls, one-handed on a phone: the short label is what a
  // narrow screen shows, the long one is the accessible name everywhere.
  const focusButtons: { zone: TableZone; label: string; short: string }[] = [
    { zone: "board", label: "Pegboard", short: "Board" },
    { zone: "schedule", label: "Schedule", short: "Sched" },
    { zone: "lines", label: "Lines", short: "Lines" },
    { zone: "hand", label: "Cards", short: "Cards" },
    { zone: "table", label: "Whole table", short: "All" },
  ];

  const hud = (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 sm:p-3">
      <div ref={hudTopRef} className="flex flex-wrap items-start justify-between gap-2">
        <div
          className={`pointer-events-auto max-w-[52%] rounded-xl border-l-4 bg-[#fffaf0]/95 px-2.5 py-1.5 shadow-lg sm:max-w-[42%] sm:px-3 sm:py-2 ${
            status.tone === "act" ? "border-emerald-600" : status.tone === "wait" ? "border-stone-400" : "border-amber-500"
          }`}
        >
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-800">
            {PHASE_LABELS[game.phase] ?? game.phase}
            {game.phase === "CONSTRUCTION" &&
              ` · period ${Math.min(game.currentPeriod, SUBWAY_CONFIG.timelinePeriods)}/${SUBWAY_CONFIG.timelinePeriods}`}
          </p>
          <p className="flex items-center gap-2 text-[12px] font-bold leading-snug text-stone-900 sm:text-sm">
            {status.tone === "act" && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-600" />}
            {status.headline}
          </p>
          {status.detail && <p className="hidden text-xs text-stone-600 sm:block">{status.detail}</p>}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl bg-stone-900/85 p-1.5 text-amber-50 shadow-lg">
          <button
            onClick={() => cam.current?.zoomBy(1 / 1.3)}
            aria-label="Zoom out"
            className="rounded-lg bg-white/15 px-2.5 py-1 text-base font-black leading-none hover:bg-white/25"
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums sm:w-12 sm:text-xs">{zoomPct}%</span>
          <button
            onClick={() => cam.current?.zoomBy(1.3)}
            aria-label="Zoom in"
            className="rounded-lg bg-white/15 px-2.5 py-1 text-base font-black leading-none hover:bg-white/25"
          >
            +
          </button>
          <button
            onClick={() => cam.current?.reset()}
            aria-label="Reset view"
            className="rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold hover:bg-white/25 sm:text-xs"
          >
            Reset<span className="hidden sm:inline"> view</span>
          </button>
        </div>
      </div>

      <NarrationOverlay event={narration.overlay} onDismiss={narration.dismiss} />

      <div
        ref={hudBottomRef}
        className="flex flex-col items-center gap-1.5"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Quick-focus lives one thumb away from the action buttons. */}
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-xl bg-stone-900/85 p-1 text-amber-50 shadow-lg">
          {focusButtons.map((b) => (
            <button
              key={b.zone}
              onClick={() => cam.current?.focus(b.zone)}
              aria-label={`Focus ${b.label}`}
              className="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold hover:bg-white/25 sm:text-xs"
            >
              <span className="sm:hidden">{b.short}</span>
              <span className="hidden sm:inline">{b.label}</span>
            </button>
          ))}
        </div>
        <div className="w-full max-w-3xl">{actionStrip}</div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {veiled && me && <HandoffVeil name={me.name} color={me.color} onConfirm={() => setSeatedId(playerId)} />}
      {/* Screen readers hear every accepted public event, animation or not. */}
      <div aria-live="polite" className="sr-only">
        {narration.liveText}
      </div>

      <TabletopCanvas
        worldWidth={WORLD_W}
        apiRef={cam}
        onCamera={(scale) => setZoomPct((prev) => (Math.round(scale * 100) === prev ? prev : Math.round(scale * 100)))}
        overlay={hud}
        openZone={phaseZone}
        bottomInset={30}
        hudTop={bands.top}
        hudBottom={bands.bottom}
        label="Subway tabletop — drag to pan, pinch or scroll to zoom"
      >
        {/* Printed pieces carry dark ink whatever the surrounding page theme is. */}
        <div className="flex flex-col text-stone-900" style={{ gap: TABLE.gap, padding: TABLE.margin }}>
          {opponent && <OpponentEdge game={game} opponent={opponent} scheduleRevealed={schedulingRevealed} />}

          <ScheduleBoard
            game={game}
            viewerId={playerId}
            revealed={schedulingRevealed}
            editable={
              game.phase === "SCHEDULING" &&
              game.schedulingStep === "PLANNING" &&
              !me?.scheduleSubmitted &&
              !veiled
            }
            busy={busy}
            act={act}
            veiled={veiled}
          />

          <div className="flex items-start" style={{ gap: TABLE.gap }}>
            <ContractOffice
              game={game}
              me={me}
              veiled={veiled}
              onOpenContract={(id, price) => setFocus({ family: "contract", id, price })}
              onOpenMarket={(deck: CardDeckId) => setFocus({ family: "market", id: deck })}
              onOpenDestination={(id) => setFocus({ family: "destination", id, slot: "row" })}
            />

            <div
              ref={boardRef}
              data-zone="board"
              className="rounded-[34px] border-[10px] border-[#5d4127] bg-[#8a6844] p-[16px] shadow-[0_24px_50px_rgba(0,0,0,.5)]"
              style={{ width: BOARD_FRAME_W }}
            >
              <div className="mb-[12px] flex items-center justify-between px-[8px] text-[#f5e6c8]">
                <strong className="text-[26px] font-black uppercase tracking-[.3em]">Metropolitan pegboard</strong>
                <span className="text-[20px] font-bold opacity-80">
                  {SUBWAY_CONFIG.board.columns} × {SUBWAY_CONFIG.board.rows} holes
                </span>
              </div>
              <Board
                game={game}
                targets={canAct ? targets : []}
                following={mode === "place" ? following : []}
                selected={mode === "place" ? preview ?? undefined : undefined}
                canAct={canAct}
                drawn={drawn}
                onTapHole={onTapHole}
              />
            </div>

            <Logbook game={game} actorId={currentActorId(game)} />
          </div>

          {me && (
            <PlayerTabletop
              game={game}
              me={me}
              veiled={veiled}
              activeLineIndex={activeLineIndex}
              planChips={planChips}
              planAvailable={planAvailable}
              onOpenPlanner={openPlanner}
              onSelectLine={(i) => setSelectedLine(i)}
              selectableLines={myBuild && !veiled}
              onOpenCard={(ref) => setFocus(ref)}
            >
              {engineeringSlip}
            </PlayerTabletop>
          )}

          {game.phase === "RESULTS" && <ResultsSheet game={game} />}

          <footer className="flex items-center justify-between text-[20px] text-[#e6d7b4]">
            <span>
              Room <code className="rounded bg-black/30 px-[10px] py-[4px] font-bold">{room.roomCode}</code>
            </span>
            <Link href="/" className="underline hover:text-white">
              Leave room
            </Link>
          </footer>
        </div>
      </TabletopCanvas>

      {focusPanel}
      {flight && <CardFlight from={flight.from} to={flight.to} label={flight.label} color={flight.color} />}
    </div>
  );
}

/** Whether a committed objective currently reads as met, for the focus panel. */
function committedStatusFor(game: SubwayState, me: SubwayPlayer, cardId: string): boolean {
  const entry = committedStatus(game, me.id).find((c) => c.cardId === cardId);
  return !!entry?.met;
}

function StripButton({
  children,
  onClick,
  disabled,
  tone = "plain",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "plain" | "go" | "plan" | "danger" | "dark";
  className?: string;
} & Record<string, unknown>) {
  const skin =
    tone === "go"
      ? "bg-emerald-700 text-white"
      : tone === "plan"
        ? "bg-purple-700 text-white"
        : tone === "danger"
          ? "border border-red-300 text-red-800"
          : tone === "dark"
            ? "bg-stone-900 text-white"
            : "border border-stone-400 text-stone-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-35 ${skin} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The final scoring sheet, laid on the table like everything else. */
function ResultsSheet({ game }: { game: SubwayState }) {
  return (
    <Printed zone="results" title="Final scoring" subtitle={game.message} className="w-full">
      <div className="flex flex-col gap-[26px]">
        {game.playerOrder.map((id) => {
          const p = game.players[id];
          if (!p) return null;
          const winner = game.winnerIds.includes(id);
          return (
            <div
              key={id}
              className="rounded-[22px] border-[5px] bg-[#fffaf0] p-[22px]"
              style={{ borderColor: p.color, opacity: winner ? 1 : 0.95 }}
            >
              <div className="flex items-baseline justify-between text-[34px] font-black">
                <span className="flex items-center gap-[14px]">
                  <span className="h-[26px] w-[26px] rounded-full" style={{ background: p.color }} />
                  {p.name}
                  {winner && <Pill tone="good">🏆 Winner</Pill>}
                </span>
                <span>{p.score} VP</span>
              </div>
              <div className="mt-[14px] max-w-[1400px]">
                {p.scoreBreakdown?.map((item, i) => (
                  <div
                    key={i}
                    className={`flex justify-between border-b border-stone-200 py-[6px] text-[21px] ${
                      item.met === false ? "text-stone-400" : ""
                    }`}
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
                <div className="flex justify-between py-[6px] text-[19px] text-stone-500">
                  <span>Remaining money (tiebreak)</span>
                  <span>{money(p.money)}</span>
                </div>
              </div>
              <div className="mt-[18px] flex flex-wrap gap-[18px]">
                {p.committedEngineering.map((cardId, i) => {
                  const card = engineeringById(cardId);
                  const scored = p.scoreBreakdown?.find((x) => x.label === card?.name);
                  return (
                    <div key={`${cardId}-${i}`} style={{ width: 360 }}>
                      <EngineeringCardFace
                        card={cardId}
                        color={p.color}
                        compact
                        state={scored?.met ? "met" : "missed"}
                        footer={
                          <p className={`mt-1 text-[11px] font-black ${scored?.met ? "text-emerald-700" : "text-stone-400"}`}>
                            {scored?.met ? `Scored +${scored.points}` : "Not met"}
                          </p>
                        }
                      />
                    </div>
                  );
                })}
                {p.destinationCommitments.map((commitment, i) => {
                  const met = destinationMet(p, commitment);
                  const assigned = p.lines[commitment.lineIndex];
                  const contract = assigned ? contractOf(assigned) : undefined;
                  return (
                    <div key={`${commitment.cardId}-${i}`} style={{ width: 360 }}>
                      <DestinationCardFace
                        card={commitment.cardId}
                        color={p.color}
                        compact
                        state={met ? "met" : "missed"}
                        footer={
                          <p className={`mt-1 flex items-center gap-1 text-[11px] font-black ${met ? "text-emerald-700" : "text-stone-400"}`}>
                            {contract && <LineTile contract={contract} size={16} />}
                            {assigned ? lineLabel(assigned) : "unassigned"} ·{" "}
                            {met ? `Scored +${SUBWAY_CONFIG.destinationVp}` : "Not connected"}
                          </p>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Printed>
  );
}
